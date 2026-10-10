const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/entropy-models.js'),'utf8'),context);
const M = context.EntropyModels;

test('Binary entropy is the probability-weighted surprise, including certain outcomes', () => {
  assert.equal(M.binaryEntropy(0),0);
  assert.equal(M.binaryEntropy(1),0);
  assert.equal(M.binaryEntropy(.5),1);
  assert.ok(Math.abs(M.binaryEntropy(.1)-.4689955935892812)<1e-12);
  assert.ok(Math.abs(M.binaryEntropy(.25)-.8112781244591328)<1e-12);
  for(const p of [.01,.1,.25,.5,.75,.9,.99]) {
    assert.ok(Math.abs(M.binaryEntropy(p)-(p*M.surprisal(p)+(1-p)*M.surprisal(1-p)))<1e-12);
    assert.ok(Math.abs(M.binaryEntropy(p)-M.binaryEntropy(1-p))<1e-12);
  }
  assert.ok(Math.abs(M.surprisal(.1)-3.321928094887362)<1e-12);
  assert.equal(M.surprisal(0),Infinity);
  assert.ok(M.surprisal(1)===0);
});

test('Discarding exactly one fair independent bit leaves one bit of uncertainty', () => {
  assert.equal(M.conditionalEntropy(false),1);
  assert.equal(M.conditionalEntropy(true),0);
});
test('Cross entropy retains the source uncertainty when the model is correct', () => {
  assert.equal(M.binaryCrossEntropy(.5,.5),1);
  assert.equal(M.binaryCrossEntropy(0,0),0);
  assert.equal(M.binaryCrossEntropy(1,1),0);
  assert.equal(M.binaryCrossEntropy(.5,0),Infinity);
  assert.equal(M.binaryCrossEntropy(.5,1),Infinity);
  assert.ok(Math.abs(M.binaryCrossEntropy(.5,.9)-1.7369655941662063)<1e-12);
  for(const p of [.05,.25,.5,.75,.95]) {
    assert.ok(Math.abs(M.binaryCrossEntropy(p,p)-M.binaryEntropy(p))<1e-12);
    for(const q of [.05,.25,.5,.75,.95])assert.ok(M.binaryCrossEntropy(p,q)>=M.binaryEntropy(p)-1e-12);
  }
});
test('A three-to-one likelihood shifts equal priors to a 75 percent posterior', () => {
  assert.equal(M.bayesBinary(.5,.75,.25),.75);
  assert.equal(M.bayesBinary(.5,.25,.75),.25);
  assert.equal(M.bayesBinary(.5,1,1),.5);
  assert.equal(M.bayesBinary(0,.75,.25),0);
  assert.equal(M.bayesBinary(1,.75,.25),1);
  assert.equal(M.bayesBinary(.5,0,0),null);
  assert.ok(Math.abs(M.binaryEntropy(M.bayesBinary(.5,.75,.25))-.8112781244591328)<1e-12);
});
test('Logistic samples converge to the fixed point and the expected two-cycle', () => {
  const fixed = M.logisticOrbit(2.8,.271828,40,700);
  assert.ok(fixed.every(x=>Math.abs(x-(1-1/2.8))<1e-12));
  const periodic = M.logisticOrbit(3.2,.271828,40,700);
  assert.ok(Math.abs(periodic[0]-periodic[1])>.1);
  assert.ok(periodic.every((x,i)=>Math.abs(x-periodic[i%2])<1e-12));
  assert.ok(M.logisticOrbit(3.9,.271828,1000).every(x=>Number.isFinite(x)&&x>=0&&x<=1));
});
test('Mandelbrot escape respects the boundary at c = -2', () => {
  for(const c of [0,-1,-2,.25]) assert.equal(M.mandelbrotEscape(c,0,320),320);
  assert.equal(M.mandelbrotEscape(1,0,320),3);
  assert.equal(M.mandelbrotEscape(2,0,320),2);
  assert.equal(M.mandelbrotEscape(3,0,320),1);
});
test('Progressive and worker rendering produce identical pixels', () => {
  const view={cx:-.6,cy:0,span:3.8,limit:160};
  const a=new Uint8ClampedArray(96*72*4),b=new Uint8ClampedArray(a.length);
  M.fillMandelbrot(a,96,72,view);
  for(let row=0;row<72;row+=8)M.fillMandelbrot(b,96,72,view,row,row+8);
  assert.deepEqual(a,b);
  assert.ok(a.some((v,i)=>i%4!==3&&v>150));
  assert.ok(a.every((v,i)=>i%4!==3||v===255));
});
test('Each Sierpinski subdivision has 3^n pieces and the correct total area', () => {
  const area = t => Math.abs(t[0][0]*(t[1][1]-t[2][1])+t[1][0]*(t[2][1]-t[0][1])+t[2][0]*(t[0][1]-t[1][1]))/2;
  for(let n=0;n<=6;n++) {
    const triangles=M.sierpinski(n);
    assert.equal(triangles.length,3**n);
    const total=triangles.reduce((sum,t)=>sum+area(t),0);
    assert.ok(Math.abs(total-Math.sqrt(3)/4*(3/4)**n)<1e-12);
    assert.ok(triangles.every(t=>Math.abs(area(t)-Math.sqrt(3)/4/4**n)<1e-12));
  }
});
