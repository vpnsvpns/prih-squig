"use strict";
/* draw: canvas rendering + lists + legend rows (v45 mobile labels) */
var XTICKS=[20,30,40,50,60,80,100,150,200,250,300,400,
500,600,800,1000,1500,2000,3000,4000,5000,6000,8000,
10000,15000,20000];
var XMAJ={20:1,60:1,250:1,500:1,600:1,2000:1,6000:1,20000:1};
var XNARROW={20:1,50:1,100:1,250:1,500:1,1000:1,
2500:1,5000:1,10000:1,20000:1};
var RE_SAN=new RegExp("[^\\w\\d-]+","g");
function xlab(f){
  if(f===20){return"20Hz";}
  if(f===20000){return"20kHz";}
  if(f>=1000){return(f/1000)+"k";}
  return""+f;
}
function draw(){
  try{
  var cv=$("graph");
  var dpr=window.devicePixelRatio||1;
  var W=cv.clientWidth,H=cv.clientHeight;
  if(!W||!H){return;}
  cv.width=W*dpr;
  cv.height=H*dpr;
  var ctx=cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=css("--plot");
  ctx.fillRect(0,0,W,H);
  var narrow=W<700;
  var m={l:T(narrow,34,46),r:T(narrow,8,16),
    t:T(narrow,18,26),b:T(narrow,20,26)};
  var xr=state.zoom?ZOOMS[state.zoom]:[FMIN,FMAX];
  var XF0=xr[0],XF1=xr[1];
  var S=series();
  var span=clamp(state.ySpan,10,120),lo,hi;
  if(state.devMode){
    lo=-span/2;
    hi=span/2;
  }else if(state.normOn){
    lo=state.normDb-span/2;
    hi=state.normDb+span/2;
  }else{
    var a=Infinity,b=-Infinity,i2,v2;
    for(i2=0;i2<S.length;i2++){
      for(v2=0;v2<S[i2].y.length;v2++){
        var vv=S[i2].y[v2];
        if(vv<a){a=vv;}
        if(vv>b){b=vv;}
      }
    }
    if(!S.length){a=45;b=75;}
    var mid=(a+b)/2;
    lo=mid-span/2;
    hi=mid+span/2;
  }
  var step=span<=24?2:span<=48?5:10;
  function X(f){
    var t=Math.log2(f/XF0)/Math.log2(XF1/XF0);
    return m.l+t*(W-m.l-m.r);
  }
  function Y(v){return m.t+(hi-v)/(hi-lo)*(H-m.t-m.b);}
  var ticks=XTICKS.filter(function(f){
    return f>=XF0&&f<=XF1;
  });
  ticks.forEach(function(f){
    var x=X(f);
    var maj=false;
    if(XMAJ[f]){maj=true;}
    ctx.strokeStyle=css("--grid");
    ctx.lineWidth=1;
    ctx.globalAlpha=T(maj,0.95,0.35);
    ctx.beginPath();
    ctx.moveTo(x,m.t);
    ctx.lineTo(x,H-m.b);
    ctx.stroke();
    ctx.globalAlpha=1;
    var showLab=true;
    if(narrow&&!XNARROW[f]){showLab=false;}
    if(!showLab){return;}
    ctx.fillStyle=T(maj,css("--text"),css("--muted"));
    var fs1=T(narrow,"700 8px",T(maj,"700 11px","10px"));
    ctx.font=fs1+" ui-monospace,Menlo,monospace";
    ctx.textAlign="center";
    ctx.fillText(xlab(f),x,H-m.b+T(narrow,12,15));
  });
  var v0=Math.ceil(lo/step)*step,vv2;
  for(vv2=v0;vv2<=hi;vv2+=step){
    var y=Y(vv2);
    ctx.strokeStyle=css("--grid");
    ctx.lineWidth=1;
    ctx.globalAlpha=0.75;
    ctx.beginPath();
    ctx.moveTo(m.l,y);
    ctx.lineTo(W-m.r,y);
    ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle=css("--muted");
    ctx.font=T(narrow,"8px","10px")+
      " ui-monospace,Menlo,monospace";
    ctx.textAlign="right";
    ctx.fillText(Math.round(vv2),m.l-T(narrow,4,6),y+3);
  }
  if(!narrow){
    ctx.fillStyle="rgba(255,255,255,0.10)";
    ctx.fillRect(m.l-9,(m.t+H-m.b)/2-32,4,64);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l,m.t,W-m.l-m.r,H-m.t-m.b);
  ctx.clip();
  S.forEach(function(s){
    ctx.strokeStyle=s.color;
    ctx.lineWidth=T(s.pin,2.8,(s.w||2));
    ctx.setLineDash(s.dash||[]);
    ctx.beginPath();
    var started=false,i;
    for(i=0;i<GRID.length;i++){
      if(GRID[i]<XF0||GRID[i]>XF1){
        started=false;
        continue;
      }
      var x=X(GRID[i]),y=Y(s.y[i]);
      if(started){ctx.lineTo(x,y);}
      else{ctx.moveTo(x,y);started=true;}
    }
    ctx.stroke();
  });
  if(state.inspect&&state.mouse){
    var mx=state.mouse.x;
    if(mx>m.l&&mx<W-m.r){
      var f=XF0*Math.pow(XF1/XF0,(mx-m.l)/(W-m.l-m.r));
      var gi=0,bd=1e9,i3;
      for(i3=0;i3<GRID.length;i3++){
        var d3=Math.abs(Math.log2(GRID[i3]/f));
        if(d3<bd){bd=d3;gi=i3;}
      }
      ctx.strokeStyle=css("--muted");
      ctx.lineWidth=1;
      ctx.setLineDash([3,3]);
      ctx.beginPath();
      ctx.moveTo(mx,m.t);
      ctx.lineTo(mx,H-m.b);
      ctx.stroke();
      ctx.setLineDash([]);
      var lines=S.map(function(s){
        return{c:s.color,
          t:s.name+": "+s.y[gi].toFixed(1)+" dB"};
      });
      lines.unshift({c:css("--muted"),t:Math.round(f)+" Hz"});
      var bw=150,bh=lines.length*14+8,bx=mx+10;
      if(bx+bw>W-m.r){bx=mx-10-bw;}
      ctx.fillStyle="rgba(0,0,0,0.72)";
      ctx.fillRect(bx,m.t+6,bw,bh);
      ctx.font="10px ui-monospace,Menlo,monospace";
      ctx.textAlign="left";
      lines.forEach(function(L,i4){
        ctx.fillStyle=L.c;
        ctx.fillText(L.t,bx+6,m.t+20+i4*14);
      });
    }
  }
  ctx.restore();
  ctx.setLineDash([]);
  ctx.fillStyle="rgba(255,255,255,0.10)";
  ctx.font=T(narrow,"italic 900 40px","italic 900 84px")+" system-ui";
  ctx.textAlign="right";
  ctx.fillText("PRIH",W-m.r-8,H-m.b-T(narrow,10,16));
  var leg=[];
  if(targetRaw()&&!state.hidden.has("__target")){
    leg.push({c:css("--target"),t:state.target+" Target"});
  }
  state.selected.forEach(function(s,name){
    if(s.raw&&!state.hidden.has(name)){
      leg.push({c:s.color,t:name});
    }
  });
  if(hasActiveEq()&&!state.hidden.has("__eq")){
    leg.push({c:css("--eq"),t:"EQ result"});
  }
  var lstep=T(narrow,16,22);
  ctx.font=T(narrow,"700 12px","700 16px")+" system-ui";
  ctx.textAlign="left";
  var ly=H-m.b-T(narrow,10,18)-(leg.length-1)*lstep;
  leg.forEach(function(L){
    ctx.fillStyle=L.c;
    ctx.fillText(L.t,m.l+T(narrow,6,12),ly);
    ly+=lstep;
  });
  ctx.fillStyle=css("--muted");
  ctx.font=T(narrow,"8px","10px")+" ui-monospace,Menlo,monospace";
  ctx.textAlign="right";
  var tag="Measured on: IEC 60318-4 (711) - Prih "+BUILD;
  ctx.fillText(tag,W-m.r-4,m.t-T(narrow,6,9));
  if(!narrow){
    ctx.save();
    ctx.translate(12,m.t+18);
    ctx.rotate(-Math.PI/2);
    ctx.textAlign="right";
    ctx.fillText("dB",0,0);
    ctx.restore();
  }
  }catch(e){
    var bb=$("errbar");
    if(bb){
      bb.style.display="block";
      bb.textContent="DRAW ERROR: "+e.message;
    }
  }
}
function drawSpark(cv,y,color){
  var c=cv.getContext("2d");
  var W=cv.width,H=cv.height;
  c.clearRect(0,0,W,H);
  var mn=Infinity,mx=-Infinity,i;
  for(i=0;i<y.length;i+=8){
    if(y[i]<mn){mn=y[i];}
    if(y[i]>mx){mx=y[i];}
  }
  if(!isFinite(mn)||mx-mn<1e-6){return;}
  c.strokeStyle=color;
  c.lineWidth=1.2;
  c.beginPath();
  var first=true;
  for(i=0;i<y.length;i+=8){
    var x=1+i/(y.length-1)*(W-2);
    var yy=H-2-(y[i]-mn)/(mx-mn)*(H-4);
    if(first){c.moveTo(x,yy);first=false;}
    else{c.lineTo(x,yy);}
  }
  c.stroke();
}
function renderBrands(){
  var set=new Map();
  allHps().forEach(function(hp){
    var s=hp.source||"src";
    set.set(s,(set.get(s)||0)+1);
  });
  var box=$("brandList");
  box.innerHTML="";
  function mk(label,cnt,sel,fn){
    var d=document.createElement("div");
    d.className="brand"+T(sel," sel","");
    d.innerHTML="<span>"+esc(label)+"</span>"+
      "<span class='cnt'>"+cnt+"</span>";
    d.onclick=fn;
    box.appendChild(d);
  }
  mk("All",allHps().length,state.brand==null,function(){
    state.brand=null;
    switchTab("models");
  });
  set.forEach(function(c,b){
    mk(b,c,state.brand===b,function(){
      state.brand=b;
      switchTab("models");
    });
  });
}
function renderModels(){
  var q=$("search").value.trim().toLowerCase();
  var list=allHps().filter(function(hp){
    var okB=state.brand==null||
      (hp.source||"src")===state.brand;
    var okQ=!q||hp.name.toLowerCase().indexOf(q)>=0;
    return okB&&okQ;
  });
  $("modelCount").textContent=list.length;
  var box=$("modelList");
  box.innerHTML="";
  if(!list.length){
    box.innerHTML=
      "<div class='muted' style='padding:8px'>Empty. "+
      "Use data/squig-db.json or Upload FR</div>";
  }
  list.forEach(function(hp){
    var sel=state.selected.has(hp.name);
    var d=document.createElement("div");
    d.className="mrow"+T(sel," sel","");
    d.innerHTML="<span class='nm'>"+esc(hp.name)+
      "</span><span class='src'>"+esc(hp.source||"")+
      "</span><button class='add'>"+T(sel,"-","+")+
      "</button>";
    d.onclick=function(){toggleHp(hp);};
    box.appendChild(d);
  });
}
function switchTab(t){
  var bs=document.querySelectorAll(".tabs button"),i;
  for(i=0;i<bs.length;i++){
    bs[i].classList.toggle("on",bs[i].dataset.tab===t);
  }
  $("brandList").hidden=t!=="brands";
  $("modelList").hidden=t!=="models";
  $("eqPane").hidden=t!=="eq";
  $("search").hidden=t!=="models";
}
function allTargetDefs(){
  return CFG.targets.concat(state.impTargets.map(
    function(n){
      return{name:n,group:"Reference",imported:true};
    }));
}
function buildTargetChips(){
  $("refChips").innerHTML="";
  $("prefChips").innerHTML="";
  allTargetDefs().forEach(function(t){
    var ok=targets.has(t.name);
    var b=document.createElement("button");
    b.className="tchip tgt"+
      T(state.target===t.name," on","");
    b.textContent=t.name+T(t.imported," *","");
    b.disabled=!ok;
    b.onclick=function(){
      state.target=t.name;
      buildTargetChips();
      syncAdj();
      updateLegend();
      draw();
    };
    var host=t.group==="Preference"?
      $("prefChips"):$("refChips");
    host.appendChild(b);
  });
}
function curveYByKey(key){
  if(key==="__target"){
    if(state.devMode){return new Float64Array(GRID.length);}
    return processCurve(targetRaw(),curveCfg(key),1);
  }
  if(key==="__eq"){
    return displayedY(state.eq.curve,curveCfg(key),0);
  }
  var s=state.selected.get(key);
  if(s&&s.raw){return displayedY(s.raw,curveCfg(key),0);}
  return null;
}
function downloadCurveByKey(key){
  var y=curveYByKey(key);
  if(!y){return;}
  var lines=["freq,dB"],i;
  for(i=0;i<GRID.length;i+=4){
    lines.push(GRID[i].toFixed(2)+","+y[i].toFixed(3));
  }
  download(key.replace(RE_SAN,"_")+".csv",lines.join("\n"));
}
function updateLegend(){
  var lg=$("legendRows");
  lg.innerHTML="";
  function bt(cls,active,label,title){
    var c=cls;
    if(active){c=c+" on";}
    return "<button class='"+c+"' title='"+title+"'>"+
      label+"</button>";
  }
  function row(key,color,title,srcTxt,kind){
    var cfg=curveCfg(key);
    var d=document.createElement("div");
    d.className="crow";
    d.dataset.key=key;
    var p=[];
    p.push("<span class='sw' style='background:"+
      color+"'></span>");
    var nm="<span class='cname'>"+esc(title);
    if(srcTxt){
      nm=nm+" <span class='src'>"+esc(srcTxt)+"</span>";
    }
    nm=nm+"</span>";
    p.push(nm);
    p.push("<canvas class='spark' width='72' height='16'>"+
      "</canvas>");
    p.push("<input class='coff' type='number' step='0.5'"+
      " title='Offset, dB' value='"+cfg.off+"'>");
    if(kind==="target"){
      p.push(bt("cdev",state.devMode,"~",
        "Deviation from target"));
    }else{
      p.push("<span class='ph'></span>");
    }
    p.push(bt("ceye",state.hidden.has(key),"H","Hide or show"));
    p.push(bt("cpin",cfg.pin,"P","Pin on top"));
    p.push(bt("cdl",false,"D","Download CSV"));
    p.push(bt("cx",false,"X","Remove"));
    d.innerHTML=p.join("");
    lg.appendChild(d);
    var y=curveYByKey(key);
    if(y){drawSpark(d.querySelector(".spark"),y,color);}
  }
  if(state.target){
    row("__target",css("--target"),
      "Target: "+state.target,"","target");
  }
  state.selected.forEach(function(s,name){
    if(!s.raw){return;}
    var def=null,all=allHps(),i;
    for(i=0;i<all.length;i++){
      if(all[i].name===name){def=all[i];}
    }
    var src="";
    if(def){src=def.source||"";}
    row(name,s.color,name,src,"meas");
  });
  if(hasActiveEq()){
    row("__eq",css("--eq"),"EQ result","","eq");
  }
}
/*EOF-draw*/
