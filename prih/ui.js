"use strict";
/* ui v67: eq table, robust import with preamp, uploads, average,
   restore, sync, wrapDetails, toast */
window.__uiVersion="v67";
var RE_HTML=new RegExp("^\\s*(<|<!DOCTYPE)","i");
var RE_HREF=new RegExp('href="([^"]+\\.(csv|txt))"',"gi");
var RE_L=new RegExp("[._\\- ]L([._\\- \\d]|\\.csv|\\.txt)","i");
var RE_R=new RegExp("[._\\- ]R([._\\- \\d]|\\.csv|\\.txt)","i");
function download(name,text){
  var b=new Blob([text],{type:"text/plain"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(b);
  a.download=name;
  a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},5000);
}
function eqBase(){
  if(!state.eq.name||!state.selected.has(state.eq.name)){
    state.eq.name=[...state.selected.keys()].pop()||null;
    renderEqCurveSelect();
  }
  var s=state.selected.get(state.eq.name);
  if(s){return s.raw;}
  return null;
}
function renderEqCurveSelect(){
  var sel=$("eqCurve");
  var names=[...state.selected.keys()];
  if(state.eq.name&&names.indexOf(state.eq.name)<0){
    state.eq.name=names[names.length-1]||null;
  }
  if(names.length){
    sel.innerHTML=names.map(function(n){
      return"<option "+T(n===state.eq.name,"selected","")+
        ">"+esc(n)+"</option>";
    }).join("");
  }else{
    sel.innerHTML="<option value=''>- no curves -</option>";
    state.eq.name=null;
  }
}
function eqMaskAt(f){
  if(window.AutoEqFit&&window.AutoEqFit.mask){
    return window.AutoEqFit.mask(f,state.aeq.fmax);
  }
  return 1;
}
/* preamp: peak of FILTER SUM only; imported preamp wins until edited */
function recomputeEq(){
  var base=eqBase();
  if(!base){
    state.eq.curve=null;
    state.eq.preamp=0;
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
  var pre;
  if(state.eq.preImport!=null){pre=state.eq.preImport;}
  else{pre=-Math.max(0,pk);}
  if(!isFinite(pre)){pre=0;}
  if(pre<-30){pre=-30;}
  if(pre>0){pre=0;}
  state.eq.preamp=pre;
  $("eqPreamp").textContent=
    "Pre-amp: "+state.eq.preamp.toFixed(1)+" dB";
}
function clearPreImport(){
  state.eq.preImport=null;
}
function renderEqRows(){
  var html="<div class='frow head'><span></span>"+
    "<span>Type</span><span>Frequency</span>"+
    "<span>Gain</span><span>Q</span><span></span></div>";
  state.eq.filters.forEach(function(fl,i){
    var opts=["PK","LS","HS"].map(function(t){
      return"<option "+T(t===fl.t,"selected","")+">"+t+"</option>";
    }).join("");
    html+="<div class='frow' data-i='"+i+"'>"+
      "<input type='checkbox' class='fon' "+
      T(fl.on,"checked","")+">"+
      "<select class='ft'>"+opts+"</select>"+
      "<span class='inwrap'><input class='ff'"+
      " type='number' step='1' value='"+fmtF(fl.f)+"'>"+
      "<i>Hz</i></span>"+
      "<span class='inwrap'><input class='fg'"+
      " type='number' step='0.1' value='"+r1(fl.g)+"'>"+
      "<i>dB</i></span>"+
      "<input class='fq' type='number' step='0.01'"+
      " value='"+r2(fl.q)+"'>"+
      "<button class='fx' title='Delete'>X</button></div>";
  });
  $("eqRows").innerHTML=html;
  $("eqPreamp").textContent=
    "Pre-amp: "+state.eq.preamp.toFixed(1)+" dB";
}
function eqLines(){
  var L=["Preamp: "+state.eq.preamp.toFixed(2)+" dB"];
  state.eq.filters.filter(function(f){
    return f.on&&Math.abs(f.g)>=0.05;
  }).sort(function(a,b){return a.f-b.f;})
  .forEach(function(fl,i){
    L.push("Filter "+(i+1)+": ON "+fl.t+
      " Fc "+Math.round(fl.f)+" Hz"+
      " Gain "+r1(fl.g).toFixed(1)+" dB"+
      " Q "+r2(fl.q).toFixed(2));
  });
  return L;
}
function runAutoEq(){
  if(!window.AutoEqFit||!window.AutoEqFit.fitAsync){
    toast("AutoEqFit missing");
    return;
  }
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
  var count=clamp(state.eq.filters.length||8,1,20);
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
      count:count,budget:12000
    },function(stage,secs){
      if(msg){
        msg.textContent="AutoEQ is running... stage "+
          stage+" ("+secs+" s)";
      }
    }).then(function(fits){
      var filters=fits.map(function(x){
        return{on:true,t:"PK",
          f:fmtF(x.f),g:r1(x.g),q:r2(x.q)};
      });
      while(filters.length<count){
        filters.push({on:true,t:"PK",f:0,g:0,q:0});
      }
      state.eq.filters=filters;
      clearPreImport();
      renderEqRows();
      recomputeEq();
      state.eqShow=true;
      $("eqShowChk").checked=true;
      updateLegend();
      draw();
      finish();
      toast("AutoEQ "+BUILD+": filters "+fits.length+
        ", pre-amp "+state.eq.preamp.toFixed(1)+" dB");
    }).catch(function(err){
      finish();
      toast("AutoEQ error: "+err.message);
    });
  },60);
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
function saveUploaded(){
  try{
    var arr=state.uploaded.map(function(u){
      return{name:u.name,source:u.source,pts:u.pts};
    });
    localStorage.setItem("prih-uploaded",
      JSON.stringify(arr));
  }catch(e){}
}
function loadUploaded(){
  try{
    var a=JSON.parse(
      localStorage.getItem("prih-uploaded")||"[]");
    state.uploaded=a.map(function(u){
      return{name:u.name,source:u.source||"uploaded",
        pts:u.pts,raw:resample(u.pts)};
    });
    var seen={},i;
    for(i=0;i<state.uploaded.length;i++){
      var u=state.uploaded[i];
      if(seen[u.name]){
        var j=2;
        while(seen[u.name+" "+j]){j++;}
        u.name=u.name+" "+j;
      }
      seen[u.name]=1;
    }
  }catch(e){state.uploaded=[];}
}
function baseName(fn){
  var dot=fn.lastIndexOf(".");
  if(dot<=0){return fn||"Uploaded";}
  return fn.substring(0,dot);
}
function decim(pts){
  return pts.filter(function(_,i){
    var st=Math.max(1,Math.floor(pts.length/400));
    return i%st===0;
  });
}
function pushUploaded(name,source,pts,raw){
  var uname=uniqueName(name);
  state.uploaded.push({
    name:uname,source:source,pts:decim(pts),raw:raw});
  saveUploaded();
  var i=state.selected.size+state.palShift;
  state.selected.set(uname,{
    color:PALETTE[i%PALETTE.length],raw:raw});
  return uname;
}
function importFRFile(f){
  f.text().then(function(t){
    var pts=parseTable(t);
    if(pts.length<20){
      toast("File does not look like FR");
      return;
    }
    var name=pushUploaded(baseName(f.name),
      "uploaded",pts,resample(pts));
    afterSelChange();
    toast("Measurement added: "+name);
  }).catch(function(e){
    toast("File error: "+e.message);
  });
}
function importTargetFile(f){
  f.text().then(function(t){
    var pts=parseTable(t);
    if(pts.length<10){
      toast("Too few points for target");
      return;
    }
    var name=uniqueName(baseName(f.name));
    targets.set(name,{
      def:{name:name,adjustable:true,imported:true},
      raw:resample(pts)});
    if(state.impTargets.indexOf(name)<0){
      state.impTargets.push(name);
    }
    state.target=name;
    buildTargetChips();
    syncAdj();
    updateLegend();
    draw();
    toast("Target imported: "+name);
  }).catch(function(e){
    toast("File error: "+e.message);
  });
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
function addMeasurement(){
  var err=$("mErr");
  err.textContent="";
  var name=$("mName").value.trim()||"Uploaded";
  var source=$("mSource").value.trim()||"uploaded";
  grabPts().then(function(res){
    if(!res||!res.avg){
      err.textContent="Provide URL, file or text";
      return;
    }
    if(res.avg.length<20){
      err.textContent="Not a measurement: few points";
      return;
    }
    var uname=pushUploaded(name,source,res.avg,
      resample(res.avg));
    afterSelChange();
    closeModal();
    toast("Measurement added: "+uname);
  }).catch(function(e){
    err.textContent="Error: "+e.message;
  });
}
function closeModal(){
  $("modal").hidden=true;
  $("mErr").textContent="";
  $("mPrev").textContent="";
  $("mName").value="";
  $("mUrl").value="";
  $("mUrlL").value="";
  $("mUrlR").value="";
  $("mFile").value="";
  $("mPaste").value="";
}
function absUrl(base,rel){
  try{return new URL(rel,base).href;}
  catch(e){return rel;}
}
function findCsvLinks(html,base){
  var links=[],i,idx,searchFrom=0;
  while(links.length<8){
    idx=html.indexOf(".csv",searchFrom);
    if(idx<0){break;}
    var start=idx;
    while(start>0){
      var ch=html.charAt(start-1);
      if(ch==="\""||ch==="'"||ch==="<"||ch===" "){break;}
      start--;
    }
    var url=html.substring(start,idx+4);
    if(url.indexOf("http")!==0){
      try{url=new URL(url,base).href;}catch(e){}
    }
    var dup=false;
    for(i=0;i<links.length;i++){
      if(links[i]===url){dup=true;break;}
    }
    if(!dup){links.push(url);}
    searchFrom=idx+4;
  }
  return links;
}
function fetchPtsFromUrl(u){
  return fetchAny(u).then(function(t){
    var isHtml=RE_HTML.test(t);
    if(!isHtml){return{avg:parseTable(t)};}
    var links=findCsvLinks(t,u);
    if(!links.length){
      throw new Error("no CSV links on page");
    }
    var L=links[0],R=null,i;
    for(i=0;i<links.length;i++){
      if(links[i].indexOf("L.csv")>=0||links[i].indexOf("_L")>=0){
        L=links[i];break;
      }
    }
    for(i=0;i<links.length;i++){
      var isR=links[i].indexOf("R.csv")>=0||links[i].indexOf("_R")>=0;
      if(isR&&links[i]!==L){R=links[i];break;}
    }
    if(R){
      return Promise.all([fetchAny(L),fetchAny(R)])
      .then(function(p){
        var la=resample(parseTable(p[0]));
        var lb=resample(parseTable(p[1]));
        var pts=[],j;
        for(j=0;j<GRID.length;j++){
          pts.push([GRID[j],(la[j]+lb[j])/2]);
        }
        return{avg:pts};
      });
    }
    return fetchAny(links[0]).then(function(t2){
      return{avg:parseTable(t2)};
    });
  });
}
function grabPts(){
  if($("mFile").files[0]){
    return $("mFile").files[0].text().then(function(t){
      return{avg:parseTable(t)};
    });
  }
  if($("mPaste").value.trim()){
    return Promise.resolve({avg:parseTable($("mPaste").value)});
  }
  if($("mUrlL").value.trim()&&$("mUrlR").value.trim()){
    return Promise.all([
      fetchPtsFromUrl($("mUrlL").value.trim()),
      fetchPtsFromUrl($("mUrlR").value.trim())
    ]).then(function(p){
      var la=resample(p[0].avg),lb=resample(p[1].avg);
      var pts=[],j;
      for(j=0;j<GRID.length;j++){
        pts.push([GRID[j],(la[j]+lb[j])/2]);
      }
      return{avg:pts};
    });
  }
  if($("mUrl").value.trim()){
    return fetchPtsFromUrl($("mUrl").value.trim());
  }
  return Promise.resolve(null);
}
var prevTimer=null;
function queuePreview(){
  clearTimeout(prevTimer);
  prevTimer=setTimeout(doPreview,600);
}
function doPreview(){
  var el=$("mPrev");
  el.textContent="";
  return grabPts().then(function(res){
    if(!res||!res.avg){return;}
    var pts=res.avg;
    if(pts.length>=20){
      el.textContent="OK "+pts.length+" points, "+
        Math.round(pts[0][0])+"-"+
        Math.round(pts[pts.length-1][0])+" Hz";
    }else{
      el.textContent="Few points: "+pts.length;
    }
  }).catch(function(e){
    el.textContent="Error: "+e.message;
  });
}
function averageAll(){
  var list=allHps();
  if(!list.length){
    toast("No measurements");
    return;
  }
  var btn=$("btnAvg");
  btn.disabled=true;
  var sum=new Float64Array(GRID.length),n=0;
  function step(i){
    if(i>=list.length){
      if(n){
        for(var j=0;j<GRID.length;j++){sum[j]/=n;}
        var pairs=[],k;
        for(k=0;k<GRID.length;k+=4){
          pairs.push([GRID[k],sum[k]]);
        }
        var name=pushUploaded("Average ("+n+")",
          "avg",pairs,Float64Array.from(sum));
        afterSelChange();
        toast("Average of "+n+" -> "+name);
      }
      btn.textContent="Average All";
      btn.disabled=false;
      return;
    }
    btn.textContent="Average "+(i+1)+"/"+list.length;
    loadHp(list[i]).then(function(raw){
      for(var j=0;j<GRID.length;j++){sum[j]+=raw[j];}
      n++;
    }).catch(function(){}).then(function(){
      setTimeout(function(){step(i+1);},0);
    });
  }
  step(0);
}
function screenshot(){
  $("graph").toBlob(function(b){
    var a=document.createElement("a");
    a.href=URL.createObjectURL(b);
    a.download="prih-playground.png";
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},5000);
  });
}
function sanState(){
  state.ySpan=clamp(state.ySpan,10,120);
  state.normDb=clamp(state.normDb,-20,140);
  state.normHz=clamp(state.normHz,20,20000);
  state.smoothN=clamp(state.smoothN,0,48);
  state.adj.bass=clamp(state.adj.bass,-12,12);
  state.adj.bassQ=clamp(state.adj.bassQ,0.3,2);
  state.adj.bassF=clamp(state.adj.bassF,30,300);
  state.adj.treble=clamp(state.adj.treble,-12,12);
  state.adj.tilt=clamp(state.adj.tilt,-3,3);
  state.adj.ear=clamp(state.adj.ear,-12,12);
  state.aeq.fmin=clamp(state.aeq.fmin,10,10000);
  state.aeq.fmax=clamp(state.aeq.fmax,100,20000);
  state.aeq.gmin=clamp(state.aeq.gmin,-30,0);
  state.aeq.gmax=clamp(state.aeq.gmax,0,30);
  state.aeq.qmin=clamp(state.aeq.qmin,0.05,10);
  state.aeq.qmax=clamp(state.aeq.qmax,0.05,10);
  if(state.aeq.fmax<=state.aeq.fmin){state.aeq.fmax=8000;}
  if(state.aeq.qmax<=state.aeq.qmin){state.aeq.qmax=1.5;}
}
function restore(){
  if(!location.hash||location.hash.length<2){return;}
  var s;
  try{
    s=JSON.parse(decodeURIComponent(location.hash.slice(1)));
  }catch(e){return;}
  if(s.tgt&&targets.has(s.tgt)){state.target=s.tgt;}
  if(s.adj){state.adj=Object.assign(state.adj,s.adj);}
  if(typeof s.nrm==="boolean"){state.normOn=s.nrm;}
  if(isFinite(s.ndb)){state.normDb=s.ndb;}
  if(isFinite(s.nhz)){state.normHz=s.nhz;}
  if(isFinite(s.sm)){state.smoothN=s.sm;}
  if(isFinite(s.ys)){state.ySpan=s.ys;}
  if(s.aeq){state.aeq=Object.assign(state.aeq,s.aeq);}
  if(s.zoom&&ZOOMS[s.zoom]){state.zoom=s.zoom;}
  if(typeof s.dev==="boolean"){state.devMode=s.dev;}
  sanState();
  syncInputs();
  buildTargetChips();
  syncAdj();
  (s.sel||[]).forEach(function(nm){
    var def=null,all=allHps(),i;
    for(i=0;i<all.length;i++){
      if(all[i].name===nm){def=all[i];}
    }
    if(def){toggleHp(def);}
  });
  draw();
}
function syncAdj(){
  var el=$("adjRow");
  var t=targets.get(state.target);
  var adj=t&&t.def.adjustable;
  if(el){el.classList.toggle("disabled",!adj);}
  $("adjNote").textContent=T(adj,"","(fixed target)");
  $("adjBass").value=state.adj.bass;
  $("adjBassQ").value=state.adj.bassQ;
  $("adjBassF").value=state.adj.bassF;
  $("adjTreble").value=state.adj.treble;
  $("adjTilt").value=state.adj.tilt;
  $("adjEar").value=state.adj.ear;
}
function syncZoom(){
  $("zBass").classList.toggle("on",state.zoom==="bass");
  $("zMids").classList.toggle("on",state.zoom==="mids");
  $("zTreble").classList.toggle("on",state.zoom==="treble");
}
function syncInputs(){
  sanState();
  $("ySpan").value=state.ySpan;
  $("normDb").value=state.normDb;
  $("normHz").value=state.normHz;
  $("normOn").classList.toggle("on",state.normOn);
  $("smoothN").value=state.smoothN;
  $("aeFmin").value=state.aeq.fmin;
  $("aeFmax").value=state.aeq.fmax;
  $("aeGmin").value=state.aeq.gmin;
  $("aeGmax").value=state.aeq.gmax;
  $("aeQmin").value=state.aeq.qmin;
  $("aeQmax").value=state.aeq.qmax;
  syncAdj();
  syncZoom();
  $("btnInspect").classList.toggle("on",state.inspect);
}
/* wrap toolbar into collapsible details on mobile; host MOVED, not removed */
function wrapDetails(hostEl,summaryText){
  if(!hostEl){return;}
  var par=hostEl.parentNode;
  if(!par){return;}
  if(par.tagName==="DETAILS"){return;}
  var d=document.createElement("details");
  d.className="gdet";
  var s=document.createElement("summary");
  s.textContent=summaryText;
  d.appendChild(s);
  par.insertBefore(d,hostEl);
  d.appendChild(hostEl);
}
var toastTimer=null;
function toast(msg){
  var t=$("toast");
  if(!t){return;}
  t.textContent=msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){
    t.classList.remove("show");
  },2500);
}
on("eqPreamp","dblclick",function(){
  clearPreImport();
  recomputeEq();
  renderEqRows();
  toast("Pre-amp: auto (headroom)");
});
/*EOF-ui*/
