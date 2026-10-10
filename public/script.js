const journey = document.querySelector('#journey');
const scenes = [...journey.querySelectorAll('.scene')];
const next = document.querySelector('#next-scene');
const progress = document.querySelector('#progress-fill');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const controllers = window.FormNerdExperiments;
const parts = scenes.map(scene => ({scene,visual:scene.querySelector('.visual'),caption:scene.querySelector('.caption'),height:0}));
let active = -1;
let queued = false;
let viewportHeight = 0;
let viewportWidth = 0;
let resizeFrame = 0;
let layoutFrame = 0;
let intentTimer = 0;
let destination = null;
let pair = '';
let suspended = false;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const ease = t => t*t*(3-2*t);

journey.addEventListener('selectstart', event => event.preventDefault());
journey.addEventListener('dragstart', event => event.preventDefault());

function fitScene(index) {
  const part = parts[index];
  if (!part) return;
  const style = getComputedStyle(part.scene.querySelector('.composition'));
  const usable = journey.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const available = usable - (style.display === 'grid' ? 0 : part.caption.getBoundingClientRect().height + parseFloat(style.rowGap));
  part.height = Math.max(80,Math.floor(available));
  part.visual.style.setProperty('--figure-height',part.height+'px');
}
function scheduleLayout() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {pair='';scheduleRender();});
}
function render() {
  queued = false;
  const position = clamp(journey.scrollTop/Math.max(1,journey.clientHeight),0,scenes.length-1);
  const lower = Math.floor(position), upper = Math.min(lower+1,scenes.length-1);
  const fraction = position-lower;
  active = Math.round(position);
  const key = lower+':'+upper;
  const layoutChanged=pair!==key;
  if (layoutChanged) {fitScene(lower);fitScene(upper);pair=key;}
  const start = controllers?.get(scenes[lower].id), end = controllers?.get(scenes[upper].id);
  const shared = start?.morphGroup && start.morphGroup === end?.morphGroup;
  const t = reducedMotion.matches ? Number(fraction>=.5) : ease(fraction);
  parts.forEach((part,index) => {
    const selected = index === active;
    const preview = !reducedMotion.matches && fraction>.001 && fraction<.999 && (index===lower || index===upper);
    const visible = selected || preview;
    if (!selected && part.scene.contains(document.activeElement)) journey.focus({preventScroll:true});
    part.scene.classList.toggle('is-active',selected);
    part.scene.classList.toggle('is-neighbor',visible && !selected);
    part.scene.inert = !selected;
    part.scene.setAttribute('aria-hidden',String(!selected));
    if (visible) {
      const incoming = index===upper && upper!==lower;
      const amount = reducedMotion.matches ? Number(selected) : incoming?t:1-t;
      const captionAmount = reducedMotion.matches ? amount : selected?.45+.55*Math.abs(1-2*t):0;
      part.caption.style.opacity = captionAmount;
      part.caption.style.transform = reducedMotion.matches?'none':`translateY(${(incoming?1:-1)*(1-captionAmount)*12}px)`;
      part.visual.style.opacity = shared?Number(selected):amount;
      part.visual.style.transform = shared || reducedMotion.matches || amount > .999?'none':`translateY(${(incoming?1:-1)*(1-amount)*20}px) scale(${.985+.015*amount})`;
      if (shared) part.visual.style.setProperty('--figure-height',(parts[lower].height+(parts[upper].height-parts[lower].height)*t)+'px');
    }
    const controller = controllers?.get(part.scene.id);
    controller?.setActive(!suspended && !window.cameraViewerOpen && !document.hidden && visible && (!shared || selected));
    controller?.present(!suspended && !window.cameraViewerOpen && !document.hidden && selected && Math.abs(position-index)<.02);
    if(layoutChanged && visible)controller?.requestDraw();
    if (shared && selected) controller?.scrub(scenes[lower].id,scenes[upper].id,t);
    else if (visible) controller?.scrub?.(part.scene.id,part.scene.id,1);
  });
  progress.style.transform = 'scaleX('+clamp(position/(scenes.length-1),0,1)+')';
  const last = active===scenes.length-1;
  const target = scenes[last?0:active+1];
  next.href = '#'+target.id;
  next.setAttribute('aria-label',last?'Til starten':'Vidare: '+target.getAttribute('aria-label'));
  next.classList.toggle('restart',last);
}
function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(render);
}
function clearIntent() {destination=null;clearTimeout(intentTimer);}
function rememberScene() {
  if(window.cameraViewerOpen)return;
  const position=journey.scrollTop/Math.max(1,journey.clientHeight);
  const index=clamp(Math.round(position),0,scenes.length-1);
  if(Math.abs(index-position)>.02)return;
  const hash='#'+scenes[index].id;
  if(location.hash!==hash)history.replaceState(history.state,'',hash);
}
function settled() {clearIntent();rememberScene();}
function goTo(index,behavior=reducedMotion.matches?'instant':'smooth') {
  destination=clamp(index,0,scenes.length-1);
  journey.scrollTo({top:scenes[destination].offsetTop,behavior});
}
function sizeViewport() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(() => {
    const visual=window.visualViewport;
    if (visual && Math.abs(visual.scale-1)>.01) return;
    document.documentElement.style.setProperty('--viewport-top',(visual?.offsetTop||0)+'px');
    const height=Math.round(visual?.height||window.innerHeight);
    const width=Math.round(visual?.width||window.innerWidth);
    const changed=height!==viewportHeight || width!==viewportWidth;
    if(!changed)return;
    controllers?.forEach(controller=>controller.cancelGesture?.());
    viewportWidth=width;
    const position=journey.scrollTop/Math.max(1,viewportHeight||journey.clientHeight);
    viewportHeight=height;
    document.documentElement.style.setProperty('--viewport-height',height+'px');
    journey.scrollTo({top:position*height,behavior:'instant'});
    scheduleLayout();
    controllers?.forEach(controller=>controller.requestDraw());
  });
}
next.addEventListener('click',event=>{
  event.preventDefault();
  const from=destination??active;
  if(from===scenes.length-1)goTo(0,'instant');
  else goTo(from+1);
});
journey.addEventListener('scroll',()=>{
  scheduleRender();
  clearTimeout(intentTimer);
  intentTimer=setTimeout(settled,300);
},{passive:true});
journey.addEventListener('scrollend',settled,{passive:true});
journey.addEventListener('pointerdown',clearIntent,{passive:true});
journey.addEventListener('touchstart',clearIntent,{passive:true});
journey.addEventListener('wheel',clearIntent,{passive:true});
journey.addEventListener('keydown',event=>{
  if (event.target.closest('a, button, input, select, textarea, summary, canvas') || event.altKey || event.ctrlKey || event.metaKey) return;
  const from=destination??active;
  let target;
  if (event.key==='ArrowDown' || event.key==='PageDown' || event.key===' ' && !event.shiftKey) target=from+1;
  if (event.key==='ArrowUp' || event.key==='PageUp' || event.key===' ' && event.shiftKey) target=from-1;
  if (event.key==='Home') target=0;
  if (event.key==='End') target=scenes.length-1;
  if (target===undefined) return;
  event.preventDefault();goTo(target);
});
function followHash() {
  const aliases={'#teiknet':'#kameraet','#kamera3d':'#kameraet','#synsvinkel':'#innsyn','#vindauget':'#innsyn','#snittet':'#innsyn','#opning-og-botn':'#innsyn','#djupn-i-form':'#innsyn','#eitt-eller-to':'#bit','#venta-svar':'#forventning','#utsida-og-innside':'#innsida','#moglege-meldingar':'#innsida','#forkunnskap':'#kunnskap','#veggen':'#innsyn'};
  const hash=aliases[location.hash]||location.hash;
  const target=scenes.findIndex(scene=>'#'+scene.id===hash);
  if (target>=0) goTo(target,'instant');
  scheduleRender();
}
window.addEventListener('resize',sizeViewport);
window.visualViewport?.addEventListener('resize',sizeViewport);
window.visualViewport?.addEventListener('scroll',sizeViewport);
window.addEventListener('hashchange',followHash);
window.addEventListener('pageshow',event=>{suspended=false;sizeViewport();if(!event.persisted)followHash();scheduleRender();});
function suspend() {suspended=true;controllers?.forEach(controller=>controller.setActive(false));}
window.addEventListener('pagehide',()=>{rememberScene();suspend();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else{suspended=false;sizeViewport();scheduleRender();}});
document.querySelector('.camera-link').addEventListener('click',rememberScene);
document.addEventListener('viewerchange',scheduleRender);
reducedMotion.addEventListener('change',scheduleRender);
const captionSizes=new ResizeObserver(scheduleLayout);
parts.forEach(part=>captionSizes.observe(part.caption));
sizeViewport();
journey.classList.add('enhanced');
followHash();
render();
