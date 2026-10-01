"use strict";
/* AutoEQ v29: координатный спуск с 3-параметрическим Nelder-Mead
   (log2 f, log2 Q, gain) по ПОЛНОЙ взвешенной SSE; greedy-посев по пику;
   добор/отсев; 2 детерминированных старта; маска обнуляет всё выше Freq max.
   Поведение как у squig.link/AutoEQ: 5-20 c, результат повторяем. */
window.AutoEqFit=(function(){
var clamp=function(v,a,b){
  return v<a?a:v>b?b:v;
};
var shape=function(f,f0,q){
  var x=f/f0-f0/f;
  return 1/(1+q*q*x*x);
};
function pow2(x){return Math.pow(2,x);}
function maskW(f,fmax){
  var f1=fmax*0.85;
  if(f<=f1)return 1;
  if(f>=fmax)return 0;
  return 0.5*(1+Math.cos(Math.PI*(f-f1)/(fmax-f1)));
}
function fullSSE(e0,f,fs,W){
  var s=0,i,k,d;
  for(i=0;i<f.length;i++){
    d=e0[i];
    for(k=0;k<fs.length;k++){
      if(fs[k].g)d+=fs[k].g*shape(f[i],fs[k].f,fs[k].q);
    }
    s+=W[i]*d*d;
  }
  return s;
}
function residFull(e0,f,fs){
  var e=new Array(f.length),i,k,d;
  for(i=0;i<f.length;i++){
    d=e0[i];
    for(k=0;k<fs.length;k++){
      if(fs[k].g)d+=fs[k].g*shape(f[i],fs[k].f,fs[k].q);
    }
    e[i]=d;
  }
  return e;
}
function residWithout(e0,f,fs,k){
  var e=new Array(f.length),i,j,d;
  for(i=0;i<f.length;i++){
    d=e0[i];
    for(j=0;j<fs.length;j++){
      if(j===k)continue;
      if(fs[j].g)d+=fs[j].g*shape(f[i],fs[j].f,fs[j].q);
    }
    e[i]=d;
  }
  return e;
}
function makeF(ew,f,W,o){
  return function(x){
    var fc=clamp(pow2(x[0]),o.fmin,o.fmax);
    var q=clamp(pow2(x[1]),o.qmin,o.qmax);
    var g=clamp(x[2],o.gmin,o.gmax);
    var s=0,i,d;
    for(i=0;i<f.length;i++){
      d=ew[i]+g*shape(f[i],fc,q);
      s+=W[i]*d*d;
    }
    return s;
  };
}
function nm3(F,x0,iters){
  var S=[],i,j,q2;
  S[0]={x:x0.slice()};
  S[1]={x:x0.slice()};S[1].x[0]+=0.25;
  S[2]={x:x0.slice()};S[2].x[1]+=0.25;
  S[3]={x:x0.slice()};S[3].x[2]+=0.5;
  for(i=0;i<4;i++)S[i].f=F(S[i].x);
  for(i=0;i<iters;i++){
    S.sort(function(a,b){return a.f-b.f;});
    var conv=true;
    for(j=1;j<4;j++){
      if(Math.abs(S[j].x[0]-S[0].x[0])>1e-4||
         Math.abs(S[j].x[1]-S[0].x[1])>1e-4||
         Math.abs(S[j].x[2]-S[0].x[2])>1e-3){
        conv=false;
        break;
      }
    }
    if(conv)break;
    var c=[0,0,0],r=[0,0,0];
    for(j=0;j<3;j++){
      c[j]=(S[0].x[j]+S[1].x[j]+S[2].x[j])/3;
      r[j]=2*c[j]-S[3].x[j];
    }
    var fr=F(r);
    if(fr<S[0].f){
      var ex=[0,0,0];
      for(j=0;j<3;j++)ex[j]=c[j]+2*(c[j]-S[3].x[j]);
      var fe=F(ex);
      S[3]=fe<fr?{x:ex,f:fe}:{x:r,f:fr};
    }else if(fr<S[2].f){
      S[3]={x:r,f:fr};
    }else{
      var kc=[0,0,0];
      for(j=0;j<3;j++)kc[j]=(c[j]+S[3].x[j])/2;
      var fk=F(kc);
      if(fk<S[3].f){
        S[3]={x:kc,f:fk};
      }else{
        for(j=1;j<4;j++){
          var nx=[0,0,0];
          for(q2=0;q2<3;q2++){
            nx[q2]=S[0].x[q2]+0.5*(S[j].x[q2]-S[0].x[q2]);
          }
          S[j]={x:nx,f:F(nx)};
        }
      }
    }
  }
  S.sort(function(a,b){return a.f-b.f;});
  return S[0].x;
}
function clampCand(x,o){
  return{
    f:clamp(pow2(x[0]),o.fmin,o.fmax),
    q:clamp(pow2(x[1]),o.qmin,o.qmax),
    g:clamp(x[2],o.gmin,o.gmax)
  };
}
function seedFit(e,f,o,W,bi,iters){
  var F=makeF(e,f,W,o);
  var x0=[
    Math.log2(clamp(f[bi],o.fmin,o.fmax)),
    Math.log2(clamp(1,o.qmin,o.qmax)),
    -e[bi]
  ];
  return clampCand(nm3(F,x0,iters),o);
}
function refine(e0,f,fs,k,o,W,iters){
  var ew=residWithout(e0,f,fs,k);
  var F=makeF(ew,f,W,o);
  var cur=fs[k];
  var x0=[
    Math.log2(clamp(cur.f,o.fmin,o.fmax)),
    Math.log2(clamp(cur.q,o.qmin,o.qmax)),
    cur.g
  ];
  var cand=clampCand(nm3(F,x0,iters),o);
  var trial=fs.slice();
  trial[k]=cand;
  if(fullSSE(e0,f,trial,W)<fullSSE(e0,f,fs,W)-1e-9){
    fs[k]=cand;
    return true;
  }
  return false;
}
function tick(){
  return new Promise(function(r){setTimeout(r,0);});
}
async function rounds(e0,f,fs,o,W,tEnd,iters,maxG){
  var guard=0,changed=true,k;
  while(changed&&guard<maxG&&performance.now()<tEnd){
    changed=false;
    for(k=0;k<fs.length;k++){
      if(refine(e0,f,fs,k,o,W,iters))changed=true;
    }
    guard++;
    await tick();
  }
  return fs;
}
function greedySeed(e0,f,o,W,count,tEnd){
  var fs=[],e=e0.slice(),i;
  while(fs.length<count&&performance.now()<tEnd){
    var bi=-1,bv=0;
    for(i=0;i<e.length;i++){
      var av=W[i]*Math.abs(e[i]);
      if(av>bv){bv=av;bi=i;}
    }
    if(bi<0||bv<0.15)break;
    var cand=seedFit(e,f,o,W,bi,120);
    if(Math.abs(cand.g)<0.05)break;
    var before=0,after=0;
    for(i=0;i<e.length;i++){
      before+=W[i]*e[i]*e[i];
      var d=e[i]+cand.g*shape(f[i],cand.f,cand.q);
      after+=W[i]*d*d;
    }
    if(after>=before-1e-9)break;
    fs.push(cand);
    for(i=0;i<e.length;i++){
      e[i]+=cand.g*shape(f[i],cand.f,cand.q);
    }
  }
  return fs;
}
function logSeed(o,count){
  var fs=[],i;
  for(i=0;i<count;i++){
    var t=count>1?i/(count-1):0;
    fs.push({
      f:o.fmin*Math.pow(o.fmax/o.fmin,t),
      q:clamp(1,o.qmin,o.qmax),
      g:0});
  }
  return fs;
}
function pruneAdd(e0,f,fs,o,W,tEnd){
  var k,i;
  for(k=fs.length-1;k>=0;k--){
    var rest=fs.filter(function(_,j){return j!==k;});
    if(fullSSE(e0,f,rest,W)<=fullSSE(e0,f,fs,W)+1e-7){
      fs=rest;
    }
  }
  while(fs.length<o.count&&performance.now()<tEnd){
    var e=residFull(e0,f,fs);
    var bi=-1,bv=0;
    for(i=0;i<e.length;i++){
      var av=W[i]*Math.abs(e[i]);
      if(av>bv){bv=av;bi=i;}
    }
    if(bi<0||bv<0.15)break;
    var cand=seedFit(e,f,o,W,bi,120);
    if(Math.abs(cand.g)<0.05)break;
    if(fullSSE(e0,f,fs.concat([cand]),W)>=
       fullSSE(e0,f,fs,W)-1e-9)break;
    fs.push(cand);
  }
  return fs;
}
function mergeClose(fs,minD){
  fs.sort(function(a,b){return a.f-b.f;});
  var out=[],i;
  for(i=0;i<fs.length;i++){
    if(out.length&&Math.abs(
       Math.log2(fs[i].f/out[out.length-1].f))<minD){
      if(Math.abs(fs[i].g)>Math.abs(out[out.length-1].g)){
        out[out.length-1]=fs[i];
      }
    }else{
      out.push(fs[i]);
    }
  }
  return out;
}
async function fitAsync(eFull,fFull,o,onProg){
  var idx=[],i;
  for(i=0;i<fFull.length;i++){
    if(fFull[i]>=o.fmin&&fFull[i]<=o.fmax)idx.push(i);
  }
  if(idx.length<10)return[];
  var f=idx.map(function(k){return fFull[k];});
  var e0=idx.map(function(k){return eFull[k];});
  var W=f.map(function(ff){return maskW(ff,o.fmax);});
  var t0=performance.now();
  var BUDGET=o.budget||12000;
  var tEnd=t0+BUDGET;
  var starts=[
    greedySeed(e0,f,o,W,o.count,tEnd),
    logSeed(o,o.count)
  ];
  var best=null,si;
  for(si=0;si<starts.length;si++){
    var fs=starts[si];
    fs=await rounds(e0,f,fs,o,W,tEnd,140,6);
    fs=pruneAdd(e0,f,fs,o,W,tEnd);
    fs=await rounds(e0,f,fs,o,W,tEnd,90,4);
    var sc=fullSSE(e0,f,fs,W);
    if(!best||sc<best.sc-1e-9)best={fs:fs,sc:sc};
    if(onProg){
      onProg(si+1,Math.round((performance.now()-t0)/100)/10);
    }
    await tick();
    if(performance.now()>tEnd)break;
  }
  if(!best)return[];
  var out=mergeClose(best.fs,0.05);
  return out.filter(function(x){
    return Math.abs(x.g)>=0.1;
  });
}
function fit(e,f,o){
  var W=f.map(function(ff){return maskW(ff,o.fmax);});
  var fs=greedySeed(e,f,o,W,o.count||8,performance.now()+2000);
  return fs.filter(function(x){
    return Math.abs(x.g)>=0.1;
  }).sort(function(a,b){return a.f-b.f;});
}
return{fit:fit,fitAsync:fitAsync,mask:maskW};
})();
/*EOF-autoeq-v29*/
