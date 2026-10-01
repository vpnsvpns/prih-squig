"use strict";
/* AutoEqFit — порт ядра AutoEQ (Jaakko Pasanen, github.com/jaakkopasanen/AutoEQ, autoeq.py),
   как использует squig.link: greedy по макс.|ошибки| -> PK (fc,Q через Nelder-Mead по log2,
   gain аналитически LS) -> координатный спуск -> prune |gain|<0.08 dB. */
window.AutoEqFit=(()=>{
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const shape=(f,f0,q)=>{const x=f/f0-f0/f;return 1/(1+q*q*x*x);};
function lsGain(e,w,f,fc,q,ga,gb){let n=0,d=0;for(let k=0;k<w.length;k++){const i=w[k],m=shape(f[i],fc,q);n+=e[i]*m;d+=m*m;}return d>1e-9?clamp(-n/d,ga,gb):0;}
function winScore(e,w,f,fc,q,g){let s=0;for(let k=0;k<w.length;k++){const i=w[k],d=e[i]+g*shape(f[i],fc,q);s+=d*d;}return w.length?s/w.length:1e9;}
function bandScore(e,f,fl,inR){let s=0;for(let i=0;i<f.length;i++)if(inR[i]){const d=e[i]+fl.g*shape(f[i],fl.f,fl.q);s+=d*d;}return s;}
function nelderMead(F,x0,iters){
  const S=[{x:[x0[0],x0[1]]},{x:[x0[0]+0.35,x0[1]]},{x:[x0[0],x0[1]+0.35]}];
  for(const p of S)p.f=F(p.x);
  for(let it=0;it<iters;it++){
    S.sort((a,b)=>a.f-b.f);
    if(Math.abs(S[2].x[0]-S[0].x[0])<1e-3&&Math.abs(S[2].x[1]-S[0].x[1])<1e-3)break;
    const cx=(S[0].x[0]+S[1].x[0])/2,cy=(S[0].x[1]+S[1].x[1])/2;
    const rx=2*cx-S[2].x[0],ry=2*cy-S[2].x[1],fr=F([rx,ry]);
    if(fr<S[0].f){const ex=cx+2*(cx-S[2].x[0]),ey=cy+2*(cy-S[2].x[1]),fe=F([ex,ey]);S[2]=fe<fr?{x:[ex,ey],f:fe}:{x:[rx,ry],f:fr};}
    else if(fr<S[1].f){S[2]={x:[rx,ry],f:fr};}
    else{const kx=(cx+S[2].x[0])/2,ky=(cy+S[2].x[1])/2,fk=F([kx,ky]);
      if(fk<S[2].f)S[2]={x:[kx,ky],f:fk};
      else for(let j=1;j<3;j++){S[j].x=[S[0].x[0]+0.5*(S[j].x[0]-S[0].x[0]),S[0].x[1]+0.5*(S[j].x[1]-S[0].x[1])];S[j].f=F(S[j].x);}}
  }
  S.sort((a,b)=>a.f-b.f);return S[0].x;
}
function fitLocal(e,f,i,o,lo,hi){
  const w=[],a=f[i]/2.5,b=f[i]*2.5;
  for(let k=0;k<f.length;k++)if(f[k]>=a&&f[k]<=b)w.push(k);
  const L0=Math.log2(lo),L1=Math.log2(hi),Q0=Math.log2(o.qmin),Q1=Math.log2(o.qmax);
  const F=x=>{let p=0;
    if(x[0]<L0)p+=(L0-x[0])*30;if(x[0]>L1)p+=(x[0]-L1)*30;
    if(x[1]<Q0)p+=(Q0-x[1])*30;if(x[1]>Q1)p+=(x[1]-Q1)*30;
    const fc=Math.pow(2,x[0]),q=Math.pow(2,x[1]);
    return winScore(e,w,f,fc,q,lsGain(e,w,f,fc,q,o.gmin,o.gmax))+p;};
  let best=null;
  for(const q0 of[1,o.qmin,o.qmax]){
    const x=nelderMead(F,[clamp(Math.log2(f[i]),L0,L1),Math.log2(clamp(q0,o.qmin,o.qmax))],70);
    const fc=clamp(Math.pow(2,x[0]),lo,hi),q=clamp(Math.pow(2,x[1]),o.qmin,o.qmax);
    const g=lsGain(e,w,f,fc,q,o.gmin,o.gmax),s=winScore(e,w,f,fc,q,g);
    if(!best||s<best.s)best={f:fc,q,g,s};
  }
  return best;
}
function addRes(e,f,fl,sgn){for(let i=0;i<f.length;i++)e[i]+=sgn*fl.g*shape(f[i],fl.f,fl.q);}
function fit(e,f,o){
  const inR=f.map(v=>v>=o.fmin&&v<=o.fmax);
  let res=e.slice();const filters=[];
  for(let k=0;k<o.count;k++){
    let bi=-1,bv=0;
    for(let i=0;i<f.length;i++)if(inR[i]&&Math.abs(res[i])>bv){bv=Math.abs(res[i]);bi=i;}
    if(bi<0||bv<0.05)break;
    let best=null;
    for(let off=-2;off<=2;off++){
      const i=bi+off;if(i<0||i>=f.length||!inR[i])continue;
      const c=fitLocal(res,f,i,o,clamp(f[i]/1.6,o.fmin,o.fmax),clamp(f[i]*1.6,o.fmin,o.fmax));
      const imp=bandScore(res,f,{f:1,q:1,g:0},inR)-bandScore(res,f,c,inR);
      if(!best||imp>best.imp)best={c,imp};
    }
    if(!best||best.imp<=1e-6)break;
    filters.push(best.c);addRes(res,f,best.c,1);
  }
  for(let r=0;r<3;r++){
    let ch=false;
    for(let k=0;k<filters.length;k++){
      const wo=res.slice();addRes(wo,f,filters[k],-1);
      let ni=0,bd=1e9;
      for(let i=0;i<f.length;i++){const d=Math.abs(Math.log2(f[i]/filters[k].f));if(d<bd){bd=d;ni=i;}}
      const c=fitLocal(wo,f,ni,o,clamp(filters[k].f/1.5,o.fmin,o.fmax),clamp(filters[k].f*1.5,o.fmin,o.fmax));
      if(bandScore(wo,f,c,inR)+1e-7<bandScore(wo,f,filters[k],inR)){filters[k]=c;res=wo;addRes(res,f,c,1);ch=true;}
    }
    if(!ch)break;
  }
  return filters.filter(x=>Math.abs(x.g)>=0.08).sort((a,b)=>a.f-b.f);
}
return{fit};
})();
