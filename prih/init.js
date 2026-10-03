"use strict";
/* init v60: audit + stubs + mobile sheet + squig modal fields + wiring */
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
function auditDeps(){
  var need=["draw","updateLegend","renderModels","renderBrands",
    "buildTargetChips","switchTab","curveYByKey","downloadCurveByKey",
    "targetRaw","series","processCurve","displayedY","filterResp",
    "loadTargets","loadRemoteDb","toggleHp","afterSelChange","curveCfg",
    "normalizeOnly","hasActiveEq","eqBase","renderEqCurveSelect",
    "renderEqRows","eqLines","runAutoEq","averageAll","screenshot",
    "restore","syncAdj","syncInputs","wrapDetails","importFRFile",
    "importTargetFile","importEqFile","addMeasurement","doPreview",
    "download","eqMaskAt","parseTable","resample","fetchAny","clamp",
    "shape","esc","css","num","r1","r2","fmtF","uniqueName","allHps",
    "loadHp","recomputeEq","parseEqText","toast"];
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
  console.info("Prih init v60");
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
  lg.addEventListener("input",function(e){
    var row=e.target.closest(".crow");
    if(!row){return;}
    var key=row.dataset.key,cfg=curveCfg(key);
    if(e.target.classList.contains("coff")){
      cfg.off=num(e.target,0);draw();}});
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
    }else if(c.contains("cpin")){
      cfg.pin=!cfg.pin;updateLegend();draw();
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
      b.textContent="INIT ERROR v60: "+e.message;
    }
    var boot2=$("boot");
    if(boot2){boot2.textContent="Init error: "+e.message;}
  }
}
init();
/*EOF-init*/
