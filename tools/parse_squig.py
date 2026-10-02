#!/usr/bin/env python3
"""Parse ALL measurements from gudkov/pw/boizoff squig.link into data/squig-db.json
Strategies: A) literal csv/txt paths in html/js  B) name list + path-pattern probing
Verbose DEBUG output so failures are diagnosable from Actions log."""
import requests, json, re, sys, time
from urllib.parse import urljoin, quote, unquote
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

SQUIGS = {
    "gudkov": "https://gudkov.squig.link/",
    "pw": "https://pw.squig.link/",
    "boizoff": "https://boizoff.squig.link/",
}
HEAD = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "*/*",
}
SESSION = requests.Session()
SESSION.headers.update(HEAD)
EX = ThreadPoolExecutor(max_workers=16)

def fetch(url, timeout=12):
    try:
        r = SESSION.get(url, timeout=timeout)
        if r.status_code != 200:
            return None, r.status_code
        return r.text, 200
    except Exception as e:
        return None, str(e)[:60]

def log(*a):
    print(*a, flush=True)

# ---------- parsing measurement text ----------
def parse_rows(text):
    rows = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = re.split(r"[,\s;]+", line)
        if len(parts) < 2:
            continue
        try:
            f = float(parts[0]); v = float(parts[1])
        except ValueError:
            continue
        if f > 0 and -60 < v < 160:
            rows.append((f, v))
    return rows if len(rows) >= 20 else None

def decimate(rows, maxpts=140):
    if len(rows) <= maxpts:
        return rows
    step = len(rows) / maxpts
    out, i = [], 0.0
    while int(i) < len(rows):
        out.append(rows[int(i)])
        i += step
    return out

def avg_two(ra, rb):
    out = []
    jb = 0
    for f, v in ra:
        while jb + 1 < len(rb) and abs(rb[jb+1][0]-f) < abs(rb[jb][0]-f):
            jb += 1
        out.append((f, (v + rb[jb][1]) / 2))
    return out

# ---------- strategy A: literal paths ----------
def literal_paths(blob, base):
    found = set()
    for m in re.finditer(r'["\'(\s]((?:https?://|/|\.?\.?/)?[^"\'()\s<>]*?/[^"\'()\s<>]*\.(?:csv|txt))["\')\s]', blob):
        p = m.group(1)
        if p.startswith("http"):
            found.add(p)
        else:
            found.add(urljoin(base, p))
    for m in re.finditer(r'["\']([^"\']{2,120}\.(?:csv|txt))["\']', blob):
        p = m.group(1)
        found.add(p if p.startswith("http") else urljoin(base, p))
    return list(found)

# ---------- strategy B: names + pattern probing ----------
def extract_names(blob):
    names = []
    seen = set()
    pats = [
        r'"name"\s*:\s*"([^"\n]{3,90})"',
        r"'name'\s*:\s*'([^'\n]{3,90})'",
        r'"model"\s*:\s*"([^"\n]{3,90})"',
        r'"displayName"\s*:\s*"([^"\n]{3,90})"',
        r'"label"\s*:\s*"([^"\n]{3,90})"',
    ]
    for p in pats:
        for m in re.finditer(p, blob):
            n = m.group(1).strip()
            if n.lower() in seen:
                continue
            bad = any(t in n for t in (".js", ".css", "function", "return", "var ", "http", "<", ">", "{", "}"))
            if bad or len(n) < 3:
                continue
            seen.add(n.lower())
            names.append(n)
    return names

PATTERNS = [
    "measurements/{q}.csv", "measurements/{q}.txt",
    "fr/{q}.csv", "data/{q}.csv", "graphs/{q}.csv",
    "measurements/{b}/{q}.csv", "measurements/{b}/{q}.txt",
    "fr/{b}/{q}.csv",
]
LR_SUFFIX = [" (L)", " (R)", " L", " R", "_L", "_R", "-L", "-R"]

def probe_pattern(base, names):
    """Try first few names against patterns, return working pattern or None"""
    for name in names[:6]:
        q = quote(name, safe="")
        b = quote(name.split(" ")[0], safe="")
        for pat in PATTERNS:
            url = urljoin(base, pat.format(q=q, b=b))
            txt, code = fetch(url)
            if code == 200 and txt and parse_rows(txt):
                log(f"  [B] pattern hit: {pat}  (name={name})")
                return pat
    return None

