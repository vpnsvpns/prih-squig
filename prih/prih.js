"use strict";
/* ================= Prih EQ Playground ================= */
const CFG = window.CONFIG;
const NR  = CFG.normRange || [500, 2000];
const PALETTE = ["#4fc3f7","#ff8a65","#aed581","#ba68c8","#ffd54f","#4db6ac","#f06292","#7986cb","#a1887f","#e57373"];

/* ---------- сетка частот и DSP ---------- */
const FMIN = 20, FMAX = 20000, SPO = 96; // шагов на октаву
const GRID = (() => {
  const n = Math.round(Math.log2(FMAX / FMIN) * SPO);
  const g = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) g[i] = FMIN * Math.pow(2, i / SPO);
  return g;
})();

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const css = v => getComputedStyle(document.body).getPropertyValue(v).trim();
const $ = id => document.getElementById(id);
async function fetchText(u){ const r = await fetch(u); if(!r.ok) throw new Error(r.status); return r.text(); }

// парсер «частота значение [значение2]», разделители: пробел/таб/запятая/точка с запятой
function parseTable(text){
  const rows = [];
  for (const line of text.split(/\r?\n/)){
    const c = line.trim().split(/[\s,;]+/).map(Number);
    if (c.length >= 2 && c[0] > 0 && Number.isFinite(c[0]) && Number.isFinite(c[1])) rows.push(c.slice(0, 3));
  }
  return rows;
}
function resample(pts){ // pts: [[f, v], ...] по возрастанию f → значения на сетке GRID
  const out = new Float64Array(GRID.length), n = pts.length; let j = 0;
  for (let i = 0; i < GRID.length; i++){
    const f = GRID[i];
    if (f <= pts[0][0])     { out[i] = pts[0][1];     continue; }
    if (f >= pts[n-1][0])   { out[i] = pts[n-1][1];   continue; }
    while (pts[j+1][0] < f) j++;
    const [f0, v0] = pts[j], [f1, v1] = pts[j+1];
    out[i] = v0 + (v1 - v0) * (Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0));
  }
  return out;
}
function smoothCurve(y, oct){ // гауссово сглаживание, ширина = oct октав
  if (!oct) return y;
  const sigma = oct * SPO / 2.355, r = Math.max(1, Math.ceil(sigma * 3));
  const out = new Float64Array(y.length);
  for (let i = 0; i < y.length; i++){
    let s = 0, w = 0;
    for (let k = -r; k <= r; k++){
      const idx = i + k; if (idx < 0 || idx >= y.length) continue;
      const g = Math.exp(-k * k / (2 * sigma * sigma));
      s += y[idx] * g; w += g;
    }
    out[i] = s / w;
  }
  return out;
}
function normOffset(y, r = NR){
  let s = 0, n = 0;
  for (let i = 0; i < GRID.length; i++) if (GRID[i] >= r[0] && GRID[i] <= r[1]){ s += y[i]; n++; }
  return n ? s / n : 0;
}
function shift(y, d){ const o = new Float64Array(y.length); for (let i = 0; i < y.length; i++) o[i] = y[i] + d; return o; }
function averageCurves(list){
  const o = new Float64Array(GRID.length);
  for (const y of list) for (let i = 0; i < GRID.length; i++) o[i] += y[i];
  for (let i = 0; i < GRID.length; i++) o[i] /= list.length;
  return o;
}
// модель пикового фильтра (дБ), симметричная по лог-частоте
function shape(f, f0, q){ const x = f / f0 - f0 / f; return 1 / (1 + (q * x) * (q * x)); }

/* ---------- состояние ---------- */
const state = {
  selected: new Map(),               // name -> {color, raw}
  average: null, avgN: 0,
  target: null,
  prefs: { bass: 0, tilt: 0, treble: 0 },
  normalize: true,
  smooth: 1 / 3,
  aeq: Object.assign({}, CFG.autoEqDefaults),
  eq: null, eqShow: true
};
const targets = new Map();           // name -> {def, raw}
const hpCache = new Map();

