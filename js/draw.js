// Drawing engine: a photo layer, an ink layer, and a preview layer for the marker.
import { loadImage } from './feedback.js';

export const SIZE_STEPS = [
  { label: 'Small', px: 4 },
  { label: 'Medium', px: 10 },
  { label: 'Large', px: 18 },
  { label: 'Extra large', px: 28 },
];

// The blend tool smudges colors together. It has its own, bigger sizes and three strengths.
export const BLEND_SIZES = [
  { label: 'Small', px: 16 },
  { label: 'Medium', px: 28 },
  { label: 'Large', px: 44 },
  { label: 'Extra large', px: 68 },
];
export const BLEND_STRENGTHS = [
  { label: 'Light', amount: 0.3 },
  { label: 'Medium', amount: 0.55 },
  { label: 'Strong', amount: 0.8 },
];

const MAX_PIXELS = 1400;
const UNDO_LIMIT = 10;

function layer(cls) {
  const c = document.createElement('canvas');
  c.className = cls;
  return c;
}

export class Drawing {
  constructor(stage) {
    this.stage = stage;
    this.bg = layer('stage-bg');
    this.ink = layer('stage-ink');
    this.temp = layer('stage-temp');
    this.bg.setAttribute('aria-hidden', 'true');
    this.temp.setAttribute('aria-hidden', 'true');
    stage.replaceChildren(this.bg, this.ink, this.temp);
    this.inkCtx = this.ink.getContext('2d', { willReadFrequently: true });
    this.tool = 'pen';
    this.color = '#F28B82';
    this.sizePx = 4;
    this.strength = BLEND_STRENGTHS[1].amount;
    this.carry = null;
    this.maskCache = null;
    this.scale = 1;
    this.undoStack = [];
    this.dirty = false;
    this.points = null;
    this.pointerId = null;
    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    stage.addEventListener('pointerdown', this.onDown);
    stage.addEventListener('pointermove', this.onMove);
    stage.addEventListener('pointerup', this.onUp);
    stage.addEventListener('pointercancel', this.onUp);
  }

