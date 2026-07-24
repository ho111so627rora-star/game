import { coordOf } from './core.js';

export class BoardRenderer {
  constructor(canvas, onPick) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPick = onPick;
    this.yaw = -0.72;
    this.pitch = 0.68;
    this.zoom = 1;
    this.hover = -1;
    this.transparent = false;
    this.last = -1;
    this.win = [];
    this.drag = null;
    this.bind();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  reset() {
    this.yaw = -0.72;
    this.pitch = 0.68;
    this.zoom = 1;
    this.draw();
  }

  setState(game) {
    this.game = game;
    this.last = game.history.at(-1)?.cell ?? -1;
    this.win = game.winningLine || [];
    if (this.hover >= 0 && game.heights[this.hover] >= 4) this.hover = -1;
    this.draw();
  }

  project(x, y, z) {
    x -= 1.5;
    y -= 1.5;
    z -= 1.5;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const horizontal = x * cy - y * sy;
    const away = x * sy + y * cy;
    // Positive z must always travel upward on screen. The old minus sign here
    // made the rods appear to hang below the board.
    const vertical = away * cp + z * sp;
    const depth = away * sp - z * cp;
    const scale = Math.min(this.c.clientWidth, this.c.clientHeight) * 0.125 * this.zoom;
    return {
      x: this.c.clientWidth / 2 + horizontal * scale,
      y: this.c.clientHeight * 0.56 - vertical * scale,
      depth,
      r: scale * 0.28,
    };
  }

  rodInfo(rod) {
    const x = rod % 4, y = Math.floor(rod / 4);
    return {
      rod, x, y,
      lo: this.project(x, y, -0.32),
      hi: this.project(x, y, 3.35),
      target: this.project(x, y, Math.min(this.game?.heights[rod] ?? 0, 3)),
      depth: this.project(x, y, 1.5).depth,
    };
  }

  rods() {
    return Array.from({ length: 16 }, (_, rod) => this.rodInfo(rod));
  }

