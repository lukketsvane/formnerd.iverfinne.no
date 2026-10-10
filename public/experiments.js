(() => {
  const M = EntropyModels;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const controllers = new Map();
  const number = (value, digits = 0) => value.toFixed(digits).replace('.', ',');
  const white = '#f4f4f2';
  const gray = '#969694';
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  class Surface {
    constructor(id) {
      this.scene = document.getElementById(id);
      this.canvas = this.scene.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.active = false;
      this.frame = 0;
      this.animation = 0;
      this.finishAnimation = null;
      this.cue = this.scene.querySelector('.gesture-cue');
      this.cueAnimation = null;
      this.cuePlayed = false;
      this.discovered = false;
      this.draw = () => {};
      controllers.set(id, this);
      new ResizeObserver(() => this.requestDraw()).observe(this.canvas);
      this.scene.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>this.engage()));
      this.canvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','+','=','-'].includes(event.key))this.engage();});
    }
    setActive(active) {
      if (this.active === active) return;
      this.active = active;
      if (active) this.requestDraw();
      else {this.present(false);this.cancelGesture?.();this.stopAnimation(true);cancelAnimationFrame(this.frame);this.frame=0;this.sleep?.();}
    }
    present(present) {
      if(!this.cue)return;
      if(!present || motion.matches || this.discovered) {
        this.cueAnimation?.cancel();this.cueAnimation=null;return;
      }
      if(this.cuePlayed || this.cueAnimation)return;
      const kind=this.cue.dataset.gesture;
      const transforms=kind==='tap'?['scale(1)','scale(.65)','scale(1.35)','scale(1)']:kind==='zoom'?['scale(1)','scale(.8)','scale(1.45)','scale(1)']:['translateX(0)','translateX(-9px)','translateX(9px)','translateX(0)'];
      this.cueAnimation=this.cue.querySelector('.gesture-motion').animate(transforms.map(transform=>({transform})),{duration:1400,delay:550,easing:'ease-in-out',iterations:1});
      this.cueAnimation.onfinish=()=>{this.cuePlayed=true;this.cueAnimation=null;};
    }
    engage() {
      this.discovered=true;this.present(false);this.cue?.classList.add('is-learned');
    }
    dragging(value) {
      this.cue?.classList.toggle('is-engaged',value);
      if(value)this.engage();
    }
    cueText(text) {
      const label=this.cue?.querySelector('.gesture-label');
      if(label)label.textContent=text;
    }
    requestDraw() {
      if (!this.active || document.hidden || this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        if (!this.active || document.hidden) return;
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.round(rect.width), h = Math.round(rect.height);
        if (w < 1 || h < 1) return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
          this.canvas.width = Math.round(w * dpr);
          this.canvas.height = Math.round(h * dpr);
        }
        const ctx = this.ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.lineWidth = 1;
        ctx.strokeStyle = ctx.fillStyle = white;
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.draw(ctx, w, h);
      });
    }
    tween(step, duration = 450) {
      this.stopAnimation();
      if (motion.matches || !this.active) {step(1); this.requestDraw(); return;}
      this.finishAnimation=()=>step(1);
      const start = performance.now();
      const tick = now => {
        const t = motion.matches ? 1 : Math.min(1, (now - start) / duration);
        step(t * t * (3 - 2 * t));
        this.requestDraw();
        if (t < 1 && this.active) this.animation = requestAnimationFrame(tick);
        else {this.animation=0;this.finishAnimation=null;step(1);this.requestDraw();}
      };
      this.animation = requestAnimationFrame(tick);
    }
    stopAnimation(finish=false) {
      cancelAnimationFrame(this.animation);this.animation=0;
      const last=this.finishAnimation;this.finishAnimation=null;
      if(finish)last?.();
    }
  }
  function horizontalGesture(surface, handlers) {
    const canvas=surface.canvas;
    let pointer=null;
    function finish(event,cancelled=false) {
      if (!pointer || event && event.pointerId!==pointer.id) return;
      const last=pointer;pointer=null;
      if(cancelled || performance.now()-last.time>100){last.vx=0;last.vy=0;}
      canvas.classList.remove('is-dragging');
      surface.dragging(false);
      if (canvas.hasPointerCapture?.(last.id)) canvas.releasePointerCapture(last.id);
      if (last.locked) handlers.end?.(last,cancelled);
      else if (!cancelled && !last.native && event && Math.hypot(event.clientX-last.x,event.clientY-last.y)<8 && handlers.tap) {if(canvas.id!=='mandelbrot-canvas')surface.engage();handlers.tap(event);}
    }
    canvas.addEventListener('pointerdown',event=>{
      if (!surface.active || event.isPrimary===false || event.button>0 || handlers.blocked?.()) return;
      if (event.pointerType==='touch' && (event.clientX<22 || event.clientX>window.innerWidth-22)) return;
      finish(null,true);
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0,vx:0,vy:0,time:performance.now(),locked:false,native:false};
    });
    canvas.addEventListener('pointermove',event=>{
      if (!pointer || pointer.id!==event.pointerId || pointer.native) return;
      if(event.pointerType==='mouse' && event.buttons===0){finish(event,true);return;}
      const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      const now=performance.now(),dt=Math.max(8,now-pointer.time);
      if (!pointer.locked) {
        if (Math.hypot(dx,dy)<7) return;
        if (Math.abs(dy)>Math.abs(dx)*1.1) {pointer.native=true;return;}
        if (Math.abs(dx)<Math.abs(dy)*1.15) return;
        pointer.locked=true;canvas.setPointerCapture(event.pointerId);canvas.classList.add('is-dragging');
        surface.dragging(true);
        handlers.start?.(pointer);
      }
      pointer.vx=pointer.vx*.4+(dx-pointer.dx)/dt*.6;
      pointer.vy=pointer.vy*.4+(dy-pointer.dy)/dt*.6;
      Object.assign(pointer,{dx,dy,time:now});
      handlers.move?.(pointer,event);
      if (event.cancelable) event.preventDefault();
    },{passive:false});
    canvas.addEventListener('pointerup',event=>finish(event));
    canvas.addEventListener('pointercancel',event=>finish(event,true));
    canvas.addEventListener('lostpointercapture',event=>finish(event,true));
    window.addEventListener('pointerup',event=>finish(event));
    window.addEventListener('pointercancel',event=>finish(event,true));
    const cancel=()=>finish(null,true);
    window.addEventListener('blur',cancel);
    surface.cancelGesture=cancel;
    return cancel;
  }
  const conceptStates = {
    entropi: {source:[.5,.37,.29,'?',1], branches:[[.2,.78,.09,'001',0],[.5,.78,.09,'010',0],[.8,.78,.09,'111',0]], eye:1, note:'det me ser'},
    innsida: {source:[.5,.25,.18,'?',1], branches:[[.18,.75,.11,'001',1],[.5,.75,.11,'010',1],[.82,.75,.11,'111',1]], eye:0, note:'moglege innsider'},
    visst: {source:[.5,.25,.18,'',1], branches:[[.5,.75,.12,'0',1],[.5,.75,.12,'',0],[.82,.75,.11,'',0]], eye:0, note:'100 %'},
    bit: {source:[.5,.25,.18,'?',1], branches:[[.25,.75,.12,'0',1],[.75,.75,.12,'1',1],[.82,.75,.11,'',0]], eye:0, note:'50 % kvar'}
  };
  let probability=.5,revealed=null,revealPulse=1;
  const blendNode = (a,b,t) => a.map((v,i)=>i===3?b[i]:v+(b[i]-v)*t);
  Object.entries(conceptStates).forEach(([id,initial]) => {
    const surface = new Surface(id);
    surface.morphGroup = 'concept';
    let from=initial,state=initial,blend=1;
    surface.scrub=(fromId,toId,amount)=>{
      from=conceptStates[fromId]||initial;state=conceptStates[toId]||initial;blend=amount;
      surface.requestDraw();
    };
    surface.draw = (ctx,w,h) => {
      const unit = Math.min(w,h*(h<220?.8:1));
      const source = blendNode(from.source,state.source,blend);
      const branches = state.branches.map((node,i)=>blendNode(from.branches[i],node,blend));
      const eyeLevel=from.eye+(state.eye-from.eye)*blend;
      if(from.eye || state.eye)branches.forEach(node=>{node[4]*=clamp((.65-eyeLevel)/.65,0,1);});
      branches.forEach((node,i)=>{
        const before=from.branches[i][3].length>1?14:0,after=state.branches[i][3].length>1?14:0;
        node[2]=Math.max(node[2],(before+(after-before)*blend)/unit);
      });
      const largest=Math.max(...branches.map(node=>node[4]>.001?node[2]:0))*unit;
      branches.forEach(node=>{node[1]=Math.min(node[1],(h-largest-28)/h);});
      const sx=source[0]*w,sy=source[1]*h,sr=source[2]*unit;
      ctx.lineWidth=1.5;
      branches.forEach(node=>{
        const [x,y,r,,alpha]=node;
        ctx.globalAlpha=alpha;ctx.strokeStyle='#777775';ctx.beginPath();
        const start=sy+sr,end=y*h-r*unit,handle=Math.max(0,Math.min(28,(end-start)*.45));
        ctx.moveTo(sx,start);ctx.bezierCurveTo(sx,start+handle,x*w,end-handle,x*w,end);ctx.stroke();
      });
      const nodes=[source,...branches],oldNodes=[from.source,...from.branches],newNodes=[state.source,...state.branches];
      nodes.forEach((node,i)=>{
        const [x,y,r,,alpha]=node,px=x*w,py=y*h,radius=r*unit;
        ctx.globalAlpha=alpha;ctx.fillStyle='#000';ctx.strokeStyle=white;
        ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.font=Math.max(12,Math.min(i===0?40:24,radius*.62))+'px monospace';ctx.fillStyle=white;
        const labelY=i && radius<7?py+radius+11:py;
        if(oldNodes[i][3]!==newNodes[i][3]){ctx.globalAlpha=alpha*(1-blend);ctx.fillText(oldNodes[i][3],px,labelY);ctx.globalAlpha=alpha*blend;}
        ctx.fillText(newNodes[i][3],px,labelY);
      });
      if(id==='bit' && revealed!==null) {
        const node=branches[revealed];
        const travel=clamp(revealPulse/.65,0,1),pulse=clamp((revealPulse-.65)/.35,0,1);
        const endY=node[1]*h-node[2]*unit,handle=Math.max(0,Math.min(28,(endY-sy-sr)*.45));
        const a=1-travel,px=a*a*a*sx+3*a*a*travel*sx+3*a*travel*travel*node[0]*w+travel**3*node[0]*w;
        const py=a**3*(sy+sr)+3*a*a*travel*(sy+sr+handle)+3*a*travel*travel*(endY-handle)+travel**3*endY;
        if(travel<1){ctx.globalAlpha=1;ctx.fillStyle=white;ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.fill();}
        ctx.globalAlpha=travel===1?.5+.5*(1-pulse):0;ctx.strokeStyle=white;ctx.lineWidth=2;ctx.beginPath();
        ctx.arc(node[0]*w,node[1]*h,node[2]*unit+5+pulse*5,0,Math.PI*2);ctx.stroke();
      }
      const eye=clamp((eyeLevel-.65)/.35,0,1);
      ctx.globalAlpha=eye;ctx.strokeStyle=white;ctx.fillStyle=white;
      const ey=h*.82,ex=w*.5,er=Math.min(w*.07,h*.045);
      ctx.beginPath();ctx.moveTo(ex-er*1.6,ey);ctx.quadraticCurveTo(ex,ey-er*1.6,ex+er*1.6,ey);ctx.quadraticCurveTo(ex,ey+er*1.6,ex-er*1.6,ey);ctx.stroke();
      ctx.beginPath();ctx.arc(ex,ey,er*.48,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#777775';ctx.beginPath();ctx.moveTo(sx,sy+sr+10);ctx.lineTo(ex,ey-er-12);ctx.stroke();
      const note=blend<.5?from:state;
      ctx.globalAlpha=from===state?1:Math.abs(blend-.5)*2;ctx.font='13px Arial';ctx.fillStyle=gray;
      ctx.fillText(note.note,w*.5,Math.min(h-12,note.eye?ey+er*2.5:Math.max(...branches.map(node=>node[1]*h+(node[4]>.001?node[2]*unit:0)))+22));
      ctx.globalAlpha=1;
    };
  });
  const bit=controllers.get('bit');
  let probabilityStart=.5;
  function setProbability(value) {
    probability=Math.round(clamp(value,0,1)*100)/100;revealed=null;
    const p=probability,q=1-p,state=conceptStates.bit;
    state.source[3]=p===0?'0':p===1?'1':'?';
    state.branches[0][2]=.12*Math.sqrt(2*q);state.branches[0][4]=q>0?1:0;
    state.branches[1][2]=.12*Math.sqrt(2*p);state.branches[1][4]=p>0?1:0;
    state.note=number(q*100)+' %  ·  '+number(p*100)+' %';
    const entropy=M.binaryEntropy(p);
    document.getElementById('bit-h').textContent=number(entropy,entropy===0 || entropy===1?0:3);
    document.getElementById('bit-copy').textContent=p===0 || p===1?'Eitt svar er sikkert. Ingen uvisse står att.':p===.5?'To like sannsynlege svar. Størst uvisse før svaret.':'Same to svar. Men det eine er meir venta.';
    document.getElementById('bit-result').textContent='Entropi er overraskinga i gjennomsnitt.';
    document.querySelectorAll('[data-probability]').forEach(button=>button.setAttribute('aria-pressed',String(Math.abs(Number(button.dataset.probability)-p)<.005)));
    bit.canvas.setAttribute('aria-valuenow',Math.round(p*100));
    bit.canvas.setAttribute('aria-valuetext',number(p*100)+' prosent for 1; '+number(entropy,3)+' bit i snitt');
    bit.requestDraw();
  }
  function revealBit() {
    bit.stopAnimation();revealed=Math.random()<probability?1:0;
    const p=revealed?probability:1-probability;
    conceptStates.bit.source[3]=String(revealed);
    const surprise=M.surprisal(p);
    document.getElementById('bit-result').textContent='Dette svaret: '+revealed+' → '+number(surprise,surprise%1?3:0)+' bit.';
    revealPulse=0;
    bit.tween(t=>{revealPulse=t;},560);
  }
  document.querySelectorAll('[data-probability]').forEach(button=>button.addEventListener('click',()=>{
    const from=probability,to=Number(button.dataset.probability);
    bit.tween(t=>setProbability(from+(to-from)*t),380);
  }));
  document.getElementById('bit-reveal').addEventListener('click',revealBit);
  bit.canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    bit.stopAnimation();
    setProbability(event.key==='Home'?0:event.key==='End'?1:probability+(event.key==='ArrowRight'?.01:-.01));
  });
  horizontalGesture(bit,{
    start(){bit.stopAnimation();probabilityStart=probability;},
    move(gesture){setProbability(probabilityStart+gesture.dx/(bit.canvas.getBoundingClientRect().width*.7));},
    tap:revealBit
  });
  const expectation=new Surface('forventning');
  let expected=.5,expectedStart=.5;
  function setExpectation(value) {
    expected=Math.round(clamp(value,.05,.95)*100)/100;
    const total=M.binaryCrossEntropy(.5,expected),deviation=Math.max(0,total-1);
    document.getElementById('expectation-total').textContent=number(total,3);
    document.getElementById('expectation-parts').textContent='1 bit uvisse + '+number(deviation,3)+' bit modellavvik (KL).';
    document.getElementById('expectation-copy').textContent=expected===.5?'Modellen kjenner sjansane. Neste svar er framleis uvisst.':'Forventninga bommar på sjansane. Grunnuvissa er den same.';
    expectation.canvas.setAttribute('aria-valuenow',Math.round(expected*100));
    expectation.canvas.setAttribute('aria-valuetext',number(expected*100)+' prosent for 1; kryssentropi '+number(total,3)+' bit');
    document.querySelectorAll('[data-expectation]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.expectation)===expected)));
    expectation.requestDraw();
  }
  function expect(value) {
    const from=expected;
    expectation.tween(t=>setExpectation(from+(value-from)*t),320);
  }
  expectation.draw=(ctx,w,h)=>{
    const left=12,right=w-12,range=right-left,bar=Math.min(18,Math.max(6,h*.06));
    const compact=h<140,font=compact?11:13,offset=compact?12:18;
    ctx.font=font+'px Arial';
    [[.5,h*.24,'faktiske sjansar · p'],[expected,h*.70,'modellen ventar · q']].forEach(([p,y,label])=>{
      const cut=left+range*(1-p);
      ctx.fillStyle=gray;ctx.textAlign='center';ctx.fillText(label,w*.5,y-offset);
      ctx.fillStyle=white;ctx.fillRect(left,y,cut-left,bar);
      ctx.fillStyle='#666664';ctx.fillRect(cut,y,right-cut,bar);
      ctx.fillStyle='#000';ctx.fillRect(cut-.5,y,1,bar);
      if(label.endsWith('q')){
        ctx.fillStyle='#000';ctx.strokeStyle=white;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(cut,y+bar/2,Math.max(8,bar*.65),0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle=white;ctx.beginPath();ctx.arc(cut,y+bar/2,2,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle=white;ctx.textAlign='left';ctx.fillText('0 · '+number((1-p)*100)+' %',left,Math.min(h-8,y+bar+offset));
      ctx.fillStyle=gray;ctx.textAlign='right';ctx.fillText('1 · '+number(p*100)+' %',right,Math.min(h-8,y+bar+offset));
    });
    ctx.textAlign='center';
  };
  document.querySelectorAll('[data-expectation]').forEach(button=>button.addEventListener('click',()=>expect(Number(button.dataset.expectation))));
  expectation.canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();expectation.stopAnimation();
    setExpectation(event.key==='Home'?.05:event.key==='End'?.95:expected+(event.key==='ArrowRight'?.01:-.01));
  });
  horizontalGesture(expectation,{
    start(){expectation.stopAnimation();expectedStart=expected;},
    move(gesture){setExpectation(expectedStart-gesture.dx/(expectation.canvas.getBoundingClientRect().width-24));}
  });
  const evidence=new Surface('sporet');
  let evidenceAmount=0,evidenceShown=false,evidenceStart=0;
  const posterior=M.bayesBinary(.5,.75,.25);
  function describeEvidence() {
    const p=.5+(posterior-.5)*evidenceAmount;
    document.getElementById('evidence-h').textContent=number(M.binaryEntropy(p),3);
    evidence.canvas.setAttribute('aria-label','Før sporet: A og B har 50 prosent kvar. Etter sporet: A '+number(p*100)+' prosent, B '+number((1-p)*100)+' prosent.');
  }
  function revealEvidence(value) {
    const from=evidenceAmount;evidenceShown=value;
    document.getElementById('evidence-reveal').textContent=value?'Før sporet':'Vis sporet';
    document.getElementById('evidence-copy').textContent=value?'Sporet peikar mot A. B er framleis mogleg.':'To innsider passar like godt. Sjå kva eitt spor kan endre.';
    evidence.cueText(value?'Trykk for å sjå før sporet':'Trykk på figuren for å vise sporet');
    evidence.tween(t=>{evidenceAmount=from+(Number(value)-from)*t;describeEvidence();},560);
  }
  evidence.draw=(ctx,w,h)=>{
    const compact=h<180,p=.5+(posterior-.5)*evidenceAmount,probabilities=[p,1-p];
    const radius=compact?Math.min(14,h*.115):Math.min(w*.12,h*.105),mid=h*.47,crescent=Math.min(w*.06,h*.10);
    const before=compact?[[w*.12,h*.32],[w*.12,h*.76]]:[[w*.25,h*.16],[w*.75,h*.16]];
    const after=compact?[[w*.70,h*.32],[w*.70,h*.76]]:[[w*.25,h*.76],[w*.75,h*.76]];
    ctx.strokeStyle='#626260';ctx.lineWidth=1;
    before.forEach(([x,y],i)=>{
      const [ax,ay]=after[i],r=radius*Math.sqrt(2*probabilities[i]);
      ctx.beginPath();
      if(compact){ctx.moveTo(w*.38,y);ctx.quadraticCurveTo(w*.43,y,w*.47,mid);}
      else{ctx.moveTo(x,y+radius+22);ctx.bezierCurveTo(x,mid-h*.10,w*.5,mid-h*.12,w*.5,mid-crescent);}
      ctx.stroke();ctx.beginPath();
      if(compact){ctx.moveTo(w*.55,mid);ctx.quadraticCurveTo(w*.61,ay,ax-r,ay);}
      else{ctx.moveTo(w*.5,mid+crescent);ctx.bezierCurveTo(w*.5,mid+h*.15,ax,ay-r-h*.1,ax,ay-r);}
      ctx.stroke();
    });
    ctx.globalAlpha=.12+.88*evidenceAmount;ctx.fillStyle=white;ctx.beginPath();
    ctx.moveTo(w*.5-crescent*.35,mid-crescent);ctx.bezierCurveTo(w*.5+crescent*1.5,mid-crescent*.65,w*.5+crescent*1.5,mid+crescent*.65,w*.5-crescent*.35,mid+crescent);ctx.bezierCurveTo(w*.5+crescent*.7,mid+crescent*.4,w*.5+crescent*.7,mid-crescent*.4,w*.5-crescent*.35,mid-crescent);ctx.fill();ctx.globalAlpha=1;
    before.forEach(([x,y],i)=>{
      [[x,y,radius,.5],[...after[i],radius*Math.sqrt(2*probabilities[i]),probabilities[i]]].forEach(([nx,ny,r,chance],row)=>{
        ctx.strokeStyle=white;ctx.fillStyle='#000';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(nx,ny,r,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle=white;ctx.font=Math.max(12,Math.min(28,r*.8))+'px Arial';ctx.fillText(i?'B':'A',nx,ny);
        ctx.fillStyle=gray;ctx.font='12px Arial';ctx.fillText(number(chance*100)+' %',compact?w*(row?.88:.30):nx,compact?ny:Math.min(h-8,ny+r+14));
      });
    });
    ctx.fillStyle=gray;ctx.font='12px Arial';ctx.fillText('før',w*(compact?.22:.5),compact?8:h*.16);ctx.fillText('etter',w*(compact?.79:.5),compact?8:h*.76);
  };
  document.getElementById('evidence-reveal').addEventListener('click',()=>revealEvidence(!evidenceShown));
  horizontalGesture(evidence,{
    start(){evidence.stopAnimation();evidenceStart=evidenceAmount;},
    move(gesture){evidenceAmount=clamp(evidenceStart+gesture.dx/(evidence.canvas.getBoundingClientRect().width*.55),0,1);describeEvidence();evidence.requestDraw();},
    end(){revealEvidence(evidenceAmount>=.5);},
    tap(){revealEvidence(!evidenceShown);}
  });
  const knowledge=new Surface('kunnskap');
  let shared=0,knows=false,shareStart=0;
  function shareKnowledge(value) {
    const from=shared;knows=value;
    document.getElementById('knowledge-share').textContent=knows?'Prøv på nytt':'Del det du veit';
    document.getElementById('knowledge-copy').textContent=knows?'Same spor. No kjenner begge svaret.':'Same spor. Ulik uvisse med ulik forkunnskap.';
    knowledge.canvas.setAttribute('aria-label',knows?'Sporet er delt. Begge observatørane veit at svaret er 0. Ingen uvisse står att.':'Same spor. Éin observatør kjenner svaret 0. Den andre har to like sannsynlege alternativ, 0 og 1.');
    knowledge.cueText(knows?'Trykk på figuren for å starte på nytt':'Trykk på figuren for å dele svaret');
    knowledge.tween(t=>{shared=from+(Number(knows)-from)*t;},600);
  }
  knowledge.draw=(ctx,w,h)=>{
    const unit=Math.min(w,h),radius=unit*.12,sx=w*.5,sy=h*.17,thoughtY=h*.46,eyeY=h*.7,er=Math.min(w*.045,h*.04);
    const xs=[w*.24,w*.76];
    ctx.strokeStyle='#626260';ctx.lineWidth=1.2;
    xs.forEach(x=>{ctx.beginPath();ctx.moveTo(sx,sy+radius);ctx.bezierCurveTo(sx,h*.34,x,h*.32,x,thoughtY-radius*.65);ctx.stroke();});
    ctx.fillStyle='#000';ctx.strokeStyle=white;ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=white;ctx.font=Math.max(20,radius*.8)+'px Arial';ctx.fillText('?',sx,sy);
    ctx.font='24px monospace';ctx.fillText('0',xs[0],thoughtY);
    ctx.fillText('0',xs[1]-14*(1-shared),thoughtY);
    ctx.globalAlpha=1-shared;ctx.fillText('1',xs[1]+18,thoughtY);ctx.globalAlpha=1;
    xs.forEach(x=>{
      ctx.strokeStyle=white;ctx.beginPath();ctx.moveTo(x-er*1.6,eyeY);ctx.quadraticCurveTo(x,eyeY-er*1.5,x+er*1.6,eyeY);ctx.quadraticCurveTo(x,eyeY+er*1.5,x-er*1.6,eyeY);ctx.stroke();
      ctx.beginPath();ctx.arc(x,eyeY,er*.45,0,Math.PI*2);ctx.fill();
    });
    ctx.fillStyle=gray;ctx.font='14px Arial';ctx.fillText('0 bit',xs[0],Math.min(h-10,eyeY+er+25));
    ctx.globalAlpha=1-shared;ctx.fillText('1 bit',xs[1],Math.min(h-10,eyeY+er+25));
    ctx.globalAlpha=shared;ctx.fillText('0 bit',xs[1],Math.min(h-10,eyeY+er+25));
    if(shared>0 && shared<1) {
      ctx.globalAlpha=Math.sin(shared*Math.PI);ctx.fillStyle=white;ctx.beginPath();ctx.arc(xs[0]+(xs[1]-xs[0])*shared,eyeY-Math.sin(shared*Math.PI)*h*.12,3,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  };
  document.getElementById('knowledge-share').addEventListener('click',()=>shareKnowledge(!knows));
  horizontalGesture(knowledge,{
    start(){knowledge.stopAnimation();shareStart=shared;},
    move(gesture){shared=clamp(shareStart+gesture.dx/(knowledge.canvas.getBoundingClientRect().width*.5),0,1);knowledge.requestDraw();},
    end(){shareKnowledge(shared>=.5);},
    tap(){shareKnowledge(!knows);}
  });
  const compression = new Surface('komprimering');
  let compressed = 1;
  compression.draw = (ctx, w, h) => {
    const left = w * .18, right = w * .79;
    const top = Math.max(34, h * .15), range = Math.max(48, h - top - 28);
    const font=Math.min(23,range/3*.78),erase=font*1.2;
    ctx.fillStyle = gray;
    ctx.fillText('X = (a, b)', left, 16);
    ctx.fillText(compressed > .5 ? 'Y = a' : 'Y = (a, b)', right, 16);
    for (let i = 0; i < 4; i++) {
      const y = top + range * i / 3;
      const merged = top + range * (i < 2 ? 1 / 6 : 5 / 6);
      const end = y + (merged - y) * compressed;
      ctx.strokeStyle = '#777775';
      ctx.beginPath();ctx.moveTo(left + 28, y);
      ctx.bezierCurveTo(w * .46, y, w * .51, end, right - 28, end);ctx.stroke();
      ctx.fillStyle = white;ctx.font = font+'px monospace';
      ctx.fillText(i.toString(2).padStart(2, '0'), left, y);
      ctx.fillStyle = '#000';ctx.fillRect(right - 25, end - erase/2, 54, erase);
      ctx.fillStyle = white;
      ctx.fillText(String(i >> 1), right - 7 * (1 - compressed), end);
      ctx.globalAlpha = 1 - compressed;
      ctx.fillText(String(i & 1), right + 16, end);
      ctx.globalAlpha = 1;
    }
  };
  function describeCompression(both) {
    document.querySelectorAll('[data-compression]').forEach(item => item.setAttribute('aria-pressed',String((item.dataset.compression==='both')===both)));
    document.getElementById('compression-h').textContent = M.conditionalEntropy(both);
    document.getElementById('compression-copy').textContent = both ? 'Me kjenner både a og b. Berre éin original passar.' : 'Me kjenner a. Men b kan framleis vere 0 eller 1.';
    compression.canvas.setAttribute('aria-label', both ? 'Fire originalar blir haldne frå kvarandre med fire ulike kodar.' : '00 og 01 gir same kode 0. 10 og 11 gir same kode 1.');
    compression.cueText(both?'Dra mot venstre for å skjule b':'Dra mot høgre for å hente fram b');
  }
  function compress(both) {
    const from=compressed,to=both?0:1;
    describeCompression(both);
    compression.tween(t=>{compressed=from+(to-from)*t;},460);
  }
  document.querySelectorAll('[data-compression]').forEach(button=>button.addEventListener('click',()=>compress(button.dataset.compression==='both')));
  let compressionStart=1;
  horizontalGesture(compression,{
    start(){compression.stopAnimation();compressionStart=compressed;},
    move(gesture){compressed=clamp(compressionStart-gesture.dx/(compression.canvas.getBoundingClientRect().width*.55),0,1);describeCompression(compressed<.5);compression.requestDraw();},
    end(gesture,cancelled){compress((cancelled?compressed:compressed-gesture.vx*.12)<.5);}
  });

  const chaos = new Surface('kaos');
  let r = 3.9;
  let cloud, cloudKey = '';
  function setR(value) {
    r = Math.max(2.5, Math.min(4, value));
    document.getElementById('chaos-r').textContent = 'r = ' + number(r, 2);
    chaos.canvas.setAttribute('aria-valuenow', r.toFixed(3));
    chaos.canvas.setAttribute('aria-valuetext', 'r = ' + number(r, 2));
    document.getElementById('chaos-copy').textContent = Math.abs(r-2.8)<.005 ? 'Skilnaden forsvinn. Begge banene endar i same verdi.' : Math.abs(r-3.2)<.005 ? 'Begge banene vekslar mellom dei same to verdiane.' : 'Regelen er kjend. Nesten like startar kan gi ulike baner.';
    document.querySelectorAll('[data-r]').forEach(button => button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.r) - r) < .005)));
    chaos.requestDraw();
  }
  chaos.draw = (ctx, w, h) => {
    const x0=29,x1=w-16,y0=16,gap=h<180?28:44;
    const y1=y0+Math.max(24,(h-y0-14-gap)*.64);
    const key = w + ':' + h;
    if (key !== cloudKey) {
      cloudKey = key;
      cloud = document.createElement('canvas');
      cloud.width = Math.min(900, Math.max(200, Math.round((x1 - x0) * 1.6)));
      cloud.height = Math.max(100, Math.round((y1 - y0) * 1.6));
      const target = cloud.getContext('2d');
      const pixels = target.createImageData(cloud.width, cloud.height);
      for (let col = 0; col < cloud.width; col++) {
        const values = M.logisticOrbit(2.5 + 1.5 * col / (cloud.width - 1), .271828, 130, 700);
        for (const x of values) {
          const row = Math.max(0, Math.min(cloud.height - 1, Math.round((1 - x) * (cloud.height - 1))));
          const at = (row * cloud.width + col) * 4;
          pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = 244;
          pixels.data[at + 3] = Math.min(240, pixels.data[at + 3] + 34);
        }
      }
      target.putImageData(pixels, 0, 0);
    }
    ctx.drawImage(cloud, x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = '#626260';ctx.beginPath();ctx.moveTo(x0, y0);ctx.lineTo(x0, y1);ctx.lineTo(x1, y1);ctx.stroke();
    ctx.fillStyle = gray;ctx.font = '11px Arial';
    ctx.fillText('x',10,7);ctx.fillText('r',w-5,y1+14);
    [0, .5, 1].forEach(x => ctx.fillText(number(x, x === .5 ? 1 : 0), 10, y1 - x * (y1 - y0)));
    [2.5, 3, 3.5, 4].forEach(value => ctx.fillText(number(value, value % 1 ? 1 : 0), x0 + (value - 2.5) / 1.5 * (x1 - x0), y1 + 15));
    const selected = x0 + (r - 2.5) / 1.5 * (x1 - x0);
    ctx.strokeStyle = white;ctx.beginPath();ctx.moveTo(selected, y0);ctx.lineTo(selected, y1);ctx.stroke();
    ctx.fillStyle='#000';ctx.beginPath();ctx.arc(selected,y0,7,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=white;ctx.beginPath();ctx.arc(selected,y0,2,0,Math.PI*2);ctx.fill();
    M.logisticOrbit(r, .271828, 40, 700).forEach(x => {ctx.beginPath();ctx.arc(selected, y1 - x * (y1 - y0), 1.8, 0, Math.PI * 2);ctx.fill();});
    const bottom=h-14,upper=y1+gap;
    [.2, .200001].forEach((start, index) => {
      ctx.strokeStyle = index ? '#f4f4f2' : '#626260';
      ctx.lineWidth = index ? 1.2 : 2.4;
      ctx.beginPath();
      M.logisticOrbit(r, start, 65).forEach((x, n) => {const px = x0 + n / 64 * (x1 - x0), py = bottom - x * Math.max(12, bottom - upper);if (n) ctx.lineTo(px, py);else ctx.moveTo(px, py);});
      ctx.stroke();
    });
    ctx.fillStyle=gray;ctx.font='11px Arial';ctx.textAlign='left';ctx.fillText('start',x0,h-6);ctx.textAlign='right';ctx.fillText('65 steg',x1,h-6);ctx.textAlign='center';
  };
  document.querySelectorAll('[data-r]').forEach(button => button.addEventListener('click', () => {
    const from=r,to=Number(button.dataset.r);
    chaos.tween(t=>setR(from+(to-from)*t),460);
  }));
  function rAt(event) {const rect = chaos.canvas.getBoundingClientRect();setR(2.5 + 1.5 * (event.clientX - rect.left - 29) / (rect.width - 45));}
  horizontalGesture(chaos,{start(){chaos.stopAnimation();},move:(_,event)=>rAt(event),tap(event){chaos.stopAnimation();rAt(event);}});
  chaos.canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();
    chaos.stopAnimation();
    setR(event.key === 'Home' ? 2.5 : event.key === 'End' ? 4 : r + (event.key === 'ArrowRight' ? .01 : -.01));
  });

  const mandel = new Surface('mandelbrot');
  let view = {cx:-.6,cy:0,span:4,limit:320};
  let displayView = {...view};
  let manipulating=false,pinch=null,panStart=null,lastTap=null;
  let baseSpan = 4, changedView = false, rendered = null, previousRender = null, desired = null, busy = false, serial = 0, work = null;
  let fallbackTimer=0,workEpoch=0,workerUnavailable=false;
  function stopWork() {
    work?.terminate();work=null;busy=false;workEpoch++;
    clearTimeout(fallbackTimer);fallbackTimer=0;
  }
  mandel.sleep=stopWork;
  function receive(result) {
    busy = false;
    if(!mandel.active || document.hidden)return;
    if (result.id === desired?.id) {
      const image = document.createElement('canvas');image.width = result.width;image.height = result.height;
      image.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height), 0, 0);
      previousRender = rendered;
      rendered = {id:result.id, image, view:result.view};
      mandel.canvas.setAttribute('aria-busy','false');mandel.requestDraw();
    } else if (mandel.active) send(desired);
  }
  function send(job) {
    if (!job || !mandel.active || document.hidden || manipulating) return;
    busy = true;
    if(!work && !workerUnavailable) {
      try {
        const worker=new Worker('fractal-worker.js');work=worker;
        worker.onmessage=event=>{if(work===worker)receive(event.data);};
        worker.onerror=()=>{
          if(work!==worker)return;
          stopWork();workerUnavailable=true;send(desired);
        };
      } catch {workerUnavailable=true;}
    }
    if (work) {work.postMessage(job);return;}
    const pixels = new Uint8ClampedArray(job.width * job.height * 4);
    const epoch=++workEpoch;
    let row = 0;
    function batch() {
      if(epoch!==workEpoch)return;
      if (!mandel.active || document.hidden || manipulating || desired.id!==job.id) {busy=false;send(desired);return;}
      const started=performance.now(),end=Math.min(job.height,row+8);
      do {M.fillMandelbrot(pixels,job.width,job.height,job.view,row,row+1);row++;} while(row<end && performance.now()-started<6);
      if (row < job.height) fallbackTimer=setTimeout(batch,0);
      else receive({...job,pixels:pixels.buffer});
    }
    fallbackTimer=setTimeout(batch,0);
  }
  function requestImage(w,h) {
    const resolution=Math.min(1.5,850/w,Math.sqrt(400000/(w*h)));
    const width=Math.max(1,Math.floor(w*resolution)),height=Math.max(1,Math.floor(h*resolution));
    const key = [width,height,view.cx,view.cy,view.span,view.limit].join(':');
    if (desired?.key === key) {if (!busy && rendered?.id !== desired.id) send(desired);return;}
    desired = {id:++serial,key,width,height,view:{...view}};
    mandel.canvas.setAttribute('aria-busy','true');
    if (!busy) send(desired);
  }
  mandel.draw = (ctx,w,h) => {
    baseSpan = Math.max(3.5,2.7 * w / h);
    if (!changedView) {view.span = baseSpan;displayView = {...view};}
    if (!manipulating) requestImage(w,h);
    [previousRender,rendered].forEach(layer => {
      if(!layer)return;
      const old = layer.view, image = layer.image;
      const x = (displayView.cx - displayView.span / 2 - old.cx + old.span / 2) / old.span * image.width;
      const y = (old.cy + old.span * image.height / image.width / 2 - displayView.cy - displayView.span * h / w / 2) / old.span * image.width;
      const sw = displayView.span / old.span * image.width, sh = sw * h / w;
      ctx.drawImage(image,x,y,sw,sh,0,0,w,h);
    });
    document.getElementById('mandel-zoom').textContent = number(baseSpan / view.span, baseSpan / view.span < 10 ? 1 : 0) + '×';
    document.getElementById('mandel-out').disabled = view.span >= baseSpan;
    document.getElementById('mandel-in').disabled = view.span <= baseSpan/4096;
  };
  function moveView(target, home = false) {
    const from = {...displayView};
    manipulating=false;view=target;changedView=true;
    mandel.tween(t => {
      displayView={cx:from.cx+(target.cx-from.cx)*t,cy:from.cy+(target.cy-from.cy)*t,span:Math.exp(Math.log(from.span)+(Math.log(target.span)-Math.log(from.span))*t)};
      if(t===1 && home)changedView=false;
    },440);
  }
  function zoom(factor,x=0,y=0) {
    mandel.engage();
    const span = Math.max(baseSpan / 4096,Math.min(baseSpan,view.span * factor));
    if (span === view.span) return;
    moveView({...view,cx:view.cx+x*view.span,cy:view.cy+y*view.span,span});
  }
  document.getElementById('mandel-in').addEventListener('click', () => zoom(.5,changedView?0:(-.75-view.cx)/view.span,changedView?0:(.1-view.cy)/view.span));
  document.getElementById('mandel-out').addEventListener('click', () => zoom(2));
  document.getElementById('mandel-reset').addEventListener('click', () => moveView({cx:-.6,cy:0,span:baseSpan,limit:320},true));
  mandel.canvas.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();
    if (event.key==='Home') moveView({cx:-.6,cy:0,span:baseSpan,limit:320},true);
    else if (event.key==='+' || event.key==='=') zoom(.5);
    else if (event.key==='-') zoom(2);
    else {
      const step=view.span*.12;
      moveView({...view,cx:clamp(view.cx+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),-2.4,1.2),cy:clamp(view.cy+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0),-1.8,1.8)});
    }
  });
  function beginManipulation() {
    mandel.stopAnimation();lastTap=null;changedView=true;manipulating=true;
    view={...view,...displayView};
    return {...view};
  }
  function followView(target) {
    view={...target,cx:clamp(target.cx,-2.4,1.2),cy:clamp(target.cy,-1.8,1.8),span:clamp(target.span,baseSpan/4096,baseSpan)};
    view.limit=Math.min(800,320+Math.round(Math.log2(baseSpan/view.span)*30));
    displayView={...view};mandel.requestDraw();
  }
  function endManipulation() {manipulating=false;pinch=null;panStart=null;mandel.dragging(false);mandel.requestDraw();}
  const cancelPan=horizontalGesture(mandel,{
    blocked:()=>Boolean(pinch),
    start(){panStart=beginManipulation();},
    move(gesture){
      if (!panStart) return;
      const width=mandel.canvas.getBoundingClientRect().width;
      followView({...panStart,cx:panStart.cx-gesture.dx/width*panStart.span,cy:panStart.cy+gesture.dy/width*panStart.span});
    },
    end(){endManipulation();},
    tap(event){
      const now=performance.now();
      if (lastTap && now-lastTap.time<300 && Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<28) {
        const rect=mandel.canvas.getBoundingClientRect();
        zoom(.5,(event.clientX-rect.left)/rect.width-.5,(rect.height/2-event.clientY+rect.top)/rect.width);lastTap=null;
      } else lastTap={x:event.clientX,y:event.clientY,time:now};
    }
  });
  function touchGeometry(touches) {
    const [a,b]=touches,rect=mandel.canvas.getBoundingClientRect();
    return {x:(a.clientX+b.clientX)/2-rect.left,y:(a.clientY+b.clientY)/2-rect.top,distance:Math.max(8,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)),width:rect.width,height:rect.height};
  }
  mandel.canvas.addEventListener('touchstart',event=>{
    if (event.touches.length!==2 || !mandel.active) return;
    cancelPan();
    mandel.dragging(true);
    const base=beginManipulation(),geometry=touchGeometry(event.touches);
    pinch={base,geometry,anchorX:base.cx+(geometry.x/geometry.width-.5)*base.span,anchorY:base.cy+(.5*geometry.height-geometry.y)/geometry.width*base.span};
    if (event.cancelable) event.preventDefault();
  },{passive:false});
  mandel.canvas.addEventListener('touchmove',event=>{
    if (!pinch || event.touches.length!==2) return;
    const current=touchGeometry(event.touches),span=clamp(pinch.base.span*pinch.geometry.distance/current.distance,baseSpan/4096,baseSpan);
    followView({...pinch.base,span,cx:pinch.anchorX-(current.x/current.width-.5)*span,cy:pinch.anchorY-(.5*current.height-current.y)/current.width*span});
    if (event.cancelable) event.preventDefault();
  },{passive:false});
  mandel.canvas.addEventListener('touchend',event=>{if(pinch && event.touches.length<2)endManipulation();},{passive:true});
  mandel.canvas.addEventListener('touchcancel',()=>{if(pinch)endManipulation();},{passive:true});
  mandel.cancelGesture=()=>{cancelPan();endManipulation();lastTap=null;};
  window.addEventListener('blur',mandel.cancelGesture);

  const scale = new Surface('skala');
  const levels = Array.from({length:7},(_,n)=>M.sierpinski(n));
  let level=1,detail=1,detailStart=1;
  function drawTriangles(ctx,w,h,triangles,alpha=1) {
    const side = Math.min(w-24,(h-24)/(Math.sqrt(3)/2));
    const left = (w-side)/2, top = (h-side*Math.sqrt(3)/2)/2;
    ctx.strokeStyle = ctx.fillStyle = white;ctx.globalAlpha = alpha;ctx.lineWidth = .8;
    ctx.beginPath();
    for (const points of triangles) {points.forEach((p,i)=>{const x=left+p[0]*side,y=top+p[1]*side;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();}
    ctx.stroke();ctx.beginPath();
    const seen = new Set();
    for (const points of triangles) for (const p of points) {
      const key=p[0].toFixed(7)+':'+p[1].toFixed(7);if(seen.has(key))continue;seen.add(key);
      const x=left+p[0]*side,y=top+p[1]*side;ctx.moveTo(x+1.8,y);ctx.arc(x,y,1.8,0,Math.PI*2);
    }
    ctx.fill();ctx.globalAlpha=1;
  }
  scale.draw = (ctx,w,h) => {
    const coarse=Math.floor(detail),t=detail-coarse;
    if (t<.001 || coarse===6) {drawTriangles(ctx,w,h,levels[coarse]);return;}
    const base=levels[coarse];
    const growing = base.flatMap(parent => M.splitTriangle(parent).map(child => child.map((p,i)=>[parent[i][0]+(p[0]-parent[i][0])*t,parent[i][1]+(p[1]-parent[i][1])*t])));
    drawTriangles(ctx,w,h,growing);
  };
  function describeLevel(value) {
    level=clamp(Math.round(value),0,6);
    document.getElementById('scale-count').textContent=3**level;
    document.getElementById('scale-entropy').textContent=number(level*Math.log2(3),3);
    document.getElementById('scale-level').textContent='n = '+level;
    document.getElementById('scale-less').disabled=level===0;
    document.getElementById('scale-more').disabled=level===6;
    scale.canvas.setAttribute('aria-label','Sierpinski-trekanten med '+3**level+' like sannsynlege delar.');
    scale.cueText(level===6?'Dra mot venstre for færre delar':'Dra mot høgre for fleire delar');
  }
  function setLevel(value) {
    const from=detail;
    describeLevel(value);
    scale.tween(t=>{detail=from+(level-from)*t;},420);
  }
  let refinementStarted=false,refinementTimer=0,refinements=0;
  function refineOnArrival() {
    refinementTimer=0;
    if(!scale.active || document.hidden || scale.discovered)return;
    setLevel(level+1);
    if(++refinements<3)refinementTimer=setTimeout(refineOnArrival,720);
  }
  scale.present=present=>{
    Surface.prototype.present.call(scale,present);
    if(!present){clearTimeout(refinementTimer);refinementTimer=0;return;}
    if(refinementStarted || scale.discovered)return;
    refinementStarted=true;
    if(motion.matches)setLevel(level+3);
    else refinementTimer=setTimeout(refineOnArrival,500);
  };
  document.getElementById('scale-less').addEventListener('click',()=>setLevel(level-1));
  document.getElementById('scale-more').addEventListener('click',()=>setLevel(level+1));
  horizontalGesture(scale,{
    start(){scale.stopAnimation();detailStart=detail;},
    move(gesture){detail=clamp(detailStart+gesture.dx/70,0,6);describeLevel(detail);scale.requestDraw();},
    end(gesture,cancelled){setLevel(detail+(cancelled?0:clamp(gesture.vx*.3,-.6,.6)));}
  });
  const aperture=new Surface('innsyn');
  let depth=.35,depthStart=.35;
  function describeDepth() {
    const visible=.34-(.2/.225)*(.04+.53*depth);
    const state=visible<=0?'Innsida er skjult':depth<.18?'Meir innsyn':'Delvis innsyn';
    document.getElementById('aperture-state').textContent=state;
    aperture.canvas.setAttribute('aria-valuenow',Math.round(depth*100));
    aperture.canvas.setAttribute('aria-valuetext',state);
    document.getElementById('aperture-open').setAttribute('aria-pressed',String(depth<.01));
    document.getElementById('aperture-hide').setAttribute('aria-pressed',String(depth>.99));
  }
  function setDepth(target,animate=false) {
    target=clamp(target,0,1);
    const from=depth;
    if (animate) aperture.tween(t=>{depth=from+(target-from)*t;describeDepth();},460);
    else {depth=target;describeDepth();aperture.requestDraw();}
  }
  aperture.draw=(ctx,w,h)=>{
    const ex=w*.075,ey=h*.21,front=w*.30,back=front+w*(.04+.53*depth),top=h*.41,bottom=h*.75;
    const slope=(top-ey)/(front-ex),cut=top+slope*(back-front),visible=clamp(cut,top,bottom);
    const eye=Math.min(w*.04,h*.045),wall=Math.min(8,h*.035);
    ctx.fillStyle='#202020';ctx.fillRect(front,top-wall,back-front+wall,wall);ctx.fillRect(front,bottom,back-front+wall,wall);
    if (visible<bottom) {
      ctx.fillStyle='rgba(244,244,242,.055)';ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(back,visible);ctx.lineTo(back,bottom);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#777775';ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(back,bottom);ctx.stroke();
    }
    ctx.strokeStyle='#626260';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(back,top);ctx.lineTo(back,bottom);ctx.stroke();
    ctx.strokeStyle=white;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(front,top);ctx.lineTo(back,top);ctx.moveTo(front,bottom);ctx.lineTo(back,bottom);ctx.stroke();
    ctx.strokeStyle=white;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(back,visible);ctx.lineTo(back,bottom);ctx.stroke();
    ctx.strokeStyle='#969694';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(Math.min(back,front+(bottom-top)/slope),Math.min(cut,bottom));ctx.stroke();
    ctx.strokeStyle=white;ctx.fillStyle='#000';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(ex-eye*1.5,ey);ctx.quadraticCurveTo(ex,ey-eye*1.4,ex+eye*1.5,ey);ctx.quadraticCurveTo(ex,ey+eye*1.4,ex-eye*1.5,ey);ctx.fill();ctx.stroke();ctx.fillStyle=white;ctx.beginPath();ctx.arc(ex,ey,eye*.42,0,Math.PI*2);ctx.fill();
    [top,bottom].forEach(y=>{ctx.beginPath();ctx.arc(front,y,2.5,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle=gray;ctx.font='12px Arial';ctx.fillText('opning',front,Math.min(h-10,bottom+24));
    ctx.strokeStyle='#4a4a48';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(front,top-Math.min(22,h*.12));ctx.lineTo(back,top-Math.min(22,h*.12));ctx.stroke();
    ctx.fillText('djupn',(front+back)/2,Math.max(12,top-38));
  };
  document.getElementById('aperture-open').addEventListener('click',()=>setDepth(0,true));
  document.getElementById('aperture-hide').addEventListener('click',()=>setDepth(1,true));
  aperture.canvas.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();
    aperture.stopAnimation();
    setDepth(event.key==='Home'?0:event.key==='End'?1:depth+(event.key==='ArrowRight'?.05:-.05));
  });
  horizontalGesture(aperture,{
    start(){aperture.stopAnimation();depthStart=depth;},
    move(gesture){setDepth(depthStart+gesture.dx/(aperture.canvas.getBoundingClientRect().width*.6));}
  });
  const form=new Surface('kameraet');
  let turn=.5,turnStart=.5;
  function turnForm(value) {
    turn=clamp(value,0,1);
    form.canvas.setAttribute('aria-valuenow',Math.round(turn*100));
    form.requestDraw();
  }
  form.draw=(ctx,w,h)=>{
    const radius=Math.min(w*.28,h*.30),x=w*.59,y=h*.48;
    const angle=(turn-.5)*2.2,opening=Math.max(.16,Math.cos(angle)),offset=Math.sin(angle)*radius*.65;
    ctx.strokeStyle=white;ctx.lineWidth=1.4;
    ctx.globalAlpha=.24;ctx.beginPath();ctx.ellipse(x+offset,y,radius*opening,radius,0,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,y-radius);ctx.lineTo(x+offset,y-radius);ctx.moveTo(x,y+radius);ctx.lineTo(x+offset,y+radius);ctx.stroke();
    ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(x,y,radius*opening,radius,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    const left=x-radius*opening-radius*.7,thickness=radius*(.24+.2*turn);
    ctx.fillStyle=white;ctx.beginPath();ctx.moveTo(left,y-radius);
    ctx.bezierCurveTo(left+radius*.95,y-radius*.6,left+radius*.95,y+radius*.6,left,y+radius);
    ctx.bezierCurveTo(left+radius*.95-thickness,y+radius*.5,left+radius*.95-thickness,y-radius*.5,left,y-radius);ctx.fill();
  };
  horizontalGesture(form,{
    start(){turnStart=turn;},
    move(gesture){turnForm(turnStart+gesture.dx/form.canvas.getBoundingClientRect().width);}
  });
  form.canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();form.engage();
    turnForm(event.key==='Home'?0:event.key==='End'?1:turn+(event.key==='ArrowRight'?.05:-.05));
  });
  window.FormNerdExperiments=controllers;
})();
