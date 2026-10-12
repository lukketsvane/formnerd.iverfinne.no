const stageButtons=[...document.querySelectorAll('[data-stage]')];
const panels=[...document.querySelectorAll('[data-panel]')];

for(const button of stageButtons){
  button.addEventListener('click',()=>{
    for(const item of stageButtons)item.setAttribute('aria-pressed',String(item===button));
    for(const panel of panels)panel.hidden=panel.dataset.panel!==button.dataset.stage;
  });
}

const views={
  front:{textured:'a15-06-front.png',mesh:'a15-03-front.png',name:'skrått framanfrå'},
  rear:{textured:'a15-06-rear.png',mesh:'a15-03-rear.png',name:'skrått bakfrå'}
};
const viewButtons=[...document.querySelectorAll('[data-view]')];
const textured=document.querySelector('#textured-view');
const mesh=document.querySelector('#mesh-view');

for(const button of viewButtons){
  button.addEventListener('click',()=>{
    const view=views[button.dataset.view];
    for(const item of viewButtons)item.setAttribute('aria-pressed',String(item===button));
    textured.src=`/a15/assets/${view.textured}`;
    textured.alt=`Teksturert A15_06-kjeldemodell sett ${view.name}.`;
    mesh.src=`/a15/assets/${view.mesh}`;
    mesh.alt=`Grå A15_03-kjeldemodell sett ${view.name}.`;
  });
}
