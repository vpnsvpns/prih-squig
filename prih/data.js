"use strict";
/* data: config, state, targets, curve processing, series */
var BUILD="v46";
var CFG={
  name:"Prih",normRange:[500,2000],
  autoEqDefaults:{fmin:20,fmax:8000,gmin:-10,gmax:6,qmin:0.5,qmax:1.5},
  targets:[
    {group:"Reference",name:"ISO 11904-1 DF",
     file:"targets/∆ ISO 11904-1 DF Target.txt",
     alt:"targets/ISO 11904-1 DF Target.txt",adjustable:true},
    {group:"Reference",name:"ISO DF Harman Bass",
     file:"targets/ISO DF Harman Bass 711.txt",adjustable:true},
    {group:"Reference",name:"PEQdB Diamond β",
     file:"targets/PEQdB Diamond β.txt"},
    {group:"Reference",name:"Harman IE 2019 v2",
     file:"targets/Harman IE 2019v2 Target Target.txt",
     alt:"targets/Harman IE 2019v2 Target.txt",
     adjustable:true},
    {group:"Reference",name:"Prih Target",
     file:"targets/Prih Target.txt",default:true},
    {group:"Preference",name:"JM1",
     file:"targets/JM1.txt",adjustable:true},
    {group:"Preference",name:"Harman IE 2017",
     file:"targets/Harman IE 2017.txt",adjustable:true}
  ],
  hps:[]
};
var PALETTE=["#38c5f4","#ff8a65","#aed581","#ba68c8","#ffd54f",
"#4db6ac","#f06292","#7986cb","#a1887f","#e57373"];
var FMIN=20,FMAX=20000,SPO=96;
var GRID=(function(){
  var n=Math.round(Math.log2(FMAX/FMIN)*SPO);
  var g=new Float64Array(n+1),i;
  for(i=0;i<=n;i++){
    g[i]=FMIN*Math.pow(2,i/SPO);
  }
  return g;
})();
var ZOOMS={bass:[20,500],mids:[500,5000],treble:[5000,20000]};
var state={
  selected:new Map(),hidden:new Set(),curves:new Map(),
  target:null,brand:null,
  adj:{bass:0,bassQ:0.707,bassF:105,treble:0,tilt:0,ear:0},
  normOn:true,normDb:60,normHz:500,smoothN:0,ySpan:30,
  aeq:{fmin:20,fmax:8000,gmin:-10,gmax:6,qmin:0.5,qmax:1.5},
  eq:{name:null,filters:[],preamp:0,curve:null},
  eqShow:true,eqRunning:false,devMode:false,
  uploaded:[],remote:[],impTargets:[],
  zoom:null,inspect:false,palShift:0,mouse:null,
  dbUpdated:null
};
var targets=new Map(),hpCache=new Map();
function curveCfg(key){
  if(!state.curves.has(key)){
    state.curves.set(key,{off:0,pin:false});
  }
  return state.curves.get(key);
}
function flatToPairs(p){
  var out=[],i;
  for(i=0;i+1<p.length;i+=2){out.push([p[i],p[i+1]]);}
  return out;
}
var FALLBACK_HARMAN=[
20,7.62973,22.44924,7.68487,25.19842,7.71947,28.28427,7.72681,
31.74802,7.69917,35.63595,7.60681,40,7.41131,44.89848,7.08692,
50.39684,6.63857,56.56854,6.10753,63.49604,5.50985,71.2719,4.85848,
80,4.18831,89.79696,3.50032,100.79368,2.77975,113.13708,2.0519,
126.99208,1.33947,142.54379,0.6872,160,0.09838,179.59393,-0.47266,
201.58737,-0.98818,226.27417,-1.37155,253.98417,-1.60032,
285.08759,-1.70023,320,-1.70974,359.18786,-1.6662,403.17474,-1.59545,
452.54834,-1.50398,507.96834,-1.38436,570.17518,-1.24699,
640,-1.07811,718.37571,-0.86396,806.34947,-0.62243,905.09668,-0.33051,
1015.93667,0.05512,1140.35036,0.58276,1280,1.32076,
1436.75142,2.21175,1612.69894,3.21386,1810.19336,4.49772,
2031.87335,5.98719,2280.70072,7.3739,2560,8.4983,
2873.50284,9.17476,3225.39789,9.41864,3620.38672,9.24472,
4063.74669,8.8162,4561.40144,8.24556,5120,7.6048,
5747.00569,6.99762,6450.79578,6.18873,7240.77344,4.97312,
8127.49339,3.32921,9122.80287,1.21727,10240,-1.25957,
11494.01137,-3.68367,12901.59155,-5.99103,14481.54688,-8.09968,
16254.98677,-10.65092,18245.60575,-15.25816,20186.38231,-20.68071];
function allHps(){return CFG.hps.concat(state.uploaded,state.remote);}
function nameTaken(x){
  if(targets.has(x)){return true;}
  var all=allHps(),i;
  for(i=0;i<all.length;i++){
    if(all[i].name===x){return true;}
  }
  return false;
}
function uniqueName(base){
  var n=base,i=2;
  while(nameTaken(n)){
    n=base+" "+i;
    i++;
  }
  return n;
}
function loadTargets(){
  var jobs=CFG.targets.map(function(t){
    var urls=[t.file,t.alt].filter(Boolean);
    var chain=Promise.reject(new Error("no file"));
    urls.forEach(function(u){
      chain=chain.catch(function(){
        return fetchLocal(u).then(function(txt){
          var pts=parseTable(txt);
          if(pts.length>10){
            targets.set(t.name,{def:t,raw:resample(pts)});
          }else{
            throw new Error("short");
          }
        });
      });
    });
    return chain.catch(function(){
      if(t.name==="Harman IE 2019 v2"&&
         !targets.has(t.name)){
        targets.set(t.name,{
          def:t,
          raw:resample(flatToPairs(FALLBACK_HARMAN))});
      }
    });
  });
  return Promise.all(jobs).then(function(){
    if(!state.target||!targets.has(state.target)){
      var d=null,i;
      for(i=0;i<CFG.targets.length;i++){
        var t=CFG.targets[i];
        if(t.default&&targets.has(t.name)){d=t;}
      }
      if(d){state.target=d.name;}
      else{state.target=targets.keys().next().value||null;}
    }
  });
}
function loadRemoteDb(){
  return fetchWithTimeout("data/squig-db.json",8000)
  .then(function(r){
    if(!r.ok){throw new Error("http");}
    return r.json();
  }).then(function(j){
    (j.hps||[]).forEach(function(rec){
      var pairs=flatToPairs(rec.pts||[]);
      if(pairs.length<20){return;}
      state.remote.push({
        name:rec.name,source:rec.src,
        raw:resample(pairs),remote:true});
    });
    state.dbUpdated=(j.meta&&j.meta.updated)||null;
    if(state.remote.length){
      toast("Squig db: "+state.remote.length+" models");
    }
  }).catch(function(){});
}
function adjCurve(){
  var a=state.adj,out=new Float64Array(GRID.length);
  var B=clamp(a.bass,-12,12),Tt=clamp(a.treble,-12,12);
  var E=clamp(a.ear,-12,12),TL=clamp(a.tilt,-3,3);
  if(!B&&!Tt&&!E&&!TL){return out;}
  var fc=clamp(a.bassF,30,300);
  var k=1.2/clamp(a.bassQ,0.3,2);
  for(var i=0;i<GRID.length;i++){
    var f=GRID[i],d=0;
    d+=B*0.5*(1-Math.tanh(k*Math.log2(f/fc)));
    d+=Tt*0.5*(1-Math.tanh(-k*Math.log2(f/10000)));
    d+=E*Math.exp(-Math.pow(Math.log2(f/2700)/1.1,2));
    d+=TL*Math.log2(f/1000);
    out[i]=d;
  }
  return out;
}
function targetRaw(){
  var t=targets.get(state.target);
  if(!t){return null;}
  if(t.def.adjustable){return addF(t.raw,adjCurve());}
  return t.raw;
}
function normalizeOnly(y){
  if(!state.normOn){return y;}
  return shift(y,state.normDb-anchorVal(y,state.normHz));
}
function processCurve(raw,cfg,isTarget){
  var y=raw;
  var n=0;
  if(!isTarget){n=state.smoothN;}
  if(n>0){y=smoothCurve(y,1/n);}
  if(state.normOn){
    y=shift(y,state.normDb-anchorVal(y,state.normHz));
  }
  if(cfg&&cfg.off){y=shift(y,cfg.off);}
  return y;
}
function displayedY(raw,cfg,isTarget){
  var y=processCurve(raw,cfg,isTarget);
  if(state.devMode){
    var tr=targetRaw();
    if(tr){
      y=minusF(y,processCurve(tr,curveCfg("__target"),1));
    }
  }
  return y;
}
function filterResp(fl,f){
  if(!fl.on||!fl.g){return 0;}
  if(fl.t==="PK"){return fl.g*shape(f,fl.f,fl.q);}
  var bt="hs";
  if(fl.t==="LS"){bt="ls";}
  return biquadDb(bt,fl.f,fl.q,fl.g,f);
}
function hasActiveEq(){
  if(!state.eq||!state.eqShow||!state.eq.curve){return false;}
  return state.eq.filters.some(function(f){
    return f.on&&Math.abs(f.g)>=0.05;
  });
}
function series(){
  var S=[];
  state.selected.forEach(function(s,name){
    if(!s.raw||state.hidden.has(name)){return;}
    var cfg=curveCfg(name);
    S.push({name:name,color:s.color,pin:cfg.pin,
      y:displayedY(s.raw,cfg,0)});
  });
  var tr=targetRaw();
  if(tr&&!state.hidden.has("__target")){
    var ct=curveCfg("__target");
    var ty;
    if(state.devMode){
      ty=new Float64Array(GRID.length);
    }else{
      ty=processCurve(tr,ct,1);
    }
    S.push({name:state.target,color:css("--target"),
      dash:[6,4],w:2,pin:ct.pin,y:ty});
  }
  if(hasActiveEq()&&!state.hidden.has("__eq")){
    S.push({name:"EQ result",color:css("--eq"),w:2,
      pin:curveCfg("__eq").pin,
      y:displayedY(state.eq.curve,curveCfg("__eq"),0)});
  }
  S.sort(function(a,b){return(a.pin?1:0)-(b.pin?1:0);});
  return S;
}
function loadHp(def){
  if(def.raw){return Promise.resolve(def.raw);}
  if(!hpCache.has(def.name)){
    hpCache.set(def.name,doLoadHp(def).catch(function(e){
      hpCache.delete(def.name);
      throw e;
    }));
  }
  return hpCache.get(def.name);
}
function doLoadHp(def){
  function one(u){
    return fetchAny(u).then(function(t){
      return resample(parseTable(t));
    });
  }
  if(def.raw){return Promise.resolve(def.raw);}
  if(def.url){return one(def.url);}
  if(def.urlL&&def.urlR){
    return Promise.all([one(def.urlL),one(def.urlR)])
      .then(function(p){return averageCurves(p);});
  }
  if(def.file){return one(def.file);}
  if(def.L&&def.R){
    return Promise.all([one(def.L),one(def.R)])
      .then(function(p){return averageCurves(p);});
  }
  return Promise.reject(new Error("no source"));
}
function afterSelChange(){
  renderEqCurveSelect();
  recomputeEq();
  renderModels();
  updateLegend();
  draw();
}
function toggleHp(def){
  if(!def){return;}
  if(state.selected.has(def.name)){
    state.selected.delete(def.name);
    afterSelChange();
    return;
  }
  var i=state.selected.size+state.palShift;
  var color=PALETTE[i%PALETTE.length];
  state.selected.set(def.name,{color:color,raw:null});
  loadHp(def).then(function(raw){
    var s=state.selected.get(def.name);
    if(s){s.raw=raw;}
    afterSelChange();
  }).catch(function(){
    state.selected.delete(def.name);
    toast("Load failed: "+def.name);
    afterSelChange();
  });
}
/*EOF-data*/