  async setBackground(blob) {
    let img = null;
    if (blob) img = await loadImage(blob);
    const aspect = img ? img.naturalWidth / img.naturalHeight : 1;
    const maxW = this.stage.parentElement.clientWidth;
    const maxH = Math.max(240, Math.min(window.innerHeight * 0.52, maxW * 1.25));
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) { h = maxH; w = h * aspect; }
    w = Math.round(w); h = Math.round(h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    const k = Math.min(1, MAX_PIXELS / Math.max(pw, ph));
    pw = Math.round(pw * k); ph = Math.round(ph * k);
    this.scale = pw / w;
    for (const c of [this.bg, this.ink, this.temp]) {
      c.width = pw; c.height = ph;
      c.style.width = `${w}px`; c.style.height = `${h}px`;
    }
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    const g = this.bg.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, pw, ph);
    if (img) { g.drawImage(img, 0, 0, pw, ph); img.release(); }
  }

  setTool(tool, sizePx, color, strength) {
    this.tool = tool; this.sizePx = sizePx; this.color = color;
    if (strength !== undefined) this.strength = strength;
  }

  point(e) {
    const r = this.ink.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (this.ink.width / r.width), y: (e.clientY - r.top) * (this.ink.height / r.height) };
  }

  brush(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.sizePx * this.scale;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = this.tool === 'eraser' ? '#000' : this.color;
    if (this.tool === 'brush') {
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.sizePx * this.scale * 0.8;
    }
    return ctx;
  }

  saveUndo() {
    const snap = document.createElement('canvas');
    snap.width = this.ink.width; snap.height = this.ink.height;
    snap.getContext('2d').drawImage(this.ink, 0, 0);
    this.undoStack.push(snap);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
  }

  onDown(e) {
    if (e.button > 0 || this.pointerId !== null) return;
    e.preventDefault();
    try { this.stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.pointerId = e.pointerId;
    this.saveUndo();
    const p = this.point(e);
    this.points = [p];
    if (this.tool === 'marker') { this.drawMarkerPreview(); return; }
    if (this.tool === 'blend') { this.blendBegin(p); return; }
    const ctx = this.brush(this.ink.getContext('2d'));
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  onMove(e) {
    if (e.pointerId !== this.pointerId || !this.points) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const list = events.length ? events : [e];
    if (this.tool === 'marker') {
      for (const ev of list) this.points.push(this.point(ev));
      this.drawMarkerPreview();
      return;
    }
    if (this.tool === 'blend') {
      for (const ev of list) {
        const p = this.point(ev);
        this.blendAlong(this.points[this.points.length - 1], p);
        this.points.push(p);
      }
      return;
    }
    const ctx = this.brush(this.ink.getContext('2d'));
    for (const ev of list) {
      const p = this.point(ev);
      const last = this.points[this.points.length - 1];
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      this.points.push(p);
    }
  }

  onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    if (this.tool === 'marker' && this.points) {
      const ctx = this.ink.getContext('2d');
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = 0;
      ctx.drawImage(this.temp, 0, 0);
      ctx.restore();
      this.temp.getContext('2d').clearRect(0, 0, this.temp.width, this.temp.height);
    }
    this.points = null;
    this.pointerId = null;
    this.carry = null;
    this.dirty = true;
  }

  drawMarkerPreview() {
    const ctx = this.temp.getContext('2d');
    ctx.clearRect(0, 0, this.temp.width, this.temp.height);
    const pts = this.points;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.sizePx * this.scale;
    ctx.strokeStyle = ctx.fillStyle = this.color;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  // Blend (smudge): the finger picks up the paint under it and drags it along,
  // mixing it into what it touches. A soft round mask keeps the edges gentle.
  blendDiameter() { return Math.max(6, Math.round(this.sizePx * this.scale)); }

  blendMask(d) {
    if (this.maskCache && this.maskCache.d === d) return this.maskCache.mask;
    const mask = new Float32Array(d * d);
    const r = d / 2;
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const dist = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
        const t = dist >= 1 ? 0 : Math.min(1, (1 - dist) / 0.5);
        mask[y * d + x] = t * t * (3 - 2 * t);
      }
    }
    this.maskCache = { d, mask };
    return mask;
  }

  blendBegin(p) {
    const d = this.blendDiameter();
    this.carry = this.inkCtx.getImageData(Math.round(p.x - d / 2), Math.round(p.y - d / 2), d, d);
  }

  blendStep(p) {
    const d = this.blendDiameter();
    if (!this.carry || this.carry.width !== d) { this.blendBegin(p); return; }
    const x0 = Math.round(p.x - d / 2), y0 = Math.round(p.y - d / 2);
    const under = this.inkCtx.getImageData(x0, y0, d, d);
    const u = under.data, c = this.carry.data;
    const out = new Uint8ClampedArray(u);
    const mask = this.blendMask(d);
    const deposit = this.strength * 0.5;
    const pickup = (1 - this.strength) * 0.35 + 0.05;
    for (let i = 0, k = 0; i < mask.length; i++, k += 4) {
      const w = mask[i];
      if (w <= 0) continue;
      const ua = u[k + 3] / 255, ca = c[k + 3] / 255;
      const a = deposit * w, b = pickup * w;
      const na = ua * (1 - a) + ca * a;
      if (na < 0.004) { out[k] = out[k + 1] = out[k + 2] = out[k + 3] = 0; } else {
        for (let j = 0; j < 3; j++) out[k + j] = Math.round((u[k + j] * ua * (1 - a) + c[k + j] * ca * a) / na);
        out[k + 3] = Math.round(na * 255);
      }
      const nc = ca * (1 - b) + ua * b;
      if (nc < 0.004) { c[k] = c[k + 1] = c[k + 2] = c[k + 3] = 0; } else {
        for (let j = 0; j < 3; j++) c[k + j] = Math.round((c[k + j] * ca * (1 - b) + u[k + j] * ua * b) / nc);
        c[k + 3] = Math.round(nc * 255);
      }
    }
    this.inkCtx.putImageData(new ImageData(out, d, d), x0, y0);
  }

  blendAlong(from, to) {
    const d = this.blendDiameter();
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.min(40, Math.max(1, Math.ceil(dist / Math.max(1, d * 0.12))));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.blendStep({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }

  undo() {
    if (!this.undoStack.length) return false;
    const ctx = this.ink.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.drawImage(this.undoStack.pop(), 0, 0);
    ctx.restore();
    this.dirty = this.undoStack.length > 0;
    return true;
  }

  clear() {
    this.saveUndo();
    this.ink.getContext('2d').clearRect(0, 0, this.ink.width, this.ink.height);
  }

  exportBlob() {
    const out = document.createElement('canvas');
    out.width = this.bg.width; out.height = this.bg.height;
    const g = out.getContext('2d');
    g.drawImage(this.bg, 0, 0);
    g.drawImage(this.ink, 0, 0);
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Saving failed. Try again.'))), 'image/jpeg', 0.9));
  }

  destroy() {
    this.stage.removeEventListener('pointerdown', this.onDown);
    this.stage.removeEventListener('pointermove', this.onMove);
    this.stage.removeEventListener('pointerup', this.onUp);
    this.stage.removeEventListener('pointercancel', this.onUp);
    this.undoStack = [];
  }
}
