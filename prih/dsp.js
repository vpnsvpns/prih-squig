/* DSP-ядро: сетка, биквады, сглаживание, AutoEQ, парсинг FR */
function logspace(a,b,n){const r=[],la=Math.log(a),lb=Math.log(b);for(let i=0;i<n;i++)r.push(Math.exp(la+(lb-la)*i/(n-1)));return r;}
const FREQS=logspace(20,20000,480);
const TOTAL_OCT=Math.log2(20000/20);

function interpPoints(pts,freqs){
  const p=pts.slice().sort((a,b)=>a[0]-b[0]),out=new Array(freqs.length);
  for(let i=0;i<freqs.length;i++){const f=freqs[i];
    if(f<=p[0][0])out[i]=p[0][1];
    else if(f>=p[p.length-1][0])out[i]=p[p.length-1][1];
    else{let k=0;while(k<p.length-2&&p[k+1][0]<f)k++;
      const t=(Math.log(f)-Math.log(p[k][0]))/(Math.log(p[k+1][0])-Math.log(p[k][0]));
      out[i]=p[k][1]+(p[k+1][1]-p[k][1])*t;}}
  return out;
}
function biquadDB(type,f0,gain,Q,f){
  const fs=48000,w=2*Math.PI*f/fs,w0=2*Math.PI*Math.max(f0,10)/fs;
  const c=Math.cos(w0),s=Math.sin(w0),A=Math.pow(10,(gain||0)/40),al=s/(2*Math.max(Q,0.05));
  let b0,b1,b2,a0,a1,a2;
  if(type==='LS'){b0=A*((A+1)+(A-1)*c+2*Math.sqrt(A)*al);b1=2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-2*Math.sqrt(A)*al);a0=(A+1)-(A-1)*c+2*Math.sqrt(A)*al;a1=-2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-2*Math.sqrt(A)*al;}
  else if(type==='HS'){b0=A*((A+1)-(A-1)*c+2*Math.sqrt(A)*al);b1=-2*A*((A-1)-(A+1)*c);b2=A*((A+1)-(A-1)*c-2*Math.sqrt(A)*al);a0=(A+1)+(A-1)*c+2*Math.sqrt(A)*al;a1=2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-2*Math.sqrt(A)*al;}
  else if(type==='LP'){b0=(1-c)/2;b1=1-c;b2=(1-c)/2;a0=1+al;a1=-2*c;a2=1-al;}
  else if(type==='HP'){b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2;a0=1+al;a1=-2*c;a2=1-al;}
  else if(type==='BP'){b0=al;b1=0;b2=-al;a0=1+al;a1=-2*c;a2=1-al;}
  else if(type==='NS'){b0=1;b1=-2*c;b2=1;a0=1+al;a1=-2*c;a2=1-al;}
  else{b0=1+al*A;b1=-2*c;b2=1-al*A;a0=1+al/A;a1=-2*c;a2=1-al/A;}
  const cw=Math.cos(w),sw=Math.sin(w),c2=Math.cos(2*w),s2=Math.sin(2*w);
  const br=b0+b1*cw+b2*c2,bi=-(b1*sw+b2*s2),ar=a0+a1*cw+a2*c2,ai=-(a1*sw+a2*s2);
  return 20*Math.log10(Math.max(Math.hypot(br,bi)/Math.hypot(ar,ai),1e-9));
}
function eqResponse(filters,preamp,freqs){
  const out=new Array(freqs.length).fill(preamp||0);
  for(const fl of filters){if(fl.on===false)continue;
    for(let i=0;i<freqs.length;i++)out[i]+=biquadDB(fl.type,fl.f,fl.gain,fl.Q,freqs[i]);}
  return out;
}
function smoothDB(freqs,db,oct){
  if(!oct||oct<=0)return db.slice();
  const n=freqs.length,half=Math.max(1,Math.round((0.5/oct)*n/TOTAL_OCT));
  const pre=new Array(n+1);pre[0]=0;for(let i=0;i<n;i++)pre[i+1]=pre[i]+db[i];
  const out=new Array(n);
  for(let i=0;i<n;i++){const a=Math.max(0,i-half),b=Math.min(n-1,i+half);out[i]=(pre[b+1]-pre[a])/(b-a+1);}
  return out;
}
function valueAt(freqs,db,f){
  if(f<=freqs[0])return db[0];if(f>=freqs[freqs.length-1])return db[db.length-1];
  const t=(Math.log(f)-Math.log(freqs[0]))/(Math.log(freqs[freqs.length-1])-Math.log(freqs[0]))*(freqs.length-1);
  const i=Math.floor(t),k=t-i;return db[i]*(1-k)+db[Math.min(i+1,freqs.length-1)]*k;
}
function autoEQ(freqs,meas,target,o){
  const filters=[],cur=meas.slice(),idx=[];
  for(let i=0;i<freqs.length;i++)if(freqs[i]>=o.fmin&&freqs[i]<=o.fmax)idx.push(i);
  for(let it=0;it<(o.maxFilters||12);it++){
    const sm=smoothDB(freqs,freqs.map((f,i)=>target[i]-cur[i]),3);
    let bi=-1,bv=0;for(const i of idx)if(Math.abs(sm[i])>Math.abs(bv)){bv=sm[i];bi=i;}
    if(bi<0||Math.abs(bv)<0.4)break;
    let l=bi,r=bi;const h=Math.abs(bv)/2;
    while(l>0&&Math.abs(sm[l])>=h)l--;while(r<freqs.length-1&&Math.abs(sm[r])>=h)r++;
    const bwOct=Math.max(0.15,Math.log2(freqs[r]/freqs[l]));
    const Q=Math.min(o.qmax,Math.max(o.qmin,1/bwOct));
    const gain=Math.min(o.gmax,Math.max(o.gmin,bv));
    filters.push({type:'PK',f:Math.round(freqs[bi]),gain:Math.round(gain*10)/10,Q:Math.round(Q*100)/100,on:true});
    const resp=eqResponse(filters,0,freqs);
    for(let i=0;i<freqs.length;i++)cur[i]=meas[i]+resp[i];
  }
  const resp=eqResponse(filters,0,freqs);let mx=-Infinity;for(const v of resp)mx=Math.max(mx,v);
  return{filters,preamp:Math.min(0,Math.round(-mx*10)/10)};
}
function parseFR(text){
  const pts=[];
  for(const ln of text.split(/\r?\n/)){
    const p=ln.split(/[\s,;]+/).filter(Boolean);if(p.length<2)continue;
    const f=parseFloat(p[0]);if(!isFinite(f)||f<=0)continue;
    const a=parseFloat(p[1]),b=p.length>2?parseFloat(p[2]):NaN;let db;
    if(isFinite(a)&&isFinite(b))db=(a+b)/2;else if(isFinite(a))db=a;else continue;
    pts.push([f,db]);
  }
  return pts.sort((x,y)=>x[0]-y[0]);
}
function avgCurves(list){const n=list[0].length,out=new Array(n).fill(0);for(const c of list)for(let i=0;i<n;i++)out[i]+=c[i]/list.length;return out;}
