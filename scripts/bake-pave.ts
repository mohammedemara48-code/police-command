// Bakes the pavement region of every road chunk into src/game/world/paveBake.json (npm run bake:pave).
// clipper2-js can loop forever on rare inputs, so each chunk is built in a worker under a time limit and retried
// with a different simplification tolerance if it does not come back.
import { writeFileSync } from 'fs';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import { fileURLToPath } from 'url';
import { WORLD_BOX } from '../src/game/logic/cairo';
import { BAKE_CHUNK as C, computeRegion, packRegion, shapeHash } from '../src/game/world/pavement';
import { edgesIn } from '../src/game/world/roadMesh';

const EPS = [5, 0, 7, 11, 3, 13, 17, 23, 31];
const LIMIT = 15_000;

if (!isMainThread) {
  parentPort!.on('message', (m: { x: number; z: number; eps: number }) => {
    parentPort!.postMessage(packRegion(computeRegion(m.x, m.z, m.x + C, m.z + C, m.eps)));
  });
} else {
  const self = fileURLToPath(import.meta.url);
  let w: Worker | null = null;
  const run = (x: number, z: number, eps: number) =>
    new Promise<unknown>((res) => {
      w ??= new Worker(self);
      const t = setTimeout(() => {
        void w!.terminate();
        w = null;
        res(null);
      }, LIMIT);
      w.once('message', (r) => {
        clearTimeout(t);
        res(r);
      });
      w.postMessage({ x, z, eps });
    });
  const main = async () => {
    const chunks: Record<string, unknown> = {};
    const t0 = Date.now();
    for (let x = Math.floor(WORLD_BOX.x0 / C) * C; x < WORLD_BOX.x1; x += C)
      for (let z = Math.floor(WORLD_BOX.z0 / C) * C; z < WORLD_BOX.z1; z += C) {
        if (!edgesIn(x, z, x + C, z + C).length) continue;
        let r: unknown = null;
        for (const eps of EPS) {
          r = await run(x, z, eps);
          if (r) break;
          console.log(`chunk ${x},${z}: no result with eps ${eps}, retrying`);
        }
        if (!r) throw new Error(`chunk ${x},${z} failed`);
        const [p, f] = r as [unknown[], unknown[]];
        if (p.length || f.length) chunks[`${x}:${z}`] = r;
      }
    void w?.terminate();
    writeFileSync('src/game/world/paveBake.json', JSON.stringify({ hash: shapeHash(), chunks }));
    console.log(`baked ${Object.keys(chunks).length} chunks in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  };
  void main();
}
