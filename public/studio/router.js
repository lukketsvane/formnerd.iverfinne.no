const routes = new Set(['/kamera', '/canon50mm', '/a8']);
const router = {
  push(path) {
    if (routes.has(path)) window.dispatchEvent(new CustomEvent('studio:navigate', {detail:path}));
  }
};
export const t = () => router;
export const n = load => load();
