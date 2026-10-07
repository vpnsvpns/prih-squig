"use strict";
/* core v3: math, DSP, fetch, parse + AutoEQ trained on user presets */
function T(c,a,b){
  if(c){return a;}
  return b;
}
function clamp(v,a,b){
  if(v<a){return a;}
  if(v>b){return b;}
  return v;
}
function shape(f,f0,q){
  var x=f/f0-f0/f;
  return 1/(1+q*q*x*x);
}
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
function smoothCurve(y,oct){
  if(!oct){return y;}
  var sigma=oct*SPO/2.355;
  var r=Math.max(1,Math.ceil(sigma*3));
  var out=new Float64Array(y.length),i,k;
  for(i=0;i<y.length;i++){
    var s=0,w=0;
    for(k=-r;k<=r;k++){
      var idx=i+k;
      if(idx<0||idx>=y.length){continue;}
      var g=Math.exp(-k*k/(2*sigma*sigma));
      s+=y[idx]*g;
      w+=g;
    }
    out[i]=s/w;
  }
  return out;
}
function shift(y,d){
  var o=new Float64Array(y.length),i;
  for(i=0;i<y.length;i++){o[i]=y[i]+d;}
  return o;
}
function minusF(a,b){
  var o=new Float64Array(a.length),i;
  for(i=0;i<a.length;i++){o[i]=a[i]-b[i];}
  return o;
}
function addF(a,b){
  var o=new Float64Array(a.length),i;
  for(i=0;i<a.length;i++){o[i]=a[i]+b[i];}
  return o;
}
function averageCurves(list){
  var o=new Float64Array(GRID.length),i,j;
  for(j=0;j<list.length;j++){
    for(i=0;i<GRID.length;i++){o[i]+=list[j][i];}
  }
  for(i=0;i<GRID.length;i++){o[i]/=list.length;}
  return o;
}
function anchorVal(y,f){
  var s=0,n=0,lo=f/1.06,hi=f*1.06,i;
  for(i=0;i<GRID.length;i++){
    if(GRID[i]>=lo&&GRID[i]<=hi){s+=y[i];n++;}
  }
  return n?s/n:y[0];
}
function biquadDb(type,f0,Q,gain,f){
  var w0=2*Math.PI*clamp(f0,10,23000)/48000;
  var w=2*Math.PI*clamp(f,10,23500)/48000;
  var A=Math.pow(10,(gain||0)/40);
  var cw=Math.cos(w0),sw=Math.sin(w0);
  var al=sw/(2*Math.max(Q,0.05));
  var sA=Math.sqrt(A);
  var b0,b1,b2,a0,a1,a2;
  if(type==="ls"){
    b0=A*((A+1)+(A-1)*cw+2*sA*al);
    b1=2*A*((A-1)+(A+1)*cw);
    b2=A*((A+1)+(A-1)*cw-2*sA*al);
    a0=(A+1)+(A-1)*cw+2*sA*al;
    a1=-2*((A-1)+(A+1)*cw);
    a2=(A+1)+(A-1)*cw-2*sA*al;
  }else{
    b0=A*((A+1)+(A-1)*cw-2*sA*al);
    b1=-2*A*((A-1)+(A+1)*cw);
    b2=A*((A+1)+(A-1)*cw+2*sA*al);
    a0=(A+1)+(A-1)*cw-2*sA*al;
    a1=2*((A-1)+(A+1)*cw);
    a2=(A+1)+(A-1)*cw-2*sA*al;
  }
  var c1=Math.cos(w),s1=Math.sin(w);
  var c2=Math.cos(2*w),s2=Math.sin(2*w);
  var nbR=b0+b1*c1+b2*c2;
  var nbI=-(b1*s1+b2*s2);
  var dR=a0+a1*c1+a2*c2;
  var dI=-(a1*s1+a2*s2);
  var den=dR*dR+dI*dI||1e-9;
  var hR=(nbR*dR+nbI*dI)/den;
  var hI=(nbI*dR-nbR*dI)/den;
  return 10*Math.log10(hR*hR+hI*hI+1e-12);
}
var RE_SPLIT=/[\s,;]+/;
var RE_NL=new RegExp("\\r{0,1}\\n");
function parseTable(text){
  var rows=[],lines=text.split(RE_NL),i;
  for(i=0;i<lines.length;i++){
    var toks=lines[i].trim().split(RE_SPLIT)
      .filter(function(t){return t.length;});
    if(toks.length<2){continue;}
    var n=toks.map(Number);
    if(!isFinite(n[0])||n[0]<=0||!isFinite(n[1])){continue;}
    var v=n[1];
    if(toks.length>=3&&isFinite(n[2])){v=(n[1]+n[2])/2;}
    rows.push([n[0],v]);
  }
  rows.sort(function(a,b){return a[0]-b[0];});
  return rows;
}
function resample(pts){
  var out=new Float64Array(GRID.length);
  var n=pts.length,j=0,i;
  for(i=0;i<GRID.length;i++){
    var f=GRID[i];
    if(f<=pts[0][0]){out[i]=pts[0][1];continue;}
    if(f>=pts[n-1][0]){out[i]=pts[n-1][1];continue;}
    while(pts[j+1][0]<f){j++;}
    var f0=pts[j][0],v0=pts[j][1];
    var f1=pts[j+1][0],v1=pts[j+1][1];
    var t=(Math.log(f)-Math.log(f0));
    t=t/(Math.log(f1)-Math.log(f0));
    out[i]=v0+(v1-v0)*t;
  }
  return out;
}
function esc(s){
  var out="",i,c;
  for(i=0;i<s.length;i++){
    c=s.charAt(i);
    if(c==="&"){out+="&amp;";}
    else if(c==="<"){out+="&lt;";}
    else if(c===">"){out+="&gt;";}
    else if(c==="\""){out+="&quot;";}
    else{out+=c;}
  }
  return out;
}
function css(v){
  return getComputedStyle(document.body)
    .getPropertyValue(v).trim();
}
function $(id){return document.getElementById(id);}
function on(id,ev,fn){
  var el=$(id);
  if(el){el.addEventListener(ev,fn);}
  return el;
}
function num(el,fb){
  var v=parseFloat(el.value);
  return isFinite(v)?v:fb;
}
function r1(v){return Math.round(v*10)/10;}
function r2(v){return Math.round(v*100)/100;}
function fmtF(f){return Math.round(f);}
var RE_ABS=/^https{0,1}:\/\//i;
function isAbs(u){return RE_ABS.test(u);}
function fetchWithTimeout(u,ms){
  var c=new AbortController();
  var t=setTimeout(function(){c.abort();},ms);
  return fetch(u,{signal:c.signal}).finally(function(){
    clearTimeout(t);
  });
}
function fetchLocal(u){
  return fetchWithTimeout(u,8000).then(function(r){
    if(!r.ok){throw new Error("HTTP "+r.status);}
    return r.text();
  });
}
function fetchRemote(u){
  var Q=String.fromCharCode(63);
  var p1="https://api.allorigins.win/raw"+Q+"url=";
  var p2="https://corsproxy.io/"+Q+"url=";
  var urls=[u,p1+encodeURIComponent(u),p2+encodeURIComponent(u)];
  var chain=Promise.reject(new Error("fetch failed"));
  urls.forEach(function(uu){
    chain=chain.catch(function(){
      return fetchWithTimeout(uu,7000).then(function(r){
        if(!r.ok){throw new Error("http");}
        return r.text();
      }).then(function(t){
        if(!t||!t.trim()){throw new Error("empty");}
        return t;
      });
    });
  });
  return chain;
}
function fetchAny(u){
  return isAbs(u)?fetchRemote(u):fetchLocal(u);
}
/* =========================================================
   AutoEQ v3: TEMPLATE ENGINE trained on user's 6 presets.
   Bands: 1) sub-bass PK32-46 or LSC105  2) mud 150-260 cut
   3) body 500-1600  4) presence 2400-4600  5) treble 4800-7900
   Limits: |gain|<=3.5, Q in [0.5,1.5], no centers above 8kHz,
   2-6 filters, skip band if |gain|<0.45dB.
   ========================================================= */
