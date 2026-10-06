"use strict";
/* core v2.0: math, DSP, fetch, parse, NEW AutoEQ optimizer */
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
    a2=(A+1)+(A-1)*cw+2*sA*al;
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
   NEW AUTOEQ ENGINE v2.0 (Prih Edition)
   - Max 8 filters (aims for 3-5)
   - Q: [0.5, 1.5]
   - Gain: [-10, +6]
   - Fc: <= 8000 Hz
   - Weighted error: 6k-10k zone weight 0.3
   ========================================================= */
window.AutoEqFit=(function(){
  function cl(v,a,b){ return v<a?a:(v>b?b:v); }
  function sh(f,f0,q){ var x=f/f0-f0/f; return 1/(1+q*q*x*x); }
  function pow2(x){ return Math.pow(2,x); }
  
  // Mask: 1.0 up to 6kHz, taper to 0.3 at 8kHz, 0.0 above 10kHz
  function maskW(f, fmax){
    if(f <= 6000) return 1.0;
    if(f >= 10000) return 0.0;
    if(f >= 8000) return 0.3; // Reduced weight zone
    // Taper between 6k and 8k
    var t = (f - 6000) / 2000;
    return 1.0 - 0.7 * t; 
  }

  function calcError(e0, f, fs, W){
    var s=0, i, k, d;
    for(i=0; i<f.length; i++){
      d = e0[i];
      for(k=0; k<fs.length; k++){
        if(fs[k].g !== 0){
          d += fs[k].g * sh(f[i], fs[k].f, fs[k].q);
        }
      }
      s += W[i] * d * d;
    }
    // Penalty for using too many filters (encourage minimalism)
    // Base penalty 0 for <= 3 filters, then small cost per extra filter
    var countPenalty = fs.length > 3 ? (fs.length - 3) * 5.0 : 0;
    return s + countPenalty;
  }

  function residWithout(e0, f, fs, k){
    var e=new Array(f.length), i, j, d;
    for(i=0; i<f.length; i++){
      d = e0[i];
      for(j=0; j<fs.length; j++){
        if(j===k) continue;
        if(fs[j].g !== 0){
          d += fs[j].g * sh(f[i], fs[j].f, fs[j].q);
        }
      }
      e[i] = d;
    }
    return e;
  }

  function makeF(ew, f, W, o){
    return function(x){
      var fc = cl(pow2(x[0]), o.fmin, Math.min(o.fmax, 8000)); // Hard cap 8kHz
      var q  = cl(pow2(x[1]), 0.5, 1.5); // Hard Q limits
      var g  = cl(x[2], -10, 6); // Hard Gain limits
      var s=0, i, d;
      for(i=0; i<f.length; i++){
        d = ew[i] + g * sh(f[i], fc, q);
        s += W[i] * d * d;
      }
      return s;
    };
  }

  // Nelder-Mead for 3 params (log_f, log_q, g)
  function nm3(F, x0, iters){
    var S=[], i, j, q2;
    S[0]={x:x0.slice()};
    S[1]={x:x0.slice()}; S[1].x[0]+=0.2; // smaller steps for stability
    S[2]={x:x0.slice()}; S[2].x[1]+=0.2;
    S[3]={x:x0.slice()}; S[3].x[2]+=0.5;
    for(i=0;i<4;i++){S[i].f=F(S[i].x);}
    
    for(i=0;i<iters;i++){
      S.sort(function(a,b){return a.f-b.f;});
      var conv=true;
      for(j=1;j<4;j++){
        if(Math.abs(S[j].x[0]-S[0].x[0])>1e-4) conv=false;
        if(Math.abs(S[j].x[1]-S[0].x[1])>1e-4) conv=false;
        if(Math.abs(S[j].x[2]-S[0].x[2])>1e-3) conv=false;
      }
      if(conv) break;
      
      var c=[0,0,0], r=[0,0,0];
      for(j=0;j<3;j++){
        c[j]=(S[0].x[j]+S[1].x[j]+S[2].x[j])/3;
        r[j]=2*c[j]-S[3].x[j];
      }
      var fr=F(r);
      if(fr < S[0].f){
        var ex=[0,0,0];
        for(j=0;j<3;j++) ex[j]=c[j]+2*(c[j]-S[3].x[j]);
        var fe=F(ex);
        S[3] = fe < fr ? {x:ex, f:fe} : {x:r, f:fr};
      } else if(fr < S[2].f){
        S[3]={x:r, f:fr};
      } else {
        var kc=[0,0,0];
        for(j=0;j<3;j++) kc[j]=(c[j]+S[3].x[j])/2;
        var fk=F(kc);
        if(fk < S[3].f) S[3]={x:kc, f:fk};
        else {
          for(j=1;j<4;j++){
            var nx=[0,0,0];
            for(q2=0;q2<3;q2++) nx[q2]=S[0].x[q2]+0.5*(S[j].x[q2]-S[0].x[q2]);
            S[j]={x:nx, f:F(nx)};
          }
        }
      }
    }
    S.sort(function(a,b){return a.f-b.f;});
    return S[0].x;
  }

  function clampCand(x, o){
    return {
      f: cl(pow2(x[0]), o.fmin, Math.min(o.fmax, 8000)),
      q: cl(pow2(x[1]), 0.5, 1.5),
      g: cl(x[2], -10, 6)
    };
  }

  // Smart Seeding: Find peaks in error curve in specific bands
  function smartSeed(e, f, o, W, maxFilters){
    var seeds = [];
    var bands = [
      {min: 20, max: 200, type: 'bass'},
      {min: 200, max: 2000, type: 'mid'},
      {min: 2000, max: 6000, type: 'treble'}
    ];
    
    // Calculate weighted error magnitude per band
    bands.forEach(function(band){
      var bandIndices = [];
      var maxErr = 0;
      var maxIdx = -1;
      
      for(var i=0; i<f.length; i++){
        if(f[i] >= band.min && f[i] <= band.max){
          var errMag = W[i] * Math.abs(e[i]);
          if(errMag > maxErr){
            maxErr = errMag;
            maxIdx = i;
          }
          bandIndices.push(i);
        }
      }
      
      // If significant error exists in this band, create a seed
      if(maxIdx !== -1 && maxErr > 0.5){ // Threshold 0.5dB weighted
        var targetGain = -e[maxIdx]; // Try to cancel error
        // Limit initial gain guess to reasonable range
        targetGain = cl(targetGain, -4, 4); 
        
        seeds.push({
          f: f[maxIdx],
          q: band.type === 'bass' ? 0.7 : (band.type === 'mid' ? 1.0 : 1.2),
          g: targetGain
        });
      }
    });
    
    // If we found fewer seeds than maxFilters, fill with log-spaced zeros
    while(seeds.length < maxFilters){
       // Add a generic filler, will be optimized or pruned
       var t = seeds.length / maxFilters;
       seeds.push({
         f: o.fmin * Math.pow(o.fmax/o.fmin, t),
         q: 1.0,
         g: 0
       });
    }
    
    return seeds.slice(0, maxFilters);
  }

  function refine(e0, f, fs, k, o, W){
    var ew = residWithout(e0, f, fs, k);
    var F = makeF(ew, f, W, o);
    var cur = fs[k];
    // Start optimization from current values (transformed)
    var x0 = [
      Math.log2(cl(cur.f, o.fmin, 8000)),
      Math.log2(cl(cur.q, 0.5, 1.5)),
      cur.g
    ];
    var cand = clampCand(nm3(F, x0, 60), o); // 60 iters per filter
    
    // Check if this filter actually helps
    var trial = fs.slice();
    trial[k] = cand;
    // Use simple SSE for acceptance check to avoid penalty bias during refinement
    var curErr = calcError(e0, f, fs, W); 
    var newErr = calcError(e0, f, trial, W);
    
    if(newErr < curErr - 0.1){ // Must improve by at least 0.1 score
      fs[k] = cand;
      return true;
    }
    return false;
  }

  function tick(){ return new Promise(function(r){setTimeout(r,0); }); }

  async function rounds(e0, f, fs, o, W, tEnd, maxG){
    var guard=0, changed=true, k;
    while(changed && guard<maxG && performance.now()<tEnd){
      changed=false;
      for(k=0; k<fs.length; k++){
        if(refine(e0, f, fs, k, o, W)) changed=true;
      }
      guard++;
      await tick();
    }
    return fs;
  }

  function prune(fs, e0, f, W){
    // Remove filters that contribute little or have near-zero gain
    var kept = [];
    for(var i=0; i<fs.length; i++){
      if(Math.abs(fs[i].g) > 0.1){ // Keep if gain > 0.1dB
        // Check if removing it hurts score significantly
        var without = fs.filter(function(_, j){ return j!==i; });
        var errWith = calcError(e0, f, fs, W);
        var errWithout = calcError(e0, f, without, W);
        
        // If removing it doesn't increase error much (or decreases due to penalty), drop it
        if(errWithout <= errWith + 2.0){ 
           // Actually, if errWithout is lower, we definitely drop.
           // If slightly higher, we might keep for fidelity, but let's be aggressive for minimalism
           if(errWithout < errWith + 0.5) continue; 
        }
        kept.push(fs[i]);
      }
    }
    return kept;
  }

  async function fitAsync(eFull, fFull, o, onProg){
    var idx=[], i;
    // Only optimize up to 10kHz, ignore above completely for calculation
    for(i=0; i<fFull.length; i++){
      if(fFull[i]>=o.fmin && fFull[i]<=10000){ idx.push(i); }
    }
    if(idx.length<10) return [];
    
    var f = idx.map(function(k){return fFull[k];});
    var e0 = idx.map(function(k){return eFull[k];});
    var W = f.map(function(ff){ return maskW(ff, o.fmax); });
    
    var t0 = performance.now();
    var tEnd = t0 + (o.budget || 12000);
    
    // Determine max filters (user setting, capped at 8)
    var maxF = Math.min(o.count || 5, 8);
    
    // Strategy 1: Smart Seed based on error peaks
    var fs1 = smartSeed(e0, f, o, W, maxF);
    // Strategy 2: Log-spaced seed (fallback)
    var fs2 = [];
    for(i=0; i<maxF; i++){
      var t = maxF>1 ? i/(maxF-1) : 0;
      fs2.push({ f: o.fmin*Math.pow(o.fmax/o.fmin, t), q: 1.0, g: 0 });
    }
    
    var starts = [fs1, fs2];
    var best = null;
    
    for(var si=0; si<starts.length; si++){
      var fs = starts[si];
      // Initial optimization round
      fs = await rounds(e0, f, fs, o, W, tEnd, 4);
      // Prune useless filters
      fs = prune(fs, e0, f, W);
      // Final polish
      fs = await rounds(e0, f, fs, o, W, tEnd, 4);
      
      var sc = calcError(e0, f, fs, W);
      if(!best || sc < best.sc - 0.1){
        best = {fs: fs, sc: sc};
      }
      
      if(onProg) onProg(si+1, Math.round((performance.now()-t0)/100)/10);
      await tick();
      if(performance.now() > tEnd) break;
    }
    
    if(!best) return [];
    
    // Final cleanup: sort by freq, merge very close filters
    var out = best.fs.filter(function(x){ return Math.abs(x.g) >= 0.1; });
    out.sort(function(a,b){ return a.f - b.f; });
    
    // Merge filters closer than 0.2 octaves
    var merged = [];
    for(i=0; i<out.length; i++){
      if(merged.length > 0){
        var last = merged[merged.length-1];
        if(Math.abs(Math.log2(out[i].f / last.f)) < 0.2){
          // Keep the one with higher gain impact
          if(Math.abs(out[i].g) > Math.abs(last.g)){
            merged[merged.length-1] = out[i];
          }
          continue;
        }
      }
      merged.push(out[i]);
    }
    
    return merged;
  }

  return {fitAsync: fitAsync, mask: maskW};
})();
/*EOF-core*/
