const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Target{
  constructor(dataset={}){this.dataset=dataset;this.attributes={};this.listeners={};}
  addEventListener(name,callback){(this.listeners[name]??=[]).push(callback);}
  dispatchEvent(event){for(const callback of this.listeners[event.type]||[])callback(event);}
  setAttribute(name,value){this.attributes[name]=value;}
  removeAttribute(name){delete this.attributes[name];}
}

function setup(){
  const host=new Target(),hint=new Target();
  const links=['a11','canon','a8','a9','a10'].map(model=>new Target({model}));
  const document=new Target();
  document.querySelector=selector=>selector==='#studio-root'?host:hint;
  document.querySelectorAll=()=>links;
  const window=new Target();
  window.matchMedia=()=>({matches:true});
  const location={pathname:'/kamera',origin:'https://formnerd.iverfinne.no',href:'https://formnerd.iverfinne.no/kamera',assign(path){this.assigned=path;}};
  const renders=[],history=[];
  const deferred=[];
  const React={Component:class{},createElement:(type,props,...children)=>({type,props,children})};
  const context={document,window,location,history:{pushState(state,title,path){history.push(path);location.pathname=path;}},getReact:()=>React,getDOM:()=>({createRoot:()=>({render:node=>renders.push(node)})}),URL,Promise,setTimeout:callback=>{callback();},requestAnimationFrame:callback=>{callback();},loadModule:path=>new Promise((resolve,reject)=>deferred.push({path,resolve:()=>resolve({default:path}),reject}))};
  vm.createContext(context);
  const source=fs.readFileSync('public/studio/studio.js','utf8').replace(/^import[^\n]+\n/,'').replaceAll('import(','loadModule(');
  vm.runInContext(source,context);
  const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
  return {host,hint,links,document,window,location,renders,history,deferred,tick};
}

test('studio models share history, selected navigation and return route',async()=>{
  const s=setup();s.deferred[0].resolve();await s.tick();
  assert.equal(s.links[0].attributes['aria-current'],'page');
  assert.equal(s.renders.at(-1).children[0].props.variant,'a11');
  s.window.dispatchEvent({type:'studio:navigate',detail:'/canon50mm'});
  s.deferred[1].resolve();await s.tick();
  assert.deepEqual(s.history,['/canon50mm']);
  assert.equal(s.links[1].attributes['aria-current'],'page');
  assert.equal(s.renders.at(-1).children[0].type,'./vendor/lens-page.js');
  s.window.dispatchEvent({type:'studio:navigate',detail:'/a8'});
  s.deferred[2].resolve();await s.tick();
  assert.equal(s.renders.at(-1).children[0].props.variant,'a8');
  s.window.dispatchEvent({type:'studio:navigate',detail:'/a9'});
  s.deferred[3].resolve();await s.tick();
  assert.equal(s.links[3].attributes['aria-current'],'page');
  assert.equal(s.renders.at(-1).children[0].props.variant,'a9');
  s.window.dispatchEvent({type:'studio:navigate',detail:'/a10'});
  s.deferred[4].resolve();await s.tick();
  assert.equal(s.links[4].attributes['aria-current'],'page');
  assert.equal(s.renders.at(-1).children[0].props.variant,'a10');
  s.location.pathname='/canon50mm';s.window.dispatchEvent({type:'popstate'});
  s.deferred[5].resolve();await s.tick();
  assert.equal(s.history.length,4);
  assert.equal(s.links[1].attributes['aria-current'],'page');
  s.window.dispatchEvent({type:'keydown',key:'Escape'});
  assert.equal(s.location.assigned,'/#kameraet');
});

test('late model loads do not replace the latest selection',async()=>{
  const s=setup();
  s.window.dispatchEvent({type:'studio:navigate',detail:'/canon50mm'});
  s.deferred[1].resolve();await s.tick();s.deferred[0].resolve();await s.tick();
  assert.equal(s.renders.length,1);
  assert.equal(s.renders[0].children[0].type,'./vendor/lens-page.js');
  assert.deepEqual(s.history,['/canon50mm']);
});

test('load errors are recoverable and wheel scrolling is separated from pinch zoom',async()=>{
  const s=setup();s.deferred[0].reject(new Error('offline'));await s.tick();
  assert.equal(s.host.attributes['aria-busy'],'false');
  assert.equal(s.renders.at(-1).props.role,'alert');
  let blocked=0;
  s.host.dispatchEvent({type:'wheel',ctrlKey:false,metaKey:false,stopPropagation(){blocked++;}});
  s.host.dispatchEvent({type:'wheel',ctrlKey:true,metaKey:false,stopPropagation(){blocked++;}});
  assert.equal(blocked,1);
});

test('all studio imports and asset routes resolve inside the combined build',()=>{
  const path=require('node:path');
  const vendor='public/studio/vendor';
  for(const file of fs.readdirSync(vendor).filter(name=>name.endsWith('.js'))){
    const source=fs.readFileSync(path.join(vendor,file),'utf8');
    for(const match of source.matchAll(/(?:from|import\()\s*["'`]((?:\.\.?\/)[^"'`]+)["'`]/g))assert.ok(fs.existsSync(path.resolve(vendor,match[1])),`${file}: ${match[1]}`);
    assert.ok(!source.includes('from"./index-Da53m1MG.js"'));
  }
  const index=fs.readFileSync('public/index.html','utf8');
  assert.match(index,/href="\/kamera"/);
  assert.doesNotMatch(index,/<dialog|viewer\.js|<img|<svg/i);
  const assets=JSON.parse(fs.readFileSync('studio-assets.json'));
  for(const asset of assets)assert.ok(fs.statSync(path.join('dist',asset.path)).size===asset.bytes,asset.path);
  for(const [file,expected] of Object.entries({
    'models/a9-r03.glb':'d80a20ad7b95ad64a0da63c79f23ab14c02534718927fc3b4c3afcdad9c13217',
    'camera/A10_REV_B_studio.glb':'c7c903dcbf7a775b2cf509dc81b4e131840b1b21cb30cced9860578141e98694'
  })){
    const actual=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join('dist',file))).digest('hex');
    assert.equal(actual,expected,file);
  }
});
