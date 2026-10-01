#!/usr/bin/env python3
"""Ежечасный парсер замеров pw/boizoff/gudkov squig.link -> data/squig-db.json"""
import json, re, os, math, bisect, datetime, urllib.request, urllib.parse

SITES = ["pw", "boizoff", "gudkov"]
UA = {"User-Agent": "Mozilla/5.0 (prih-squig-parser)"}
CFG_CANDIDATES = ["config.js", "config.json", "models.json", "data/models.json", "hp_list.json"]

def get(u):
    try:
        req = urllib.request.Request(u, headers=UA)
        return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    except Exception as e:
        print("  ! fetch fail", u, e)
        return None

def parse_table(t):
    rows = []
    for line in t.splitlines():
        toks = [x for x in re.split(r"[\s,;]+", line.strip()) if x]
        if len(toks) < 2:
            continue
        try:
            f = float(toks[0]); v = float(toks[1])
            v2 = float(toks[2]) if len(toks) > 2 else None
        except ValueError:
            continue
        if f <= 0:
            continue
        rows.append((f, (v + v2) / 2 if v2 is not None else v))
    rows.sort()
    return rows

def interp(rows, f):
    xs = [r[0] for r in rows]
    i = bisect.bisect_left(xs, f)
    if i <= 0: return rows[0][1]
    if i >= len(rows): return rows[-1][1]
    f0, v0 = rows[i - 1]; f1, v1 = rows[i]
    return v0 + (v1 - v0) * (math.log(f) - math.log(f0)) / (math.log(f1) - math.log(f0))

def walk_json(o, out):
    if isinstance(o, dict):
        nm = o.get("name") or o.get("model") or o.get("label")
        fs = [o[k] for k in ("file", "url", "path", "L", "R", "left", "right")
              if isinstance(o.get(k), str) and re.search(r"\.(csv|txt)$", o[k], re.I)]
        if nm and fs:
            out.append((str(nm), fs)); return
        for v in o.values(): walk_json(v, out)
    elif isinstance(o, list):
        for v in o: walk_json(v, out)

def extract_pairs(text):
    out = []
    t = text.strip()
    if t[:1] in "[{":
        try:
            walk_json(json.loads(t), out)
            return out
        except Exception:
            pass
    for m in re.finditer(r"""name\s*:\s*["']([^"']+)["']""", text):
        seg = text[m.end():m.end() + 600]
        files = re.findall(r"""["']([^"']+?\.(?:csv|txt))["']""", seg)
        if files and not any(o[0] == m.group(1) for o in out):
            out.append((m.group(1), files[:2]))
    return out

def main():
    db = []
    for s in SITES:
        base = f"https://{s}.squig.link/"
        print("== site", s)
        pairs = []
        for c in CFG_CANDIDATES:
            t = get(base + c)
            if t:
                pairs = extract_pairs(t)
                if pairs:
                    break
        print("  models found:", len(pairs))
        for name, files in pairs:
            try:
                chans = []
                for fp in files:
                    u = fp if fp.startswith("http") else base + urllib.parse.quote(fp.lstrip("/"), safe="/:()@")
                    t = get(u)
                    if not t or t.lstrip()[:1] in "<!":
                        continue
                    r = parse_table(t)
                    if len(r) >= 20:
                        chans.append(r)
                if not chans:
                    continue
                merged = chans[0] if len(chans) == 1 else \
                    [(f, (v + interp(chans[1], f)) / 2) for f, v in chans[0]]
                dec = merged[::4] or merged
                flat = []
                for f, v in dec:
                    flat += [round(f, 3), round(v, 3)]
                db.append({"src": s, "name": name, "pts": flat})
                print("   +", name, len(flat) // 2)
            except Exception as e:
                print("   ! model fail", name, e)
    os.makedirs("data", exist_ok=True)
    meta = {"updated": datetime.datetime.utcnow().isoformat() + "Z", "count": len(db)}
    with open("data/squig-db.json", "w") as fh:
        json.dump({"meta": meta, "hps": db}, fh, separators=(",", ":"))
    print("total models:", len(db))

if __name__ == "__main__":
    main()
