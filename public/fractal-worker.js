importScripts('entropy-models.js');
self.onmessage = ({data: job}) => {
  const pixels = new Uint8ClampedArray(job.width * job.height * 4);
  EntropyModels.fillMandelbrot(pixels, job.width, job.height, job.view);
  self.postMessage({id: job.id, width: job.width, height: job.height, view: job.view, pixels: pixels.buffer}, [pixels.buffer]);
};
