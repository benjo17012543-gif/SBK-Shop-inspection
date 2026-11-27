/* =====================================================================
 *  common.js — ตัวช่วยที่ใช้ร่วมกันทุกหน้า
 *  (โหลดหลัง js/config.js และ supabase-js)
 * ===================================================================== */
const CFG = window.APP_CONFIG || {};

const IS_CONFIGURED =
  !!CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('YOUR-PROJECT') &&
  !!CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes('YOUR-');

/** Supabase client (null ถ้ายังไม่ได้ตั้งค่า) */
const db = IS_CONFIGURED && window.supabase
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;

/* ---------- ค่าคงที่ของระบบ ---------- */
const PROBLEMS = ['หนู', 'แมลงสาบ', 'หนู-แมลงสาบ', 'ไม่พบปัญหา'];
const METHODS = ['หยอดเจล', 'วางกรงดักหนู', 'วางถาดกาวดักหนู', 'โยนยาเบื่อหนู', 'อื่นๆ'];
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const hasRat = (p) => p === 'หนู' || p === 'หนู-แมลงสาบ';
const hasRoach = (p) => p === 'แมลงสาบ' || p === 'หนู-แมลงสาบ';

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ---------- วันที่ / เวลา (แสดงผลแบบไทย พ.ศ.) ---------- */
function fmtDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
/** ช่วงเวลาเดือนที่เลือก (เวลาท้องถิ่น) -> ISO สำหรับ query */
function monthRange(year, month /* 1-12 */) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}
function monthLabel(year, month) {
  return `${THAI_MONTHS[month - 1]} ${year + 543}`;
}

/* ---------- Badge ---------- */
function problemBadge(p) {
  const cls = p === 'หนู' ? 'rat' : p === 'แมลงสาบ' ? 'roach' : p === 'หนู-แมลงสาบ' ? 'both' : 'ok';
  return `<span class="badge badge-${cls}">${escapeHtml(p)}</span>`;
}

/* ---------- Toast ---------- */
function toast(message, type = 'info', ms = 3200) {
  let box = $('#toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastBox';
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ---------- Loading overlay ---------- */
function showLoading(text = 'กำลังโหลด...') {
  let ov = $('#loadingOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'loadingOverlay';
    ov.className = 'loading-overlay';
    ov.innerHTML = '<div class="loading-card"><div class="spinner"></div><div class="loading-text"></div></div>';
    document.body.appendChild(ov);
  }
  $('.loading-text', ov).textContent = text;
  ov.classList.add('show');
}
function hideLoading() { $('#loadingOverlay')?.classList.remove('show'); }

/* ---------- Modal ---------- */
function openModal(title, html, { wide = false } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.id = 'appModal';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <h3 id="modalTitle">${escapeHtml(title)}</h3>
        <button class="icon-btn" data-close aria-label="ปิด">✕</button>
      </div>
      <div class="modal-body">${html}</div>
    </div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) closeModal();
  });
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  return wrap;
}
function closeModal() {
  $('#appModal')?.remove();
  document.body.classList.remove('no-scroll');
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#lightbox')) $('#lightbox').remove(); else closeModal();
});

/* ---------- Lightbox (ดูรูปเต็มจอ) ---------- */
document.addEventListener('click', (e) => {
  const img = e.target.closest('[data-lightbox]');
  if (!img) return;
  e.preventDefault();
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${escapeHtml(img.dataset.lightbox)}" alt="">`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
});

/* ---------- แจ้งเตือนเมื่อยังไม่ได้ตั้งค่า Supabase ---------- */
function requireConfig() {
  if (IS_CONFIGURED && db) return true;
  const main = $('main');
  const div = document.createElement('div');
  div.className = 'alert alert-warn';
  div.innerHTML = `<strong>ยังไม่ได้เชื่อมต่อ Supabase</strong><br>
    กรุณาแก้ไขไฟล์ <code>js/config.js</code> ใส่ค่า <code>SUPABASE_URL</code> และ
    <code>SUPABASE_ANON_KEY</code> แล้วรันสคริปต์ <code>supabase/schema.sql</code> ในโปรเจกต์ Supabase ของคุณ`;
  main?.prepend(div);
  return false;
}

/* ---------- แปลง error ของ Supabase เป็นข้อความไทย ---------- */
function errMsg(err) {
  if (!err) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  if (err.code === '23505') return 'ข้อมูลซ้ำ (รหัสร้านค้านี้มีอยู่แล้ว)';
  if (err.code === '23503') return 'ไม่สามารถลบได้ เพราะมีประวัติการตรวจผูกอยู่ — แนะนำให้ "ปิดใช้งาน" แทน';
  if (err.code === '42501' || /row-level security/i.test(err.message || '')) return 'ไม่มีสิทธิ์ทำรายการนี้ (กรุณาล็อกอิน Admin)';
  if (/Failed to fetch|NetworkError/i.test(err.message || '')) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่';
  if (/Invalid login credentials/i.test(err.message || '')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  return err.message || String(err);
}

/* ---------- ไฮไลต์เมนูหน้าปัจจุบัน ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
});

/* ---------- Pagination (แบ่งหน้า) ---------- */
/**
 * แสดงแถบเปลี่ยนหน้า
 * @param {HTMLElement} el     กล่องที่จะวางแถบเปลี่ยนหน้า
 * @param {{total:number, page:number, size:number, onChange:(page:number, size:number)=>void}} o
 */
function renderPager(el, { total, page, size, onChange }) {
  const pages = Math.max(1, Math.ceil(total / size));
  page = Math.min(Math.max(1, page), pages);
  if (!total) { el.innerHTML = ''; return page; }

  // เลขหน้าแบบย่อ: 1 … 4 5 6 … 12
  const nums = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  el.innerHTML = `
    <div class="pager">
      <div class="pager-info">แสดง <b>${from}–${to}</b> จาก <b>${total}</b> รายการ</div>
      <div class="pager-btns">
        <button type="button" class="pg" data-pg="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="หน้าก่อน">‹</button>
        ${nums.map((n) => (n === '…' ? '<span class="pg-gap">…</span>'
          : `<button type="button" class="pg ${n === page ? 'active' : ''}" data-pg="${n}">${n}</button>`)).join('')}
        <button type="button" class="pg" data-pg="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="หน้าถัดไป">›</button>
      </div>
      <select class="pg-size" aria-label="จำนวนต่อหน้า">
        ${[10, 20, 50, 100].map((n) => `<option value="${n}" ${n === size ? 'selected' : ''}>${n} / หน้า</option>`).join('')}
      </select>
    </div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-pg]');
    if (b && !b.disabled) onChange(Number(b.dataset.pg), size);
  };
  $('.pg-size', el).onchange = (e) => onChange(1, Number(e.target.value));
  return page;
}
const pageSlice = (items, page, size) => items.slice((page - 1) * size, page * size);