window.AutoEqFit=(function(){
function maskW(f,fmax){
  var f1=fmax*0.85;
  if(f<=f1){return 1;}
  if(f>=fmax){return 0;}
  return 0.5*(1+Math.cos(Math.PI*(f-f1)/(fmax-f1)));
}
function tick(){
  return new Promise(function(r){setTimeout(r,0);});
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
  return clamp(g,gmin,gmax);
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
function applyFilter(e,s,g){
  var i;
  for(i=0;i<e.length;i++){e[i]-=g*s[i];}
}
function bestInBand(e,f,w,cs,qs,gmin,gmax){
  var best=null,ci,qi,i;
  for(ci=0;ci<cs.length;ci++){
    for(qi=0;qi<qs.length;qi++){
      var s=new Array(f.length);
      for(i=0;i<f.length;i++){s[i]=shape(f[i],cs[ci],qs[qi]);}
      var g=lsGain(e,s,w,gmin,gmax);
      if(Math.abs(g)<0.45){continue;}
      var red=reduction(e,s,g,w);
      if(red<=0){continue;}
      if(!best||red>best.red){
        best={f:cs[ci],q:qs[qi],g:g,red:red,s:s};
      }
    }
  }
  return best;
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
  /* --- band 1: sub-bass --- */
  var sLs=new Array(f.length);
  for(i=0;i<f.length;i++){
    sLs[i]=biquadDb("ls",105,0.71,1,f[i]);
  }
  var gLs=lsGain(e,sLs,w,-3,0);
  var redLs=Math.abs(gLs)>=0.45?reduction(e,sLs,gLs,w):0;
  var pk1=bestInBand(e,f,w,
    [28,32,36,40,46,50],[0.5,0.6,0.7,0.8],-1.5,2);
  var redPk=pk1?pk1.red:0;
  if(redLs>redPk&&redLs>0){
    out.push({f:105,q:0.71,g:Math.round(gLs*10)/10,t:"LS"});
    applyFilter(e,sLs,gLs);
  }else if(pk1&&redPk>0){
    out.push({f:pk1.f,q:pk1.q,
      g:Math.round(pk1.g*10)/10,t:"PK"});
    applyFilter(e,pk1.s,pk1.g);
  }
  await tick();
  /* --- bands 2..5 --- */
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
    var b=bestInBand(e,f,w,defs[d].cs,defs[d].qs,
      defs[d].gmin,defs[d].gmax);
    if(!b){continue;}
    out.push({f:b.f,q:b.q,g:Math.round(b.g*10)/10,t:"PK"});
    applyFilter(e,b.s,b.g);
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
/*EOF-core*/
