(() => {
  function binaryEntropy(p) {
    if (p<=0 || p>=1) return 0;
    return -p*Math.log2(p)-(1-p)*Math.log2(1-p);
  }
  function surprisal(p) {
    return p>0?-Math.log2(p):Infinity;
  }
  function binaryCrossEntropy(p,q) {
    return (p===0?0:p*surprisal(q))+(p===1?0:(1-p)*surprisal(1-q));
  }
  function bayesBinary(prior,likelihoodA,likelihoodB) {
    const a=prior*likelihoodA,b=(1-prior)*likelihoodB;
    return a+b>0?a/(a+b):null;
  }
  function conditionalEntropy(keepBoth) {
    const groups = new Map();
    for (let x = 0; x < 4; x++) {
      const y = keepBoth ? x : x >> 1;
      groups.set(y, (groups.get(y) || 0) + 1);
    }
    return [...groups.values()].reduce((sum, count) => sum + count / 4 * Math.log2(count), 0);
  }
  function logisticOrbit(r, start, count, discard = 0) {
    let x = start;
    const result = [];
    for (let n = 0; n < count + discard; n++) {
      x = r * x * (1 - x);
      if (n >= discard) result.push(x);
    }
    return result;
  }
  function mandelbrotEscape(cx, cy, limit = 320) {
    const q = (cx - .25) ** 2 + cy * cy;
    if (q * (q + cx - .25) <= .25 * cy * cy || (cx + 1) ** 2 + cy * cy <= .0625) return limit;
    let x = 0, y = 0, n = 0;
    while (x * x + y * y <= 4 && n < limit) {
      const next = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = next;
      n++;
    }
    return n;
  }
  function fillMandelbrot(data, width, height, view, start = 0, end = height) {
    for (let row = start; row < end; row++) {
      const cy = view.cy + (height / 2 - row - .5) * view.span / width;
      for (let col = 0; col < width; col++) {
        const cx = view.cx + (col + .5 - width / 2) * view.span / width;
        const n = mandelbrotEscape(cx, cy, view.limit);
        const value = n === view.limit ? 0 : Math.round(244 * (1 - Math.exp(-Math.max(0, n - 3) / 13)));
        const at = (row * width + col) * 4;
        data[at] = data[at + 1] = data[at + 2] = value;
        data[at + 3] = 255;
      }
    }
    return data;
  }
  function splitTriangle(triangle) {
    return triangle.map(anchor => triangle.map(point => [(point[0] + anchor[0]) / 2, (point[1] + anchor[1]) / 2]));
  }
  function sierpinski(level) {
    let triangles = [[[.5, 0], [0, Math.sqrt(3) / 2], [1, Math.sqrt(3) / 2]]];
    for (let n = 0; n < level; n++) triangles = triangles.flatMap(splitTriangle);
    return triangles;
  }
  globalThis.EntropyModels = {binaryEntropy, surprisal, binaryCrossEntropy, bayesBinary, conditionalEntropy, logisticOrbit, mandelbrotEscape, fillMandelbrot, splitTriangle, sierpinski};
})();