/* ---------- загрузка таргетов ---------- */
async function loadTargets(){
  const sel = $("targetSel"); sel.innerHTML = "";
  const groups = {};
  for (const t of CFG.targets) (groups[t.group || "Targets"] = groups[t.group || "Targets"] || []).push(t);
  let firstOk = null;
  for (const gname in groups){
    const og = document.createElement("optgroup"); og.label = gname;
    for (const t of groups[gname]){
      const op = document.createElement("option"); op.value = t.name; op.textContent = t.name;
      let ok = false;
      try {
        const pts = parseTable(await fetchText(t.file)).map(r => [r[0], r[1]]);
        if (pts.length > 10){ targets.set(t.name, { def: t, raw: resample(pts) }); ok = true; }
      } catch(e){}
      if (!ok){ op.disabled = true; op.textContent += " (нет файла)"; }
      else if (!firstOk) firstOk = t.name;
      og.appendChild(op);
    }
    sel.appendChild(og);
  }
  const d = CFG.targets.find(t => t.default && targets.has(t.name));
  state.target = d ? d.name : firstOk;
  sel.value = state.target || "";
}

/* ---------- загрузка замеров ---------- */
function loadHp(def){
  if (!hpCache.has(def.name)){
    hpCache.set(def.name, doLoadHp(def).catch(e => { hpCache.delete(def.name); throw e; }));
  }
  return hpCache.get(def.name);
}
async function doLoadHp(def){
  if (def.file){
    const rows = parseTable(await fetchText(def.file));
    return resample(rows.map(r => [r[0], r.length > 2 ? (r[1] + r[2]) / 2 : r[1]]));
  }
  const [lt, rt] = await Promise.all([fetchText(def.L), fetchText(def.R)]);
  const l = resample(parseTable(lt).map(r => [r[0], r[1]]));
  const r = resample(parseTable(rt).map(r => [r[0], r[1]]));
  const raw = new Float64Array(GRID.length);
  for (let i = 0; i < GRID.length; i++) raw[i] = (l[i] + r[i]) / 2;
  return raw;
}
async function toggleHp(def){
  if (state.selected.has(def.name)){
    state.selected.delete(def.name);
  } else {
    const color = PALETTE[state.selected.size % PALETTE.length];
    state.selected.set(def.name, { color, raw: null });
    try { state.selected.get(def.name).raw = await loadHp(def); }
    catch(e){ state.selected.delete(def.name); toast("Не удалось загрузить замер: " + def.name); }
  }
  invalidateEq(); renderList(); updateLegend(); draw();
}

/* ---------- обработка кривых ---------- */
function process(raw){
  let y = state.smooth ? smoothCurve(raw, state.smooth) : raw;
  if (state.normalize) y = shift(y, -normOffset(y));
  return y;
}
function applyPrefs(raw){
  const { bass, tilt, treble } = state.prefs;
  if (!bass && !tilt && !treble) return raw;
  const o = new Float64Array(GRID.length);
  for (let i = 0; i < GRID.length; i++){
    const f = GRID[i];
    o[i] = raw[i]
      + bass   / (1 + Math.pow(f / 105, 2))
      + treble / (1 + Math.pow(10000 / f, 2))
      + tilt * Math.log2(f / 1000);
  }
  return o;
}
function targetRaw(){
  const t = targets.get(state.target); if (!t) return null;
  return t.def.adjustable ? applyPrefs(t.raw) : t.raw;
}
function targetCurve(){
  const r = targetRaw(); if (!r) return null;
  return state.normalize ? shift(r, -normOffset(r)) : r;
}
function series(){
  const S = [];
  for (const [name, s] of state.selected) if (s.raw) S.push({ name, color: s.color, y: process(s.raw) });
  if (state.average) S.push({ name: "AVERAGE", color: css("--text"), dash: [6, 4], y: process(state.average) });
  const t = targetCurve(); if (t) S.push({ name: state.target, color: css("--target"), w: 2.2, y: t });
  if (state.eq && state.eqShow) S.push({ name: "EQ result", color: css("--eq"), y: process(state.eq.curve) });
  return S;
}

/* ---------- отрисовка ---------- */
const XTICKS = [20,30,40,50,60,80,100,200,300,400,500,600,800,1000,2000,3000,4000,5000,6000,8000,10000,20000];
const XLBL = {20:"20",50:"50",100:"100",200:"200",500:"500",1000:"1k",2000:"2k",5000:"5k",10000:"10k",20000:"20k"};

