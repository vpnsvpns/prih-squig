#!/usr/bin/env python3
"""
Parse all measurements from gudkov/pw/boizoff squig.link sites
and export to squig-db.json for Prih EQ Playground
"""
import requests
import json
import re
import sys
from urllib.parse import urljoin, quote
from datetime import datetime

SQUIGS = {
    "gudkov": "https://gudkov.squig.link/",
    "pw": "https://pw.squig.link/",
    "boizoff": "https://boizoff.squig.link/"
}

def fetch(url, timeout=10):
    """Fetch URL with error handling"""
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}", file=sys.stderr)
        return None

def extract_csv_paths(html, base_url):
    """Extract all .csv and .txt paths from HTML/JS"""
    paths = set()
    
    # Pattern 1: href="...csv"
    for m in re.finditer(r'href=["\']([^"\']+\.(?:csv|txt))["\']', html):
        paths.add(m.group(1))
    
    # Pattern 2: plain text URLs ending in .csv or .txt
    for m in re.finditer(r'(?:https?://[^"\'<>\s]+|[a-zA-Z0-9_\-./%]+)\.(?:csv|txt)', html):
        path = m.group(0)
        if not path.startswith('http'):
            path = urljoin(base_url, path)
        paths.add(path)
    
    # Resolve relative URLs
    resolved = []
    for p in paths:
        if not p.startswith('http'):
            p = urljoin(base_url, p)
        resolved.append(p)
    
    return list(set(resolved))

def group_channels(paths):
    """Group L/R channels and identify single files"""
    groups = {}
    suffixes = [
        '(l)', '(r)', ' l', ' r', '_l', '_r', '-l', '-r',
        '%20l', '%20r', ' L', ' R'
    ]
    
    for path in paths:
        decoded = path.lower()
        # Remove extension
        if decoded.endswith('.csv'):
            core = decoded[:-4]
        elif decoded.endswith('.txt'):
            core = decoded[:-4]
        else:
            continue
        
        # Check for L/R suffix
        channel = None
        base = core
        for suf in suffixes:
            if core.endswith(suf):
                channel = suf[-1].upper()
                base = core[:-len(suf)]
                break
        
        if base not in groups:
            groups[base] = {}
        
        if channel:
            groups[base][channel] = path
        else:
            groups[base]['A'] = path  # Single file (no channel)
    
    return groups

def parse_measurement(url):
    """Parse a single measurement file"""
    content = fetch(url)
    if not content:
        return None
    
    # Parse CSV/TXT format: freq,value or freq,L,R
    rows = []
    for line in content.strip().split('\n'):
        parts = re.split(r'[,\s]+', line.strip())
        if len(parts) < 2:
            continue
        try:
            freq = float(parts[0])
            if len(parts) == 2:
                value = float(parts[1])
            elif len(parts) >= 3:
                # Average L and R if both present
                value = (float(parts[1]) + float(parts[2])) / 2
            else:
                continue
            
            if freq > 0:
                rows.append((freq, value))
        except:
            continue
    
    return rows if len(rows) >= 20 else None

def average_measurements(meas_list):
    """Average multiple measurements at each frequency"""
    if not meas_list:
        return None
    
    # Find common frequencies (use first measurement as reference)
    ref = meas_list[0]
    result = []
    
    for freq, _ in ref:
        values = []
        for meas in meas_list:
            # Find closest frequency
            closest = min(meas, key=lambda x: abs(x[0] - freq))
            if abs(closest[0] - freq) < 1:  # Within 1 Hz
                values.append(closest[1])
        
        if values:
            result.append((freq, sum(values) / len(values)))
    
    return result

def parse_squig_site(name, base_url):
    """Parse all measurements from a squig site"""
    print(f"\n{'='*60}")
    print(f"Parsing {name} ({base_url})")
    print(f"{'='*60}")
    
    # Fetch main page
    html = fetch(base_url)
    if not html:
        print(f"  Failed to fetch {base_url}")
        return []
    
    # Find all JS files
    js_paths = []
    for m in re.finditer(r'<script[^>]+src=["\']([^"\']+\.js)["\']', html):
        js_url = m.group(1)
        if not js_url.startswith('http'):
            js_url = urljoin(base_url, js_url)
        js_paths.append(js_url)
    
    print(f"  Found {len(js_paths)} JS files")
    
    # Combine HTML + all JS
    all_content = html
    for js_url in js_paths:
        js_content = fetch(js_url)
        if js_content:
            all_content += "\n" + js_content
    
    # Extract all CSV/TXT paths
    csv_paths = extract_csv_paths(all_content, base_url)
    print(f"  Found {len(csv_paths)} CSV/TXT paths")
    
    # Group by model (L/R channels)
    groups = group_channels(csv_paths)
    print(f"  Grouped into {len(groups)} models")
    
    # Parse each model
    models = []
    for base_path, channels in groups.items():
        # Extract model name from path
        # Remove query params and decode
        clean_path = base_path.split('?')[0]
        model_name = clean_path.split('/')[-1]
        
        # Remove channel suffixes and extension
        for suf in ['(l)', '(r)', ' l', ' r', '_l', '_r', '-l', '-r', '%20l', '%20r', ' L', ' R']:
            if model_name.endswith(suf):
                model_name = model_name[:-len(suf)]
        if model_name.endswith('.csv'):
            model_name = model_name[:-4]
        elif model_name.endswith('.txt'):
            model_name = model_name[:-4]
        
        # Decode URL encoding
        try:
            from urllib.parse import unquote
            model_name = unquote(model_name)
        except:
            pass
        
        # Parse measurement(s)
        measurements = []
        for ch, url in channels.items():
            meas = parse_measurement(url)
            if meas:
                measurements.append(meas)
        
        if not measurements:
            continue
        
        # Average if multiple measurements (L+R)
        if len(measurements) > 1:
            avg = average_measurements(measurements)
            if avg:
                measurements = [avg]
        
        # Convert to point pairs
        pts = []
        for freq, value in measurements[0]:
            pts.extend([freq, value])
        
        models.append({
            "name": model_name,
            "src": name,
            "pts": pts
        })
        
        print(f"  ✓ {model_name}")
    
    print(f"  Parsed {len(models)} models from {name}")
    return models

def main():
    all_models = []
    
    # Parse each squig site
    for name, url in SQUIGS.items():
        models = parse_squig_site(name, url)
        all_models.extend(models)
    
    # Remove duplicates by name
    seen = set()
    unique_models = []
    for m in all_models:
        if m['name'] not in seen:
            seen.add(m['name'])
            unique_models.append(m)
    
    # Build output JSON
    output = {
        "meta": {
            "updated": datetime.now().isoformat(),
            "sources": list(SQUIGS.keys()),
            "total": len(unique_models)
        },
        "hps": unique_models
    }
    
    # Write to file
    output_file = "data/squig-db.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Exported {len(unique_models)} models to {output_file}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()