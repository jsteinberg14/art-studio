// Zoom and pan for pictures. Used by the picture viewer and by the drawing screen.
// The target is scaled with a CSS transform that starts at its top-left corner.

export class ZoomView {
  constructor(target, container, { min = 1, max = 6, onChange = null } = {}) {
    this.target = target;
    this.container = container;
    this.min = min;
    this.max = max;
    this.onChange = onChange;
    this.k = 1;
    this.tx = 0;
    this.ty = 0;
    this.g = null;
    target.style.transformOrigin = '0 0';
    target.style.willChange = 'transform';
  }

  get percent() { return Math.round(this.k * 100); }
  get zoomed() { return this.k > 1.02; }

  // Where the target would sit with no zoom or pan.
  natural() {
    const r = this.target.getBoundingClientRect();
    return { x: r.left - this.tx, y: r.top - this.ty };
  }

  apply() {
    this.target.style.transform = this.k === 1 && !this.tx && !this.ty ? '' : `translate(${this.tx}px, ${this.ty}px) scale(${this.k})`;
    if (this.onChange) this.onChange(this);
  }

  // Keep the picture on screen: fill the view when zoomed in, center it when smaller.
  clamp() {
    const c = this.container.getBoundingClientRect();
    const n = this.natural();
    const w = this.target.offsetWidth * this.k, h = this.target.offsetHeight * this.k;
    const fit = (size, view, start, nat, t) => {
      if (size <= view + 0.5) return start + (view - size) / 2 - nat;
      return Math.min(start - nat, Math.max(start + view - size - nat, t));
    };
    this.tx = fit(w, c.width, c.left, n.x, this.tx);
    this.ty = fit(h, c.height, c.top, n.y, this.ty);
  }

  zoomAt(cx, cy, nk) {
    nk = Math.min(this.max, Math.max(this.min, nk));
    const n = this.natural();
    const ux = (cx - n.x - this.tx) / this.k, uy = (cy - n.y - this.ty) / this.k;
    this.k = nk;
    this.tx = cx - n.x - nk * ux;
    this.ty = cy - n.y - nk * uy;
    this.clamp();
    this.apply();
  }

  zoomBy(factor) {
    const c = this.container.getBoundingClientRect();
    this.zoomAt(c.left + c.width / 2, c.top + c.height / 2, this.k * factor);
  }

  panBy(dx, dy) {
    this.tx += dx; this.ty += dy;
    this.clamp();
    this.apply();
  }

  reset() {
    this.k = 1; this.tx = 0; this.ty = 0; this.g = null;
    this.target.style.transform = '';
    if (this.onChange) this.onChange(this);
  }

  // Two-finger pinch: the point between the fingers stays under them.
  beginPinch(a, b) {
    const n = this.natural();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.g = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), k0: this.k, ux: (mid.x - n.x - this.tx) / this.k, uy: (mid.y - n.y - this.ty) / this.k };
  }

  updatePinch(a, b) {
    if (!this.g) return;
    const n = this.natural();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const nk = Math.min(this.max, Math.max(this.min, this.g.k0 * Math.hypot(a.x - b.x, a.y - b.y) / this.g.d0));
    this.k = nk;
    this.tx = mid.x - n.x - nk * this.g.ux;
    this.ty = mid.y - n.y - nk * this.g.uy;
    this.clamp();
    this.apply();
  }

  endPinch() { this.g = null; }

  // Mouse wheel and trackpad: pinch (or Ctrl/Cmd + wheel) zooms, plain scrolling pans a zoomed picture.
  wheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, this.k * Math.exp(-e.deltaY * 0.01));
    } else if (this.zoomed) {
      e.preventDefault();
      this.panBy(-e.deltaX, -e.deltaY);
    }
  }
}

// Pinch, drag, double-tap, and wheel for a picture shown on its own.
export function attachGestures(el, zv) {
  const pointers = new Map();
  let last = null, tap = null;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; zv.beginPinch(a, b); tap = null; }
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const before = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()]; zv.updatePinch(a, b); return; }
    if (zv.zoomed) zv.panBy(e.clientX - before.x, e.clientY - before.y);
    if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) > 8) last = null;
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) zv.endPinch();
    if (e.type === 'pointerup' && last && pointers.size === 0) {
      const now = performance.now();
      if (tap && now - tap.t < 320 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 32) {
        if (zv.zoomed) zv.reset(); else zv.zoomAt(e.clientX, e.clientY, 2.5);
        tap = null;
      } else tap = { x: e.clientX, y: e.clientY, t: now };
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => zv.wheel(e), { passive: false });
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The picture viewer: opens a picture full screen so it can be pinched, dragged, and zoomed with buttons.
export function openViewer(dlg, src, alt, icons) {
  dlg.className = 'viewer';
  dlg.setAttribute('aria-label', `Zoomed picture: ${alt}`);
  dlg.innerHTML = `
    <div class="viewer-bar">
      <button type="button" class="icon-btn" data-viewer="close" aria-label="Close picture">${icons.close}</button>
      <p class="viewer-title">${esc(alt)}</p>
    </div>
    <div class="viewer-stage"><img class="viewer-img" src="${esc(src)}" alt="${esc(alt)}" draggable="false"></div>
    <div class="viewer-tools" role="group" aria-label="Zoom">
      <button type="button" class="zoom-btn" data-viewer="out" aria-label="Zoom out">${icons.minus}</button>
      <span class="zoom-pct" data-viewer-pct role="status">100%</span>
      <button type="button" class="zoom-btn" data-viewer="in" aria-label="Zoom in">${icons.plus}</button>
      <button type="button" class="btn btn-small" data-viewer="fit">Fit</button>
    </div>
    <p class="viewer-hint">Pinch or double-tap to zoom. Drag to move around.</p>`;
  const stage = dlg.querySelector('.viewer-stage');
  const img = dlg.querySelector('.viewer-img');
  const pct = dlg.querySelector('[data-viewer-pct]');
  const zv = new ZoomView(img, stage, { max: 8, onChange: (z) => { pct.textContent = `${z.percent}%`; } });
  attachGestures(stage, zv);
  // Keyboard: arrow keys move around a zoomed picture, + and - zoom, 0 fits it.
  stage.tabIndex = 0;
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', `${alt}. Use plus and minus to zoom and the arrow keys to move around.`);
  stage.addEventListener('keydown', (e) => {
    const step = 80;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { if (zv.zoomed) { e.preventDefault(); zv.panBy(...moves[e.key]); } }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zv.zoomBy(1.5); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zv.zoomBy(1 / 1.5); }
    else if (e.key === '0') { e.preventDefault(); zv.reset(); }
  });
  dlg.onclick = (e) => {
    const b = e.target.closest('[data-viewer]');
    if (!b) return;
    const a = b.dataset.viewer;
    if (a === 'close') dlg.close();
    else if (a === 'in') zv.zoomBy(1.5);
    else if (a === 'out') zv.zoomBy(1 / 1.5);
    else if (a === 'fit') zv.reset();
  };
  dlg.addEventListener('close', () => { dlg.innerHTML = ''; dlg.className = ''; dlg.removeAttribute('aria-label'); dlg.onclick = null; }, { once: true });
  dlg.showModal();
}