  pointSegmentDistance(px, py, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy));
  }

  pick(px, py) {
    let best = null;
    for (const q of this.rods()) {
      if (this.game?.heights[q.rod] >= 4) continue;
      const capDistance = Math.hypot(px - q.target.x, py - q.target.y);
      const rodDistance = this.pointSegmentDistance(px, py, q.lo, q.hi);
      const distance = Math.min(capDistance * 0.7, rodDistance);
      if (distance < Math.max(24, q.target.r * 1.35) && (!best || distance < best.distance)) {
        best = { rod: q.rod, distance };
      }
    }
    return best?.rod ?? -1;
  }

  bind() {
    const pos = e => {
      const r = this.c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.c.addEventListener('pointerdown', e => {
      this.c.setPointerCapture(e.pointerId);
      const p = pos(e);
      this.hover = this.pick(p.x, p.y);
      this.drag = { ...p, ox: e.clientX, oy: e.clientY, moved: false };
      this.draw();
    });
    this.c.addEventListener('pointermove', e => {
      const p = pos(e);
      if (this.drag) {
        const dx = e.clientX - this.drag.ox, dy = e.clientY - this.drag.oy;
        if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
        this.yaw += dx * 0.008;
        this.pitch = Math.max(0.24, Math.min(1.22, this.pitch + dy * 0.006));
        this.drag.ox = e.clientX;
        this.drag.oy = e.clientY;
      } else {
        this.hover = this.pick(p.x, p.y);
      }
      this.draw();
    });
    this.c.addEventListener('pointerleave', () => {
      if (!this.drag) { this.hover = -1; this.draw(); }
    });
    this.c.addEventListener('pointerup', e => {
      const p = pos(e);
      if (this.drag && !this.drag.moved) this.onPick(this.pick(p.x, p.y));
      this.drag = null;
    });
    this.c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(0.68, Math.min(1.5, this.zoom * (1 - e.deltaY * 0.001)));
      this.draw();
    }, { passive: false });
  }

  path(points) {
    this.ctx.beginPath();
    points.forEach((p, i) => i ? this.ctx.lineTo(p.x, p.y) : this.ctx.moveTo(p.x, p.y));
    this.ctx.closePath();
  }

  drawBase() {
    const corners = [[-0.5, -0.5], [3.5, -0.5], [3.5, 3.5], [-0.5, 3.5]];
    const top = corners.map(([x, y]) => this.project(x, y, -0.42));
    const bottom = corners.map(([x, y]) => this.project(x, y, -0.68));

    const shadow = bottom.map(p => ({ x: p.x + 8, y: p.y + 13 }));
    this.path(shadow);
    this.ctx.fillStyle = '#5d421f33';
    this.ctx.fill();

    const sides = corners.map((_, i) => {
      const n = (i + 1) % 4;
      return { points: [top[i], top[n], bottom[n], bottom[i]], depth: (top[i].depth + top[n].depth) / 2 };
    }).sort((a, b) => a.depth - b.depth);
    for (const side of sides) {
      this.path(side.points);
      this.ctx.fillStyle = '#bf7828';
      this.ctx.fill();
      this.ctx.strokeStyle = '#8d551d';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }

    this.path(top);
    const gradient = this.ctx.createLinearGradient(0, Math.min(...top.map(p => p.y)), 0, Math.max(...top.map(p => p.y)));
    gradient.addColorStop(0, '#ffd56a');
    gradient.addColorStop(1, '#e7a53a');
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
    this.ctx.strokeStyle = '#89531d';
    this.ctx.lineWidth = 5;
    this.ctx.stroke();

    // A visible 4×4 grid anchors every rod to a clear square.
    this.ctx.lineWidth = 1.8;
    this.ctx.strokeStyle = '#9b652c88';
    for (let i = 0; i <= 4; i++) {
      for (const [a, b] of [
        [this.project(i - 0.5, -0.5, -0.405), this.project(i - 0.5, 3.5, -0.405)],
        [this.project(-0.5, i - 0.5, -0.405), this.project(3.5, i - 0.5, -0.405)],
      ]) {
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.stroke();
      }
    }
  }

  sphere(p, player, alpha = 1, mark = false) {
    const g = this.ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.08, p.x, p.y, p.r);
    if (player === 1) {
      g.addColorStop(0, `rgba(114,133,166,${alpha})`);
      g.addColorStop(0.55, `rgba(34,48,75,${alpha})`);
      g.addColorStop(1, `rgba(9,17,33,${alpha})`);
    } else {
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.6, `rgba(230,238,245,${alpha})`);
      g.addColorStop(1, `rgba(155,171,190,${alpha})`);
    }
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    this.ctx.fillStyle = g;
    this.ctx.fill();
    this.ctx.lineWidth = mark ? 5 : player === 2 ? 2 : 1.5;
    this.ctx.strokeStyle = mark ? '#ffbd27' : player === 2 ? '#64748b' : '#101827';
    this.ctx.setLineDash(player === 2 ? [5, 3] : []);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  drawRod(o) {
    const full = this.game.heights[o.rod] >= 4;
    const active = o.rod === this.hover && !full;
    this.ctx.beginPath();
    this.ctx.moveTo(o.lo.x, o.lo.y);
    this.ctx.lineTo(o.hi.x, o.hi.y);
    this.ctx.lineCap = 'round';
    this.ctx.lineWidth = active ? 7 : 4.5;
    this.ctx.strokeStyle = full ? '#8d9297' : active ? '#ffd124' : '#715035';
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(o.hi.x, o.hi.y, active ? 7 : 5, 0, Math.PI * 2);
    this.ctx.fillStyle = active ? '#ffe66b' : '#9a6c46';
    this.ctx.fill();

    if (active) {
      this.ctx.beginPath();
      this.ctx.arc(o.target.x, o.target.y, o.target.r * 1.28, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#ffbf16';
      this.ctx.lineWidth = 4;
      this.ctx.setLineDash([7, 5]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  draw() {
    const dpr = Math.min(devicePixelRatio, 2), w = this.c.clientWidth, h = this.c.clientHeight;
    if (this.c.width !== w * dpr || this.c.height !== h * dpr) {
      this.c.width = w * dpr;
      this.c.height = h * dpr;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    if (!this.game) return;

    this.drawBase();
    const objects = [];
    for (const q of this.rods()) {
      objects.push({ ...q, type: 'rod' });
      for (let z = 0; z < this.game.heights[q.rod]; z++) {
        const i = q.x + q.y * 4 + z * 16;
        const p = this.project(q.x, q.y, z);
        objects.push({ depth: p.depth, type: 'ball', p, player: this.game.cells[i], i });
      }
      if (this.game.heights[q.rod] < 4 && q.rod === this.hover) {
        const p = this.project(q.x, q.y, this.game.heights[q.rod]);
        objects.push({ depth: p.depth - 0.01, type: 'ghost', p, player: this.game.turn });
      }
    }
    objects.sort((a, b) => a.depth - b.depth);
    for (const o of objects) {
      if (o.type === 'rod') this.drawRod(o);
      else this.sphere(o.p, o.player, o.type === 'ghost' ? 0.48 : this.transparent ? 0.67 : 1, o.i === this.last || this.win.includes(o.i));
    }

    if (this.win.length) {
      const a = this.project(...Object.values(coordOf(this.win[0])));
      const b = this.project(...Object.values(coordOf(this.win[3])));
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.strokeStyle = '#ffcf24';
      this.ctx.lineWidth = 9;
      this.ctx.lineCap = 'round';
      this.ctx.stroke();
    }

    // A tiny fixed cue removes ambiguity even after the camera is rotated.
    this.ctx.fillStyle = '#6d5838bb';
    this.ctx.font = '700 13px system-ui';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('↑ 棒は上へ伸びています', w / 2, h - 30);
  }
}
