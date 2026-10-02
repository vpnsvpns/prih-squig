/* UI Prih EQ Playground.
   v31.1: удалены помеченные контролы строки кривой — пер-кривой <select> (дропдаун)
   и кнопка "~". Функции отключены: код их не создаёт и не обслуживает. */
const $=id=>document.getElementById(id);
const COLORS=['#4fc3f7','#ffb74d','#81c784','#e57373','#ba68c8','#4db6ac','#f06292','#aed581','#90a4ae','#ff8a65'];
let colorIdx=0;
const state={
  curves:[],targetId:'prih',customTarget:null,
  prefAdj:{bass:0,bassQ:0.707,bassF:105,treble:0,tilt:0,ear:0},
  eq:{modelId:null,filters:[],preamp:0,show:true,disabled:false},
  view:{ySpan:30,norm:true,normDb:60,normHz:500,smooth:5,fmin:20,fmax:20000,inspect:false},
  brandFilter:null
};
const graph=new Graph($('graph'));

/* ---------- целевые кривые ---------- */
function targetDef(){return state.customTarget&&state.targetId==='custom'?state.customTarget:TARGETS.find(t=>t.id===state.targetId);}
function targetRaw(){
  const t=targetDef();let db=interpPoints(t.points,FREQS);
  if(t&&t.kind==='pref'){
    const a=state.prefAdj;
    if(a.bass)db=db.map((v,i)=>v+biquadDB('LS',a.bassF,a.bass,a.bassQ,FREQS[i]));
    if(a.treble)db=db.map((v,i)=>v+biquadDB('HS',4000,a.treble,0.7,FREQS[i]));
    if(a.tilt)db=db.map((v,i)=>v+a.tilt*Math.log2(FREQS[i]/1000));
    if(a.ear)db=db.map((v,i)=>v+a.ear*Math.exp(-Math.pow(Math.log2(FREQS[i]/3000),2)/(2*0.6*0.6)));
  }
  return db;
}
/* ---------- расчёт отображаемых кривых ---------- */
function displayCurves(){
  const v=state.view;
  const eqDB=eqResponse(state.eq.filters,state.eq.preamp,FREQS);
  const hasEQ=state.eq.filters.length&&!state.eq.disabled;
  const out=[];
  if(state.targetId&&targetDef())
    out.push({id:'target',name:'Target: '+targetDef().name,freqs:FREQS,
      db:smoothDB(FREQS,targetRaw(),v.smooth),
      visible:true,dashed:true,pinned:false,color:'#c9c3b8',isTarget:true});
  for(const cu of state.curves){
    const sm=cu.smooth>0?cu.smooth:v.smooth;
    let db=smoothDB(FREQS,cu.raw,sm).map((x,i)=>x+(cu.offset||0));
    if(hasEQ&&cu.id===state.eq.modelId)db=db.map((x,i)=>x+eqDB[i]);
    out.push({id:cu.id,name:cu.name,freqs:FREQS,db,visible:!cu.disabled,
      dashed:false,pinned:!!cu.pinned,color:cu.color,isTarget:false,uploaded:cu.uploaded});
  }
  if(state.eq.show&&hasEQ)
    out.push({id:'eqview',name:'EQ response',freqs:FREQS,db:eqDB,visible:true,dashed:true,pinned:false,color:'#7fd4ff',isTarget:false});
  if(v.norm)for(const cu of out){if(cu.pinned||cu.id==='eqview')continue;
    const sh=v.normDb-valueAt(FREQS,cu.db,v.normHz);cu.db=cu.db.map(x=>x+sh);}
  return out;
}
function render(){
  const list=displayCurves();
  graph.resize();
  graph.draw({curves:list,ySpan:state.view.ySpan,center:state.view.norm?state.view.normDb:60,fmin:state.view.fmin,fmax:state.view.fmax});
  $('preampVal').textContent=state.eq.preamp.toFixed(1)+' dB';
  drawThumbs(list);
  layoutBands();
}
/* ---------- список кривых: БЕЗ дропдауна и БЕЗ "~" (удалены в v31.1) ---------- */
function rebuildList(){
  const box=$('curveList');box.innerHTML='';
  const rows=[];
  if(state.targetId&&targetDef())rows.push({id:'target',name:'Target: '+targetDef().name,color:'#c9c3b8',isTarget:true});
  for(const cu of state.curves)rows.push(cu);
  for(const r of rows){
    const div=document.createElement('div');div.className='crow';div.dataset.id=r.id;
    const th=document.createElement('canvas');th.width=64;th.height=20;th.dataset.thumb=r.id;
    const nm=document.createElement('span');nm.className='nm';nm.textContent=r.name;
    if(r.uploaded){const tag=document.createElement('span');tag.className='tag';tag.textContent='uploaded';nm.appendChild(tag);}
    const off=document.createElement('input');off.type='number';off.step='0.5';off.title='Offset, dB';
    off.value=r.isTarget?0:(r.offset||0);off.disabled=!!r.isTarget;
    off.oninput=()=>{r.offset=parseFloat(off.value)||0;render();};
    const smi=document.createElement('input');smi.type='number';smi.min='0';smi.max='48';smi.title='Smooth 1/x oct (0 = global)';
    smi.value=r.isTarget?0:(r.smooth||0);smi.disabled=!!r.isTarget;
    smi.oninput=()=>{r.smooth=parseFloat(smi.value)||0;render();};
    const P=document.createElement('button');P.textContent='P';P.title='Pin';P.classList.toggle('active',!!r.pinned);
    P.onclick=()=>{if(r.isTarget)return;r.pinned=!r.pinned;P.classList.toggle('active',r.pinned);render();};
    const D=document.createElement('button');D.textContent='D';D.title='Disable';D.classList.toggle('active',!!r.disabled);
    D.onclick=()=>{if(r.isTarget)return;r.disabled=!r.disabled;D.classList.toggle('active',r.disabled);render();};
    const X=document.createElement('button');X.textContent='X';X.title='Remove';
    X.onclick=()=>{
      if(r.isTarget){state.targetId=null;rebuildTargets();}
      else{state.curves=state.curves.filter(c=>c.id!==r.id);
        if(state.eq.modelId===r.id)setEqModel(state.curves[0]?state.curves[0].id:null);}
      rebuildList();render();};
    div.append(th,nm,off,smi,P,D,X);box.appendChild(div);
  }
}
function drawThumbs(list){
  document.querySelectorAll('canvas[data-thumb]').forEach(cv=>{
    const cu=list.find(c=>c.id===cv.dataset.thumb);if(!cu)return;
    const c=cv.getContext('2d');c.clearRect(0,0,64,20);
    let mn=Infinity,mx=-Infinity;for(const v of cu.db){mn=Math.min(mn,v);mx=Math.max(mx,v);}
    c.strokeStyle=cu.color;c.lineWidth=1;c.beginPath();
    for(let i=0;i<64;i++){const v=valueAt(FREQS,cu.db,Math.pow(2,Math.log2(20)+i/63*TOTAL_OCT));
      const y=18-((v-mn)/Math.max(mx-mn,1))*16;i?c.lineTo(i,y):c.moveTo(i,y);}
    c.stroke();
  });
}
/* ---------- полосы частот ---------- */
const BANDS=[['Sub bass',20,60],['Bass',60,250],['Lower Mids',250,600],['Midrange',600,2000],['Upper Mids',2000,6000],['Presence',6000,10000],['Treble',10000,20000]];
function layoutBands(){
  const row=$('bandRow');row.innerHTML='';
  const lo=Math.log2(state.view.fmin),hi=Math.log2(state.view.fmax);
  for(const [n,a,b] of BANDS){const c=Math.log2(Math.sqrt(a*b));if(c<lo||c>hi)continue;
    const s=document.createElement('span');s.textContent=n;s.style.left=((c-lo)/(hi-lo)*100)+'%';row.appendChild(s);}
}
/* ---------- таргеты ---------- */
function rebuildTargets(){
  const mk=(box,kind)=>{const el=$(box);el.innerHTML='';
    TARGETS.filter(t=>t.kind===kind).forEach(t=>{const b=document.createElement('button');
      b.textContent=t.name;b.classList.toggle('active',state.targetId===t.id);
      b.onclick=()=>{state.targetId=t.id;rebuildTargets();rebuildList();render();};el.appendChild(b);});
    if(state.customTarget&&kind==='fixed'){const b=document.createElement('button');b.textContent=state.customTarget.name;
      b.classList.toggle('active',state.targetId==='custom');
      b.onclick=()=>{state.targetId='custom';rebuildTargets();rebuildList();render();};el.appendChild(b);}
  };
  mk('refTargets','fixed');mk('prefTargets','pref');syncPref();
}
function syncPref(){
  const t=targetDef();const dis=!t||t.kind!=='pref';
  ['adjBass','adjBassQ','adjBassF','adjTreble','adjTilt','adjEar','btnRemoveAdj'].forEach(id=>$(id).disabled=dis);
  $('prefNote').style.display=dis?'':'none';
}
['adjBass','adjBassQ','adjBassF','adjTreble','adjTilt','adjEar'].forEach(id=>$(id).oninput=()=>{
  state.prefAdj={bass:+$('adjBass').value,bassQ:+$('adjBassQ').value,bassF:+$('adjBassF').value,treble:+$('adjTreble').value,tilt:+$('adjTilt').value,ear:+$('adjEar').value};
  render();});
