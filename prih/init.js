"use strict";
/* init v71: TRAINED AutoEQ engine lives here (overrides core.js),
   + self-sufficient EQ funcs + audit + stubs + sheet + squig + legend */
function stubIfMissing(name,fn){
  if(typeof window[name]==="function"){return null;}
  window[name]=fn;
  return name;
}
function installStubs(){
  var out=[];
  var s1=stubIfMissing("loadUploaded",function(){
    try{
      var a=JSON.parse(
        localStorage.getItem("prih-uploaded")||"[]");
      state.uploaded=a.map(function(u){
        return{name:u.name,source:u.source||"uploaded",
          pts:u.pts,raw:resample(u.pts)};
      });
    }catch(e){state.uploaded=[];}
  });
  if(s1){out.push(s1);}
  var s2=stubIfMissing("saveUploaded",function(){
    try{
      var arr=state.uploaded.map(function(u){
        return{name:u.name,source:u.source,pts:u.pts};
      });
      localStorage.setItem("prih-uploaded",
        JSON.stringify(arr));
    }catch(e){}
  });
  if(s2){out.push(s2);}
  var s3=stubIfMissing("pushUploaded",function(n,s,p,r){
    state.uploaded.push({name:n,source:s,pts:p,raw:r});
    var i=state.selected.size+state.palShift;
    state.selected.set(n,{
      color:PALETTE[i%PALETTE.length],raw:r});
    return n;
  });
  if(s3){out.push(s3);}
  var s4=stubIfMissing("toast",function(m){
    console.log("TOAST: "+m);
  });
  if(s4){out.push(s4);}
  return out;
}
/* ============ TRAINED AutoEQ ENGINE v3 (from user's 6 presets) ====
   Bands: 1) sub-bass PK28-50 or LSC105  2) mud 160-250 (cut only)
   3) body 550-1500  4) presence 2500-4300  5) treble 5000-7750
   Limits: |gain| per band, Q in [0.5,1.5], no centers above 8kHz,
   2-6 filters, skip band if |gain|<0.45dB, weight 6-8kHz x0.3, >8kHz x0
   ================================================================== */
