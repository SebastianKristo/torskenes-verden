// Swipe-to-dismiss: driver transform direkte i DOM via rAF (ingen React-render per bevegelse),
// fart-basert slipp, fjær tilbake og målt høyde-kollaps med Web Animations API.
(function(){
  if(window.SwipeDismiss)return;
  const vib=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch(_){}};
  function attach(card,o){
    o=o||{};
    const th=o.threshold||.38,wrap=o.wrap||card.parentElement,rev=wrap&&wrap.querySelector('[data-sw-rev]'),q=s=>rev&&rev.querySelector(s);
    const lIdle=q('[data-sw-idle]'),lArm=q('[data-sw-armed]'),lDone=q('[data-sw-done]'),ic=q('[data-sw-ic]');
    let x0=null,y0=0,lock=null,dx=0,W=360,raf=0,hist=[],armed=false,busy=false,cap=false,mvT=0,pid=null;
    card.style.willChange='transform';card.style.backfaceVisibility='hidden';
    const lbl=w=>{[[lIdle,'i'],[lArm,'a'],[lDone,'d']].forEach(([el,k])=>{if(el)el.style.opacity=k===w?'1':'0'})};
    const paint=()=>{raf=0;const p=Math.min(1,Math.max(0,dx)/(W*th));card.style.transform='translate3d('+dx.toFixed(1)+'px,0,0) rotate('+(dx/W*4).toFixed(2)+'deg)';
      if(rev){rev.style.opacity=dx>2?String(Math.min(1,.35+p*.65)):'0'}if(ic)ic.style.transform='scale('+(armed?1.15:.7+p*.3).toFixed(3)+')'};
    const arm=a=>{if(a===armed)return;armed=a;if(a)vib(10);if(rev)rev.style.background=a?(o.armedBg||'#2f7a4f'):(o.idleBg||'#1b1a17');lbl(a?'a':'i')};
    const stopAnims=()=>{card.getAnimations&&card.getAnimations().forEach(a=>{if(a.id==='sw')a.cancel()})};
    const down=e=>{if(busy||(e.pointerType==='mouse'&&e.button!==0))return;stopAnims();x0=e.clientX;y0=e.clientY;lock=null;cap=false;pid=e.pointerId;W=card.offsetWidth||360;hist=[[e.timeStamp,0]];dx=0;o.onStart&&o.onStart()};
    const move=e=>{if(x0==null||e.pointerId!==pid)return;const ddx=e.clientX-x0,ddy=e.clientY-y0;
      if(lock==null&&(Math.abs(ddx)>6||Math.abs(ddy)>6))lock=Math.abs(ddx)>Math.abs(ddy)*1.15&&ddx>0?'x':'y';
      if(lock==='y'){x0=null;return}if(lock!=='x')return;
      if(!cap){cap=true;try{card.setPointerCapture(pid)}catch(_){}card.style.transition='none';card.style.animation='none';if(rev)rev.style.transition='background .18s ease';lbl('i')}
      if(e.cancelable)e.preventDefault();mvT=Date.now();
      dx=ddx>=0?ddx:-Math.pow(-ddx,.7);hist.push([e.timeStamp,dx]);while(hist.length>2&&e.timeStamp-hist[0][0]>90)hist.shift();
      arm(dx>=W*th);if(!raf)raf=requestAnimationFrame(paint)};
    const settle=()=>{const from=card.style.transform||'none',dur=420;card.style.transform='translate3d(0,0,0)';
      card.animate([{transform:from},{transform:'translate3d(0,0,0)'}],{duration:dur,easing:'cubic-bezier(.22,1.28,.36,1)',id:'sw'});
      if(rev){const op=rev.style.opacity||'0';rev.style.opacity='0';rev.animate([{opacity:op},{opacity:0}],{duration:220,easing:'ease-out'})}
      arm(false);dx=0};
    const commit=v=>{busy=true;arm(true);lbl('d');vib([8,30,12]);const from=card.style.transform,end=W*1.18,dist=Math.max(40,end-dx),dur=Math.max(170,Math.min(320,dist/Math.max(1.1,v)));
      card.style.transform='translate3d('+end+'px,0,0) rotate(6deg)';
      const fly=card.animate([{transform:from},{transform:card.style.transform}],{duration:dur,easing:'cubic-bezier(.2,.6,.3,1)',id:'sw'});
      fly.onfinish=()=>{setTimeout(()=>{let g=wrap,t=wrap;for(;;){const p=g.parentElement;if(!p||p.children.length!==1||p===document.body)break;const cs=getComputedStyle(p);if(cs.display!=='contents'&&parseFloat(cs.rowGap)>0)break;g=p;if(cs.display!=='contents')t=p}
        const h=t.offsetHeight,gp=t.parentElement,gap=gp?(parseFloat(getComputedStyle(gp).rowGap)||0):0;t.style.overflow='hidden';
        const col=t.animate([{height:h+'px',marginBottom:'0px',opacity:1},{height:'0px',marginBottom:(-gap)+'px',opacity:0}],{duration:o.collapseMs||300,easing:'cubic-bezier(.3,0,.15,1)',fill:'forwards'});
        col.onfinish=()=>{o.onCommit&&o.onCommit()}},o.holdMs==null?260:o.holdMs)}};
    const up=e=>{if(x0==null||(e&&e.pointerId!==pid))return;x0=null;if(raf){cancelAnimationFrame(raf);paint()}if(lock!=='x')return;
      const a=hist[0],b=hist[hist.length-1],v=b&&a&&b[0]>a[0]?(b[1]-a[1])/(b[0]-a[0]):0;
      if(e&&e.type!=='pointercancel'&&(dx>=W*th||(v>.55&&dx>36)))commit(v);else settle()};
    const clk=e=>{if(Date.now()-mvT<350){e.stopPropagation();e.preventDefault()}};
    card.addEventListener('pointerdown',down);card.addEventListener('pointermove',move,{passive:false});card.addEventListener('pointerup',up);card.addEventListener('pointercancel',up);card.addEventListener('lostpointercapture',up);card.addEventListener('click',clk,true);
    return()=>{card.removeEventListener('pointerdown',down);card.removeEventListener('pointermove',move);card.removeEventListener('pointerup',up);card.removeEventListener('pointercancel',up);card.removeEventListener('lostpointercapture',up);card.removeEventListener('click',clk,true);if(raf)cancelAnimationFrame(raf)};
  }
  window.SwipeDismiss={attach};
})();