$('btnRemoveAdj').onclick=()=>{state.prefAdj={bass:0,bassQ:0.707,bassF:105,treble:0,tilt:0,ear:0};
  $('adjBass').value=0;$('adjBassQ').value=0.707;$('adjBassF').value=105;$('adjTreble').value=0;$('adjTilt').value=0;$('adjEar').value=0;render();};
/* ---------- тулбар ---------- */
$('ySpan').oninput=()=>{state.view.ySpan=+$('ySpan').value||30;render();};
$('btnNorm').onclick=()=>{state.view.norm=!state.view.norm;$('btnNorm').classList.toggle('active',state.view.norm);render();};
$('normDb').oninput=()=>{state.view.normDb=+$('normDb').value||60;render();};
$('normHz').oninput=()=>{state.view.normHz=+$('normHz').value||500;render();};
$('smoothOct').oninput=()=>{state.view.smooth=+$('smoothOct').value||0;render();};
const ZOOM={zBass:[20,250],zMids:[250,4000],zTreble:[4000,20000]};
Object.keys(ZOOM).forEach(id=>$(id).onclick=()=>{
  const on=$(id).classList.contains('active');
  ['zBass','zMids','zTreble'].forEach(z=>$(z).classList.remove('active'));
  if(on){state.view.fmin=20;state.view.fmax=20000;}
  else{$(id).classList.add('active');state.view.fmin=ZOOM[id][0];state.view.fmax=ZOOM[id][1];}
  render();});
