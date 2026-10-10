import {i as getReact,t as getDOM} from './vendor/framework-D_rUT4EX.js';

const React=getReact();
const host=document.querySelector('#studio-root');
const root=getDOM().createRoot(host);
const routes={'/kamera':{key:'a11',title:'A11',load:()=>import('./vendor/camera-page.js')},'/a8':{key:'a8',title:'A8',load:()=>import('./vendor/camera-page.js')},'/canon50mm':{key:'canon',title:'Canon 50 mm',load:()=>import('./vendor/lens-page.js')}};
const hint=document.querySelector('#studio-gesture');
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let generation=0,current='',mounted=false;

class StudioBoundary extends React.Component{
  constructor(props){super(props);this.state={failed:false};}
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?React.createElement('div',{className:'studio-loading',role:'alert'},'Kamerastudioet kunne ikkje starte.',React.createElement('a',{href:location.pathname},'Prøv på nytt'),React.createElement('a',{href:'/#kameraet'},'Tilbake til forteljinga')):this.props.children;}
}

async function navigate(path,push=false){
  const route=routes[path];
  if(!route||path===current)return;
  const id=++generation;
  host.setAttribute('aria-busy','true');
  if(mounted)host.dataset.transition='out';
  try{
    const [module]=await Promise.all([route.load(),new Promise(resolve=>setTimeout(resolve,mounted&&!reduced.matches?160:0))]);
    if(id!==generation)return;
    if(push)history.pushState({studio:true},'',path);
    current=path;
    document.title=`FormNerd · ${route.title}`;
    document.querySelectorAll('[data-model]').forEach(link=>{
      if(link.dataset.model===route.key)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    hint.dataset.dismissed='false';
    hint.textContent='Dra sidelengs for å rotere · Sveip opp for å opne · Knip for å zoome';
    root.render(React.createElement(StudioBoundary,{key:path},React.createElement(module.default,{variant:route.key})));
    mounted=true;
    requestAnimationFrame(()=>{if(id===generation){host.dataset.transition='in';host.setAttribute('aria-busy','false');}});
  }catch{
    if(id!==generation)return;
    host.dataset.transition='in';
    host.setAttribute('aria-busy','false');
    root.render(React.createElement('div',{className:'studio-loading',role:'alert'},'Kamerastudioet kunne ikkje lastast.',React.createElement('a',{href:path},'Prøv på nytt'),React.createElement('a',{href:'/#kameraet'},'Tilbake til forteljinga')));
  }
}

document.addEventListener('click',event=>{
  const link=event.target.closest('a');
  if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank')return;
  const url=new URL(link.href,location.href);
  if(url.origin===location.origin&&routes[url.pathname]){event.preventDefault();navigate(url.pathname,true);}
});
host.addEventListener('pointerdown',()=>{hint.dataset.dismissed='true';},{passive:true});
host.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)event.stopPropagation();},{capture:true,passive:true});
document.addEventListener('selectstart',event=>event.preventDefault());
window.addEventListener('studio:navigate',event=>navigate(event.detail,true));
window.addEventListener('popstate',()=>navigate(location.pathname));
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!event.defaultPrevented)location.assign('/#kameraet');
});
navigate(routes[location.pathname]?location.pathname:'/kamera');
