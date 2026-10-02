/** Procedural B/W CRT surveillance feed drawn on a canvas */

export class CCTVFeed {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private t0 = performance.now();
  private mode: 'bank' | 'street' | 'chase' | 'generic' = 'generic';
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize(320, 180);
  }

  resize(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  setMode(mode: typeof this.mode) {
    this.mode = mode;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.draw((performance.now() - this.t0) / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw(t: number) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#1a1a1a';
    if (this.mode === 'bank') {
      ctx.fillRect(20, 40, w - 40, h - 60);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(40, h * 0.55, w - 80, 28);
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 0.42, 28, 0, Math.PI * 2);
      ctx.fillStyle = '#333';
      ctx.fill();
      ctx.strokeStyle = '#666';
      ctx.stroke();
    } else if (this.mode === 'chase') {
      ctx.fillStyle = '#151515';
      ctx.fillRect(0, h * 0.45, w, h * 0.55);
      ctx.strokeStyle = '#888';
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      ctx.lineTo(w, h * 0.7);
      ctx.stroke();
      ctx.setLineDash([]);
      const cx = ((t * 80) % (w + 40)) - 20;
      ctx.fillStyle = '#ccc';
      ctx.fillRect(cx, h * 0.58, 36, 16);
      ctx.fillStyle = '#999';
      ctx.fillRect(cx - 50, h * 0.62, 34, 14);
    } else {
      ctx.fillRect(10, 30, w - 20, h - 50);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = Math.sin(t + i) > 0 ? '#3a3a3a' : '#222';
        ctx.fillRect(30 + i * 50, 50, 28, 40);
      }
    }

    const bob = Math.sin(t * 3) * 3;
    ctx.fillStyle = '#ddd';
    for (let i = 0; i < 3; i++) {
      const fx = w * 0.28 + i * 28 + Math.sin(t * 2 + i) * 4;
      const fy = h * 0.48 + bob;
      ctx.fillRect(fx, fy, 8, 22);
      ctx.beginPath();
      ctx.arc(fx + 4, fy - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      const line = y % 3 === 0 ? 18 : 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const n = (Math.random() * 40) | 0;
        const v = d[i] + n - 20 - line;
        const g = Math.max(0, Math.min(255, v));
        d[i] = d[i + 1] = d[i + 2] = g;
      }
    }
    ctx.putImageData(img, 0, 0);

    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#9f9';
    ctx.font = '10px monospace';
    ctx.fillText(`CAM-0${(Math.floor(t) % 4) + 1}  ${new Date().toISOString().slice(11, 19)}`, 8, h - 8);
  }
}