$('btnInspect').onclick=()=>{state.view.inspect=!state.view.inspect;$('btnInspect').classList.toggle('active',state.view.inspect);if(!state.view.inspect)$('inspectTip').classList.add('hidden');};
$('graph').addEventListener('mousemove',e=>{
  if(!state.view.inspect)return;
  const r=$('graph').getBoundingClientRect(),f=graph.freqAt(e.clientX-r.left);
  const list=displayCurves();
  let txt=f>=1000?(f/1000).toFixed(2)+' kHz':Math.round(f)+' Hz';
  for(const cu of list)if(cu.visible)txt+='\n'+cu.name+': '+valueAt(FREQS,cu.db,f).toFixed(1)+' dB';
  const tip=$('inspectTip');tip.textContent=txt;tip.classList.remove('hidden');
  tip.style.left=Math.min(e.clientX-r.left+14,r.width-190)+'px';tip.style.top=(e.clientY-r.top+10)+'px';});
$('graph').addEventListener('mouseleave',()=>$('inspectTip').classList.add('hidden'));
/* ---------- кривые ---------- */
function addCurve(name,pts,opts={}){
  const cu=Object.assign({id:'c'+Date.now()+Math.random().toString(16).slice(2),name,
    raw:interpPoints(pts,FREQS),offset:0,smooth:0,pinned:false,disabled:false,
    color:COLORS[colorIdx++%COLORS.length]},opts);
  state.curves.push(cu);rebuildEqModelSelect();rebuildList();render();return cu;
}
function rebuildEqModelSelect(){
  const s=$('eqModel');s.innerHTML='';
  state.curves.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;s.appendChild(o);});
  if(!state.curves.find(c=>c.id===state.eq.modelId))setEqModel(state.curves[0]?state.curves[0].id:null);
  else s.value=state.eq.modelId;
}
function setEqModel(id){state.eq.modelId=id;$('eqModel').value=id||'';loadPreset();rebuildFilters();}
$('eqModel').onchange=()=>{state.eq.modelId=$('eqModel').value;loadPreset();rebuildFilters();render();};
/* ---------- вкладки / каталог ---------- */
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  ['brands','models','eq'].forEach(t=>$('tab-'+t).classList.toggle('hidden',t!==b.dataset.tab));});
function rebuildBrands(){
  const brands=[...new Set(MODELS.map(m=>m.brand))];
  const box=$('brandList');box.innerHTML='';
  brands.forEach(br=>{const b=document.createElement('button');b.textContent=br;
    b.onclick=()=>{state.brandFilter=br;rebuildModels();document.querySelector('#tabs button[data-tab=models]').click();};
    box.appendChild(b);});
  $('modelCount').textContent=MODELS.length;
}
function rebuildModels(){
  const box=$('modelList');box.innerHTML='';
  MODELS.filter(m=>!state.brandFilter||m.brand===state.brandFilter).forEach(m=>{
    const b=document.createElement('button');b.textContent=m.name+'  +';
    b.onclick=()=>{if(!state.curves.find(c=>c.name===m.name))addCurve(m.name,m.points);};
    box.appendChild(b);});
  const clr=document.createElement('button');clr.textContent='(all brands)';
  clr.onclick=()=>{state.brandFilter=null;rebuildModels();};box.appendChild(clr);
}
/* ---------- EQ ---------- */
function rebuildFilters(){
  const box=$('filterRows');box.innerHTML='';
  state.eq.filters.forEach((fl,i)=>{
    const d=document.createElement('div');
    const del=document.createElement('button');del.textContent='×';del.title='Remove filter';
    del.onclick=()=>{state.eq.filters.splice(i,1);rebuildFilters();render();};
    const ty=document.createElement('select');
    ['PK','LS','HS','LP','HP','BP','NS'].forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;ty.appendChild(o);});
    ty.value=fl.type;ty.onchange=()=>{fl.type=ty.value;render();};
    const f=document.createElement('input');f.type='number';f.value=fl.f;f.oninput=()=>{fl.f=+f.value||20;render();};
    const g=document.createElement('input');g.type='number';g.step='0.1';g.value=fl.gain;
    g.disabled=(fl.type!=='PK'&&fl.type!=='LS'&&fl.type!=='HS');
    g.oninput=()=>{fl.gain=+g.value||0;render();};
    const q=document.createElement('input');q.type='number';q.step='0.01';q.value=fl.Q;q.oninput=()=>{fl.Q=+q.value||0.7;render();};
    d.append(del,ty,f,g,q);box.appendChild(d);});
}
$('fAdd').onclick=()=>{state.eq.filters.push({type:'PK',f:1000,gain:0,Q:1,on:true});rebuildFilters();render();};
$('fRem').onclick=()=>{state.eq.filters.pop();rebuildFilters();render();};
$('prePlus').onclick=()=>{state.eq.preamp=Math.round((state.eq.preamp+0.5)*10)/10;render();};
$('preMinus').onclick=()=>{state.eq.preamp=Math.round((state.eq.preamp-0.5)*10)/10;render();};
$('btnSort').onclick=()=>{state.eq.filters.sort((a,b)=>a.f-b.f);rebuildFilters();render();};
$('btnDisable').onclick=()=>{state.eq.disabled=!state.eq.disabled;$('btnDisable').classList.toggle('active',state.eq.disabled);render();};
$('chkShowEQ').onchange=()=>{state.eq.show=$('chkShowEQ').checked;render();};
function eqText(){let t='Preamp: '+state.eq.preamp.toFixed(1)+' dB\n';
  state.eq.filters.forEach((f,i)=>t+='Filter '+(i+1)+': ON '+f.type+' Fc '+f.f+' Hz Gain '+f.gain.toFixed(1)+' dB Q '+f.Q.toFixed(2)+'\n');return t;}
