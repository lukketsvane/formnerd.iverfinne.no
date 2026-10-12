const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'../dist/');
const html = fs.readFileSync(root + 'index.html', 'utf8');
let height=720,width=390,rafId=0,clock=0,workerRequests=0,workersCreated=0,workersStopped=0;
let randomValue=.5;
const frames = new Map(), timers = new Map(), jobs = [];
const motions = new Set();
function context2d() {
  return new Proxy({records:[],recording:false,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})}, {get:(o,k)=>k in o?o[k]:((...args)=>{if(o.recording)o.records.push({method:k,args,alpha:o.globalAlpha??1});for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),k+' has finite coordinates');if(k==='arc')assert.ok(args[2]>=0);}),set:(o,k,v)=>(o[k]=v,true)});
}
class Element {
  constructor(tag, attrs = '') {
    this.tagName=tag.toUpperCase();this.attrs={};this.listeners={};this.children=[];this.style={setProperty:(k,v)=>{this.style[k]=v;if(k==='--viewport-height')height=parseFloat(v);}};
    for(const match of attrs.matchAll(/([\w-]+)="([^"]*)"/g))this.attrs[match[1]]=match[2];
    this.id=this.attrs.id||'';this.dataset={};
    for(const [key,value] of Object.entries(this.attrs))if(key.startsWith('data-'))this.dataset[key.slice(5)]=value;
    const classes=new Set((this.attrs.class||'').split(' '));
    this.classList={add:key=>classes.add(key),remove:key=>classes.delete(key),toggle:(key,on)=>on?classes.add(key):classes.delete(key),contains:key=>classes.has(key)};
    this.scrollTop=0;this.ctx=context2d();this.textContent='';
  }
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  emit(name,event={}){for(const fn of this.listeners[name]||[])fn({target:this,preventDefault(){},stopPropagation(){},...event});}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key];}
  getContext(){return this.ctx;}
  setPointerCapture(id){this.capture=id;}
  hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(){this.capture=null;}
  animate(frames,options){const animation={target:this,onfinish:null,ends:clock+options.duration+(options.delay||0),cancel(){motions.delete(animation);}};motions.add(animation);return animation;}
  focus(){document.activeElement=this;}
  contains(item){return item===this||this.children.some(child=>child.contains(item));}
  closest(selector){return selector.split(',').some(tag=>tag.trim().toUpperCase()===this.tagName)?this:null;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){const descendants=this.children.flatMap(child=>[child,...child.all()]);return descendants.filter(el=>matches(el,selector));}
  all(){return this.children.flatMap(child=>[child,...child.all()]);}
  get clientHeight(){return height;}
  get scrollHeight(){return height*scenes.length;}
  get offsetTop(){return Math.max(0,scenes.indexOf(this))*height;}
  getBoundingClientRect(){
    if(this.classList.contains('scene'))return {top:this.offsetTop-journey.scrollTop,height,width,left:0};
    if(this.classList.contains('caption'))return {top:0,left:24,width:width-48,height:this.parent.parent.classList.contains('experiment')?205:125};
    if(this.classList.contains('visual'))return {top:30,left:24,width:width-48,height:parseFloat(this.style['--figure-height'])||340};
    if(this.tagName==='CANVAS')return this.parent?.getBoundingClientRect()||{top:30,left:24,width:width-48,height:340};
    return {top:0,left:0,width,height};
  }
  scrollTo({top}){this.scrollTop=top;this.emit('scroll');}
}
function matches(el,selector){if(selector.startsWith('#'))return el.id===selector.slice(1);if(selector.startsWith('.'))return el.classList.contains(selector.slice(1));if(selector.startsWith('['))return el.attrs[selector.slice(1,-1)]!==undefined;return el.tagName===selector.toUpperCase();}
const elements=[];
const stack=[],voids=new Set(['meta','link','img','br','input']);
for(const tag of html.matchAll(/<(\/?)(\w+)\b([^>]*)>/g)){
  if(tag[1]){assert.equal(stack.pop().tagName,tag[2].toUpperCase());continue;}
  const element=new Element(tag[2],tag[3]);elements.push(element);
  if(stack.length){element.parent=stack.at(-1);element.parent.children.push(element);}
  if(!voids.has(tag[2])&&!tag[3].trim().endsWith('/'))stack.push(element);
}
assert.equal(stack.length,0);
const byId=id=>elements.find(el=>el.id===id);
const journey=byId('journey'),scenes=elements.filter(el=>el.classList.contains('scene'));
const document=Object.assign(new Element('document'),{hidden:false,activeElement:null,documentElement:new Element('html'),getElementById:byId,querySelector:selector=>elements.find(el=>matches(el,selector)),querySelectorAll:selector=>elements.filter(el=>matches(el,selector)),createElement:tag=>new Element(tag)});
const window=new Element('window');window.visualViewport={height,offsetTop:0,scale:1,addEventListener(){}};window.innerHeight=height;window.innerWidth=width;
const motion={matches:false,addEventListener(){}};
class Worker {
  constructor(){if(process.env.NO_WORKER)throw new Error('Worker unavailable');workersCreated++;const host=this;this.alive=true;this.scope={Uint8ClampedArray,Math,self:{postMessage:data=>jobs.push(()=>{if(host.alive)host.onmessage({data});})}};vm.createContext(this.scope);this.scope.importScripts=name=>vm.runInContext(fs.readFileSync(root+name,'utf8'),this.scope);vm.runInContext(fs.readFileSync(root+'fractal-worker.js','utf8'),this.scope);}
  postMessage(data){workerRequests++;jobs.push(()=>{if(this.alive)this.scope.self.onmessage({data});});}
  terminate(){if(this.alive)workersStopped++;this.alive=false;}
}
const scope={document,window,location:{hash:process.env.START_HASH||''},Math:Object.assign(Object.create(Math),{random:()=>randomValue}),getComputedStyle:element=>({paddingTop:height<=600?'10px':'14px',paddingBottom:height<=600?'60px':'64px',rowGap:element?.classList.contains('visual')?(height<=600?'12px':'18px'):'12px',display:width>=650&&height<=440?'grid':'flex'}),matchMedia:()=>motion,ResizeObserver:class{observe(){}},devicePixelRatio:2,performance:{now:()=>clock},requestAnimationFrame:fn=>{frames.set(++rafId,fn);return rafId;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{timers.set(++rafId,fn);return rafId;},clearTimeout:id=>timers.delete(id),Worker,ImageData:class{constructor(data,width,height){Object.assign(this,{data,width,height});}},Uint8ClampedArray,console};
scope.history={state:null,replaceState(state,title,url){scope.location.hash=url;}};
vm.createContext(scope);
for(const file of ['entropy-models.js','experiments.js','script.js'])vm.runInContext(fs.readFileSync(root+file,'utf8'),scope,{filename:file});
function tick(){clock+=32;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(clock));jobs.splice(0).forEach(fn=>fn());for(const animation of [...motions])if(animation.ends<=clock){motions.delete(animation);animation.onfinish?.();}}
function flush(){let n=0;while(frames.size||jobs.length||motions.size){assert.ok(n++<100,'frame loop settles');tick();}}
function flushTimers(){let n=0;while(timers.size||frames.size||jobs.length||motions.size){assert.ok(n++<400,'scheduled work settles');const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());tick();}}
function active(){return scenes.filter(scene=>scene.classList.contains('is-active'));}
function go(id){journey.emit('pointerdown');journey.scrollTo({top:byId(id).offsetTop});flush();journey.emit('scrollend');assert.deepEqual(active().map(el=>el.id),[id]);assert.equal(scenes.filter(scene=>!scene.inert).length,1);assert.equal(scenes.filter(scene=>scene.classList.contains('is-neighbor')).length,0);}
flush();assert.equal(active()[0].id,process.env.START_HASH?({'#teiknet':'kameraet','#kamera3d':'kameraet','#synsvinkel':'innsyn','#vindauget':'innsyn','#snittet':'innsyn'}[process.env.START_HASH]||process.env.START_HASH.slice(1)):'entropi');
if(process.env.START_HASH){assert.equal(journey.scrollTop,active()[0].offsetTop);console.log('PASS: initial deep link survives first viewport sizing.');process.exit(0);}
if(process.env.SCALE_DEMO){
  const mode=process.env.SCALE_DEMO;
  motion.matches=mode==='reduced';go('skala');
  function nextRefinement(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());flush();}
  if(mode==='reduced')assert.equal(byId('scale-count').textContent,81);
  else {
    nextRefinement();assert.equal(byId('scale-count').textContent,9);
    if(mode==='interrupt'){
      byId('scale-less').emit('click');flushTimers();assert.equal(byId('scale-count').textContent,3);
    } else if(mode==='hidden'){
      document.hidden=true;document.emit('visibilitychange');flushTimers();assert.equal(byId('scale-count').textContent,9);
      document.hidden=false;document.emit('visibilitychange');flushTimers();assert.equal(byId('scale-count').textContent,9);
    } else {
      nextRefinement();assert.equal(byId('scale-count').textContent,27);
      nextRefinement();assert.equal(byId('scale-count').textContent,81);
    }
  }
  const count=byId('scale-count').textContent;
  go('kaos');go('skala');flushTimers();assert.equal(byId('scale-count').textContent,count);
  console.log('PASS: automatic refinement '+mode+', correct levels and no repeat on return.');process.exit(0);
}
if(process.env.NO_WORKER){
  go('mandelbrot');assert.equal(byId('mandelbrot-canvas').attrs['aria-busy'],'true');
  document.hidden=true;document.emit('visibilitychange');flushTimers();assert.equal(frames.size,0);
  document.hidden=false;document.emit('visibilitychange');flushTimers();assert.equal(byId('mandelbrot-canvas').attrs['aria-busy'],'false');
  byId('mandel-in').emit('click');flush();go('innsyn');flushTimers();assert.equal(active()[0].id,'innsyn');
  go('mandelbrot');flushTimers();assert.equal(byId('mandelbrot-canvas').attrs['aria-busy'],'false');
  assert.equal(byId('mandel-zoom').textContent,'2,0×');assert.equal(workersCreated,0);
  console.log('PASS: progressive fallback stops offscreen, resumes after visibility changes and completes without a worker.');process.exit(0);
}
function animatedCue(id){return [...motions].some(animation=>byId(id).querySelector('.gesture-cue').contains(animation.target));}
go('visst');journey.scrollTo({top:byId('bit').offsetTop-height*.2});tick();assert.ok(!animatedCue('bit'));
journey.scrollTo({top:byId('bit').offsetTop});tick();assert.ok(animatedCue('bit'));
const bitCanvas=byId('bit-canvas'),bitCue=byId('bit-guide');
assert.equal(bitCanvas.attrs['aria-valuenow'],'50');
pointer(bitCanvas,'pointerdown',140,120);pointer(bitCanvas,'pointermove',142,200);pointer(bitCanvas,'pointerup',142,200);
assert.ok(animatedCue('bit'));assert.ok(!bitCue.classList.contains('is-learned'));
pointer(bitCanvas,'pointerdown',140,120);pointer(bitCanvas,'pointermove',180,121);
assert.ok(!animatedCue('bit'));assert.ok(bitCue.classList.contains('is-engaged'));
pointer(bitCanvas,'pointerup',180,121);flush();assert.ok(!bitCue.classList.contains('is-engaged'));
assert.ok(Number(bitCanvas.attrs['aria-valuenow'])>50);
elements.find(el=>el.dataset.probability==='0.5').emit('click');flush();
journey.scrollTo({top:byId('forventning').offsetTop});tick();assert.ok(animatedCue('forventning'));flush();
go('bit');journey.scrollTo({top:byId('forventning').offsetTop});tick();assert.ok(!animatedCue('forventning'));
motion.matches=true;go('sporet');assert.ok(!animatedCue('sporet'));
motion.matches=false;journey.emit('scroll');tick();assert.ok(animatedCue('sporet'));
document.hidden=true;document.emit('visibilitychange');assert.ok(!animatedCue('sporet'));
document.hidden=false;document.emit('visibilitychange');flush();
for(const scene of scenes)go(scene.id);
go('bit');elements.find(el=>el.dataset.probability==='0.1').emit('click');tick();
assert.ok(Number(bitCanvas.attrs['aria-valuenow'])>10 && Number(bitCanvas.attrs['aria-valuenow'])<50);flush();
assert.equal(byId('bit-h').textContent,'0,469');assert.equal(byId('bit-canvas').attrs['aria-valuenow'],'10');
randomValue=.05;byId('bit-reveal').emit('click');flush();assert.equal(byId('bit-result').textContent,'Dette svaret: 1 → 3,322 bit.');
randomValue=.8;byId('bit-reveal').emit('click');flush();assert.equal(byId('bit-result').textContent,'Dette svaret: 0 → 0,152 bit.');
for(const key of ['Home','End']){byId('bit-canvas').emit('keydown',{key});flush();byId('bit-reveal').emit('click');flush();assert.equal(byId('bit-h').textContent,'0');assert.ok(byId('bit-result').textContent.endsWith('→ 0 bit.'));}
elements.find(el=>el.dataset.probability==='0.5').emit('click');flush();assert.equal(byId('bit-h').textContent,'1');
go('kunnskap');byId('knowledge-share').emit('click');tick();byId('knowledge-share').emit('click');flush();
assert.equal(byId('knowledge-share').textContent,'Del det du veit');
byId('knowledge-share').emit('click');flush();assert.equal(byId('knowledge-copy').textContent,'Same spor. No kjenner begge svaret.');
assert.ok(byId('knowledge-canvas').attrs['aria-label'].includes('Ingen uvisse'));
byId('knowledge-share').emit('click');go('komprimering');go('kunnskap');flush();
assert.equal(byId('knowledge-share').textContent,'Del det du veit');
go('komprimering');elements.find(el=>el.dataset.compression==='both').emit('click');flush();assert.equal(byId('compression-h').textContent,0);elements.find(el=>el.dataset.compression==='one').emit('click');flush();assert.equal(byId('compression-h').textContent,1);
go('kaos');elements.find(el=>el.dataset.r==='3.2').emit('click');tick();assert.ok(Number(byId('chaos-canvas').attrs['aria-valuenow'])>3.2 && Number(byId('chaos-canvas').attrs['aria-valuenow'])<3.9);flush();assert.equal(byId('chaos-canvas').attrs['aria-valuenow'],'3.200');byId('chaos-canvas').emit('keydown',{key:'ArrowRight'});flush();assert.equal(byId('chaos-canvas').attrs['aria-valuenow'],'3.210');
go('mandelbrot');assert.equal(byId('mandelbrot-canvas').attrs['aria-busy'],'false');byId('mandel-in').emit('click');flush();assert.equal(byId('mandel-zoom').textContent,'2,0×');byId('mandel-reset').emit('click');flush();assert.equal(byId('mandel-zoom').textContent,'1,0×');
go('skala');byId('scale-more').emit('click');flush();assert.equal(byId('scale-count').textContent,9);byId('scale-less').emit('click');flush();assert.equal(byId('scale-count').textContent,3);
motion.matches=true;byId('scale-more').emit('click');flush();assert.equal(byId('scale-count').textContent,9);
go('innsyn');journey.scrollTop+=height*.48;journey.emit('scroll');flush();assert.equal(active().length,1);assert.equal(active()[0].id,'innsyn');
go('bit');window.visualViewport.height=568;window.emit('resize');flush();assert.equal(height,568);assert.equal(journey.scrollTop,byId('bit').offsetTop);assert.equal(active()[0].id,'bit');
byId('next-scene').emit('click');flush();assert.equal(active()[0].id,'kunnskap');
go('kameraet');byId('next-scene').emit('click');flush();assert.equal(active()[0].id,'entropi');
scope.location.hash='#mandelbrot';window.emit('hashchange');flush();assert.equal(active()[0].id,'mandelbrot');
let selectionBlocked=false,dragBlocked=false;
journey.emit('selectstart',{preventDefault(){selectionBlocked=true;}});journey.emit('dragstart',{preventDefault(){dragBlocked=true;}});
assert.ok(selectionBlocked&&dragBlocked);
assert.ok(!html.includes('class="colophon"'));assert.ok(!/<img|<svg|\.png|\.svg/i.test(html));
assert.deepEqual(scenes.map(scene=>scene.id),['entropi', 'innsida', 'visst', 'bit', 'kunnskap', 'sporet', 'komprimering', 'restbit', 'skala', 'mandelbrot', 'kaos', 'forventning', 'innsyn', 'kameraet']);
assert.ok(html.includes('Når me berre beheld første bit av to uavhengige, jamt fordelte bitar'));
motion.matches=false;
for(const id of ['entropi','innsida','bit','visst','skala','mandelbrot','innsida']){journey.scrollTo({top:byId(id).offsetTop});tick();tick();}
flush();assert.equal(active()[0].id,'innsida');assert.equal(scenes.filter(scene=>scene.classList.contains('is-neighbor')).length,0);
for(const dimensions of [[320,480],[390,720],[844,390]]){[width,window.visualViewport.height]=dimensions;window.innerWidth=width;window.emit('resize');flush();for(const scene of scenes){go(scene.id);const visual=scene.querySelector('.visual'),images=visual.querySelectorAll('img');if(images.length){const fitted=parseFloat(visual.style['--figure-height']);const sum=images.reduce((total,image)=>total+parseFloat(image.style['--artwork-height']),0)+Math.max(0,images.length-1)*(height<=600?12:18);assert.ok(Math.abs(sum-fitted)<.01,'drawings fit their allocated frame');assert.ok((width>=650&&height<=440?Math.max(fitted,125):fitted+125+12)+(height<=600?70:78)<=height,'caption and drawings fit above navigation: '+scene.id+' '+width+'×'+height);}}}

