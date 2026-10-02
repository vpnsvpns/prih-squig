"use strict";
/* init v48: mobile sheet like squig + full legend rows on mobile */
function injectMobileCss(){
  if(document.getElementById("mobileCss")){return;}
  var L=[];
  L.push("#graphWrap{height:40vh;min-height:230px}");
  L.push("header .topbtns button{padding:10px 14px;font-size:13px}");
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
  L.push(".crow .coff{order:3;flex:0 0 76px;width:76px;");
  L.push("font-size:16px;padding:8px}");
  L.push(".crow .ph{display:none}");
  L.push(".crow .cdev{display:inline-block;order:4}");
  L.push(".crow .ceye{order:5}");
  L.push(".crow .cpin{display:inline-block;order:6}");
  L.push(".crow .cdl{order:7}");
  L.push(".crow .cx{order:8}");
  L.push(".crow button{min-width:44px;min-height:44px;");
  L.push("flex:0 0 44px;font-size:16px;");
  L.push("border:1px solid var(--line);border-radius:8px;");
  L.push("background:var(--panel2)}");
  L.push(".crow button:first-of-type{margin-left:auto}");
  L.push(".frow{gap:6px}");
  L.push(".frow input[type=checkbox]{width:22px;height:22px}");
  L.push("#eqPane .row button{padding:12px 16px;font-size:14px}");
  L.push(".grid2 input{padding:10px;font-size:16px}");
  L.push("#left{max-height:60vh;overflow:hidden;");
  L.push("transition:max-height .25s ease;padding-top:0}");
  L.push("#left::before{display:none}");
  L.push("#sheetHandle{display:flex;justify-content:center;");
  L.push("align-items:center;padding:10px 0 6px;touch-action:none}");
  L.push("#sheetHandle i{width:44px;height:4px;border-radius:2px;");
  L.push("background:var(--line)}");
  L.push("#left.collapsed{max-height:88px}");
  L.push("#left.collapsed .pane,#left.collapsed #search{");
  L.push("display:none}");
  L.push(".pane{overflow-y:auto;min-height:0}");
  L.push("#browseBtn{display:flex;justify-content:space-between;");
  L.push("align-items:center;width:calc(100% - 20px);");
  L.push("margin:10px auto;padding:14px 16px;font-size:14px;");
  L.push("border:1px solid var(--line);border-radius:10px;");
  L.push("background:var(--panel)}");
  L.push("#browseBtn b{font-size:18px;font-weight:600}");
  var st=document.createElement("style");
  st.id="mobileCss";
  st.textContent=L.join("");
  document.head.appendChild(st);
}
function setupSheet(){
  var left=$("left");
  var main=document.querySelector("main");
  if(!left||!main){return;}
  if(document.getElementById("sheetHandle")){return;}
  var h=document.createElement("div");
  h.id="sheetHandle";
  h.innerHTML="<i></i>";
  left.insertBefore(h,left.firstChild);
  var bb=document.createElement("button");
  bb.id="browseBtn";
  bb.innerHTML="Browse all graphs<b>+</b>";
  main.insertBefore(bb,left);
  function sync(){
    var col=left.classList.contains("collapsed");
    bb.style.display=col?"flex":"none";
  }
  function setCol(v){
    left.classList.toggle("collapsed",v);
    sync();
  }
  setCol(true);
  var y0=null;
  var sup=0;
  h.addEventListener("touchstart",function(e){
    y0=null;
    if(e.touches&&e.touches[0]){
      y0=e.touches[0].clientY;
    }
  },{passive:true});
  h.addEventListener("touchend",function(e){
    if(y0===null){return;}
    var dy=e.changedTouches[0].clientY-y0;
    y0=null;
    sup=Date.now();
    if(dy>30){setCol(true);return;}
    if(dy<-30){setCol(false);return;}
    setCol(!left.classList.contains("collapsed"));
  },{passive:true});
  h.addEventListener("click",function(){
    if(Date.now()-sup<500){return;}
    setCol(!left.classList.contains("collapsed"));
  });
  bb.addEventListener("click",function(){
    setCol(false);
    switchTab("models");
    left.scrollIntoView({block:"nearest"});
  });
}
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