$('btnCopy').onclick=()=>navigator.clipboard.writeText(eqText());
$('btnExportEQ').onclick=()=>download((modelName()||'eq')+'.txt',eqText());
$('btnSaveEQ').onclick=()=>{localStorage.setItem('prih_eq_'+state.eq.modelId,JSON.stringify({filters:state.eq.filters,preamp:state.eq.preamp}));alert('EQ saved (localStorage)');};
function loadPreset(){const s=localStorage.getItem('prih_eq_'+state.eq.modelId);
  if(s){const p=JSON.parse(s);state.eq.filters=p.filters||[];state.eq.preamp=p.preamp||0;}
  else{state.eq.filters=[];state.eq.preamp=0;}}
$('btnImportEQ').onclick=()=>{
  const txt=prompt('Paste parametric EQ (AutoEQ format):');if(!txt)return;
  const filters=[];let pre=0;
  for(const ln of txt.split(/\r?\n/)){
    const mp=ln.match(/Preamp:\s*([-0-9.]+)/i);if(mp)pre=parseFloat(mp[1]);
    const mf=ln.match(/Filter\s*\d+.*?(PK|LS|HS|LP|HP|BP|NS).*?Fc\s*([0-9.]+).*?Gain\s*([-0-9.]+).*?Q\s*([0-9.]+)/i);
    if(mf)filters.push({type:mf[1].toUpperCase(),f:parseFloat(mf[2]),gain:parseFloat(mf[3]),Q:parseFloat(mf[4]),on:true});}
  state.eq.filters=filters;state.eq.preamp=pre;rebuildFilters();render();};