function pointer(canvas,name,x,y,id=1){clock+=16;canvas.emit(name,{pointerId:id,pointerType:'touch',button:0,isPrimary:true,clientX:x,clientY:y,cancelable:true});}
function drag(canvas,start,end,cancel=false){pointer(canvas,'pointerdown',...start);for(let i=1;i<=5;i++){pointer(canvas,'pointermove',start[0]+(end[0]-start[0])*i/5,start[1]+(end[1]-start[1])*i/5);tick();}pointer(canvas,cancel?'pointercancel':'pointerup',...end);flush();}
[width,window.visualViewport.height]=[390,720];window.innerWidth=width;window.emit('resize');flush();
go('komprimering');
const compression=byId('compression-canvas');
drag(compression,[80,140],[300,142]);assert.equal(byId('compression-h').textContent,0);
drag(compression,[300,140],[80,142]);assert.equal(byId('compression-h').textContent,1);
drag(compression,[100,120],[104,310]);assert.equal(byId('compression-h').textContent,1);
drag(compression,[80,140],[300,142],true);assert.equal(byId('compression-h').textContent,0);assert.ok(!compression.classList.contains('is-dragging'));
go('skala');
byId('scale-more').emit('click');tick();byId('scale-less').emit('click');flush();assert.equal(byId('scale-count').textContent,9);
drag(byId('sierpinski-canvas'),[90,140],[240,142]);assert.ok(Number(byId('scale-count').textContent)>9);
go('kaos');
drag(byId('chaos-canvas'),[80,150],[290,152]);assert.ok(Number(byId('chaos-canvas').attrs['aria-valuenow'])>3.5);
const before=byId('chaos-canvas').attrs['aria-valuenow'];drag(byId('chaos-canvas'),[160,120],[163,310]);assert.equal(byId('chaos-canvas').attrs['aria-valuenow'],before);
go('mandelbrot');
const mandel=byId('mandelbrot-canvas');
byId('mandel-reset').emit('click');flush();
pointer(mandel,'pointerdown',220,170);pointer(mandel,'pointerup',220,170);flush();assert.equal(byId('mandel-zoom').textContent,'1,0×');
pointer(mandel,'pointerdown',220,170);pointer(mandel,'pointerup',220,170);flush();assert.equal(byId('mandel-zoom').textContent,'2,0×');
const requests=workerRequests;
pointer(mandel,'pointerdown',200,170);pointer(mandel,'pointermove',230,170);tick();pointer(mandel,'pointermove',260,172);tick();assert.equal(workerRequests,requests);
pointer(mandel,'pointerup',260,172);flush();assert.ok(workerRequests>requests);
byId('mandel-reset').emit('click');flush();
const touches=(a,b)=>[{clientX:a,clientY:180},{clientX:b,clientY:180}];let pinchBlocked=false;
mandel.emit('touchstart',{touches:touches(150,230),cancelable:true,preventDefault(){pinchBlocked=true;}});
const pinchRequests=workerRequests;
mandel.emit('touchmove',{touches:touches(110,270),cancelable:true});tick();assert.equal(workerRequests,pinchRequests);assert.ok(pinchBlocked);
mandel.emit('touchend',{touches:[]});flush();assert.equal(byId('mandel-zoom').textContent,'2,0×');assert.equal(mandel.attrs['aria-busy'],'false');
mandel.emit('touchstart',{touches:touches(150,230),cancelable:true});mandel.emit('touchcancel',{touches:[]});flush();
mandel.emit('keydown',{key:'+'});flush();assert.equal(byId('mandel-zoom').textContent,'4,0×');mandel.emit('keydown',{key:'ArrowLeft'});flush();assert.equal(mandel.attrs['aria-busy'],'false');mandel.emit('keydown',{key:'Home'});flush();assert.equal(byId('mandel-zoom').textContent,'1,0×');
go('innsyn');byId('aperture-hide').emit('click');flush();assert.equal(byId('aperture-canvas').attrs['aria-valuenow'],'100');byId('aperture-canvas').emit('keydown',{key:'Home'});flush();assert.equal(byId('aperture-canvas').attrs['aria-valuenow'],'0');
drag(byId('aperture-canvas'),[80,160],[280,161]);assert.ok(Number(byId('aperture-canvas').attrs['aria-valuenow'])>90);
go('entropi');journey.scrollTo({top:height*.25});flush();assert.equal(active()[0].id,'entropi');assert.equal(byId('entropi').querySelector('.visual').style.opacity,1);assert.ok(byId('innsida').classList.contains('is-neighbor'));
const quarter=byId('entropi').querySelector('.caption').style.opacity;
journey.scrollTo({top:height*.1});flush();assert.ok(byId('entropi').querySelector('.caption').style.opacity>quarter);
journey.scrollTo({top:height*.5});flush();assert.equal(byId('entropi').querySelector('.caption').style.opacity,0);assert.equal(byId('innsida').querySelector('.caption').style.opacity,.45);
journey.scrollTo({top:height});flush();assert.equal(active()[0].id,'innsida');assert.ok(!byId('entropi').classList.contains('is-neighbor'));
go('komprimering');elements.find(el=>el.dataset.compression==='one').emit('click');flush();
pointer(compression,'pointerdown',100,140);pointer(compression,'pointermove',180,141);tick();clock+=200;pointer(compression,'pointerup',180,141);flush();
assert.equal(byId('compression-h').textContent,1);
pointer(compression,'pointerdown',100,140);pointer(compression,'pointermove',290,141);tick();
window.emit('pointerup',{pointerId:1,clientX:290,clientY:141});flush();assert.ok(!compression.classList.contains('is-dragging'));
assert.equal(byId('compression-h').textContent,0);
compression.emit('pointerdown',{pointerId:2,pointerType:'mouse',button:0,buttons:1,clientX:290,clientY:140});
compression.emit('pointermove',{pointerId:2,pointerType:'mouse',buttons:1,clientX:200,clientY:140});tick();
compression.emit('pointermove',{pointerId:2,pointerType:'mouse',buttons:0,clientX:80,clientY:140});flush();assert.ok(!compression.classList.contains('is-dragging'));
go('kunnskap');drag(byId('knowledge-canvas'),[80,150],[290,151]);assert.equal(byId('knowledge-share').textContent,'Prøv på nytt');
drag(byId('knowledge-canvas'),[290,150],[80,151]);assert.equal(byId('knowledge-share').textContent,'Del det du veit');
go('bit');drag(byId('bit-canvas'),[80,150],[290,151]);assert.equal(byId('bit-canvas').attrs['aria-valuenow'],'100');
go('innsyn');byId('aperture-canvas').emit('keydown',{key:'Home'});
for(let i=0;i<13;i++)byId('aperture-canvas').emit('keydown',{key:'ArrowRight'});flush();assert.equal(byId('aperture-state').textContent,'Innsida er skjult');
go('kameraet');byId('form-canvas').emit('keydown',{key:'End'});flush();assert.equal(byId('form-canvas').attrs['aria-valuenow'],'100');drag(byId('form-canvas'),[280,140],[80,141]);assert.ok(Number(byId('form-canvas').attrs['aria-valuenow'])<100);
width=430;window.innerWidth=width;window.emit('resize');flush();assert.ok(parseFloat(byId('kameraet').querySelector('.visual').style['--figure-height'])>0);assert.equal(active()[0].id,'kameraet');
go('mandelbrot');byId('mandel-in').emit('click');tick();const stopped=workersStopped;
document.hidden=true;document.emit('visibilitychange');flush();assert.ok(workersStopped>stopped);
const hiddenRequests=workerRequests;tick();tick();assert.equal(workerRequests,hiddenRequests);assert.equal(frames.size,0);
document.hidden=false;document.emit('visibilitychange');flush();assert.equal(active()[0].id,'mandelbrot');assert.equal(mandel.attrs['aria-busy'],'false');assert.ok(workerRequests>hiddenRequests);
go('komprimering');window.emit('pagehide');flush();assert.ok([...window.FormNerdExperiments.values()].every(surface=>!surface.active));
assert.equal(scope.location.hash,'#komprimering');window.emit('pageshow',{persisted:true});flush();assert.equal(active()[0].id,'komprimering');assert.ok(window.FormNerdExperiments.get('komprimering').active);
go('forventning');elements.find(el=>el.dataset.expectation==='0.9').emit('click');flush();
assert.equal(byId('expectation-total').textContent,'1,737');assert.equal(byId('expectation-parts').textContent,'1 bit uvisse + 0,737 bit modellavvik (KL).');
elements.find(el=>el.dataset.expectation==='0.5').emit('click');flush();assert.equal(byId('expectation-total').textContent,'1,000');
drag(byId('expectation-canvas'),[80,140],[280,141]);assert.equal(byId('expectation-canvas').attrs['aria-valuenow'],'5');
byId('expectation-canvas').emit('keydown',{key:'Home'});flush();assert.equal(byId('expectation-canvas').attrs['aria-valuenow'],'5');
byId('expectation-canvas').emit('keydown',{key:'ArrowRight'});flush();assert.equal(byId('expectation-canvas').attrs['aria-valuenow'],'6');
go('sporet');byId('evidence-reveal').emit('click');flush();assert.equal(byId('evidence-h').textContent,'0,811');assert.equal(byId('evidence-reveal').textContent,'Før sporet');
assert.ok(byId('evidence-canvas').attrs['aria-label'].includes('A 75 prosent, B 25 prosent'));
byId('evidence-reveal').emit('click');tick();byId('evidence-reveal').emit('click');flush();assert.equal(byId('evidence-h').textContent,'0,811');
drag(byId('evidence-canvas'),[280,140],[80,141]);assert.equal(byId('evidence-h').textContent,'1,000');
byId('evidence-reveal').emit('click');tick();go('innsyn');go('sporet');assert.equal(byId('evidence-h').textContent,'0,811');
for(const fraction of [0,.2,.35,.5,.65,.8,1,.8,.5,.2,0]){
  journey.scrollTo({top:height*fraction});flush();
  assert.ok(active()[0].querySelector('.caption').style.opacity>=.45);
}
go('entropi');const openingSurface=window.FormNerdExperiments.get('entropi'),drawing=openingSurface.ctx;drawing.recording=true;
for(let step=0;step<=20;step++){
  drawing.records.length=0;openingSurface.scrub('entropi','innsida',step/20);flush();
  const branches=drawing.records.some(r=>r.method==='fillText'&&['001','010','111'].includes(r.args[0])&&r.alpha>.001);
  const eye=drawing.records.some(r=>r.method==='quadraticCurveTo'&&r.alpha>.001);
  assert.ok(!(branches&&eye),'the observer and possible answers never overlap visibly');
}
drawing.recording=false;
console.log('PASS: discoverable gesture cues wait for the settled scene, stay quiet after use, respect reduced motion, stop offscreen, and never change model values; direct split dragging follows the finger; animated presets interpolate; nonoverlapping observer transition, cross entropy, Bayesian evidence, continuously readable transition captions, probability, weighted surprise, knowledge sharing, lifecycle suspension, position restoration, width-only resize, stale flick prevention and 14 scenes, top sizing, reversible scroll transitions, selection prevention, navigation, resize, reduced motion, direction locking, cancelled drags, compression, interrupted refinement, chaos, double tap, pan, anchored pinch, bounded worker requests and aperture depth. Mock DOM only; no browser layout assertion.');
