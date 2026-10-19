(function(){
if(customElements.get('dom-kart'))return;
const load=src=>new Promise((res,rej)=>{const ex=document.querySelector('script[data-dk="'+src+'"]');if(ex){if(ex._ok)return res();ex.addEventListener('load',res);ex.addEventListener('error',rej);return}const s=document.createElement('script');s.src=src;s.dataset.dk=src;s.onload=()=>{s._ok=true;res()};s.onerror=rej;document.head.appendChild(s)});
let worldP=null;
const getWorld=()=>worldP||(worldP=(async()=>{
  if(!window.d3)await load('https://unpkg.com/d3@7.9.0/dist/d3.min.js');
  if(!window.topojson)await load('https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js');
  const t=await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')).json();
  return topojson.feature(t,t.objects.countries).features.filter(f=>f.id!=='010');
})());
class DomKart extends HTMLElement{
  static get observedAttributes(){return['map','height']}
  connectedCallback(){
    if(!this._root){this._root=this.attachShadow({mode:'open'});
      this._root.innerHTML='<style>:host{display:block;position:relative;width:100%;aspect-ratio:1.9;min-height:140px}svg{display:block;width:100%;height:100%;position:absolute;inset:0}#tip{position:absolute;pointer-events:none;padding:7px 11px;border-radius:10px;background:rgba(10,12,18,.94);border:1px solid #2c3446;font:13px system-ui,sans-serif;color:#eef0f4;display:none;white-space:nowrap;z-index:2}#msg{position:absolute;inset:0;display:grid;place-items:center;font:13px system-ui,sans-serif;color:#8a93a6}</style><svg></svg><div id="tip"></div><div id="msg">Laster kart …</div>';
      this._svg=this._root.querySelector('svg');this._tip=this._root.querySelector('#tip');this._msg=this._root.querySelector('#msg');
      this._ro=new ResizeObserver(()=>this.draw());}
    this._h();this._ro.observe(this);
    getWorld().then(f=>{this._f=f;this._msg.style.display='none';this.draw()}).catch(()=>{this._msg.textContent='Kunne ikke laste kartdata'});
  }
  disconnectedCallback(){this._ro&&this._ro.disconnect()}
  attributeChangedCallback(n){if(n==='height')this._h();this.draw()}
  _h(){const v=this.getAttribute('height');if(v){this.style.height=/^\d+$/.test(v)?v+'px':v;this.style.aspectRatio='auto'}}
  set map(v){this.setAttribute('map',typeof v==='string'?v:JSON.stringify(v))}
  data(){const a=this.getAttribute('map')||'';try{return JSON.parse(a[0]==='{'?a:decodeURIComponent(a))}catch(e){return{}}}
  draw(){
    if(!this._f||!this._svg)return;const d3=window.d3,W=this.clientWidth,H=this.clientHeight;if(!W||!H)return;
    const svg=d3.select(this._svg).attr('viewBox','0 0 '+W+' '+H);svg.selectAll('*').remove();
    const feats=this._f,proj=d3.geoNaturalEarth1().fitExtent([[2,2],[W-2,H-2]],{type:'FeatureCollection',features:feats}),path=d3.geoPath(proj);
    const D=this.data(),by=new Map((D.c||[]).map(([id,n,v])=>[id,{n,v}])),max=d3.max(D.c||[],x=>x[2])||1;
    const col=d3.scaleSequentialLog([1,Math.max(2,max)],d3.interpolateRgb(D.lo||'#24406b',D.hi||'#a8d4fb')),EMP=D.empty||'#1d2738',STK=D.stroke||'#0b0e15',tip=this._tip,host=this;
    const show=(el,e,f)=>{svg.selectAll('path').attr('stroke',STK).attr('stroke-width',.5);d3.select(el).attr('stroke','#eef0f4').attr('stroke-width',1).raise();const x=by.get(f.id),r=host.getBoundingClientRect();
      tip.style.display='block';tip.innerHTML='<b>'+(x?x.n:f.properties.name)+'</b> · '+(x?x.v.toLocaleString('nb-NO')+' besøk':'ingen besøk');
      tip.style.left=Math.max(4,Math.min(e.clientX-r.left+14,W-tip.offsetWidth-6))+'px';tip.style.top=Math.max(4,Math.min(e.clientY-r.top+14,H-36))+'px'};
    svg.append('g').selectAll('path').data(feats).join('path').attr('d',path).attr('fill',f=>by.has(f.id)?col(Math.max(1,by.get(f.id).v)):EMP).attr('stroke',STK).attr('stroke-width',.5)
      .on('pointerdown',function(e,f){show(this,e,f)}).on('pointermove',function(e,f){if(e.pointerType==='mouse')show(this,e,f)})
      .on('pointerleave',function(e){if(e.pointerType==='mouse'){d3.select(this).attr('stroke',STK).attr('stroke-width',.5);tip.style.display='none'}});
  }
}
customElements.define('dom-kart',DomKart);
})();
