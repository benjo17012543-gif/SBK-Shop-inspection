/**
 * Signature Pad บน Canvas (เขียนเอง ไม่พึ่งไลบรารี)
 * - รองรับนิ้ว / ปากกา / เมาส์ ด้วย Pointer Events
 * - คมชัดบนจอ HiDPI (devicePixelRatio)
 * - เก็บเส้นแบบพิกัดสัมพัทธ์ (0..1) จึงวาดใหม่ได้ถูกต้องเมื่อขนาดจอเปลี่ยน/หมุนจอ
 */
export class SignaturePad {
  constructor(canvas, { penColor = '#0f172a', lineWidth = 2.4, onChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.penColor = penColor;
    this.lineWidth = lineWidth;
    this.onChange = onChange;
    this.strokes = [];
    this.current = null;
    this.lastWidth = 0;

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
      canvas.addEventListener(t, (e) => this.#up(e)));

    this.resize();
    // วาดใหม่เฉพาะเมื่อ "ความกว้าง" เปลี่ยน (เลี่ยงการ resize จากแถบ URL บนมือถือ)
    new ResizeObserver(() => {
      const w = this.canvas.getBoundingClientRect().width;
      if (Math.abs(w - this.lastWidth) > 1) this.resize();
    }).observe(canvas);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    this.lastWidth = rect.width;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#redraw();
  }

  isEmpty() {
    return this.strokes.length === 0;
  }

  clear() {
    this.strokes = [];
    this.current = null;
    this.#redraw();
    this.onChange?.(this);
  }

  /** คืนค่า PNG Blob พื้นขาว ขนาดพอดี (ย่อให้กว้างไม่เกิน 600px เพื่อประหยัดพื้นที่) */
  toBlob() {
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(1, 600 / rect.width) * 1.5;
    const out = document.createElement('canvas');
    out.width = Math.round(rect.width * scale);
    out.height = Math.round(rect.height * scale);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    this.#paint(ctx, out.width, out.height, scale);
    return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  }

  #point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  #down(e) {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.current = [this.#point(e)];
    this.strokes.push(this.current);
    this.#redraw();
  }

  #move(e) {
    if (!this.current) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) this.current.push(this.#point(ev));
    this.#redraw();
  }

  #up() {
    if (!this.current) return;
    this.current = null;
    this.onChange?.(this);
  }

  #redraw() {
    const r = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, r.width, r.height);
    this.#paint(this.ctx, r.width, r.height, 1);
  }

  /** วาดเส้นทั้งหมดแบบโค้งนุ่มนวล (quadratic midpoint smoothing) */
  #paint(ctx, w, h, scale) {
    ctx.strokeStyle = this.penColor;
    ctx.fillStyle = this.penColor;
    ctx.lineWidth = this.lineWidth * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.strokes) {
      const pts = s.map((p) => ({ x: p.x * w, y: p.y * h }));
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }
}
