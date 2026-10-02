"use strict";
/* init: all event wiring + boot */
function init(){
  try{
  if(window.__prihBootTimer){
    clearTimeout(window.__prihBootTimer);
  }
  if(window.__missing&&window.__missing.length){
    var mb=$("errbar");
    if(mb){
      mb.style.display="block";
      mb.textContent="FILES NOT LOADED: "+
        window.__missing.join(", ")+
        " - upload them next to index.html";
    }
    return;
  }
  if(!window.AutoEqFit){
    var eb=$("errbar");
    if(eb){
      eb.style.display="block";
      eb.textContent="core.js failed; AutoEQ disabled.";
    }
  }
  console.info("Prih build "+BUILD);
  loadUploaded();
  var tabs=document.querySelectorAll(".tabs button"),ti;
  for(ti=0;ti<tabs.length;ti++){
    tabs[ti].onclick=function(){
      switchTab(this.dataset.tab);
    };
  }
  on("search","input",renderModels);
  on("ySpan","change",function(e){
    state.ySpan=clamp(num(e.target,30),10,120);
    draw();
  });
  on("normOn","click",function(){
    state.normOn=!state.normOn;
    $("normOn").classList.toggle("on",state.normOn);
    draw();
  });
  on("normDb","change",function(e){
    state.normDb=clamp(num(e.target,60),-20,140);
    draw();
  });
  on("normHz","change",function(e){
    state.normHz=clamp(num(e.target,500),20,20000);
    draw();
  });
  on("smoothN","change",function(e){
    state.smoothN=clamp(num(e.target,0),0,48);
    updateLegend();
    draw();
  });
  function setZoom(z){
    if(state.zoom===z){state.zoom=null;}
    else{state.zoom=z;}
    syncZoom();
    draw();
  }
  on("zBass","click",function(){setZoom("bass");});
  on("zMids","click",function(){setZoom("mids");});
  on("zTreble","click",function(){setZoom("treble");});
  on("btnInspect","click",function(){
    state.inspect=!state.inspect;
    $("btnInspect").classList.toggle("on",state.inspect);
    $("graph").classList.toggle("inspect",state.inspect);
    draw();
  });
  var cv=$("graph");
  cv.addEventListener("mousemove",function(e){
    if(!state.inspect){return;}
    var r=cv.getBoundingClientRect();
    state.mouse={x:e.clientX-r.left,y:e.clientY-r.top};
    draw();
  });
  cv.addEventListener("mouseleave",function(){
    state.mouse=null;
    if(state.inspect){draw();}
  });
  cv.addEventListener("touchmove",function(e){
    if(!state.inspect){return;}
    if(!e.touches||!e.touches[0]){return;}
    var r=cv.getBoundingClientRect();
    state.mouse={
      x:e.touches[0].clientX-r.left,
      y:e.touches[0].clientY-r.top};
    draw();
    e.preventDefault();
  },{passive:false});
  cv.addEventListener("touchend",function(){
    state.mouse=null;
    if(state.inspect){draw();}
  });
  var lg=$("legendRows");
  lg.addEventListener("input",function(e){
    var row=e.target.closest(".crow");
    if(!row){return;}
    var key=row.dataset.key,cfg=curveCfg(key);
    if(e.target.classList.contains("coff")){
      cfg.off=num(e.target,0);
      draw();
    }
  });
  lg.addEventListener("click",function(e){
    var row=e.target.closest(".crow");
    if(!row){return;}
    var key=row.dataset.key,cfg=curveCfg(key);
    var c=e.target.classList;
    if(c.contains("cdev")){
      state.devMode=!state.devMode;
      updateLegend();
      draw();
    }else if(c.contains("ceye")){
      if(state.hidden.has(key)){state.hidden.delete(key);}
      else{state.hidden.add(key);}
      updateLegend();
      draw();
    }else if(c.contains("cpin")){
      cfg.pin=!cfg.pin;
      updateLegend();
      draw();
    }else if(c.contains("cdl")){
      downloadCurveByKey(key);
    }else if(c.contains("cx")){
      if(key==="__target"){
        state.target=null;
        buildTargetChips();
        syncAdj();
      }else if(key==="__eq"){
        state.eqShow=false;
        $("eqShowChk").checked=false;
      }else{
        state.selected.delete(key);
        renderEqCurveSelect();
        recomputeEq();
        renderModels();
      }
      updateLegend();
      draw();
    }
  });
  var adjIds=["adjBass","adjBassQ","adjBassF",
    "adjTreble","adjTilt","adjEar"];
  adjIds.forEach(function(id){
    on(id,"change",function(){
      state.adj={
        bass:clamp(num($("adjBass"),0),-12,12),
        bassQ:clamp(num($("adjBassQ"),0.707),0.3,2),
        bassF:clamp(num($("adjBassF"),105),30,300),
        treble:clamp(num($("adjTreble"),0),-12,12),
        tilt:clamp(num($("adjTilt"),0),-3,3),
        ear:clamp(num($("adjEar"),0),-12,12)};
      draw();
    });
  });
  on("adjReset","click",function(){
    state.adj={bass:0,bassQ:0.707,bassF:105,
      treble:0,tilt:0,ear:0};
    syncAdj();
    draw();
  });
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
      sanState();
      recomputeEq();
      draw();
    });
  });
  on("btnEq","click",runAutoEq);
  on("eqCurve","change",function(e){
    state.eq.name=e.target.value;
    recomputeEq();
    updateLegend();
    draw();
  });
  $("eqRows").addEventListener("input",function(e){
    var row=e.target.closest(".frow");
    if(!row||row.classList.contains("head")){return;}
    var fl=state.eq.filters[+row.dataset.i];
    if(!fl){return;}
    var c=e.target.classList;
    if(c.contains("fon")){
      fl.on=e.target.checked;
    }else if(c.contains("ft")){
      fl.t=e.target.value;
    }else if(c.contains("ff")){
      fl.f=clamp(num(e.target,fl.f),0,20000);
    }else if(c.contains("fg")){
      fl.g=clamp(num(e.target,fl.g),-30,30);
    }else if(c.contains("fq")){
      fl.q=clamp(num(e.target,fl.q),0.05,20);
    }else{
      return;
    }
    recomputeEq();
    draw();
  });
  $("eqRows").addEventListener("click",function(e){
    if(e.target.classList.contains("fx")){
      var row=e.target.closest(".frow");
      state.eq.filters.splice(+row.dataset.i,1);
      renderEqRows();
      recomputeEq();
      updateLegend();
      draw();
    }
  });
  on("btnAddF","click",function(){
    state.eq.filters.push({on:true,t:"PK",f:1000,g:0,q:0.7});
    renderEqRows();
    recomputeEq();
    updateLegend();
    draw();
  });
  on("btnDelF","click",function(){
    state.eq.filters.pop();
    renderEqRows();
    recomputeEq();
    updateLegend();
    draw();
  });
  on("btnSort","click",function(){
    state.eq.filters.sort(function(a,b){return a.f-b.f;});
    renderEqRows();
    recomputeEq();
    draw();
  });
  on("btnDisable","click",function(){
    var allOn=state.eq.filters.every(function(f){
      return f.on;
    });
    state.eq.filters.forEach(function(f){f.on=!allOn;});
    renderEqRows();
    recomputeEq();
    updateLegend();
    draw();
  });
  function exportApo(){
    if(!state.eq.filters.length){
      toast("No filters");
      return;
    }
    var head=["# Prih EQ Playground "+BUILD,"Device: all"];
    download("prih-eq-apo.txt",
      head.concat(eqLines()).join("\n"));
  }
  on("btnSaveEq","click",exportApo);
  on("btnCopyEq","click",function(){
    if(!state.eq.filters.length){return;}
    navigator.clipboard.writeText(
      eqLines().join("\n")).then(function(){
      toast("PEQ copied");
    });
  });
  on("btnExportEq","click",function(){
    if(!state.eq.filters.length){
      toast("No filters");
      return;
    }
    download("prih-parametric-eq.txt",eqLines().join("\n"));
    toast("Parametric EQ exported");
  });
  on("btnImportEq","click",function(){$("fileEq").click();});
  on("btnUpFR","click",function(){$("fileFR").click();});
  on("btnUpTgt","click",function(){$("fileTgt").click();});
  on("fileFR","change",function(e){
    if(e.target.files[0]){importFRFile(e.target.files[0]);}
    e.target.value="";
  });
  on("fileTgt","change",function(e){
    if(e.target.files[0]){importTargetFile(e.target.files[0]);}
    e.target.value="";
  });
  on("fileEq","change",function(e){
    if(e.target.files[0]){importEqFile(e.target.files[0]);}
    e.target.value="";
  });
  on("mCancel","click",function(){$("modal").hidden=true;});
  on("mOk","click",addMeasurement);
  on("mFile","change",doPreview);
  on("mPaste","input",queuePreview);
  on("mUrl","input",queuePreview);
  on("mUrlL","input",queuePreview);
  on("mUrlR","input",queuePreview);
  on("modal","click",function(e){
    if(e.target.id==="modal"){$("modal").hidden=true;}
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){$("modal").hidden=true;}
  });
  on("btnAvg","click",averageAll);
  on("btnShot","click",screenshot);
  if(window.matchMedia&&
     window.matchMedia("(max-width:900px)").matches){
    wrapDetails($("toolbar"),"Graph settings");
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
  loadTargets().then(function(){
    buildTargetChips();
    syncAdj();
    updateLegend();
    draw();
    restore();
    return loadRemoteDb();
  }).then(function(){
    renderBrands();
    renderModels();
  });
  if(window.ResizeObserver){
    new ResizeObserver(function(){draw();})
      .observe($("graphWrap"));
  }
  }catch(e){
    var b=$("errbar");
    if(b){
      b.style.display="block";
      b.textContent="INIT ERROR "+BUILD+": "+e.message;
    }
    var boot2=$("boot");
    if(boot2){boot2.textContent="Init error: "+e.message;}
  }
}
init();
/*EOF-init*/