/* =====================================================================
 *  signature-pad.js — ช่องวาดลายเซ็นดิจิทัล (Canvas + Pointer Events)
 *  รองรับนิ้ว / ปากกา / เมาส์ และหน้าจอความละเอียดสูง (HiDPI)
 * ===================================================================== */
class SignaturePad {
  constructor(canvas, { onChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange || (() => {});
    this.strokes = [];   // เก็บเส้นไว้วาดใหม่เมื่อปรับขนาดจอ
    this.current = null;
    this.lastWidth = 0;

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);

    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._up);
    canvas.addEventListener('pointercancel', this._up);
    canvas.addEventListener('pointerleave', this._up);

    this.resize();
    // แถบที่อยู่บนมือถือทำให้ window resize บ่อย -> ปรับเฉพาะเมื่อความกว้างเปลี่ยน
    window.addEventListener('resize', () => {
      if (this.canvas.clientWidth !== this.lastWidth) this.resize();
    });
  }

  resize() {
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const rect = this.canvas.getBoundingClientRect();
    this.lastWidth = this.canvas.clientWidth;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#0b1f3a';
    this._redraw();
  }

  _point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 };
  }

  _down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.current = [this._point(e)];
    this.strokes.push(this.current);
    this._drawDot(this.current[0]);
  }

  _move(e) {
    if (!this.current) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const pt = this._point(ev);
      const prev = this.current[this.current.length - 1];
      this.current.push(pt);
      this._drawSegment(prev, pt);
    }
  }

  _up() {
    if (!this.current) return;
    this.current = null;
    this.onChange(this.isEmpty());
  }

  _width(p) { return 1.6 + p * 2.2; }

  _drawDot(pt) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.arc(pt.x, pt.y, this._width(pt.p) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawSegment(a, b) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.lineWidth = this._width((a.p + b.p) / 2);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  _redraw() {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    for (const s of this.strokes) {
      this._drawDot(s[0]);
      for (let i = 1; i < s.length; i++) this._drawSegment(s[i - 1], s[i]);
    }
  }

  clear() {
    this.strokes = [];
    this.current = null;
    this._redraw();
    this.onChange(true);
  }

  isEmpty() {
    // นับว่าเซ็นแล้วเมื่อมีจุดรวมกันพอสมควร (กันการแตะโดนพลาด)
    return this.strokes.reduce((n, s) => n + s.length, 0) < 6;
  }

  /** ส่งออกเป็น PNG พื้นขาว ครอปเฉพาะส่วนที่มีลายเซ็น และย่อให้ไฟล์เล็ก */
  toBlob(maxWidth = 600) {
    const pts = this.strokes.flat();
    const pad = 12;
    const minX = Math.max(0, Math.min(...pts.map((p) => p.x)) - pad);
    const minY = Math.max(0, Math.min(...pts.map((p) => p.y)) - pad);
    const maxX = Math.min(this.canvas.clientWidth, Math.max(...pts.map((p) => p.x)) + pad);
    const maxY = Math.min(this.canvas.clientHeight, Math.max(...pts.map((p) => p.y)) + pad);
    const w = maxX - minX;
    const h = maxY - minY;
    const scale = Math.min(1.5, maxWidth / w);

    const out = document.createElement('canvas');
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    const dpr = this.canvas.width / this.canvas.clientWidth;
    ctx.drawImage(this.canvas, minX * dpr, minY * dpr, w * dpr, h * dpr, 0, 0, out.width, out.height);
    return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  }
}
