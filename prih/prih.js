"use strict";
const CFG = window.CONFIG;
const NR = CFG.normRange || [500, 2000];
const PALETTE = ["#38c5f4","#ff8a65","#aed581","#ba68c8","#ffd54f","#4db6ac","#f06292","#7986cb","#a1887f","#e57373"];
const FMIN = 20, FMAX = 20000, SPO = 96;
const GRID = (() => { const n = Math.round(Math.log2(FMAX/FMIN)*SPO); const g = new Float64Array(n+1); for (let i=0;i<=n;i++) g[i]=FMIN*Math.pow(2,i/SPO); return g; })();

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const css=v=>getComputedStyle(document.body).getPropertyValue(v).trim();
const $=id=>document.getElementById(id);
const num=(el,fb)=>{const v=parseFloat(el.value);return Number.isFinite(v)?v:fb;};
const isAbs=u=>/^https?:\/\//i.test(u);

function fetchWithTimeout(u,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return fetch(u,{signal:c.signal}).finally(()=>clearTimeout(t));}
async function fetchLocal(u){const r=await fetchWithTimeout(u,8000);if(!r.ok)throw new Error("HTTP "+r.status);return r.text();}
async function fetchRemote(u){
  const urls=[u,`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,`https://corsproxy.io/?url=${encodeURIComponent(u)}`];
  let err=null;
  for(const uu of urls){
    try{
      const r=await fetchWithTimeout(uu,7000);
      if(!r.ok)continue;
      const t=await r.text();
      if(t&&t.trim())return t;
    }catch(e){err=e;}
  }
  throw err||new Error("fetch failed");
}
const fetchAny=u=>isAbs(u)?fetchRemote(u):fetchLocal(u);

function parseTable(text){
  const rows=[];
  for(const line of text.split(/\r?\n/)){
    const toks=line.trim().split(/[\s,;]+/).filter(t=>t.length);
    if(toks.length<2)continue;
    const n=toks.map(Number);
    if(!Number.isFinite(n[0])||n[0]<=0||!Number.isFinite(n[1]))continue;
    let v=n[1];
    if(toks.length>=3&&Number.isFinite(n[2]))v=(n[1]+n[2])/2;
    rows.push([n[0],v]);
  }
  rows.sort((a,b)=>a[0]-b[0]);
  return rows;
}
function resample(pts){
  const out=new Float64Array(GRID.length),n=pts.length;let j=0;
  for(let i=0;i<GRID.length;i++){
    const f=GRID[i];
    if(f<=pts[0][0]){out[i]=pts[0][1];continue;}
    if(f>=pts[n-1][0]){out[i]=pts[n-1][1];continue;}
    while(pts[j+1][0]<f)j++;
    const[f0,v0]=pts[j],[f1,v1]=pts[j+1];
    out[i]=v0+(v1-v0)*(Math.log(f)-Math.log(f0))/(Math.log(f1)-Math.log(f0));
  }
  return out;
}
function smoothCurve(y,oct){
  if(!oct)return y;
  const sigma=oct*SPO/2.355,r=Math.max(1,Math.ceil(sigma*3)),out=new Float64Array(y.length);
  for(let i=0;i<y.length;i++){let s=0,w=0;for(let k=-r;k<=r;k++){const idx=i+k;if(idx<0||idx>=y.length)continue;const g=Math.exp(-k*k/(2*sigma*sigma));s+=y[idx]*g;w+=g;}out[i]=s/w;}
  return out;
}
function shift(y,d){const o=new Float64Array(y.length);for(let i=0;i<y.length;i++)o[i]=y[i]+d;return o;}
function averageCurves(list){const o=new Float64Array(GRID.length);for(const y of list)for(let i=0;i<GRID.length;i++)o[i]+=y[i];for(let i=0;i<GRID.length;i++)o[i]/=list.length;return o;}
function shape(f,f0,q){const x=f/f0-f0/f;return 1/(1+(q*x)*(q*x));}
function anchorVal(y,f){let s=0,n=0;const lo=f/1.06,hi=f*1.06;for(let i=0;i<GRID.length;i++)if(GRID[i]>=lo&&GRID[i]<=hi){s+=y[i];n++;}return n?s/n:y[0];}
function addF(a,b){const o=new Float64Array(a.length);for(let i=0;i<a.length;i++)o[i]=a[i]+b[i];return o;}
function biquadDb(type,f0,Q,gain,f){
  const fs=48000,w0=2*Math.PI*clamp(f0,10,23000)/fs,w=2*Math.PI*clamp(f,10,23500)/fs;
  const A=Math.pow(10,(gain||0)/40),cw=Math.cos(w0),sw=Math.sin(w0),alpha=sw/(2*Math.max(Q,0.05));
  let b0,b1,b2,a0,a1,a2;
  if(type==="ls"){
    b0=A*((A+1)+(A-1)*cw+2*Math.sqrt(A)*alpha);b1=2*A*((A-1)+(A+1)*cw);b2=A*((A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha);
    a0=(A+1)+(A-1)*cw+2*Math.sqrt(A)*alpha;a1=-2*((A-1)+(A+1)*cw);a2=(A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha;
  }else if(type==="hs"){
    b0=A*((A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha);b1=-2*A*((A-1)+(A+1)*cw);b2=A*((A+1)+(A-1)*cw+2*Math.sqrt(A)*alpha);
    a0=(A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha;a1=2*((A-1)+(A+1)*cw);a2=(A+1)+(A-1)*cw+2*Math.sqrt(A)*alpha;
  }else{
    b0=1+alpha*A;b1=-2*cw;b2=1-alpha*A;a0=1+alpha/A;a1=-2*cw;a2=1-alpha/A;
  }
  const z1r=Math.cos(w),z1i=-Math.sin(w),z2r=Math.cos(2*w),z2i=-Math.sin(2*w);
  const nr=b0+b1*z1r+b2*z2r,ni=b1*z1i+b2*z2i,dr=a0+a1*z1r+a2*z2r,di=a1*z1i+a2*z2i;
  const den=dr*dr+di*di||1e-9,hr=(nr*dr+ni*di)/den,hi2=(ni*dr-nr*di)/den;
  return 10*Math.log10(hr*hr+hi2*hi2+1e-12);
}

const state={
  selected:new Map(),hidden:new Set(),average:null,avgN:0,target:null,brand:null,
  adj:{bass:0,bassQ:0.707,bassF:105,treble:0,tilt:0,ear:0},
  normOn:true,normDb:60,normHz:500,smoothN:5,ySpan:30,
  aeq:Object.assign({count:8,fmin:20,fmax:8000,gmin:-10,gmax:6,qmin:0.5,qmax:1.5},CFG.autoEqDefaults||{}),
  eq:{name:null,filters:[],preamp:0,curve:null},eqShow:true,uploaded:[]
};
const targets=new Map(),hpCache=new Map();

async function loadTargets(){
  await Promise.allSettled(CFG.targets.map(async t=>{
    const pts=parseTable(await fetchAny(t.file));
    if(pts.length>10)targets.set(t.name,{def:t,raw:resample(pts)});
  }));
  if(!state.target||!targets.has(state.target)){
    const d=CFG.targets.find(t=>t.default&&targets.has(t.name));
    state.target=d?d.name:[...targets.keys()][0]||null;
  }
}
function adjCurve(){
  const a=state.adj,out=new Float64Array(GRID.length);
  if(!a.bass&&!a.treble&&!a.tilt&&!a.ear)return out;
  for(let i=0;i<GRID.length;i++){
    const f=GRID[i];let d=0;
    if(a.bass)d+=biquadDb("ls",a.bassF,a.bassQ,a.bass,f);
    if(a.treble)d+=biquadDb("hs",10000,0.707,a.treble,f);
    if(a.ear)d+=biquadDb("pk",2700,0.9,a.ear,f);
    if(a.tilt)d+=a.tilt*Math.log2(f/1000);
    out[i]=d;
  }
  return out;
}
function targetRaw(){const t=targets.get(state.target);if(!t)return null;return t.def.adjustable?addF(t.raw,adjCurve()):t.raw;}
function process(raw){
  let y=state.smoothN>0?smoothCurve(raw,1/state.smoothN):raw;
  if(state.normOn)y=shift(y,state.normDb-anchorVal(y,state.normHz));
  return y;
}
function filterResp(fl,f){
  if(!fl.on||!fl.g)return 0;
  if(fl.t==="PK")return fl.g*shape(f,fl.f,fl.q);
  return biquadDb(fl.t==="LS"?"ls":"hs",fl.f,fl.q,fl.g,f);
}
function series(){
  const S=[];
  for(const[name,s]of state.selected)if(s.raw&&!state.hidden.has(name))S.push({name,color:s.color,y:process(s.raw)});
  if(state.average&&!state.hidden.has("__avg"))S.push({name:"AVERAGE",color:"#ffffff",dash:[5,4],w:2,y:process(state.average)});
  const tr=targetRaw();
  if(tr)S.push({name:state.target,color:css("--target"),dash:[8,5],w:2,y:process(tr)});
  if(state.eq&&state.eqShow&&state.eq.curve&&!state.hidden.has("__eq"))S.push({name:"EQ result",color:css("--eq"),w:2,y:process(state.eq.curve)});
  return S;
}

const allHps=()=>CFG.hps.concat(state.uploaded);
function loadHp(def){
  if(def.raw)return Promise.resolve(def.raw);
  if(!hpCache.has(def.name))hpCache.set(def.name,doLoadHp(def).catch(e=>{hpCache.delete(def.name);throw e;}));
  return hpCache.get(def.name);
}
async function doLoadHp(def){
  const one=async u=>resample(parseTable(await fetchAny(u)));
  if(def.raw)return def.raw;
  if(def.url)return one(def.url);
  if(def.urlL&&def.urlR){const[a,b]=await Promise.all([one(def.urlL),one(def.urlR)]);return averageCurves([a,b]);}
  if(def.file)return one(def.file);
  if(def.L&&def.R){const[a,b]=await Promise.all([one(def.L),one(def.R)]);return averageCurves([a,b]);}
  throw new Error("нет источника");
}
async function toggleHp(def){
  if(state.selected.has(def.name))state.selected.delete(def.name);
  else{
    const color=PALETTE[state.selected.size%PALETTE.length];
    state.selected.set(def.name,{color,raw:null});
    try{state.selected.get(def.name).raw=await loadHp(def);}
    catch(e){state.selected.delete(def.name);toast("Не удалось загрузить: "+def.name);}
  }
  renderEqCurveSelect();recomputeEq();renderModels();updateLegend();draw();
}

/* ---------- график (адаптивный: на телефоне меньше подписей, компактнее оси) ---------- */
const XTICKS=[20,30,40,50,60,80,100,150,200,250,300,400,500,600,800,1000,1500,2000,3000,4000,5000,6000,8000,10000,15000,20000];
const XTICKS_S=[20,50,100,200,500,1000,2000,5000,10000,20000];
const XMAJ=new Set([20,60,250,500,600,2000,6000,20000]);
function xlab(f){if(f===20)return"20Hz";if(f===20000)return"20kHz";return f>=1000?(f/1000)+"k":""+f;}
function xlabS(f){return f>=1000?(f/1000)+"k":""+f;}
function draw(){
  const cv=$("graph"),dpr=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;
  if(!W||!H)return;
  cv.width=W*dpr;cv.height=H*dpr;
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=css("--bg");ctx.fillRect(0,0,W,H);
  const narrow=W<640;
  const m={l:narrow?34:46,r:narrow?8:16,t:narrow?18:26,b:narrow?20:26};
  const S=series();
  const span=clamp(state.ySpan,10,120);
  let lo,hi;
  if(state.normOn){lo=state.normDb-span/2;hi=state.normDb+span/2;}
  else{
    let a=Infinity,b=-Infinity;
    for(const s of S)for(const v of s.y){if(v<a)a=v;if(v>b)b=v;}
    if(!S.length){a=45;b=75;}
    const mid=(a+b)/2;lo=mid-span/2;hi=mid+span/2;
  }
  const step=span<=24?2:span<=48?5:10;
  const X=f=>m.l+(Math.log2(f/FMIN)/Math.log2(FMAX/FMIN))*(W-m.l-m.r);
  const Y=v=>m.t+(hi-v)/(hi-lo)*(H-m.t-m.b);
  const ticks=narrow?XTICKS_S:XTICKS;
  for(const f of ticks){
    const x=X(f),maj=narrow?true:XMAJ.has(f);
    ctx.strokeStyle=css("--grid");ctx.lineWidth=1;ctx.globalAlpha=maj?0.9:0.35;
    ctx.beginPath();ctx.moveTo(x,m.t);ctx.lineTo(x,H-m.b);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=maj?css("--text"):css("--muted");
    ctx.font=(narrow?"700 8px":(maj?"700 11px":"10px"))+" system-ui";ctx.textAlign="center";
    ctx.fillText(narrow?xlabS(f):xlab(f),x,H-m.b+(narrow?12:15));
  }
  for(let v=Math.ceil(lo/step)*step;v<=hi;v+=step){
    const y=Y(v);
    ctx.strokeStyle=css("--grid");ctx.lineWidth=1;ctx.globalAlpha=0.7;
    ctx.beginPath();ctx.moveTo(m.l,y);ctx.lineTo(W-m.r,y);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=css("--muted");ctx.font=(narrow?"8px":"10px")+" system-ui";ctx.textAlign="right";
    ctx.fillText(Math.round(v),m.l-(narrow?4:6),y+3);
  }
  ctx.save();ctx.beginPath();ctx.rect(m.l,m.t,W-m.l-m.r,H-m.t-m.b);ctx.clip();
  for(const s of S){
    ctx.strokeStyle=s.color;ctx.lineWidth=s.w||2;ctx.setLineDash(s.dash||[]);
    ctx.beginPath();
    for(let i=0;i<GRID.length;i++){const x=X(GRID[i]),y=Y(s.y[i]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
  }
  ctx.restore();ctx.setLineDash([]);
  ctx.fillStyle="rgba(255,255,255,0.06)";ctx.font=(narrow?"900 44px":"900 84px")+" system-ui";ctx.textAlign="right";
  ctx.fillText("PRIH",W-m.r-8,H-m.b-(narrow?10:16));
  const leg=[];
  if(targetRaw())leg.push({c:css("--target"),t:state.target+" Target"});
  for(const[name,s]of state.selected)if(s.raw&&!state.hidden.has(name))leg.push({c:s.color,t:name});
  if(state.average&&!state.hidden.has("__avg"))leg.push({c:"#ffffff",t:"AVERAGE ("+state.avgN+")"});
  if(state.eq&&state.eqShow&&state.eq.curve&&!state.hidden.has("__eq"))leg.push({c:css("--eq"),t:"EQ result"});
  const lstep=narrow?14:18;
  ctx.font=(narrow?"700 11px":"700 13px")+" system-ui";ctx.textAlign="left";
  let ly=H-m.b-(narrow?8:14)-(leg.length-1)*lstep;
  for(const L of leg){ctx.fillStyle=L.c;ctx.fillText(L.t,m.l+(narrow?6:10),ly);ly+=lstep;}
  ctx.fillStyle=css("--muted");ctx.font=(narrow?"8px":"10px")+" system-ui";ctx.textAlign="right";
  ctx.fillText("Measured on: IEC 60318-4 (711) · Prih",W-m.r-4,m.t-(narrow?6:9));
  if(!narrow){ctx.save();ctx.translate(12,m.t+18);ctx.rotate(-Math.PI/2);ctx.textAlign="right";ctx.fillText("dB",0,0);ctx.restore();}
}

/* ---------- списки ---------- */
function renderBrands(){
  const set=new Map();
  for(const hp of allHps())set.set(hp.source||"?",(set.get(hp.source||"?")||0)+1);
  const box=$("brandList");box.innerHTML="";
  const mk=(label,cnt,sel,fn)=>{const d=document.createElement("div");d.className="brand"+(sel?" sel":"");d.innerHTML=`<span>${esc(label)}</span><span class="cnt">${cnt}</span>`;d.onclick=fn;box.appendChild(d);};
  mk("All",allHps().length,state.brand==null,()=>{state.brand=null;switchTab("models");});
  for(const[b,c]of set)mk(b,c,state.brand===b,()=>{state.brand=b;switchTab("models");});
}
function renderModels(){
  const q=$("search").value.trim().toLowerCase();
  const list=allHps().filter(hp=>(state.brand==null||(hp.source||"?")===state.brand)&&(!q||hp.name.toLowerCase().includes(q)));
  $("modelCount").textContent=list.length;
  const box=$("modelList");box.innerHTML="";
  if(!list.length)box.innerHTML="<div class='muted' style='padding:8px'>Пусто. Добавь замеры в config.js или кнопкой «+ Add measurement»</div>";
  for(const hp of list){
    const sel=state.selected.has(hp.name);
    const d=document.createElement("div");d.className="mrow"+(sel?" sel":"");
    d.innerHTML=`<span class="nm">${esc(hp.name)}</span><span class="src">${esc(hp.source||"")}</span><button class="add">${sel?"−":"+"}</button>`;
    d.onclick=()=>toggleHp(hp);
    box.appendChild(d);
  }
}
function switchTab(t){
  for(const b of document.querySelectorAll(".tabs button"))b.classList.toggle("on",b.dataset.tab===t);
  $("brandList").hidden=t!=="brands";$("modelList").hidden=t!=="models";$("eqPane").hidden=t!=="eq";
}
function buildTargetChips(){
  for(const gid of["refChips","prefChips"])$(gid).innerHTML="";
  for(const t of CFG.targets){
    const ok=targets.has(t.name);
    const b=document.createElement("button");
    b.className="tchip tgt"+(state.target===t.name?" on":"");
    b.textContent=t.name;b.disabled=!ok;
    b.onclick=()=>{state.target=t.name;buildTargetChips();syncAdj();updateLegend();draw();};
    (t.group==="Preference"?$("prefChips"):$("refChips")).appendChild(b);
  }
}
function updateLegend(){
  const lg=$("legend");lg.innerHTML="";
  const item=(color,name,src,extra)=>{
    const d=document.createElement("div");d.className="litem";
    d.innerHTML=`<span class="sw" style="background:${color}"></span><span>${esc(name)}</span>`+(src?`<span class="src">${esc(src)}</span>`:"");
    for(const[txt,fn]of(extra||[])){const b=document.createElement("button");b.textContent=txt;b.onclick=fn;d.appendChild(b);}
    lg.appendChild(d);
  };
  for(const[name,s]of state.selected){
    const def=allHps().find(h=>h.name===name);
    item(s.color,name,def?def.source:"",[
      [state.hidden.has(name)?"🚫":"",()=>{state.hidden.has(name)?state.hidden.delete(name):state.hidden.add(name);updateLegend();draw();}],
      ["✕",()=>toggleHp(def)]
    ]);
  }
  if(state.average)item("#ffffff","AVERAGE ("+state.avgN+")","",[["✕",()=>{state.average=null;updateLegend();draw();}]]);
  if(state.target)item(css("--target"),"TARGET: "+state.target);
  if(state.eq&&state.eq.curve)item(css("--eq"),"EQ result","",[[state.eqShow?"🚫":"",()=>{state.eqShow=!state.eqShow;$("eqShowChk").checked=state.eqShow;updateLegend();draw();}]]);
}

/* ---------- AutoEQ v3 ---------- */
function logspace(a,b,n){if(!(b>a))return[a];const o=[];for(let i=0;i<n;i++)o.push(a*Math.pow(b/a,i/(n-1)));return o;}
function optGainDamped(e,f,f0,q,o,damp){
  let num=0,den=0;
  for(let i=0;i<f.length;i++){const m=shape(f[i],f0,q);num+=e[i]*m;den+=m*m;}
  if(den<=0)return null;
  let g=clamp(-num/den*damp,o.gmin,o.gmax);
  let s=0;for(let i=0;i<f.length;i++){const d=e[i]+g*shape(f[i],f0,q);s+=d*d;}
  return {f:f0,g,q,score:s};
}
function fitPeq(err,f,o){
  const n=f.length,e=Float64Array.from(err),fs=[];
  const qs=[...new Set([o.qmin,clamp(0.7,o.qmin,o.qmax),clamp(1,o.qmin,o.qmax),o.qmax])];
  const res=()=>{let s=0;for(let i=0;i<n;i++)s+=e[i]*e[i];return s;};
  for(let k=0;k<o.count;k++){
    let bi=0;for(let i=1;i<n;i++)if(Math.abs(e[i])>Math.abs(e[bi]))bi=i;
    if(Math.abs(e[bi])<0.3)break;
    let best=null;
    for(const q of qs)for(const ff of[f[bi]/1.25,f[bi],f[bi]*1.25]){
      const c=optGainDamped(e,f,clamp(ff,o.fmin,o.fmax),q,o,0.9);
      if(c&&(!best||c.score<best.score))best=c;
    }
    if(!best)break;
    for(let i=0;i<n;i++)e[i]+=best.g*shape(f[i],best.f,best.q);
    fs.push({f:best.f,g:best.g,q:best.q});
  }
  fs.sort((a,b)=>a.f-b.f);
  for(let i=fs.length-2;i>=0;i--){
    if(Math.log2(fs[i+1].f/fs[i].f)<1/6){
      const drop=Math.abs(fs[i].g)<Math.abs(fs[i+1].g)?i:i+1;
      for(let j=0;j<n;j++)e[j]-=fs[drop].g*shape(f[j],fs[drop].f,fs[drop].q);
      fs.splice(drop,1);
    }
  }
  for(let pass=0;pass<2;pass++){
    let improved=false;
    for(let k=0;k<fs.length;k++){
      const fl=fs[k];
      for(let i=0;i<n;i++)e[i]-=fl.g*shape(f[i],fl.f,fl.q);
      const before=res();
      let best={f:fl.f,g:fl.g,q:fl.q,score:before};
      {let s=0;for(let i=0;i<n;i++)s+=e[i]*e[i];if(s<best.score)best={f:fl.f,g:0,q:fl.q,score:s};}
      const lo=clamp(fl.f/1.6,o.fmin*0.9,o.fmax*1.1),hi=clamp(fl.f*1.6,o.fmin*0.9,o.fmax*1.1);
      for(const ff of logspace(lo,hi,9))for(const qq of[fl.q/1.5,fl.q,fl.q*1.5].map(q=>clamp(q,o.qmin,o.qmax))){
        const c=optGainDamped(e,f,ff,qq,o,1);
        if(c&&c.score<best.score-1e-9)best=c;
      }
      fs[k]={f:best.f,g:best.g,q:best.q};
      for(let i=0;i<n;i++)e[i]+=fs[k].g*shape(f[i],fs[k].f,fs[k].q);
      if(res()<before-1e-9)improved=true;
    }
    if(!improved)break;
  }
  return fs.filter(x=>Math.abs(x.g)>=0.05).sort((a,b)=>a.f-b.f);
}

/* ---------- EQ панель ---------- */
function eqBase(){
  if(!state.eq.name||!state.selected.has(state.eq.name)){
    state.eq.name=[...state.selected.keys()].pop()||null;
    renderEqCurveSelect();
  }
  const s=state.selected.get(state.eq.name);
  return s?s.raw:null;
}
function renderEqCurveSelect(){
  const sel=$("eqCurve"),names=[...state.selected.keys()];
  if(state.eq.name&&!names.includes(state.eq.name))state.eq.name=names[names.length-1]||null;
  sel.innerHTML=names.length?names.map(n=>`<option ${n===state.eq.name?"selected":""}>${esc(n)}</option>`).join(""):`<option value="">— нет кривых —</option>`;
  if(!names.length)state.eq.name=null;
}
function recomputeEq(){
  const base=eqBase();
  if(!base){state.eq.curve=null;state.eq.preamp=0;$("eqPreamp").textContent="Pre-amp: 0.0 dB";return;}
  const curve=new Float64Array(GRID.length);let pk=0;
  for(let i=0;i<GRID.length;i++){
    let v=base[i],fv=0;
    for(const fl of state.eq.filters){const r=filterResp(fl,GRID[i]);v+=r;fv+=r;}
    curve[i]=v;if(fv>pk)pk=fv;
  }
  state.eq.curve=curve;state.eq.preamp=-Math.max(0,pk);
  $("eqPreamp").textContent="Pre-amp: "+state.eq.preamp.toFixed(1)+" dB";
}
function renderEqRows(){
  let html=`<div class="frow head"><span></span><span>Type</span><span>Frequency</span><span>Gain</span><span>Q</span><span></span></div>`;
  state.eq.filters.forEach((fl,i)=>{
    html+=`<div class="frow" data-i="${i}">
      <input type="checkbox" class="fon" ${fl.on?"checked":""}>
      <select class="ft">${["PK","LS","HS"].map(t=>`<option ${t===fl.t?"selected":""}>${t}</option>`).join("")}</select>
      <input class="ff" type="number" step="0.1" value="${(+fl.f).toFixed(1)}">
      <input class="fg" type="number" step="0.1" value="${(+fl.g).toFixed(2)}">
      <input class="fq" type="number" step="0.01" value="${(+fl.q).toFixed(2)}">
      <button class="fx" title="Удалить">✕</button></div>`;
  });
  $("eqRows").innerHTML=html;
  $("eqPreamp").textContent="Pre-amp: "+state.eq.preamp.toFixed(1)+" dB";
}
function eqLines(){
  const L=[`Preamp: ${state.eq.preamp.toFixed(2)} dB`];
  state.eq.filters.filter(f=>f.on&&Math.abs(f.g)>=0.05).sort((a,b)=>a.f-b.f)
    .forEach((fl,i)=>L.push(`Filter ${i+1}: ON ${fl.t} Fc ${fl.f>=100?fl.f.toFixed(1):fl.f.toFixed(2)} Hz Gain ${fl.g.toFixed(2)} dB Q ${fl.q.toFixed(2)}`));
  return L;
}
function runAutoEq(){
  const base=eqBase();
  if(!base)return toast("Сначала выбери наушники");
  const tr=targetRaw();if(!tr)return toast("Таргет недоступен");
  const a=state.aeq,hpP=process(base),tP=process(tr);
  let off=0,n=0;
  for(let i=0;i<GRID.length;i++)if(GRID[i]>=NR[0]&&GRID[i]<=NR[1]){off+=hpP[i]-tP[i];n++;}
  off=n?off/n:0;
  const idx=[];for(let i=0;i<GRID.length;i++)if(GRID[i]>=a.fmin&&GRID[i]<=a.fmax)idx.push(i);
  if(idx.length<10)return toast("Слишком узкий диапазон");
  const subF=new Float64Array(idx.length),subE=new Float64Array(idx.length);
  idx.forEach((gi,k)=>{subF[k]=GRID[gi];subE[k]=hpP[gi]-(tP[gi]+off);});
  const fits=fitPeq(subE,subF,a);
  const filters=fits.map(x=>({on:true,t:"PK",f:x.f,g:x.g,q:x.q}));
  while(filters.length<a.count)filters.push({on:true,t:"PK",f:1000,g:0,q:0.7});
  state.eq.filters=filters;
  renderEqRows();recomputeEq();
  state.eqShow=true;$("eqShowChk").checked=true;
  updateLegend();draw();
}
function download(name,text){
  const b=new Blob([text],{type:"text/plain"});
  const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}

/* ---------- свои замеры + парс ---------- */
function saveUploaded(){try{localStorage.setItem("prih-uploaded",JSON.stringify(state.uploaded.map(u=>({name:u.name,source:u.source,pts:u.pts}))));}catch(e){toast("localStorage переполнен");}}
function loadUploaded(){
  try{
    const a=JSON.parse(localStorage.getItem("prih-uploaded")||"[]");
    state.uploaded=a.map(u=>({name:u.name,source:u.source||"uploaded",pts:u.pts,raw:resample(u.pts)}));
  }catch(e){state.uploaded=[];}
}
function closeModal(){
  $("modal").hidden=true;$("mErr").textContent="";$("mPrev").textContent="";
  $("mName").value="";$("mUrl").value="";$("mUrlL").value="";$("mUrlR").value="";$("mFile").value="";$("mPaste").value="";
}
function absUrl(base,rel){try{return new URL(rel,base).href;}catch(e){return rel;}}
async function fetchPtsFromUrl(u){
  const t=await fetchAny(u);
  if(!/^\s*(<|<!DOCTYPE)/i.test(t))return parseTable(t);
  const links=[...t.matchAll(/href="([^"]+\.(?:csv|txt))"/gi)].map(m=>absUrl(u,m[1])).slice(0,6);
  if(!links.length)throw new Error("на странице нет ссылок на CSV/TXT");
  const L=links.find(l=>/[._\- ]L([._\- \d]|\.csv|\.txt)/i.test(l))||links[0];
  const R=links.find(l=>/[._\- ]R([._\- \d]|\.csv|\.txt)/i.test(l)&&l!==L);
  if(R){
    const[a,b]=await Promise.all([fetchAny(L),fetchAny(R)]);
    const la=resample(parseTable(a)),lb=resample(parseTable(b));
    const pts=[];for(let i=0;i<GRID.length;i++)pts.push([GRID[i],(la[i]+lb[i])/2]);
    return pts;
  }
  return parseTable(await fetchAny(links[0]));
}
async function grabPts(){
  if($("mFile").files[0])return parseTable(await $("mFile").files[0].text());
  if($("mPaste").value.trim())return parseTable($("mPaste").value);
  if($("mUrlL").value.trim()&&$("mUrlR").value.trim()){
    const[a,b]=await Promise.all([fetchPtsFromUrl($("mUrlL").value.trim()),fetchPtsFromUrl($("mUrlR").value.trim())]);
    const la=resample(a),lb=resample(b);
    const pts=[];for(let i=0;i<GRID.length;i++)pts.push([GRID[i],(la[i]+lb[i])/2]);
    return pts;
  }
  if($("mUrl").value.trim())return fetchPtsFromUrl($("mUrl").value.trim());
  return null;
}
let prevTimer;
function queuePreview(){clearTimeout(prevTimer);prevTimer=setTimeout(doPreview,600);}
async function doPreview(){
  const el=$("mPrev");el.textContent="";
  try{
    const pts=await grabPts();
    if(!pts)return;
    el.textContent=pts.length>=20?`✔ ${pts.length} точек, ${Math.round(pts[0][0])}–${Math.round(pts[pts.length-1][0])} Гц`:"Мало точек: "+pts.length;
  }catch(e){el.textContent="Ошибка: "+e.message;}
}
async function addMeasurement(){
  const err=$("mErr");err.textContent="";
  const name=$("mName").value.trim()||"Uploaded";
  const source=$("mSource").value.trim()||"uploaded";
  try{
    const pts=await grabPts();
    if(!pts)return err.textContent="Укажи URL, файл или вставь текст";
    if(pts.length<20)return err.textContent="Не похоже на замер: мало точек ("+pts.length+")";
    state.uploaded.push({name,source,pts:pts.filter((_,i)=>i%Math.max(1,Math.floor(pts.length/400))===0),raw:resample(pts)});
    saveUploaded();
    const def=state.uploaded[state.uploaded.length-1];
    state.selected.set(def.name,{color:PALETTE[state.selected.size%PALETTE.length],raw:def.raw});
    renderEqCurveSelect();recomputeEq();renderBrands();renderModels();updateLegend();draw();closeModal();
    toast("Замер добавлен: "+name);
  }catch(e){err.textContent="Ошибка: "+e.message+". Если не качается — скачай файл и загрузь с компьютера.";}
}

/* ---------- верхние кнопки ---------- */
async function averageAll(){
  if(!allHps().length)return toast("Список замеров пуст");
  const btn=$("btnAvg");btn.disabled=true;
  const sum=new Float64Array(GRID.length);let n=0;
  for(let i=0;i<allHps().length;i++){
    btn.textContent=`Average ${i+1}/${allHps().length}`;
    try{const raw=await loadHp(allHps()[i]);for(let j=0;j<GRID.length;j++)sum[j]+=raw[j];n++;}catch(e){}
    if(i%5===4)await new Promise(r=>setTimeout(r));
  }
  if(n){for(let j=0;j<GRID.length;j++)sum[j]/=n;state.average=sum;state.avgN=n;toast(`Average: ${n} замеров`);}
  btn.textContent="Average All";btn.disabled=false;updateLegend();draw();
}
function screenshot(){
  $("graph").toBlob(b=>{const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="prih-playground.png";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);});
}
function hashFromState(){
  return"#"+encodeURIComponent(JSON.stringify({v:6,sel:[...state.selected.keys()],tgt:state.target,adj:state.adj,nrm:state.normOn,ndb:state.normDb,nhz:state.normHz,sm:state.smoothN,ys:state.ySpan,aeq:state.aeq}));
}
async function copyUrl(){
  const u=location.origin+location.pathname+hashFromState();
  try{await navigator.clipboard.writeText(u);toast("URL скопирован");}
  catch(e){location.hash=hashFromState();toast("Скопируй URL из адресной строки");}
}
function restore(){
  if(!location.hash||location.hash.length<2)return;
  let s;try{s=JSON.parse(decodeURIComponent(location.hash.slice(1)));}catch(e){return;}
  if(s.tgt&&targets.has(s.tgt))state.target=s.tgt;
  if(s.adj)state.adj=Object.assign(state.adj,s.adj);
  if(typeof s.nrm==="boolean")state.normOn=s.nrm;
  if(Number.isFinite(s.ndb))state.normDb=s.ndb;
  if(Number.isFinite(s.nhz))state.normHz=s.nhz;
  if(Number.isFinite(s.sm))state.smoothN=s.sm;
  if(Number.isFinite(s.ys))state.ySpan=s.ys;
  if(s.aeq)state.aeq=Object.assign(state.aeq,s.aeq);
  syncInputs();buildTargetChips();syncAdj();
  (s.sel||[]).forEach(nm=>{const def=allHps().find(h=>h.name===nm);if(def)toggleHp(def);});
  draw();
}

/* ---------- sync ---------- */
function syncAdj(){
  const t=targets.get(state.target),adj=t&&t.def.adjustable;
  $("adjRow").classList.toggle("disabled",!adj);
  $("adjNote").textContent=adj?"":"(таргет фиксированный)";
  $("adjBass").value=state.adj.bass;$("adjBassQ").value=state.adj.bassQ;$("adjBassF").value=state.adj.bassF;
  $("adjTreble").value=state.adj.treble;$("adjTilt").value=state.adj.tilt;$("adjEar").value=state.adj.ear;
}
function syncInputs(){
  $("ySpan").value=state.ySpan;$("normDb").value=state.normDb;$("normHz").value=state.normHz;
  $("normOn").classList.toggle("on",state.normOn);$("smoothN").value=state.smoothN;
  $("aeCount").value=state.aeq.count;$("aeFmin").value=state.aeq.fmin;$("aeFmax").value=state.aeq.fmax;
  $("aeGmin").value=state.aeq.gmin;$("aeGmax").value=state.aeq.gmax;$("aeQmin").value=state.aeq.qmin;$("aeQmax").value=state.aeq.qmax;
  syncAdj();
}
let toastTimer;
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2500);}

/* ---------- init ---------- */
async function init(){
  if(localStorage.getItem("prih-theme")==="light")document.body.classList.add("light");
  loadUploaded();
  for(const b of document.querySelectorAll(".tabs button"))b.onclick=()=>switchTab(b.dataset.tab);
  $("search").addEventListener("input",renderModels);
  $("ySpan").onchange=e=>{state.ySpan=clamp(num(e.target,30),10,120);draw();};
  $("normOn").onclick=()=>{state.normOn=!state.normOn;$("normOn").classList.toggle("on",state.normOn);draw();};
  $("normDb").onchange=e=>{state.normDb=num(e.target,60);draw();};
  $("normHz").onchange=e=>{state.normHz=clamp(num(e.target,500),20,20000);draw();};
  $("smoothN").onchange=e=>{state.smoothN=clamp(num(e.target,5),0,48);draw();};
  for(const id of["adjBass","adjBassQ","adjBassF","adjTreble","adjTilt","adjEar"])$(id).onchange=()=>{
    state.adj={bass:num($("adjBass"),0),bassQ:Math.max(0.1,num($("adjBassQ"),0.707)),bassF:clamp(num($("adjBassF"),105),20,1000),treble:num($("adjTreble"),0),tilt:num($("adjTilt"),0),ear:num($("adjEar"),0)};
    draw();
  };
  $("adjReset").onclick=()=>{state.adj={bass:0,bassQ:0.707,bassF:105,treble:0,tilt:0,ear:0};syncAdj();draw();};
  for(const id of["aeCount","aeFmin","aeFmax","aeGmin","aeGmax","aeQmin","aeQmax"])$(id).onchange=()=>{
    state.aeq={count:Math.round(clamp(num($("aeCount"),8),1,20)),fmin:clamp(num($("aeFmin"),20),10,10000),fmax:clamp(num($("aeFmax"),8000),100,20000),gmin:num($("aeGmin"),-10),gmax:num($("aeGmax"),6),qmin:clamp(num($("aeQmin"),0.5),0.05,10),qmax:clamp(num($("aeQmax"),1.5),0.05,10)};
  };
  $("btnEq").onclick=runAutoEq;
  $("eqCurve").onchange=e=>{state.eq.name=e.target.value;recomputeEq();updateLegend();draw();};
  $("eqRows").addEventListener("input",e=>{
    const row=e.target.closest(".frow");if(!row||row.classList.contains("head"))return;
    const fl=state.eq.filters[+row.dataset.i];if(!fl)return;
    const c=e.target.classList;
    if(c.contains("fon"))fl.on=e.target.checked;
    else if(c.contains("ft"))fl.t=e.target.value;
    else if(c.contains("ff"))fl.f=clamp(num(e.target,fl.f),10,20000);
    else if(c.contains("fg"))fl.g=clamp(num(e.target,fl.g),-30,30);
    else if(c.contains("fq"))fl.q=clamp(num(e.target,fl.q),0.05,20);
    else return;
    recomputeEq();draw();
  });
  $("eqRows").addEventListener("click",e=>{
    if(e.target.classList.contains("fx")){
      const row=e.target.closest(".frow");
      state.eq.filters.splice(+row.dataset.i,1);
      renderEqRows();recomputeEq();updateLegend();draw();
    }
  });
  $("btnAddF").onclick=()=>{state.eq.filters.push({on:true,t:"PK",f:1000,g:0,q:0.7});renderEqRows();recomputeEq();updateLegend();draw();};
  $("btnDelF").onclick=()=>{state.eq.filters.pop();renderEqRows();recomputeEq();updateLegend();draw();};
  $("btnSort").onclick=()=>{state.eq.filters.sort((a,b)=>a.f-b.f);renderEqRows();recomputeEq();draw();};
  $("btnDisable").onclick=()=>{const allOn=state.eq.filters.every(f=>f.on);state.eq.filters.forEach(f=>f.on=!allOn);renderEqRows();recomputeEq();updateLegend();draw();};
  $("btnSaveEq").onclick=()=>{if(!state.eq.filters.length)return toast("Нет фильтров");download("prih-eq-apo.txt",["# Prih EQ Playground · "+new Date().toISOString(),"Device: all",...eqLines()].join("\n"));toast("EQ сохранён в файл");};
  $("btnApo").onclick=()=>{if(!state.eq.filters.length)return toast("Нет фильтров");download("prih-eq-apo.txt",["# Prih EQ Playground","Device: all",...eqLines()].join("\n"));};
  $("btnWavelet").onclick=()=>{if(!state.eq.filters.length)return toast("Нет фильтров");download("prih-eq-wavelet.txt",eqLines().join("\n"));};
  $("btnCopyEq").onclick=()=>{if(state.eq.filters.length)navigator.clipboard.writeText(eqLines().join("\n")).then(()=>toast("PEQ скопирован"));};
  $("eqShowChk").onchange=e=>{state.eqShow=e.target.checked;draw();};
  $("btnAvg").onclick=averageAll;$("btnShot").onclick=screenshot;$("btnUrl").onclick=copyUrl;
  $("btnTheme").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("prih-theme",document.body.classList.contains("light")?"light":"dark");draw();};
  $("btnAdd").onclick=()=>{$("modal").hidden=false;};
  $("mCancel").onclick=closeModal;
  $("mOk").onclick=addMeasurement;
  $("mFile").addEventListener("change",doPreview);
  $("mPaste").addEventListener("input",queuePreview);
  $("mUrl").addEventListener("input",queuePreview);
  $("mUrlL").addEventListener("input",queuePreview);
  $("mUrlR").addEventListener("input",queuePreview);
  $("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
  renderBrands();renderModels();renderEqCurveSelect();renderEqRows();syncInputs();updateLegend();draw();
  loadTargets().then(()=>{buildTargetChips();syncAdj();updateLegend();draw();restore();});
  new ResizeObserver(draw).observe($("graphWrap"));
}
init();
