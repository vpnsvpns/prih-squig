/* Отрисовка графика */
const FTICKS=[20,30,40,50,60,80,100,150,200,250,300,400,500,600,800,1000,1500,2000,3000,4000,5000,6000,8000,10000,15000,20000];
class Graph{
  constructor(cv){this.cv=cv;this.ctx=cv.getContext('2d');}
  resize(){const r=this.cv.parentElement.getBoundingClientRect(),d=window.devicePixelRatio||1;
    this.w=r.width;this.h=r.height;this.cv.width=Math.round(r.width*d);this.cv.height=Math.round(r.height*d);
    this.ctx.setTransform(d,0,0,d,0,0);}
  x(f){return (Math.log2(Math.min(Math.max(f,this.fmin),this.fmax))-Math.log2(this.fmin))/(Math.log2(this.fmax)-Math.log2(this.fmin))*this.w;}
  y(db){return this.h/2-(db-this.center)*(this.h/this.ySpan);}
  freqAt(px){const t=px/this.w;return Math.pow(2,Math.log2(this.fmin)+t*(Math.log2(this.fmax)-Math.log2(this.fmin)));}
  draw(o){
    Object.assign(this,o);const c=this.ctx;c.clearRect(0,0,this.w,this.h);
    c.fillStyle='#212226';c.fillRect(0,0,this.w,this.h);
    c.strokeStyle='#333438';c.fillStyle='#9aa0a6';c.lineWidth=1;c.font='10px ui-monospace,monospace';
    for(const f of FTICKS){if(f<this.fmin||f>this.fmax)continue;const x=Math.round(this.x(f))+.5;
      c.beginPath();c.moveTo(x,0);c.lineTo(x,this.h);c.stroke();
      c.fillText(f>=1000?(f/1000)+'k':f,x+3,this.h-6);}
    const step=this.ySpan>40?10:5;
    for(let db=Math.ceil((this.center-this.ySpan/2)/step)*step;db<=this.center+this.ySpan/2;db+=step){
      const y=Math.round(this.y(db))+.5;c.beginPath();c.moveTo(0,y);c.lineTo(this.w,y);c.stroke();
      c.fillText(db,4,y-3);}
    for(const cu of o.curves){if(!cu.visible)continue;
      c.strokeStyle=cu.color;c.lineWidth=cu.pinned?2.4:1.6;c.setLineDash(cu.dashed?[5,4]:[]);
      c.beginPath();let started=false;
      for(let i=0;i<cu.freqs.length;i++){const f=cu.freqs[i];if(f<this.fmin||f>this.fmax)continue;
        const x=this.x(f),y=this.y(cu.db[i]);if(!started){c.moveTo(x,y);started=true;}else c.lineTo(x,y);}
      c.stroke();c.setLineDash([]);}
    let ly=this.h-14;
    for(const cu of o.curves){if(!cu.visible)continue;
      c.fillStyle=cu.color;c.font='11px ui-monospace,monospace';
      c.fillText(cu.name+(cu.isTarget?' Target':''),14,ly);ly-=15;}
  }
}