def fetch_model(base, pat, name):
    q = quote(name, safe="")
    b = quote(name.split(" ")[0], safe="")
    url = urljoin(base, pat.format(q=q, b=b))
    # try L/R pair first
    l_url = urljoin(base, pat.format(q=quote(name + LR_SUFFIX[0], safe=""), b=b))
    r_url = urljoin(base, pat.format(q=quote(name + LR_SUFFIX[1], safe=""), b=b))
    tl, cl = fetch(l_url)
    tr, cr = fetch(r_url)
    if cl == 200 and cr == 200 and tl and tr:
        rl, rr = parse_rows(tl), parse_rows(tr)
        if rl and rr:
            return decimate(avg_two(rl, rr)), "LR"
    for suf in LR_SUFFIX[2:]:
        u1 = urljoin(base, pat.format(q=quote(name + suf, safe=""), b=b))
        u2 = urljoin(base, pat.format(q=quote(name + {" L": " R", " R": " L",
               "_L": "_R", "_R": "_L", "-L": "-R", "-R": "-L"}[suf], safe=""), b=b))
        t1, c1 = fetch(u1); t2, c2 = fetch(u2)
        if c1 == 200 and c2 == 200 and t1 and t2:
            r1, r2 = parse_rows(t1), parse_rows(t2)
            if r1 and r2:
                return decimate(avg_two(r1, r2)), "LR"
    txt, code = fetch(url)
    if code == 200 and txt:
        rows = parse_rows(txt)
        if rows:
            return decimate(rows), "AVG"
    return None, code

# ---------- per site ----------
def parse_site(key, base):
    log(f"\n===== SITE {key} =====")
    html, code = fetch(base)
    if html is None:
        log(f"  FATAL index fetch failed: {code}")
        return []
    log(f"  index ok, {len(html)} bytes")
    blobs = [html]
    srcs = re.findall(r'<script[^>]*src=["\']([^"\']+)["\']', html)
    log(f"  script srcs: {srcs[:8]}")
    for s in srcs[:10]:
        u = s if s.startswith("http") else urljoin(base, s)
        t, c = fetch(u)
        if t:
            blobs.append(t)
    blob = "\n".join(blobs)

    models = []
    # Strategy A
    paths = literal_paths(blob, base)
    log(f"  [A] literal csv/txt paths: {len(paths)}")
    if paths:
        groups = {}
        for p in paths:
            low = unquote(p).lower()
            core = low[:-4] if low.endswith((".csv", ".txt")) else low
            ch = None
            for suf in ("(l)", " l", "_l", "-l", "%20l"):
                if core.endswith(suf):
                    ch = "L"; core = core[:-len(suf)]; break
            if ch is None:
                for suf in ("(r)", " r", "_r", "-r", "%20r"):
                    if core.endswith(suf):
                        ch = "R"; core = core[:-len(suf)]; break
            groups.setdefault(core, {})[ch or "A"] = p
        def work(cg):
            chans = cg[1]
            ra = None
            if "L" in chans and "R" in chans:
                tl, c1 = fetch(chans["L"]); tr, c2 = fetch(chans["R"])
                r1 = parse_rows(tl) if tl else None
                r2 = parse_rows(tr) if tr else None
                if r1 and r2:
                    ra = avg_two(r1, r2)
            if ra is None and chans.get("A"):
                t, c = fetch(chans["A"])
                ra = parse_rows(t) if t else None
            if not ra:
                return None
            nm = unquote(cg[0].rstrip("/").split("/")[-1])
            return {"name": nm, "src": key,
                    "pts": [x for pr in decimate(ra) for x in pr]}
        futs = [EX.submit(work, g) for g in groups.items()]
        for fu in as_completed(futs):
            r = fu.result()
            if r:
                models.append(r)
        log(f"  [A] parsed: {len(models)}")

    # Strategy B (if A gave little)
    if len(models) < 5:
        names = extract_names(blob)
        log(f"  [B] candidate names: {len(names)}; first: {names[:5]}")
        pat = probe_pattern(base, names) if names else None
        if pat:
            done = 0
            futs = {EX.submit(fetch_model, base, pat, n): n for n in names[:900]}
            for fu in as_completed(futs):
                rows, kind = fu.result()
                done += 1
                if done % 50 == 0:
                    log(f"  [B] progress {done}/{len(futs)}")
                if rows:
                    models.append({"name": futs[fu], "src": key,
                                   "pts": [x for pr in rows for x in pr]})
            log(f"  [B] parsed total: {len(models)}")
        else:
            log("  [B] no working path pattern found; DEBUG first names probes:")
            for n in names[:3]:
                q = quote(n, safe="")
                t, c = fetch(urljoin(base, f"measurements/{q}.csv"))
                log(f"    {c}  measurements/{q}.csv")
    return models

def main():
    allm = []
    for k, base in SQUIGS.items():
        try:
            allm.extend(parse_site(k, base))
        except Exception as e:
            log(f"  SITE {k} crashed: {e}")
    # dedupe
    seen, uniq = set(), []
    for m in allm:
        key = (m["src"], m["name"].lower())
        if key in seen or not m["pts"]:
            continue
        seen.add(key)
        uniq.append(m)
    out = {"meta": {"updated": datetime.utcnow().isoformat(),
                    "sources": list(SQUIGS.keys()), "total": len(uniq)},
           "hps": uniq}
    import os
    os.makedirs("data", exist_ok=True)
    with open("data/squig-db.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    log(f"\nTOTAL MODELS: {len(uniq)}")
    for k in SQUIGS:
        log(f"  {k}: {sum(1 for m in uniq if m['src']==k)}")

if __name__ == "__main__":
    main()