window.AutoEqFit=(function(){
  function maskW(f,fmax){
    var f1=fmax*0.85;
    if(f<=f1){return 1;}
    if(f>=fmax){return 0;}
    return 0.5*(1+Math.cos(Math.PI*(f-f1)/(fmax-f1)));
  }
  function wOf(f){
    if(f<=6000){return 1;}
    if(f>=8000){return 0;}
    return 1-0.7*(f-6000)/2000;
  }
  function lsGain(e,s,w,gmin,gmax){
    var num=0,den=0,i;
    for(i=0;i<e.length;i++){
      num+=w[i]*e[i]*s[i];
      den+=w[i]*s[i]*s[i];
    }
    if(den<1e-9){return 0;}
    var g=-num/den;
    if(g<gmin){g=gmin;}
    if(g>gmax){g=gmax;}
    return g;
  }
  function reduction(e,s,g,w){
    var b=0,a=0,i,d;
    for(i=0;i<e.length;i++){
      b+=w[i]*e[i]*e[i];
      d=e[i]-g*s[i];
      a+=w[i]*d*d;
    }
    return b-a;
  }
  function applyF(e,s,g){
    var i;
    for(i=0;i<e.length;i++){e[i]-=g*s[i];}
  }
  function bestBand(e,f,w,cs,qs,gmin,gmax){
    var best=null,ci,qi,i;
    for(ci=0;ci<cs.length;ci++){
      for(qi=0;qi<qs.length;qi++){
        var s=new Array(f.length);
        for(i=0;i<f.length;i++){s[i]=shape(f[i],cs[ci],qs[qi]);}
        var g=lsGain(e,s,w,gmin,gmax);
        if(g<0.45&&g>-0.45){continue;}
        var red=reduction(e,s,g,w);
        if(red<=0){continue;}
        if(!best||red>best.red){
          best={f:cs[ci],q:qs[qi],g:g,red:red,s:s};
        }
      }
    }
    return best;
  }
  function tick(){
    return new Promise(function(r){setTimeout(r,0);});
  }
  async function fitAsync(eFull,fFull,o,onProg){
    var t0=performance.now();
    var idx=[],i;
    for(i=0;i<fFull.length;i++){
      if(fFull[i]>=20&&fFull[i]<=10000){idx.push(i);}
    }
    if(idx.length<10){return [];}
    var f=idx.map(function(k){return fFull[k];});
    var e=idx.map(function(k){return eFull[k];});
    var w=f.map(wOf);
    var out=[];
    /* band 1: LSC105 vs PK sub-bass */
    var sLs=new Array(f.length);
    for(i=0;i<f.length;i++){
      sLs[i]=biquadDb("ls",105,0.71,1,f[i]);
    }
    var gLs=lsGain(e,sLs,w,-3,0);
    var redLs=(gLs<-0.45)?reduction(e,sLs,gLs,w):0;
    var pk1=bestBand(e,f,w,
      [28,32,36,40,46,50],[0.5,0.6,0.7,0.8],-1.5,2);
    var redPk=pk1?pk1.red:0;
    if(redLs>redPk&&redLs>0){
      out.push({t:"LS",f:105,q:0.71,
        g:Math.round(gLs*10)/10});
      applyF(e,sLs,gLs);
    }else if(pk1&&redPk>0){
      out.push({t:"PK",f:pk1.f,q:pk1.q,
        g:Math.round(pk1.g*10)/10});
      applyF(e,pk1.s,pk1.g);
    }
    await tick();
    /* bands 2..5 */
    var defs=[
      {cs:[160,175,183,190,200,215,232,250],
       qs:[0.6,0.7,0.8,0.9,0.95],gmin:-3,gmax:0},
      {cs:[550,650,685,750,900,1100,1300,1400,1500],
       qs:[0.9,1,1.2,1.5],gmin:-2.5,gmax:2.5},
      {cs:[2500,2850,3000,3250,3500,3800,4000,4300],
       qs:[0.5,0.6,0.76,0.9,0.95,1.2,1.5],gmin:-2,gmax:3.5},
      {cs:[5000,5134,5360,5600,6000,6500,7000,7500,7750],
       qs:[1.2,1.5],gmin:-2,gmax:3.5}
    ];
    var d;
    for(d=0;d<defs.length;d++){
      if(out.length>=6){break;}
      var b=bestBand(e,f,w,defs[d].cs,defs[d].qs,
        defs[d].gmin,defs[d].gmax);
      if(!b){continue;}
      out.push({t:"PK",f:b.f,q:Math.round(b.q*100)/100,
        g:Math.round(b.g*10)/10});
      applyF(e,b.s,b.g);
      await tick();
    }
    out.sort(function(a,b){return a.f-b.f;});
    if(onProg){
      onProg(1,Math.round((performance.now()-t0)/100)/10);
    }
    return out;
  }
  return{fitAsync:fitAsync,mask:maskW};
})();
/* ============ runAutoEq override: no zero filler rows ==== */
function runAutoEqV71(){
  if(state.eqRunning){
    toast("AutoEQ already running");
    return;
  }
  var base=eqBase();
  if(!base){
    toast("Select headphones first");
    return;
  }
  var tr=targetRaw();
  if(!tr){
    toast("Target unavailable");
    return;
  }
  var hpN=normalizeOnly(base),tN=normalizeOnly(tr);
  var e=new Float64Array(GRID.length),i;
  for(i=0;i<GRID.length;i++){e[i]=hpN[i]-tN[i];}
  var a=state.aeq;
  state.eqRunning=true;
  $("btnEq").disabled=true;
  var ov=$("eqOverlay"),msg=$("eqOverlayMsg");
  if(ov){ov.hidden=false;}
  if(msg){
    msg.textContent="AutoEQ is running, it could "+
      "take 5-20 seconds or more.";
  }
  function finish(){
    state.eqRunning=false;
    $("btnEq").disabled=false;
    if(ov){ov.hidden=true;}
  }
  setTimeout(function(){
    window.AutoEqFit.fitAsync(e,GRID,{
      fmin:a.fmin,fmax:a.fmax,
      gmin:a.gmin,gmax:a.gmax,
      qmin:a.qmin,qmax:a.qmax,
      count:5,budget:6000
    },function(stage,secs){
      if(msg){
        msg.textContent="AutoEQ is running... ("+secs+" s)";
      }
    }).then(function(fits){
      state.eq.filters=fits.map(function(x){
        return{on:true,t:x.t||"PK",
          f:fmtF(x.f),g:r1(x.g),q:r2(x.q)};
      });
      clearPreImport();
      renderEqRows();
      recomputeEq();
      state.eqShow=true;
      $("eqShowChk").checked=true;
      updateLegend();
      draw();
      finish();
      toast("AutoEQ "+BUILD+": filters "+
        state.eq.filters.length+
        ", pre-amp "+state.eq.preamp.toFixed(1)+" dB");
    }).catch(function(err){
      finish();
      toast("AutoEQ error: "+err.message);
    });
  },60);
}
window.runAutoEq=runAutoEqV71;
/* ============ self-sufficient EQ funcs ============ */
function clearPreImport(){
  state.eq.preImport=null;
}
function recomputeEq(){
  var base=eqBase();
  if(!base){
    state.eq.curve=null;
    state.eq.preamp=0;
    state.eq.align=0;
    $("eqPreamp").textContent="Pre-amp: 0.0 dB";
    return;
  }
  var curve=new Float64Array(GRID.length),pk=0,i,j;
  for(i=0;i<GRID.length;i++){
    var mk=eqMaskAt(GRID[i]);
    var v=base[i],fv=0;
    for(j=0;j<state.eq.filters.length;j++){
      var r=filterResp(state.eq.filters[j],GRID[i])*mk;
      v+=r;
      fv+=r;
    }
    curve[i]=v;
    if(fv>pk){pk=fv;}
  }
  state.eq.curve=curve;
  if(state.normOn){
    state.eq.align=anchorVal(curve,state.normHz)-
      anchorVal(base,state.normHz);
  }else{
    state.eq.align=0;
  }
  var pre;
  if(state.eq.preImport!=null){pre=state.eq.preImport;}
  else{
    pre=pk>0?-(pk+0.1):0;
  }
  if(!isFinite(pre)){pre=0;}
  if(pre<-30){pre=-30;}
  if(pre>0){pre=0;}
  state.eq.preamp=pre;
  $("eqPreamp").textContent=
    "Pre-amp: "+state.eq.preamp.toFixed(1)+" dB";
}
function alignShift(){
  var a=state.eq.align;
  if(typeof a==="number"&&isFinite(a)){return a;}
  return 0;
}
function installAlignPatch(){
  var _ser=window.series;
  window.series=function(){
    var S=_ser();
    var d=alignShift();
    if(d!==0){
      var nm=eqResultName();
      for(var i=0;i<S.length;i++){
        if(S[i].name===nm){S[i].y=shift(S[i].y,d);}
      }
    }
    return S;
  };
  var _cy=window.curveYByKey;
  window.curveYByKey=function(k){
    var y=_cy(k);
    if(k==="__eq"&&y){y=shift(y,alignShift());}
    return y;
  };
}
function readNumAfter(s,idx){
  var i=idx,started=false,str="";
  while(i<s.length){
    var c=s.charAt(i);
    if((c>="0"&&c<="9")||c==="."){
      str+=c;started=true;
    }else if((c==="-"||c==="+")&&!started){
      str+=c;
    }else if(started){
      break;
    }
    i++;
  }
  var v=parseFloat(str);
  return isFinite(v)?v:null;
}
function parseEqText(t){
  var fs=[],pre=null,skipped=0;
  var lines=t.split("\n"),i;
  for(i=0;i<lines.length;i++){
    var line=lines[i];
    var U=line.toUpperCase();
    var pi=U.indexOf("PREAMP:");
    if(pi>=0){
      var pv=readNumAfter(line,pi+7);
      if(pv!=null){pre=pv;}
      continue;
    }
    if(U.indexOf("FILTER")<0){continue;}
    if(U.indexOf(" OFF")>=0||U.indexOf(":OFF")>=0){
      skipped++;
      continue;
    }
    if(U.indexOf(" ON")<0){continue;}
    var pon=U.indexOf(" ON ");
    var tstr="";
    if(pon>=0){
      var j=pon+4;
      while(j<U.length&&U.charAt(j)!==" "){
        tstr+=U.charAt(j);
        j++;
      }
    }
    var tt="PK";
    if(tstr.indexOf("LS")===0){tt="LS";}
    else if(tstr.indexOf("HS")===0){tt="HS";}
    var pfc=U.indexOf("FC");
    var fc=null;
    if(pfc>=0){
      fc=readNumAfter(line,pfc+2);
      var pkhz=U.indexOf("KHZ",pfc);
      var phz=U.indexOf("HZ",pfc);
      if(pkhz>=0&&(phz<0||pkhz<=phz)){
        if(fc!=null){fc=fc*1000;}
      }
    }
    var pg=U.indexOf("GAIN");
    var gain=null;
    if(pg>=0){gain=readNumAfter(line,pg+4);}
    var pq=U.indexOf(" Q");
    var q=null;
    if(pq>=0){q=readNumAfter(line,pq+2);}
    if(fc!=null&&fc>0&&gain!=null){
      fs.push({on:true,t:tt,f:fc,g:gain,
        q:q!=null?Math.max(0.05,q):0.7});
    }
  }
  return{fs:fs,pre:pre,skipped:skipped};
}
function importEqFile(f){
  f.text().then(function(t){
    var r=parseEqText(t);
    if(!r.fs.length){
      toast("No Filter N: ON ... lines found");
      return;
    }
    state.eq.filters=r.fs;
    if(r.pre!=null){state.eq.preImport=r.pre;}
    else{state.eq.preImport=null;}
    renderEqRows();
    recomputeEq();
    updateLegend();
    draw();
    var extra="";
    if(r.skipped>0){extra=", skipped OFF: "+r.skipped;}
    toast("Filters imported: "+r.fs.length+extra+
      ", preamp "+state.eq.preamp.toFixed(1)+" dB applied");
  }).catch(function(e){
    toast("File error: "+e.message);
  });
}
function auditDeps(){
  var need=["draw","updateLegend","renderModels","renderBrands",
    "buildTargetChips","switchTab","curveYByKey","downloadCurveByKey",
    "targetRaw","series","processCurve","displayedY","filterResp",
    "loadTargets","loadRemoteDb","toggleHp","afterSelChange","curveCfg",
    "normalizeOnly","hasActiveEq","eqBase","renderEqCurveSelect",
    "renderEqRows","eqLines","averageAll","screenshot",
    "restore","syncAdj","syncInputs","wrapDetails","importFRFile",
    "importTargetFile","addMeasurement","doPreview",
    "download","eqMaskAt","parseTable","resample","fetchAny","clamp",
    "shape","esc","css","num","r1","r2","fmtF","uniqueName","allHps",
    "loadHp","eqResultName","anchorVal","shift","biquadDb"];
  var miss=[],i;
  for(i=0;i<need.length;i++){
    if(typeof window[need[i]]!=="function"){miss.push(need[i]);}
  }
  if(typeof window.state==="undefined"){miss.push("state");}
  if(typeof window.GRID==="undefined"){miss.push("GRID");}
  if(typeof window.PALETTE==="undefined"){miss.push("PALETTE");}
  if(typeof window.T!=="function"){miss.push("T");}
  return miss;
}
function eqNameV71(){
  if(state.eq.name){return state.eq.name+" EQ";}
  return "EQ result";
}
function installLegendPatch(){
  var COLS="14px minmax(90px,1.1fr) 76px 44px 26px 26px 22px";
  function fix(){
    var r=document.querySelector(
      ".crow[data-key='__eq'] .cname");
    if(r){r.textContent=eqNameV71();}
    var offs=document.querySelectorAll(".crow .coff");
    var i;
    for(i=0;i<offs.length;i++){
      if(offs[i].parentNode){
        offs[i].parentNode.removeChild(offs[i]);
      }
    }
    var rows=document.querySelectorAll(".crow");
    for(i=0;i<rows.length;i++){
      rows[i].style.gridTemplateColumns=COLS;
    }
  }
  var _ul=window.updateLegend;
  window.updateLegend=function(){_ul();fix();};
  fix();
}
function injectMobileCss(){
  if(document.getElementById("mobileCss")){return;}
  var L=[];
  L.push("#graphWrap{height:40vh;min-height:230px}");
  L.push(".tabs button{font-size:15px;padding:14px 4px}");
  L.push("#search{padding:12px 14px;font-size:16px}");
  L.push(".mrow{padding:14px 12px;font-size:14px}");
  L.push(".mrow .add{padding:8px 14px;font-size:16px}");
  L.push(".tchip.tgt{padding:10px 16px;font-size:13px}");
  L.push("#adjRow label{border:1px solid var(--line);");
  L.push("border-radius:8px;background:var(--panel2);");
  L.push("padding:8px 10px;gap:8px;font-size:12px}");
  L.push("#adjRow input{width:64px;background:var(--bg)}");
  L.push("#adjRow button{padding:12px 14px;font-size:13px}");
  L.push("#legendRows{gap:12px;padding:10px}");
  L.push(".crow{display:flex;flex-wrap:wrap;gap:8px;");
  L.push("align-items:center}");
  L.push(".crow .cname{flex:1 1 100%;order:0;font-size:15px}");
  L.push(".crow .sw{order:1;flex:0 0 14px;margin-top:0}");
  L.push(".crow .spark{order:2;display:block;flex:1 1 120px;");
  L.push("width:auto;height:16px}");
  L.push(".crow .ph{display:none}");
  L.push(".crow .cdev{display:inline-block;order:4}");
  L.push(".crow .ceye{order:5}");
  L.push(".crow .cdl{order:6}");
  L.push(".crow .cx{order:7}");
  L.push(".crow button{min-width:44px;min-height:44px;");
  L.push("flex:0 0 44px;font-size:16px;");
  L.push("border:1px solid var(--line);border-radius:8px;");
  L.push("background:var(--panel2)}");
  L.push(".crow button:first-of-type{margin-left:auto}");
  L.push(".frow input[type=checkbox]{width:22px;height:22px}");
  L.push("#eqPane .row button{padding:12px 16px;font-size:14px}");
  L.push(".grid2 input{padding:10px;font-size:16px}");
  L.push("#left{height:104px;overflow:hidden;");
  L.push("transition:height .3s ease;padding-top:0}");
  L.push("#left::before{display:none}");
  L.push("#left .pane,#left #search{display:none}");
  L.push("#left.open{height:85vh}");
  L.push("#left.open #search{display:block}");
  L.push("#left.open .pane{display:flex;flex:1 1 auto;");
  L.push("min-height:0;overflow-y:auto}");
  var st=document.createElement("style");
  st.id="mobileCss";
  st.textContent=L.join("");
  document.head.appendChild(st);
}
function setupSheet(){
  var left=$("left");
  if(!left){return;}
  if(left.getAttribute("data-sheet")==="1"){return;}
  left.setAttribute("data-sheet","1");
  var CLOSED=104;
  function maxH(){return Math.round(window.innerHeight*0.85);}
  function isOpen(){return left.classList.contains("open");}
  function setOpen(v){
    left.classList.toggle("open",v);
    left.style.height="";
  }
  var drag=null,suppress=0;
  left.addEventListener("touchstart",function(e){
    if(!e.touches||!e.touches[0]){return;}
    var r=left.getBoundingClientRect();
    var y=e.touches[0].clientY;
    if(y-r.top>90){return;}
    drag={y:y,h:left.offsetHeight,moved:false};
    left.style.transition="none";
  },{passive:true});
  left.addEventListener("touchmove",function(e){
    if(!drag||!e.touches||!e.touches[0]){return;}
    var dy=drag.y-e.touches[0].clientY;
    if(Math.abs(dy)>4){drag.moved=true;}
    var nh=drag.h+dy;
    var mx=maxH();
    if(nh<CLOSED){nh=CLOSED;}
    if(nh>mx){nh=mx;}
    left.style.height=nh+"px";
    if(drag.moved&&e.cancelable){e.preventDefault();}
  },{passive:false});
  left.addEventListener("touchend",function(){
    if(!drag){return;}
    var moved=drag.moved;
    var nh=left.offsetHeight;
    drag=null;
    left.style.transition="";
    left.style.height="";
    if(moved){
      suppress=Date.now();
      setOpen(nh>(CLOSED+maxH())/2);
    }
  },{passive:true});
  left.addEventListener("click",function(e){
    var r=left.getBoundingClientRect();
    if(e.clientY-r.top>44){return;}
    if(Date.now()-suppress<400){return;}
    setOpen(!isOpen());
  });
  setOpen(false);
}
var SQ_ORIG={
  gudkov:"https://gudkov.squig.link/",
  pw:"https://pw.squig.link/",
  boizoff:"https://boizoff.squig.link/"
};
function sqEnds(s,suf){
  if(s.length<suf.length){return false;}
  return s.substring(s.length-suf.length)===suf;
}
function sqTokens(s){
  var out=[],cur="",i,c,ok;
  for(i=0;i<s.length;i++){
    c=s.charAt(i).toLowerCase();
    ok=(c>="a"&&c<="z")||(c>="0"&&c<="9");
    if(ok){cur+=c;}
    else{
      if(cur.length>2){out.push(cur);}
      cur="";
    }
  }
  if(cur.length>2){out.push(cur);}
  return out;
}
function sqCsvPaths(text){
  var res=[],from=0,pick,start,end,p,c,d;
  while(res.length<400){
    var a=text.indexOf(".csv",from);
    var b=text.indexOf(".txt",from);
    if(a<0&&b<0){break;}
    if(a<0){pick=b;}
    else if(b<0){pick=a;}
    else if(a<b){pick=a;}
    else{pick=b;}
    start=pick;
    while(start>0){
      c=text.charAt(start-1);
      if(c==="\""||c==="'"||c===" "||c==="<"||
         c===","||c==="["||c==="{"){break;}
      start--;
    }
    end=pick+4;
    while(end<text.length){
      d=text.charAt(end);
      if(d==="\""||d==="'"||d===")"||d===" "||d==="\n"){break;}
      end++;
    }
    p=text.substring(start,end);
    from=end;
    if(p.length>4&&p.length<300){res.push(p);}
  }
  var seen={},out2=[],k;
  for(k=0;k<res.length;k++){
    if(!seen[res[k]]){seen[res[k]]=1;out2.push(res[k]);}
  }
  return out2;
}
function sqScripts(html,origin){
  var paths=[],from=0,i,start,p,c,k,dup;
  while(paths.length<8){
    i=html.indexOf(".js",from);
    if(i<0){break;}
    start=i;
    while(start>0){
      c=html.charAt(start-1);
      if(c==="\""||c==="'"||c==="<"||c===" "||c==="\n"){break;}
      start--;
    }
    p=html.substring(start,i+3);
    from=i+3;
    if(p.indexOf("http")!==0){
      try{p=new URL(p,origin).href;}catch(e){continue;}
    }
    if(p.indexOf(origin)!==0){continue;}
    dup=false;
    for(k=0;k<paths.length;k++){if(paths[k]===p){dup=true;}}
    if(!dup){paths.push(p);}
  }
  return Promise.all(paths.map(function(u){
    return fetchAny(u).catch(function(){return "";});
  }));
}
function sqSiteFromUrl(u){
  if(!u){return null;}
  if(u.indexOf("gudkov.")>=0){return "gudkov";}
  if(u.indexOf("boizoff.")>=0){return "boizoff";}
  if(u.indexOf("pw.")>=0){return "pw";}
  if(u.indexOf("squig.link")>=0){
    var host=u.split("//")[1]||"";
    host=host.split("/")[0];
    var dot=host.indexOf(".squig.link");
    if(dot>0){return host.substring(0,dot);}
  }
  return null;
}
function squigModel(siteKey,model){
  var origin=SQ_ORIG[siteKey];
  if(!origin){return Promise.reject(new Error("unknown site"));}
  return fetchAny(origin).then(function(html){
    return sqScripts(html,origin).then(function(txts){
      var all=html,i;
      for(i=0;i<txts.length;i++){all=all+"\n"+txts[i];}
      var paths=sqCsvPaths(all);
      var resolved=[],k,p;
      for(k=0;k<paths.length;k++){
        p=paths[k];
        if(p.indexOf("http")!==0){
          try{p=new URL(p,origin).href;}catch(e){continue;}
        }
        resolved.push(p);
      }
      var groups={},order=[],m;
      var SUFS=["(l)"," l","_l","-l","%20l",
                "(r)"," r","_r","-r","%20r"];
      for(m=0;m<resolved.length;m++){
        var low=decodeURIComponent(resolved[m]).toLowerCase();
        var core=low.substring(0,low.length-4);
        var suf=null,ch=null,s2;
        for(s2=0;s2<SUFS.length;s2++){
          if(sqEnds(core,SUFS[s2])){
            suf=SUFS[s2];
            ch=suf.charAt(suf.length-1).toUpperCase();
            break;
          }
        }
        var base=core;
        if(suf){base=core.substring(0,core.length-suf.length);}
        if(!groups[base]){groups[base]={};order.push(base);}
        if(ch){groups[base][ch]=resolved[m];}
        else{groups[base].A=resolved[m];}
      }
      var toks=sqTokens(model);
      var best=null,bestSc=0,g;
      for(g=0;g<order.length;g++){
        var dec=decodeURIComponent(order[g]).toLowerCase();
        var sc=0,t;
        for(t=0;t<toks.length;t++){
          if(dec.indexOf(toks[t])>=0){sc++;}
        }
        if(sc>bestSc){bestSc=sc;best=order[g];}
      }
      var need=Math.max(1,Math.floor(toks.length/2));
      if(!best||bestSc<need){
        throw new Error("model not found in "+siteKey+
          " db (paths:"+resolved.length+")");
      }
      var grp=groups[best];
      if(grp.L&&grp.R){
        return Promise.all([fetchAny(grp.L),fetchAny(grp.R)])
        .then(function(pp){
          var la=resample(parseTable(pp[0]));
          var lb=resample(parseTable(pp[1]));
          var pts=[],j;
          for(j=0;j<GRID.length;j++){
            pts.push([GRID[j],(la[j]+lb[j])/2]);
          }
          return{avg:pts};
        });
      }
      var single=grp.A||grp.L||grp.R;
      if(!single){throw new Error("no data file for model");}
      return fetchAny(single).then(function(t2){
        return{avg:parseTable(t2)};
      });
    });
  });
}
function injectSquigFields(){
  if($("mSquig")){return;}
  var anchor=$("mPrev");
  if(!anchor){return;}
  var wrap=document.createElement("div");
  wrap.className="row";
  wrap.innerHTML=
    "<label style='flex:1'>Squig DB"+
    "<select id='mSquig'>"+
    "<option value='auto'>auto (from URL)</option>"+
    "<option value='gudkov'>gudkov.squig.link</option>"+
    "<option value='pw'>pw.squig.link</option>"+
    "<option value='boizoff'>boizoff.squig.link</option>"+
    "</select></label>"+
    "<label style='flex:1'>Model on squig"+
    "<input id='mModel' placeholder='KZ EDC Pro'></label>";
  anchor.parentNode.insertBefore(wrap,anchor);
}
function init(){
  try{
  if(window.__prihBootTimer){
    clearTimeout(window.__prihBootTimer);
  }
  var stubbed=installStubs();
  var miss=auditDeps();
  if(miss.length){
    var b0=$("errbar");
    if(b0){
      b0.style.display="block";
      b0.textContent="CORRUPTED FILE(S) ON SERVER. Missing: "+
        miss.join(", ")+
        " | Re-upload the file that defines them.";
    }
    return;
  }
  console.info("Prih init v71");
  installAlignPatch();
  installLegendPatch();
  injectSquigFields();
  var _grabBase=window.grabPts;
  window.grabPts=function(){
    var mEl=$("mModel");
    if(mEl&&mEl.value.trim()){
      var site=$("mSquig")?$("mSquig").value:"auto";
      if(!site||site==="auto"){
        site=sqSiteFromUrl($("mUrl").value.trim());
        if(!site){site="gudkov";}
      }
      return squigModel(site,mEl.value.trim());
    }
    return _grabBase();
  };
  loadUploaded();
  var tabs=document.querySelectorAll(".tabs button"),ti;
  for(ti=0;ti<tabs.length;ti++){
    tabs[ti].onclick=function(){switchTab(this.dataset.tab);};
  }
  on("search","input",renderModels);
  on("ySpan","change",function(e){
    state.ySpan=clamp(num(e.target,30),10,120);draw();});
  on("normOn","click",function(){
    state.normOn=!state.normOn;
    $("normOn").classList.toggle("on",state.normOn);draw();});
  on("normDb","change",function(e){
    state.normDb=clamp(num(e.target,60),-20,140);draw();});
  on("normHz","change",function(e){
    state.normHz=clamp(num(e.target,500),20,20000);draw();});
  on("smoothN","change",function(e){
    state.smoothN=clamp(num(e.target,0),0,48);
    updateLegend();draw();});
  function setZoom(z){
    if(state.zoom===z){state.zoom=null;}else{state.zoom=z;}
    syncZoom();draw();
  }
  on("zBass","click",function(){setZoom("bass");});
  on("zMids","click",function(){setZoom("mids");});
  on("zTreble","click",function(){setZoom("treble");});
  on("btnInspect","click",function(){
    state.inspect=!state.inspect;
    $("btnInspect").classList.toggle("on",state.inspect);
    $("graph").classList.toggle("inspect",state.inspect);
    draw();});
  var cv=$("graph");
  cv.addEventListener("mousemove",function(e){
    if(!state.inspect){return;}
    var r=cv.getBoundingClientRect();
    state.mouse={x:e.clientX-r.left,y:e.clientY-r.top};draw();});
  cv.addEventListener("mouseleave",function(){
    state.mouse=null;if(state.inspect){draw();}});
  cv.addEventListener("touchmove",function(e){
    if(!state.inspect){return;}
    if(!e.touches||!e.touches[0]){return;}
    var r=cv.getBoundingClientRect();
    state.mouse={x:e.touches[0].clientX-r.left,
      y:e.touches[0].clientY-r.top};
    draw();e.preventDefault();},{passive:false});
  cv.addEventListener("touchend",function(){
    state.mouse=null;if(state.inspect){draw();}});
  var lg=$("legendRows");
  lg.addEventListener("click",function(e){
    var row=e.target.closest(".crow");
    if(!row){return;}
    var key=row.dataset.key,cfg=curveCfg(key);
    var c=e.target.classList;
    if(c.contains("cdev")){
      state.devMode=!state.devMode;updateLegend();draw();
    }else if(c.contains("ceye")){
      if(state.hidden.has(key)){state.hidden.delete(key);}
      else{state.hidden.add(key);}
      updateLegend();draw();
    }else if(c.contains("cdl")){
      downloadCurveByKey(key);
    }else if(c.contains("cx")){
      if(key==="__target"){
        state.target=null;buildTargetChips();syncAdj();
      }else if(key==="__eq"){
        state.eqShow=false;$("eqShowChk").checked=false;
      }else{
        state.selected.delete(key);
        renderEqCurveSelect();recomputeEq();renderModels();
      }
      updateLegend();draw();
    }});
  var adjIds=["adjBass","adjBassQ","adjBassF",
    "adjTreble","adjTilt","adjEar"];
  adjIds.forEach(function(id){
    on(id,"change",function(){
      state.adj={
        bass:clamp(num($("adjBass"),0),-12,12),
        bassQ:clamp(num($("adjBassQ"),0.71),0.3,2),
        bassF:clamp(num($("adjBassF"),105),30,300),
        treble:clamp(num($("adjTreble"),0),-12,12),
        tilt:clamp(num($("adjTilt"),0),-3,3),
        ear:clamp(num($("adjEar"),0),-12,12)};
      draw();});});
  on("adjReset","click",function(){
    state.adj={bass:0,bassQ:0.71,bassF:105,treble:0,tilt:0,ear:0};
    syncAdj();draw();});
  var aeIds=["aeFmin","aeFmax","aeGmin",
    "aeGmax","aeQmin","aeQmax"];
  aeIds.forEach(function(id){
    on(id,"change",function(){
      state.aeq=Object.assign(state.aeq,{
        fmin:clamp(num($("aeFmin"),20),10,10000),
        fmax:clamp(num($("aeFmax"),8000),100,20000),
        gmin:clamp(num($("aeGmin"),-10),-30,0),
        gmax:clamp(num($("aeGmax"),6),0,30),
        qmin:clamp(num($("aeQmin"),0.5),0.05,10),
        qmax:clamp(num($("aeQmax"),1.5),0.05,10)});
      sanState();recomputeEq();draw();});});
  on("btnEq","click",function(){clearPreImport();runAutoEq();});
  on("eqCurve","change",function(e){
    state.eq.name=e.target.value;
    recomputeEq();updateLegend();draw();});
  $("eqRows").addEventListener("input",function(e){
    var row=e.target.closest(".frow");
    if(!row||row.classList.contains("head")){return;}
    var fl=state.eq.filters[+row.dataset.i];
    if(!fl){return;}
    var c=e.target.classList;
    if(c.contains("fon")){fl.on=e.target.checked;}
    else if(c.contains("ft")){fl.t=e.target.value;}
    else if(c.contains("ff")){fl.f=clamp(num(e.target,fl.f),0,20000);}
    else if(c.contains("fg")){fl.g=clamp(num(e.target,fl.g),-30,30);}
    else if(c.contains("fq")){fl.q=clamp(num(e.target,fl.q),0.05,20);}
    else{return;}
    clearPreImport();recomputeEq();draw();});
  $("eqRows").addEventListener("click",function(e){
    if(e.target.classList.contains("fx")){
      var row=e.target.closest(".frow");
      state.eq.filters.splice(+row.dataset.i,1);
      clearPreImport();renderEqRows();recomputeEq();
      updateLegend();draw();}});
  on("btnAddF","click",function(){
    state.eq.filters.push({on:true,t:"PK",f:1000,g:0,q:0.7});
    clearPreImport();renderEqRows();recomputeEq();
    updateLegend();draw();});
  on("btnDelF","click",function(){
    state.eq.filters.pop();
    clearPreImport();renderEqRows();recomputeEq();
    updateLegend();draw();});
  on("btnSort","click",function(){
    state.eq.filters.sort(function(a,b){return a.f-b.f;});
    renderEqRows();recomputeEq();draw();});
  on("btnDisable","click",function(){
    var allOn=state.eq.filters.every(function(f){return f.on;});
    state.eq.filters.forEach(function(f){f.on=!allOn;});
    clearPreImport();renderEqRows();recomputeEq();
    updateLegend();draw();});
  function exportApo(){
    if(!state.eq.filters.length){toast("No filters");return;}
    var head=["# Prih EQ Playground "+BUILD,"Device: all"];
    download("prih-eq-apo.txt",head.concat(eqLines()).join("\n"));
  }
  on("btnSaveEq","click",exportApo);
  on("btnCopyEq","click",function(){
    if(!state.eq.filters.length){return;}
    navigator.clipboard.writeText(eqLines().join("\n"))
      .then(function(){toast("PEQ copied");});});
  on("btnExportEq","click",function(){
    if(!state.eq.filters.length){toast("No filters");return;}
    download("prih-parametric-eq.txt",eqLines().join("\n"));
    toast("Parametric EQ exported");});
  on("btnImportEq","click",function(){$("fileEq").click();});
  on("btnUpFR","click",function(){$("fileFR").click();});
  on("btnUpTgt","click",function(){$("fileTgt").click();});
  on("fileFR","change",function(e){
    if(e.target.files[0]){importFRFile(e.target.files[0]);}
    e.target.value="";});
  on("fileTgt","change",function(e){
    if(e.target.files[0]){importTargetFile(e.target.files[0]);}
    e.target.value="";});
  on("fileEq","change",function(e){
    if(e.target.files[0]){importEqFile(e.target.files[0]);}
    e.target.value="";});
  on("mCancel","click",function(){$("modal").hidden=true;});
  on("mOk","click",addMeasurement);
  on("mFile","change",doPreview);
  on("mPaste","input",queuePreview);
  on("mUrl","input",queuePreview);
  on("mUrlL","input",queuePreview);
  on("mUrlR","input",queuePreview);
  on("mModel","input",queuePreview);
  on("modal","click",function(e){
    if(e.target.id==="modal"){$("modal").hidden=true;}});
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){$("modal").hidden=true;}});
  on("btnAvg","click",averageAll);
  on("btnShot","click",screenshot);
  if(window.matchMedia&&
     window.matchMedia("(max-width:900px)").matches){
    wrapDetails($("toolbar"),"Graph settings");
    injectMobileCss();
    setupSheet();
  }
  sanState();
  renderBrands();
  renderModels();
  renderEqCurveSelect();
  renderEqRows();
  syncInputs();
  updateLegend();
  draw();
  var boot=$("boot");
  if(boot){boot.remove();}
  var eb=$("errbar");
  if(eb&&stubbed.length===0){eb.style.display="none";}
  if(stubbed.length){
    toast("WARNING: ui.js damaged, stubbed: "+stubbed.join(","));
  }
  loadTargets().then(function(){
    buildTargetChips();syncAdj();updateLegend();draw();
    restore();
    return loadRemoteDb();
  }).then(function(){
    renderBrands();renderModels();
  });
  if(window.ResizeObserver){
    new ResizeObserver(function(){draw();})
      .observe($("graphWrap"));
  }
  }catch(e){
    var b=$("errbar");
    if(b){
      b.style.display="block";
      b.textContent="INIT ERROR v71: "+e.message;
    }
    var boot2=$("boot");
    if(boot2){boot2.textContent="Init error: "+e.message;}
  }
}
init();
/*EOF-init*/
