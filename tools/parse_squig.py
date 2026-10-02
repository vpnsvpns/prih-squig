#!/usr/bin/env python3
"""Squig DB parser v3: name->file pairing from config, extension candidates,
inline arrays fallback, pattern probing fallback, verbose diagnostics."""
import requests, json, re, os, sys
from urllib.parse import urljoin, quote, unquote
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

SQUIGS = {
    "gudkov": "https://gudkov.squig.link/",
    "pw": "https://pw.squig.link/",
    "boizoff": "https://boizoff.squig.link/",
}
HEAD = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
S = requests.Session(); S.headers.update(HEAD)
EX = ThreadPoolExecutor(max_workers=12)
LOG = []

def log(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    LOG.append(line)

def fetch(url, timeout=12):
    try:
        r = S.get(url, timeout=timeout)
        return (r.text if r.status_code == 200 else None), r.status_code
    except Exception as e:
        return None, str(e)[:50]

def parse_rows(text):
    rows = []
    for line in text.split("\n"):
        parts = re.split(r"[,\s;]+", line.strip())
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
    step = len(rows) / float(maxpts)
    out, i = [], 0.0
    while int(i) < len(rows):
        out.append(rows[int(i)]); i += step
    return out

def avg_two(ra, rb):
    out, jb = [], 0
    for f, v in ra:
        while jb + 1 < len(rb) and abs(rb[jb+1][0]-f) < abs(rb[jb][0]-f):
            jb += 1
        out.append((f, (v + rb[jb][1]) / 2.0))
    return out

CONFIG_GUESS = ["config.js", "config.json", "js/config.js", "data/config.js",
    "measurements.js", "js/measurements.js", "graphdata.js", "js/graphdata.js",
    "data.js", "js/data.js", "graphs.js", "js/graphs.js", "assets/data.json",
    "data/measurements.json", "measurements.json"]

KEY_RE = re.compile(
    r'["\']?(name|model|displayname|label|file|path|url|data|values|curve)'
    r'["\']?\s*:\s*(?:"([^"]{0,400})"|\'([^\']{0,400})\'|\[([^\]]{0,30000})\])',
    re.I)

def extract_pairs(blob):
    """positional scan: nearest preceding name for each file/data key"""
    events = []
    for m in KEY_RE.finditer(blob):
        key = m.group(1).lower()
        val = m.group(2) or m.group(3) or m.group(4)
        if val is None:
            continue
        events.append((m.start(), key, val, m.group(4) is not None))
    pairs, inline = [], []
    lastname, lastpos = None, -10**9
    for pos, key, val, is_arr in events:
        if key in ("name", "model", "displayname", "label"):
            lastname, lastpos = val.strip(), pos
        elif key in ("file", "path", "url") and not is_arr:
            nm = lastname if (lastname and pos - lastpos < 800) else None
            pairs.append((nm, val.strip()))
        elif key in ("data", "values", "curve") and is_arr:
            nm = lastname if (lastname and pos - lastpos < 20000) else None
            inline.append((nm, val))
    return pairs, inline

def resolve_candidates(base, val):
    out = []
    v = val.strip()
    if v.startswith(("http", "//")):
        base_u = v if v.startswith("http") else "https:" + v
        out.append(base_u)
    else:
        out.append(urljoin(base, v))
    low = v.lower()
    if not low.endswith((".csv", ".txt")):
        if v.startswith("http"):
            out.append(v + ".csv"); out.append(v + ".txt")
        else:
            out.append(urljoin(base, v + ".csv"))
            out.append(urljoin(base, v + ".txt"))
    return out

def fetch_rows_any(cands):
    for u in cands:
        t, code = fetch(u)
        if t:
            rows = parse_rows(t)
            if rows:
                return rows, u
    return None, None

def chan_of(name_or_file):
    s = (name_or_file or "").lower()
    for suf in ("(l)", " l", "_l", "-l", "%20l", ".l"):
        if s.endswith(suf):
            return "L", s[:-len(suf)].strip()
    for suf in ("(r)", " r", "_r", "-r", "%20r", ".r"):
        if s.endswith(suf):
            return "R", s[:-len(suf)].strip()
    return None, s

def parse_inline_array(arrstr):
    nums = re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", arrstr)
    vals = [float(x) for x in nums]
    if len(vals) < 40 or len(vals) % 2:
        return None
    rows = [(vals[i], vals[i+1]) for i in range(0, len(vals)-1, 2)]
    rows = [r for r in rows if r[0] > 0 and -60 < r[1] < 160]
    return rows if len(rows) >= 20 else None

PROBE_PATTERNS = ["measurements/{q}.csv", "measurements/{q}.txt",
    "fr/{q}.csv", "data/{q}.csv", "measurements/{b}/{q}.csv",
    "graphs/{q}.csv", "{q}.csv"]

def probe_pattern(base, names):
    for n in names[:8]:
        q = quote(n, safe=""); b = quote(n.split(" ")[0], safe="")
        for pat in PROBE_PATTERNS:
            u = urljoin(base, pat.format(q=q, b=b))
            t, code = fetch(u)
            if t and parse_rows(t):
                log("  [probe] pattern hit:", pat, "for", n)
                return pat
    return None

def parse_site(key, base):
    log("\n===== SITE", key, base, "=====")
    html, code = fetch(base)
    if html is None:
        log("  FATAL index:", code); return []
    log("  index bytes:", len(html))
    blobs = [html]
    srcs = re.findall(r'<script[^>]*src=["\']([^"\']+)["\']', html)
    log("  script srcs:", srcs[:10])
    for s in srcs[:12]:
        u = s if s.startswith("http") else urljoin(base, s)
        t, c = fetch(u)
        if t:
            blobs.append(t)
    for g in CONFIG_GUESS:
        t, c = fetch(urljoin(base, g))
        if t and len(t) > 200:
            log("  config guess hit:", g, len(t))
            blobs.append(t)
    blob = "\n".join(blobs)

    pairs, inline = extract_pairs(blob)
    log("  name->file pairs:", len(pairs), " inline arrays:", len(inline))
    for p in pairs[:8]:
        log("    pair:", p)

    models, groups = [], {}
    def add_rows(name, rows):
        if not rows:
            return
        ch, base_name = chan_of(name)
        if ch:
            groups.setdefault(base_name, {})[ch] = rows
        else:
            models.append((name or "unknown", rows))

    jobs = []
    for nm, val in pairs[:1500]:
        jobs.append((nm, resolve_candidates(base, val)))
    def work(j):
        nm, cands = j
        rows, used = fetch_rows_any(cands)
        return nm, rows, used
    futs = [EX.submit(work, j) for j in jobs]
    okc = 0
    for fu in as_completed(futs):
        nm, rows, used = fu.result()
        if rows:
            okc += 1
            add_rows(nm or unquote(used.split("/")[-1]), rows)
    log("  pairs fetched ok:", okc, "of", len(jobs))

    if len(models) + len(groups) < 5 and inline:
        logc = 0
        for nm, arr in inline[:1500]:
            rows = parse_inline_array(arr)
            if rows:
                add_rows(nm, rows); logc += 1
        log("  inline arrays parsed:", logc)

    if len(models) + len(groups) < 5:
        names = [nm for nm, _ in pairs if nm] or []
        if not names:
            names = re.findall(r'"([A-Za-z0-9][^"\n]{3,70})"', blob)[:400]
        pat = probe_pattern(base, names)
        if pat:
            done = 0
            futs2 = {EX.submit(fetch_rows_any,
                [urljoin(base, pat.format(q=quote(n, safe=""),
                 b=quote(n.split(" ")[0], safe="")))]): n for n in names[:900]}
            for fu in as_completed(futs2):
                rows, used = fu.result(); done += 1
                if done % 100 == 0:
                    log("  probe progress", done)
                if rows:
                    add_rows(futs2[fu], rows)
            log("  probe parsed total:", len(models) + len(groups))

    for gname, chans in groups.items():
        if "L" in chans and "R" in chans:
            models.append((gname, avg_two(chans["L"], chans["R"])))
        elif chans:
            models.append((gname, list(chans.values())[0]))

    out = []
    seen = set()
    for nm, rows in models:
        nm = nm.strip()
        if not nm or nm.lower() in seen or len(rows) < 20:
            continue
        seen.add(nm.lower())
        pts = [x for pr in decimate(rows) for x in pr]
        out.append({"name": nm, "src": key, "pts": pts})
    log("  SITE RESULT:", key, len(out), "models")
    if out:
        log("    sample:", [m["name"] for m in out[:5]])
    return out

def main():
    allm = []
    for k, base in SQUIGS.items():
        try:
            allm.extend(parse_site(k, base))
        except Exception as e:
            log("  SITE CRASH", k, repr(e)[:200])
    seen, uniq = set(), []
    for m in allm:
        kk = (m["src"], m["name"].lower())
        if kk in seen:
            continue
        seen.add(kk); uniq.append(m)
    os.makedirs("data", exist_ok=True)
    out = {"meta": {"updated": datetime.utcnow().isoformat(),
                    "sources": list(SQUIGS.keys()), "total": len(uniq)},
           "hps": uniq}
    with open("data/squig-db.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    log("\nTOTAL:", len(uniq))
    for k in SQUIGS:
        log("  ", k, sum(1 for m in uniq if m["src"] == k))

if __name__ == "__main__":
    main()