function draw(){
  const cv = $("graph");
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = css("--bg"); ctx.fillRect(0, 0, W, H);

  const m = { l: 48, r: 14, t: 34, b: 30 };
  const S = series();
  let lo = Infinity, hi = -Infinity;
  for (const s of S) for (const v of s.y){ if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!S.length){ lo = 40; hi = 100; }
  lo = Math.floor((lo - 3) / 5) * 5; hi = Math.ceil((hi + 3) / 5) * 5;
  if (hi - lo < 20) hi = lo + 20;

  const X = f => m.l + (Math.log2(f / FMIN) / Math.log2(FMAX / FMIN)) * (W - m.l - m.r);
  const Y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);

  ctx.lineWidth = 1; ctx.font = "11px system-ui";
  for (const f of XTICKS){
    const x = X(f);
    ctx.strokeStyle = css("--grid"); ctx.globalAlpha = XLBL[f] ? 0.9 : 0.35;
    ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, H - m.b); ctx.stroke(); ctx.globalAlpha = 1;
    if (XLBL[f]){ ctx.fillStyle = css("--muted"); ctx.textAlign = "center"; ctx.fillText(XLBL[f], x, H - m.b + 16); }
  }
  for (let v = lo; v <= hi; v += 5){
    const y = Y(v);
    ctx.strokeStyle = css("--grid"); ctx.globalAlpha = v % 10 === 0 ? 0.8 : 0.3;
    ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(W - m.r, y); ctx.stroke(); ctx.globalAlpha = 1;
    if (v % 10 === 0){ ctx.fillStyle = css("--muted"); ctx.textAlign = "right"; ctx.fillText(v, m.l - 6, y + 3); }
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, W - m.l - m.r, H - m.t - m.b); ctx.clip();
  for (const s of S){
    ctx.strokeStyle = s.color; ctx.lineWidth = s.w || 1.8; ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    for (let i = 0; i < GRID.length; i++){
      const x = X(GRID[i]), y = Y(s.y[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore(); ctx.setLineDash([]);

  ctx.fillStyle = css("--text"); ctx.font = "600 13px system-ui"; ctx.textAlign = "left";
  ctx.fillText("Prih · EQ Playground · 711", m.l + 4, m.t - 12);
}

/* ---------- легенда и список ---------- */
function chip(color, label, onclick){
  const d = document.createElement("div"); d.className = "chip";
  d.innerHTML = `<span class="sw" style="background:${color}"></span><span>${esc(label)}</span>`;
  if (onclick) d.onclick = onclick; else d.style.cursor = "default";
  return d;
}
function updateLegend(){
  const lg = $("legend"); lg.innerHTML = "";
  for (const [name, s] of state.selected){
    lg.appendChild(chip(s.color, name, () => {
      const def = CFG.hps.find(h => h.name === name); if (def) toggleHp(def);
    }));
  }
  if (state.average) lg.appendChild(chip(css("--text"), `AVERAGE (${state.avgN})`, () => { state.average = null; updateLegend(); draw(); }));
  if (state.target)  lg.appendChild(chip(css("--target"), "TARGET: " + state.target));
  if (state.eq)      lg.appendChild(chip(css("--eq"), "EQ result", () => { state.eqShow = !state.eqShow; $("eqShowChk").checked = state.eqShow; draw(); }));
}
function renderList(){
  const box = $("hplist"), q = $("search").value.trim().toLowerCase();
  box.innerHTML = "";
  if (!CFG.hps.length){ box.innerHTML = "<div class='muted'>Список пуст — добавьте замеры в config.js</div>"; return; }
  let shown = 0;
  for (const hp of CFG.hps){
    if (q && !hp.name.toLowerCase().includes(q)) continue;
    shown++;
    const d = document.createElement("div");
    d.className = "hp" + (state.selected.has(hp.name) ? " sel" : "");
    d.innerHTML = `<span class="nm">${esc(hp.name)}</span><span class="src">${esc(hp.source || "")}</span>`;
    d.onclick = () => toggleHp(hp);
    box.appendChild(d);
  }
  if (!shown) box.innerHTML = "<div class='muted'>Ничего не найдено</div>";
}

/* ---------- Auto EQ ---------- */
function optGain(e, f, f0, q, o){
  let num = 0, den = 0;
  for (let i = 0; i < f.length; i++){ const m = shape(f[i], f0, q); num += e[i] * m; den += m * m; }
  let g = den > 0 ? -num / den : 0;
  g = clamp(g, o.gmin, o.gmax);
  let s = 0;
  for (let i = 0; i < f.length; i++){ const d = e[i] + g * shape(f[i], f0, q); s += d * d; }
  return { f: f0, g, q, score: s };
}
function logspace(a, b, n){ const o = []; for (let i = 0; i < n; i++) o.push(a * Math.pow(b / a, i / (n - 1))); return o; }

function fitPeq(err, f, o){
  const n = f.length, e = Float64Array.from(err), fs = [];
  const qs = [...new Set([o.qmin, 0.2, 0.3, 0.5, 0.7, 1, 1.4, o.qmax].map(q => clamp(q, o.qmin, o.qmax)))];

  for (let k = 0; k < o.count; k++){
    let bi = 0;
    for (let i = 1; i < n; i++) if (Math.abs(e[i]) > Math.abs(e[bi])) bi = i;
    if (Math.abs(e[bi]) < 0.3) break;
    let best = null;
    for (const q of qs){ const c = optGain(e, f, f[bi], q, o); if (!best || c.score < best.score) best = c; }
    for (let it = 0; it < 2; it++){
      const f0 = best.f, q0 = best.q; let improved = false;
      for (const ff of [f0/1.2, f0/1.07, f0, f0*1.07, f0*1.2]){
        if (ff < o.fmin * 0.9 || ff > o.fmax * 1.1) continue;
        for (const qq of [q0/1.6, q0, q0*1.6]){
          const c = optGain(e, f, ff, clamp(qq, o.qmin, o.qmax), o);
          if (c.score < best.score - 1e-9){ best = c; improved = true; }
        }
      }
      if (!improved) break;
    }
    for (let i = 0; i < n; i++) e[i] += best.g * shape(f[i], best.f, best.q);
    fs.push({ f: best.f, g: best.g, q: best.q });
  }
  // финальная доводка всех фильтров
  for (let pass = 0; pass < 2; pass++){
    for (let k = 0; k < fs.length; k++){
      const fl = fs[k];
      for (let i = 0; i < n; i++) e[i] -= fl.g * shape(f[i], fl.f, fl.q);
      let best = fl, bs = Infinity;
      for (let i = 0; i < n; i++){ const d = e[i] + fl.g * shape(f[i], fl.f, fl.q); bs += 0; }
      bs = 0; for (let i = 0; i < n; i++){ const d = e[i] + fl.g * shape(f[i], fl.f, fl.q); bs += d * d; }
      const zero = { f: fl.f, g: 0, q: fl.q };
      { let s = 0; for (let i = 0; i < n; i++) s += e[i] * e[i]; zero.score = s; if (s < bs){ bs = s; best = zero; } }
      for (const ff of logspace(fl.f / 1.35, fl.f * 1.35, 9)){
        if (ff < o.fmin * 0.9 || ff > o.fmax * 1.1) continue;
        for (const qq of [fl.q/1.8, fl.q/1.25, fl.q, fl.q*1.25, fl.q*1.8]){
          const c = optGain(e, f, ff, clamp(qq, o.qmin, o.qmax), o);
          if (c.score < bs){ bs = c.score; best = c; }
        }
      }
      fs[k] = { f: best.f, g: best.g, q: best.q };
      for (let i = 0; i < n; i++) e[i] += fs[k].g * shape(f[i], fs[k].f, fs[k].q);
    }
  }
  return fs.filter(x => Math.abs(x.g) >= 0.1).sort((a, b) => a.f - b.f);
}

function runAutoEq(){
  const raws = [...state.selected.values()].filter(s => s.raw).map(s => s.raw);
  if (!raws.length) return toast("Сначала выберите наушники");
  const tr = targetRaw(); if (!tr) return toast("Таргет недоступен");
  const a = state.aeq;
  const comb = averageCurves(raws), hpP = process(comb);
  let off = 0, n = 0;
  for (let i = 0; i < GRID.length; i++) if (GRID[i] >= NR[0] && GRID[i] <= NR[1]){ off += hpP[i] - tr[i]; n++; }
  off = n ? off / n : 0;
  const idx = [];
  for (let i = 0; i < GRID.length; i++) if (GRID[i] >= a.fmin && GRID[i] <= a.fmax) idx.push(i);
  if (idx.length < 10) return toast("Слишком узкий диапазон частот");
  const subF = new Float64Array(idx.length), subE = new Float64Array(idx.length);
  idx.forEach((gi, k) => { subF[k] = GRID[gi]; subE[k] = hpP[gi] - (tr[gi] + off); });
  const filters = fitPeq(subE, subF, a);
  const curve = new Float64Array(GRID.length); let pk = 0;
  for (let i = 0; i < GRID.length; i++){
    let v = comb[i], fv = 0;
    for (const fl of filters){ const s = fl.g * shape(GRID[i], fl.f, fl.q); v += s; fv += s; }
    curve[i] = v; if (fv > pk) pk = fv;
  }
  state.eq = { filters, preamp: -Math.max(0, pk), curve };
  state.eqShow = true; $("eqShowChk").checked = true;
  renderEqTable(); updateLegend(); draw();
}
function eqText(){
  if (!state.eq) return "";
  const L = [`Preamp: ${state.eq.preamp.toFixed(1)} dB`];
  state.eq.filters.forEach((fl, i) =>
    L.push(`Filter ${i + 1}: ON PK Fc ${fl.f >= 100 ? fl.f.toFixed(0) : fl.f.toFixed(1)} Hz Gain ${fl.g.toFixed(1)} dB Q ${fl.q.toFixed(2)}`));
  return L.join("\n");
}
function renderEqTable(){
  const t = $("eqTable");
  if (!state.eq){ t.innerHTML = "<tr><td class='muted'>Нажмите «Применить»</td></tr>"; $("btnCopyEq").disabled = true; return; }
  let html = "<tr><th>#</th><th>Fc, Гц</th><th>Gain, дБ</th><th>Q</th></tr>";
  state.eq.filters.forEach((f, i) => html += `<tr><td>${i + 1}</td><td>${f.f.toFixed(1)}</td><td>${f.g.toFixed(2)}</td><td>${f.q.toFixed(2)}</td></tr>`);
  html += `<tr><td colspan="4">Preamp: ${state.eq.preamp.toFixed(2)} dB</td></tr>`;
  t.innerHTML = html; $("btnCopyEq").disabled = false;
}

/* ---------- кнопки сверху ---------- */
async function averageAll(){
  if (!CFG.hps.length) return toast("Список замеров пуст");
  const btn = $("btnAvg"); btn.disabled = true;
  const sum = new Float64Array(GRID.length); let n = 0;
  for (let i = 0; i < CFG.hps.length; i++){
    btn.textContent = `Average ${i + 1}/${CFG.hps.length}`;
    try { const raw = await loadHp(CFG.hps[i]); for (let j = 0; j < GRID.length; j++) sum[j] += raw[j]; n++; } catch(e){}
    if (i % 5 === 4) await new Promise(r => setTimeout(r));
  }
  if (n){ for (let j = 0; j < GRID.length; j++) sum[j] /= n; state.average = sum; state.avgN = n; toast(`Average: ${n} наушников`); }
  else toast("Не удалось загрузить ни одного замера");
  btn.textContent = "Average All"; btn.disabled = false;
  updateLegend(); draw();
}
function screenshot(){
  $("graph").toBlob(b => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = "prih-playground.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}
function hashFromState(){
  return "#" + encodeURIComponent(JSON.stringify({
    v: 1, sel: [...state.selected.keys()], tgt: state.target,
    prf: state.prefs, nrm: state.normalize, sm: state.smooth, aeq: state.aeq
  }));
}
async function copyUrl(){
  const u = location.origin + location.pathname + hashFromState();
  try { await navigator.clipboard.writeText(u); toast("URL скопирован"); }
  catch(e){ location.hash = hashFromState(); toast("Скопируйте URL из адресной строки"); }
}
function restore(){
  if (!location.hash || location.hash.length < 2) return;
  let s; try { s = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch(e){ return; }
  if (s.tgt && targets.has(s.tgt)){ state.target = s.tgt; $("targetSel").value = s.tgt; }
  if (s.prf) state.prefs = Object.assign(state.prefs, s.prf);
  if (typeof s.nrm === "boolean") state.normalize = s.nrm;
  if (typeof s.sm === "number") state.smooth = s.sm;
  if (s.aeq) state.aeq = Object.assign(state.aeq, s.aeq);
  syncInputs(); updatePrefsPanel();
  (s.sel || []).forEach(nm => { const def = CFG.hps.find(h => h.name === nm); if (def) toggleHp(def); });
  draw();
}

/* ---------- UI ---------- */
const SMOOTH = { "off": 0, "1/12": 1/12, "1/6": 1/6, "1/3": 1/3, "1": 1 };
function num(el, fb){ const v = parseFloat(el.value); return Number.isFinite(v) ? v : fb; }
function readAeq(){
  state.aeq = {
    count: Math.round(clamp(num($("aeCount"), 8), 1, 30)),
    fmin: clamp(num($("aeFmin"), 20), 10, 10000),
    fmax: clamp(num($("aeFmax"), 8000), 100, 20000),
    gmin: num($("aeGmin"), -10), gmax: num($("aeGmax"), 6),
    qmin: clamp(num($("aeQmin"), 0.1), 0.05, 10), qmax: clamp(num($("aeQmax"), 1.5), 0.05, 10)
  };
}
function syncInputs(){
  $("normChk").checked = state.normalize;
  for (const [k, v] of Object.entries(SMOOTH)) if (Math.abs(v - state.smooth) < 1e-6) $("smoothSel").value = k;
  $("bassR").value = state.prefs.bass; $("bassO").textContent = state.prefs.bass.toFixed(1) + " дБ";
  $("tiltR").value = state.prefs.tilt; $("tiltO").textContent = state.prefs.tilt.toFixed(2);
  $("trebR").value = state.prefs.treble; $("trebO").textContent = state.prefs.treble.toFixed(1) + " дБ";
  $("aeCount").value = state.aeq.count; $("aeFmin").value = state.aeq.fmin; $("aeFmax").value = state.aeq.fmax;
  $("aeGmin").value = state.aeq.gmin; $("aeGmax").value = state.aeq.gmax;
  $("aeQmin").value = state.aeq.qmin; $("aeQmax").value = state.aeq.qmax;
}
function updatePrefsPanel(){
  const t = targets.get(state.target), adj = t && t.def.adjustable;
  $("prefsPanel").classList.toggle("disabled", !adj);
  $("prefsNote").textContent = adj ? "" : "Этот таргет фиксированный — редактирование недоступно";
}
function invalidateEq(){ state.eq = null; renderEqTable(); }
let toastTimer;
function toast(msg){
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}

/* ---------- init ---------- */
async function init(){
  if (localStorage.getItem("prih-theme") === "light") document.body.classList.add("light");
  await loadTargets();

  $("search").addEventListener("input", renderList);
  $("targetSel").addEventListener("change", e => { state.target = e.target.value; invalidateEq(); updatePrefsPanel(); updateLegend(); draw(); });
  $("bassR").addEventListener("input", e => { state.prefs.bass = +e.target.value; $("bassO").textContent = (+e.target.value).toFixed(1) + " дБ"; invalidateEq(); draw(); });
  $("tiltR").addEventListener("input", e => { state.prefs.tilt = +e.target.value; $("tiltO").textContent = (+e.target.value).toFixed(2); invalidateEq(); draw(); });
  $("trebR").addEventListener("input", e => { state.prefs.treble = +e.target.value; $("trebO").textContent = (+e.target.value).toFixed(1) + " дБ"; invalidateEq(); draw(); });
  $("prefsReset").onclick = () => { state.prefs = { bass: 0, tilt: 0, treble: 0 }; syncInputs(); invalidateEq(); draw(); };
  $("normChk").addEventListener("change", e => { state.normalize = e.target.checked; invalidateEq(); draw(); });
  $("smoothSel").addEventListener("change", e => { state.smooth = SMOOTH[e.target.value]; invalidateEq(); draw(); });
  for (const id of ["aeCount","aeFmin","aeFmax","aeGmin","aeGmax","aeQmin","aeQmax"]) $(id).addEventListener("change", readAeq);
  $("btnEq").onclick = runAutoEq;
  $("btnCopyEq").onclick = () => navigator.clipboard.writeText(eqText()).then(() => toast("PEQ скопирован"));
  $("eqShowChk").addEventListener("change", e => { state.eqShow = e.target.checked; draw(); });
  $("btnAvg").onclick = averageAll;
  $("btnShot").onclick = screenshot;
  $("btnUrl").onclick = copyUrl;
  $("btnTheme").onclick = () => {
    document.body.classList.toggle("light");
    localStorage.setItem("prih-theme", document.body.classList.contains("light") ? "light" : "dark");
    draw();
  };

  syncInputs(); renderList(); updatePrefsPanel(); renderEqTable(); draw(); restore();
  new ResizeObserver(draw).observe($("center"));
}
init();