$('btnAutoEQ').onclick=()=>{
  const cu=state.curves.find(c=>c.id===state.eq.modelId);if(!cu){alert('Select a model curve');return;}
  const meas=smoothDB(FREQS,cu.raw,12),tgt=smoothDB(FREQS,targetRaw(),12);
  const r=autoEQ(FREQS,meas,tgt,{fmin:+$('aqFmin').value,fmax:+$('aqFmax').value,gmin:+$('aqGmin').value,gmax:+$('aqGmax').value,qmin:+$('aqQmin').value,qmax:+$('aqQmax').value});
  state.eq.filters=r.filters;state.eq.preamp=r.preamp;rebuildFilters();render();};
function modelName(){const c=state.curves.find(c=>c.id===state.eq.modelId);return c?c.name.replace(/[^\w-]+/g,'_'):null;}
function download(name,text){const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
/* ---------- загрузки / модалка ---------- */
$('btnUploadFR').onclick=()=>$('fileFR').click();
$('fileFR').onchange=e=>readFile(e.target.files[0],(name,txt)=>{const p=parseFR(txt);if(p.length>2)addCurve(name,p,{uploaded:true});});
$('btnUploadTarget').onclick=()=>$('fileTarget').click();
$('fileTarget').onchange=e=>readFile(e.target.files[0],(name,txt)=>{const p=parseFR(txt);if(p.length>2){
  state.customTarget={id:'custom',name:name+' Target',kind:'fixed',points:p};state.targetId='custom';rebuildTargets();rebuildList();render();}});
function readFile(f,cb){if(!f)return;const r=new FileReader();r.onload=()=>cb(f.name.replace(/\.[^.]+$/,''),r.result);r.readAsText(f);}
$('btnAddMeas').onclick=()=>$('modal').classList.remove('hidden');
$('mCancel').onclick=()=>$('modal').classList.add('hidden');
$('mAdd').onclick=async()=>{
  let pts=null;
  if($('mText').value.trim())pts=parseFR($('mText').value);
  else if($('mFile').files[0])pts=parseFR(await $('mFile').files[0].text());
  else if($('mURL').value)pts=parseFR(await fetch($('mURL').value).then(r=>r.text()).catch(()=>''));
  else if($('mURLL').value&&$('mURLR').value){
    const [l,r]=await Promise.all([fetch($('mURLL').value).then(x=>x.text()).catch(()=>''),fetch($('mURLR').value).then(x=>x.text()).catch(()=>'')]);
    const a=parseFR(l),b=parseFR(r);
    if(a.length&&b.length){const bf=b.map(x=>x[0]),bd=b.map(x=>x[1]);
      pts=a.map(([f,d])=>[f,(d+valueAt(bf,bd,f))/2]);}}
  if(!pts||pts.length<3){alert('No valid data');return;}
  addCurve($('mName').value||'Measurement',pts,{uploaded:true,source:$('mSource').value});
  $('modal').classList.add('hidden');};
/* ---------- топ-кнопки ---------- */
$('btnScreenshot').onclick=()=>{const a=document.createElement('a');a.href=$('graph').toDataURL('image/png');a.download='prih_graph.png';a.click();};
$('btnAvg').onclick=()=>{const vis=displayCurves().filter(c=>c.visible&&!c.isTarget&&c.id!=='eqview');
  if(vis.length<2){alert('Need 2+ visible curves');return;}
  const avg=avgCurves(vis.map(v=>v.db));
  addCurve('Average',FREQS.map((f,i)=>[f,avg[i]]),{uploaded:true});};
/* ---------- старт ---------- */
rebuildBrands();rebuildModels();rebuildTargets();
addCurve('KZ EDC Pro AVG',MODELS[0].points);
setEqModel(state.curves[0].id);
rebuildList();render();
window.addEventListener('resize',render);
