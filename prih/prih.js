"use strict";
const CFG = window.CONFIG;
const NR = CFG.normRange || [500, 2000];
const PALETTE = ["#4fc3f7","#ff8a65","#aed581","#ba68c8","#ffd54f","#4db6ac","#f06292","#7986cb","#a1887f","#e57373"];
const FMIN = 20, FMAX = 20000, SPO = 96;
const GRID = (() => { const n = Math.round(Math.log2(FMAX/FMIN)*SPO); const g = new Float64Array(n+1); for (let i=0;i<=n;i++) g[i]=FMIN*Math.pow(2,i/SPO); return g; })();

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const css=v=>getComputedStyle(document.body).getPropertyValue(v).trim();
const $=id=>document.getElementById(id);
const fetchText=async u=>{const r=await fetch(u);if(!r.ok)throw new Error(r.status);return r.text();};

function parseTable(text){
  const rows=[];
  for(const line of text.split(/\r?\n/)){
    const c=line.trim().split(/[\s,;]+/).map(Number);
    if(c.length>=2&&c[0]>0&&Number.isFinite(c[0])&&Number.isFinite(c[1]))rows.push(c.slice(0,3));
  }
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

/* RBJ biquad magnitude, dB */
function biquadDb(type,f0,Q,gain,f){
  const fs=48000,w0=2*Math.PI*clamp(f0,10,23000)/fs,w=2*Math.PI*clamp(f,10,23500)/fs;
  const A=Math.pow(10,(gain||0)/40),cw=Math.cos(w0),sw=Math.sin(w0),alpha=sw/(2*Math.max(Q,0.05));
  let b0,b1,b2,a0,a1,a2;
  if(type==="ls"){
    b0=A*((A+1)+(A-1)*cw+2*Math.sqrt(A)*alpha);b1=2*A*((A-1)+(A+1)*cw);b2=A*((A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha);
    a0=(A+1)+(A-1)*cw+2*Math.sqrt(A)*alpha;a1=-2*((A-1)+(A+1)*cw);a2=(A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha;
  }else if(type==="hs"){
    b0=A*((A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha);b1=-2*A*((A-1)+(A+1)*cw);b2=A*((A+1)+(A-1)*cw+2*Math.sqrt(A)*alpha);
    a0=(A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha;a1=2*((A-1)+(A+1)*cw);a2=(A+1)+(A-1)*cw-2*Math.sqrt(A)*alpha;
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
  aeq:Object.assign({},CFG.autoEqDefaults),eq:null,eqShow:true,uploaded:[]
};
const targets=new Map(),hpCache=new Map();

/* ---------- targets ---------- */
async function loadTargets(){
  for(const t of CFG.targets){
    try{
      const pts=parseTable(await fetchText(t.file)).map(r=>[r[0],r[1]]);
      if(pts.length>10)targets.set(t.name,{def:t,raw:resample(pts)});
    }catch(e){}
  }
  const d=CFG.targets.find(t=>t.default&&targets.has(t.name));
  state.target=d?d.name:[...targets.keys()][0]||null;
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
function targetRaw(){const t=targets.get(state.target);if(!t)return null;return t.def.adjustable?shift(t.raw,0).map?shift(addF(t.raw,adjCurve()),0):addF(t.raw,adjCurve()):t.raw;}
function addF(a,b){const o=new Float64Array(a.length);for(let i=0;i<a.length;i++)o[i]=a[i]+b[i];return o;}
function process(raw){
  let y=state.smoothN>0?smoothCurve(raw,1/state.smoothN):raw;
  if(state.normOn)y=shift(y,state.normDb-anchorVal(y,state.normHz));
  return y;
}
function series(){
  const S=[];
  for(const[name,s]of state.selected)if(s.raw&&!state.hidden.has(name))S.push({name,color:s.color,y:process(s.raw)});
  if(state.average&&!state.hidden.has("__avg"))S.push({name:"AVERAGE",color:"#ffffff",dash:[5,4],w:1.4,y:process(state.average)});
  const tr=targetRaw();
  if(tr)S.push({name:state.target,color:css("--target"),dash:[8,5],w:2,y:process(tr)});
  if(state.eq&&state.eqShow&&!state.hidden.has("__eq"))S.push({name:"EQ result",color:css("--eq"),w:1.6,y:process(state.eq.curve)});
  return S;
}

/* ---------- measurements ---------- */
const allHps=()=>CFG.hps.concat(state.uploaded);
function loadHp(def){
  if(def.raw)return Promise.resolve(def.raw);
  if(!hpCache.has(def.name))hpCache.set(def.name,doLoadHp(def).catch(e=>{hpCache.delete(def.name);throw e;}));
  return hpCache.get(def.name);
}
async function doLoadHp(def){
  if(def.file){const rows=parseTable(await fetchText(def.file));return resample(rows.map(r=>[r[0],r.length>2?(r[1]+r[2])/2:r[1]]));}
  const[lt,rt]=await Promise.all([fetchText(def.L),fetchText(def.R)]);
  const l=resample(parseTable(lt).map(r=>[r[0],r[1]])),r=resample(parseTable(rt).map(r=>[r[0],r[1]]));
  return averageCurves([l,r]);
}
async function toggleHp(def){
  if(state.selected.has(def.name))state.selected.delete(def.name);
  else{
    const color=PALETTE[state.selected.size%PALETTE.length];
    state.selected.set(def.name,{color,raw:null});
    try{state.selected.get(def.name).raw=await loadHp(def);}
    catch(e){state.selected.delete(def.name);toast("Не удалось загрузить: "+def.name);}
  }
  invalidateEq();renderModels();updateLegend();draw();
}

/* ---------- draw ---------- */
const XTICKS=[20,30,40,50,60,80,100,200,300,400,500,600,800,1000,2000,3000,4000,5000,6000,8000,10000,20000];
const XLBL={20:"20Hz",50:"50",100:"100",200:"200",500:"500",1000:"1k",2000:"2k",5000:"5k",10000:"10k",20000:"20kHz"};
function draw(){
  const cv=$("graph"),dpr=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;
  if(!W||!H)return;
  cv.width=W*dpr;cv.height=H*dpr;
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=css("--bg");ctx.fillRect(0,0,W,H);
  const m={l:46,r:16,t:26,b:26},S=series();
  let lo=Infinity,hi=-Infinity;
  for(const s of S)for(const v of s.y){if(v<lo)lo=v;if(v>hi)hi=v;}
  if(!S.length){lo=45;hi=75;}
  const span=clamp(state.ySpan,10,120),mid=(lo+hi)/2;
  lo=mid-span/2;hi=mid+span/2;
  const step=span<=24?2:span<=48?5:10;
  const X=f=>m.l+(Math.log2(f/FMIN)/Math.log2(FMAX/FMIN))*(W-m.l-m.r);
  const Y=v=>m.t+(hi-v)/(hi-lo)*(H-m.t-m.b);
  ctx.lineWidth=1;ctx.font="10px system-ui";
  for(const f of XTICKS){
    const x=X(f);ctx.strokeStyle=css("--grid");ctx.globalAlpha=XLBL[f]?0.9:0.35;
    ctx.beginPath();ctx.moveTo(x,m.t);ctx.lineTo(x,H-m.b);ctx.stroke();ctx.globalAlpha=1;
    if(XLBL[f]){ctx.fillStyle=css("--muted");ctx.textAlign="center";ctx.fillText(XLBL[f],x,H-m.b+15);}
  }
  for(let v=Math.ceil(lo/step)*step;v<=hi;v+=step){
    const y=Y(v);ctx.strokeStyle=css("--grid");ctx.globalAlpha=0.7;
    ctx.beginPath();ctx.moveTo(m.l,y);ctx.lineTo(W-m.r,y);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=css("--muted");ctx.textAlign="right";ctx.fillText(Math.round(v),m.l-6,y+3);
  }
  ctx.save();ctx.beginPath();ctx.rect(m.l,m.t,W-m.l-m.r,H-m.t-m.b);ctx.clip();
  for(const s of S){
    ctx.strokeStyle=s.color;ctx.lineWidth=s.w||1.6;ctx.setLineDash(s.dash||[]);
    ctx.beginPath();
    for(let i=0;i<GRID.length;i++){const x=X(GRID[i]),y=Y(s.y[i]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
  }
  ctx.restore();ctx.setLineDash([]);
  ctx.fillStyle="rgba(255,255,255,0.05)";ctx.font="800 58px system-ui";ctx.textAlign="right";
  ctx.fillText("PRIH",W-m.r-10,H-m.b-14);
  if(state.target){ctx.fillStyle=css("--target");ctx.globalAlpha=.85;ctx.font="700 17px system-ui";ctx.textAlign="left";ctx.fillText(state.target+" Target",m.l+10,H-m.b-14);ctx.globalAlpha=1;}
  ctx.fillStyle=css("--muted");ctx.font="10px system-ui";ctx.textAlign="right";
  ctx.fillText("Measured on: IEC 60318-4 (711) · Prih",W-m.r-6,m.t-9);
}

/* ---------- lists ---------- */
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
    b.onclick=()=>{state.target=t.name;invalidateEq();buildTargetChips();syncAdj();updateLegend();draw();};
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
      [state.hidden.has(name)?"🚫":"👁",()=>{state.hidden.has(name)?state.hidden.delete(name):state.hidden.add(name);updateLegend();draw();}],
      ["✕",()=>toggleHp(def)]
    ]);
  }
  if(state.average)item("#ffffff","AVERAGE ("+state.avgN+")","",[["✕",()=>{state.average=null;updateLegend();draw();}]]);
  if(state.target)item(css("--target"),"TARGET: "+state.target);
  if(state.eq)item(css("--eq"),"EQ result","",[[state.eqShow?"🚫":"👁",()=>{state.eqShow=!state.eqShow;$("eqShowChk").checked=state.eqShow;updateLegend();draw();}]]);
}

/* ---------- Auto EQ ---------- */
function optGain(e,f,f0,q,o){let num=0,den=0;for(let i=0;i<f.length;i++){const m=shape(f[i],f0,q);num+=e[i]*m;den+=m*m;}let g=den>0?-num/den:0;g=clamp(g,o.gmin,o.gmax);let s=0;for(let i=0;i<f.length;i++){const d=e[i]+g*shape(f[i],f0,q);s+=d*d;}return{f:f0,g,q,score:s};}
function logspace(a,b,n){const o=[];for(let i=0;i<n;i++)o.push(a*Math.pow(b/a,i/(n-1)));return o;}
function fitPeq(err,f,o){
  const n=f.length,e=Float64Array.from(err),fs=[];
  const qs=[...new Set([o.qmin,0.2,0.3,0.5,0.7,1,1.4,o.qmax].map(q=>clamp(q,o.qmin,o.qmax)))];
  for(let k=0;k<o.count;k++){
    let bi=0;for(let i=1;i<n;i++)if(Math.abs(e[i])>Math.abs(e[bi]))bi=i;
    if(Math.abs(e[bi])<0.3)break;
    let best=null;
    for(const q of qs){const c=optGain(e,f,f[bi],q,o);if(!best||c.score<best.score)best=c;}
    for(let it=0;it<2;it++){
      const f0=best.f,q0=best.q;let imp=false;
      for(const ff of[f0/1.2,f0/1.07,f0,f0*1.07,f0*1.2]){
        if(ff<o.fmin*0.9||ff>o.fmax*1.1)continue;
        for(const qq of[q0/1.6,q0,q0*1.6]){const c=optGain(e,f,ff,clamp(qq,o.qmin,o.qmax),o);if(c.score<best.score-1e-9){best=c;imp=true;}}
      }
      if(!imp)break;
    }
    for(let i=0;i<n;i++)e[i]+=best.g*shape(f[i],best.f,best.q);
    fs.push({f:best.f,g:best.g,q:best.q});
  }
  for(let pass=0;pass<2;pass++)for(let k=0;k<fs.length;k++){
    const fl=fs[k];
    for(let i=0;i<n;i++)e[i]-=fl.g*shape(f[i],fl.f,fl.q);
    let best=fl,bs=0;for(let i=0;i<n;i++){const d=e[i]+fl.g*shape(f[i],fl.f,fl.q);bs+=d*d;}
    {let s=0;for(let i=0;i<n;i++)s+=e[i]*e[i];if(s<bs){bs=s;best={f:fl.f,g:0,q:fl.q};}}
    for(const ff of logspace(fl.f/1.35,fl.f*1.35,9)){
      if(ff<o.fmin*0.9||ff>o.fmax*1.1)continue;
      for(const qq of[fl.q/1.8,fl.q/1.25,fl.q,fl.q*1.25,fl.q*1.8]){const c=optGain(e,f,ff,clamp(qq,o.qmin,o.qmax),o);if(c.score<bs){bs=c.score;best=c;}}
    }
    fs[k]={f:best.f,g:best.g,q:best.q};
    for(let i=0;i<n;i++)e[i]+=fs[k].g*shape(f[i],fs[k].f,fs[k].q);
  }
  return fs.filter(x=>Math.abs(x.g)>=0.1).sort((a,b)=>a.f-b.f);
}
function runAutoEq(){
  const raws=[...state.selected.values()].filter(s=>s.raw).map(s=>s.raw);
  if(!raws.length)return toast("Сначала выбери наушники");
  const tr=targetRaw();if(!tr)return toast("Таргет недоступен");
  const a=state.aeq,comb=averageCurves(raws),hpP=process(comb),tP=process(tr);
  let off=0,n=0;
  for(let i=0;i<GRID.length;i++)if(GRID[i]>=NR[0]&&GRID[i]<=NR[1]){off+=hpP[i]-tP[i];n++;}
  off=n?off/n:0;
  const idx=[];for(let i=0;i<GRID.length;i++)if(GRID[i]>=a.fmin&&GRID[i]<=a.fmax)idx.push(i);
  if(idx.length<10)return toast("Слишком узкий диапазон");
  const subF=new Float64Array(idx.length),subE=new Float64Array(idx.length);
  idx.forEach((gi,k)=>{subF[k]=GRID[gi];subE[k]=hpP[gi]-(tP[gi]+off);});
  const filters=fitPeq(subE,subF,a);
  const curve=new Float64Array(GRID.length);let pk=0;
  for(let i=0;i<GRID.length;i++){let v=comb[i],fv=0;for(const fl of filters){const s=fl.g*shape(GRID[i],fl.f,fl.q);v+=s;fv+=s;}curve[i]=v;if(fv>pk)pk=fv;}
  state.eq={filters,preamp:-Math.max(0,pk),curve};state.eqShow=true;$("eqShowChk").checked=true;
  renderEqTable();updateLegend();draw();
}
function eqText(){
  if(!state.eq)return"";
  const L=[`Preamp: ${state.eq.preamp.toFixed(1)} dB`];
  state.eq.filters.forEach((fl,i)=>L.push(`Filter ${i+1}: ON PK Fc ${fl.f>=100?fl.f.toFixed(0):fl.f.toFixed(1)} Hz Gain ${fl.g.toFixed(1)} dB Q ${fl.q.toFixed(2)}`));
  return L.join("\n");
}
function renderEqTable(){
  const t=$("eqTable");
  if(!state.eq){t.innerHTML="<tr><td class='muted'>Нажми «Применить»</td></tr>";$("btnCopyEq").disabled=true;return;}
  let html="<tr><th>#</th><th>Fc, Гц</th><th>Gain, дБ</th><th>Q</th></tr>";
  state.eq.filters.forEach((f,i)=>html+=`<tr><td>${i+1}</td><td>${f.f.toFixed(1)}</td><td>${f.g.toFixed(2)}</td><td>${f.q.toFixed(2)}</td></tr>`);
  html+=`<tr><td colspan="4">Preamp: ${state.eq.preamp.toFixed(2)} dB</td></tr>`;
  t.innerHTML=html;$("btnCopyEq").disabled=false;
}
function invalidateEq(){state.eq=null;renderEqTable();}

/* ---------- add measurement ---------- */
function saveUploaded(){try{localStorage.setItem("prih-uploaded",JSON.stringify(state.uploaded.map(u=>({name:u.name,source:u.source,pts:u.pts}))));}catch(e){toast("localStorage переполнен");}}
function loadUploaded(){
  try{
    const a=JSON.parse(localStorage.getItem("prih-uploaded")||"[]");
    state.uploaded=a.map(u=>({name:u.name,source:u.source||"uploaded",pts:u.pts,raw:resample(u.pts)}));
  }catch(e){state.uploaded=[];}
}
async function addMeasurement(){
  const err=$("mErr");err.textContent="";
  const name=$("mName").value.trim()||"Uploaded";
  const source=$("mSource").value.trim()||"uploaded";
  try{
    let pts=null;
    if($("mFile").files[0])pts=parseTable(await $("mFile").files[0].text());
    else if($("mUrl").value.trim())pts=parseTable(await fetchText($("mUrl").value.trim()));
    else return err.textContent="Укажи URL или файл";
    pts=pts.map(r=>[r[0],r.length>2?(r[1]+r[2])/2:r[1]]);
    if(pts.length<20)return err.textContent="Файл не похож на замер (мало точек)";
    state.uploaded.push({name,source,pts,raw:resample(pts)});
    saveUploaded();renderBrands();renderModels();
    $("modal").hidden=true;$("mUrl").value="";$("mFile").value="";$("mName").value="";
    toast("Замер добавлен: "+name);
  }catch(e){err.textContent="Ошибка загрузки: "+e.message+" (возможно, CORS — скачай CSV и загрузи файлом)";}
}

/* ---------- top buttons ---------- */
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
  return"#"+encodeURIComponent(JSON.stringify({v:2,sel:[...state.selected.keys()],tgt:state.target,adj:state.adj,nrm:state.normOn,ndb:state.normDb,nhz:state.normHz,sm:state.smoothN,ys:state.ySpan,aeq:state.aeq}));
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
const num=(el,fb)=>{const v=parseFloat(el.value);return Number.isFinite(v)?v:fb;};

/* ---------- init ---------- */
async function init(){
  if(localStorage.getItem("prih-theme")==="light")document.body.classList.add("light");
  loadUploaded();
  await loadTargets();
  for(const b of document.querySelectorAll(".tabs button"))b.onclick=()=>switchTab(b.dataset.tab);
  $("search").addEventListener("input",renderModels);
  $("ySpan").onchange=e=>{state.ySpan=clamp(num(e.target,30),10,120);draw();};
  $("normOn").onclick=()=>{state.normOn=!state.normOn;$("normOn").classList.toggle("on",state.normOn);invalidateEq();draw();};
  $("normDb").onchange=e=>{state.normDb=num(e.target,60);invalidateEq();draw();};
  $("normHz").onchange=e=>{state.normHz=clamp(num(e.target,500),20,20000);invalidateEq();draw();};
  $("smoothN").onchange=e=>{state.smoothN=clamp(num(e.target,5),0,48);invalidateEq();draw();};
  for(const id of["adjBass","adjBassQ","adjBassF","adjTreble","adjTilt","adjEar"])$(id).onchange=()=>{
    state.adj={bass:num($("adjBass"),0),bassQ:Math.max(0.1,num($("adjBassQ"),0.707)),bassF:clamp(num($("adjBassF"),105),20,1000),treble:num($("adjTreble"),0),tilt:num($("adjTilt"),0),ear:num($("adjEar"),0)};
    invalidateEq();draw();
  };
  $("adjReset").onclick=()=>{state.adj={bass:0,bassQ:0.707,bassF:105,treble:0,tilt:0,ear:0};syncAdj();invalidateEq();draw();};
  for(const id of["aeCount","aeFmin","aeFmax","aeGmin","aeGmax","aeQmin","aeQmax"])$(id).onchange=()=>{
    state.aeq={count:Math.round(clamp(num($("aeCount"),8),1,30)),fmin:clamp(num($("aeFmin"),20),10,10000),fmax:clamp(num($("aeFmax"),8000),100,20000),gmin:num($("aeGmin"),-10),gmax:num($("aeGmax"),6),qmin:clamp(num($("aeQmin"),0.1),0.05,10),qmax:clamp(num($("aeQmax"),1.5),0.05,10)};
  };
  $("btnEq").onclick=runAutoEq;
  $("btnCopyEq").onclick=()=>navigator.clipboard.writeText(eqText()).then(()=>toast("PEQ скопирован"));
  $("eqShowChk").onchange=e=>{state.eqShow=e.target.checked;draw();};
  $("btnAvg").onclick=averageAll;$("btnShot").onclick=screenshot;$("btnUrl").onclick=copyUrl;
  $("btnTheme").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("prih-theme",document.body.classList.contains("light")?"light":"dark");draw();};
  $("btnAdd").onclick=()=>{$("modal").hidden=false;};
  $("mCancel").onclick=()=>{$("modal").hidden=true;};
  $("mOk").onclick=addMeasurement;
  buildTargetChips();renderBrands();renderModels();syncInputs();renderEqTable();draw();restore();
  new ResizeObserver(draw).observe($("graphWrap"));
}
init();
