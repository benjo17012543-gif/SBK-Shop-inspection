import { FLOORS, PAGE_SIZE } from './config.js?v=20261128c';
import { isConfigured } from './supabase-client.js?v=20261128c';

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/* ---------------- ข้อมูล / รูปแบบ ---------------- */

/** ชั้นของร้าน: อักษรตัวแรกของรหัสร้าน (B,1-5) */
export function getFloor(code) {
  const c = String(code || '').trim().charAt(0).toUpperCase();
  return FLOORS.includes(c) ? c : '?';
}

export const floorLabel = (f) => (f === 'ALL' ? 'ทั้งหมด' : `ชั้น ${f}`);

/** ลำดับชั้นตามทิศทาง: 'asc' = B → 6, 'desc' = 6 → B */
export const floorsInOrder = (dir = 'asc') => (dir === 'desc' ? [...FLOORS].reverse() : [...FLOORS]);

/** เรียงร้าน: ตามชั้น (B→6 หรือ 6→B) แล้วตามชื่อร้าน */
export function compareStores(a, b, dir = 'asc') {
  const d = FLOORS.indexOf(getFloor(a.store_code)) - FLOORS.indexOf(getFloor(b.store_code));
  if (d) return dir === 'desc' ? -d : d;
  return String(a.store_name).localeCompare(String(b.store_name), 'th', { numeric: true })
    || String(a.store_code).localeCompare(String(b.store_code), 'th', { numeric: true });
}

/** สร้างรหัสร้านแบบสุ่ม: <ชั้น>-<เลขสุ่ม 3 หลัก> เช่น B-472, 3-058 (ไม่ซ้ำกับ existing) */
export function randomStoreCode(floor, existing = new Set()) {
  const taken = new Set([...existing].map((c) => String(c).toUpperCase()));
  const free = [];
  for (let n = 1; n <= 999; n++) {
    const code = `${floor}-${String(n).padStart(3, '0')}`;
    if (!taken.has(code)) free.push(code);
  }
  if (!free.length) throw new Error(`รหัสของชั้น ${floor} เต็มแล้ว (999 ร้าน)`);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return free[buf[0] % free.length];
}

/** ปุ่มสลับการเรียงชั้น (จำค่าไว้ในเครื่อง) */
export function initSortToggle(btn, onChange, key = 'floorSort') {
  let dir = 'asc';
  try { dir = localStorage.getItem(key) === 'desc' ? 'desc' : 'asc'; } catch { /* ignore */ }
  const paint = () => {
    btn.innerHTML = `⇅ ชั้น ${dir === 'asc' ? 'B → 6' : '6 → B'}`;
    btn.setAttribute('aria-label', `เรียงชั้นจาก ${dir === 'asc' ? 'B ไป 6' : '6 ไป B'} (กดเพื่อสลับ)`);
  };
  paint();
  btn.addEventListener('click', () => {
    dir = dir === 'asc' ? 'desc' : 'asc';
    try { localStorage.setItem(key, dir); } catch { /* ignore */ }
    paint();
    onChange(dir);
  });
  return dir;
}

/** problem มีศัตรูพืชชนิดนั้นหรือไม่ ('หนู' | 'แมลงสาบ') */
export const hasPest = (problem, pest) => problem === pest || problem === 'หนู-แมลงสาบ';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** ช่วงเวลาของเดือน [start, end) ตามเวลาท้องถิ่น → ISO */
export function monthRange(year, monthIndex) {
  return {
    start: new Date(year, monthIndex, 1).toISOString(),
    end: new Date(year, monthIndex + 1, 1).toISOString(),
  };
}

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ---------------- การแบ่งหน้า ---------------- */

export function paginate(items, page, size = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((p - 1) * size, p * size), page: p, totalPages, total: items.length };
}

export function renderPagination(el, { page, totalPages, total }, onChange) {
  if (total === 0 || totalPages <= 1) {
    el.innerHTML = total ? `<span class="muted">ทั้งหมด ${total} รายการ</span>` : '';
    return;
  }
  const nums = [];
  let from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  from = Math.max(1, to - 4);
  for (let i = from; i <= to; i++) {
    nums.push(`<button type="button" class="page-btn ${i === page ? 'active' : ''}" data-p="${i}">${i}</button>`);
  }
  el.innerHTML = `
    <button type="button" class="page-btn" data-p="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="ก่อนหน้า">‹</button>
    ${nums.join('')}
    <button type="button" class="page-btn" data-p="${page + 1}" ${page === totalPages ? 'disabled' : ''} aria-label="ถัดไป">›</button>
    <span class="muted page-info">หน้า ${page}/${totalPages} · ${total} รายการ</span>`;
  el.querySelectorAll('[data-p]').forEach((b) =>
    b.addEventListener('click', () => onChange(Number(b.dataset.p))));
}

/** แท็บชั้น: counts = { B: 10, '1': 4, ... } */
export function renderFloorTabs(el, counts, active, onChange, { includeAll = false, dir = 'asc' } = {}) {
  const floors = floorsInOrder(dir);
  const keys = includeAll ? ['ALL', ...floors] : floors;
  el.innerHTML = keys.map((f) => {
    const n = f === 'ALL' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[f] || 0);
    return `<button type="button" role="tab" class="floor-tab ${f === active ? 'active' : ''}" data-f="${f}"
              aria-selected="${f === active}">${floorLabel(f)}<span class="count">${n}</span></button>`;
  }).join('');
  el.querySelectorAll('[data-f]').forEach((b) =>
    b.addEventListener('click', () => onChange(b.dataset.f)));
}

/* ---------------- UI ทั่วไป ---------------- */

export function toast(message, type = 'info', ms = 3200) {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    wrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function setBusy(btn, busy, text) {
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${escapeHtml(text || 'กำลังดำเนินการ...')}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/** เปิด Modal ทั่วไป คืนค่า { el, close } */
export function openModal({ title, body, footer = '', wide = false, onClose }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="icon-btn" data-close aria-label="ปิด">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('no-scroll');
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  document.body.classList.add('no-scroll');
  return { el: backdrop, close };
}

export function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${escapeHtml(src)}" alt="รูปภาพขยาย"><button class="icon-btn lb-close" aria-label="ปิด">✕</button>`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

export function confirmDialog(message, okText = 'ยืนยัน', danger = true) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: 'ยืนยันการทำรายการ',
      body: `<p>${escapeHtml(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${escapeHtml(okText)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
}

/* ---------------- Layout (แถบนำทาง) ---------------- */

const NAV = [
  { key: 'inspect', href: 'index.html', icon: '📝', label: 'บันทึกการตรวจ' },
  { key: 'dashboard', href: 'dashboard.html', icon: '📊', label: 'Dashboard' },
  { key: 'stores', href: 'stores.html', icon: '🏪', label: 'จัดการร้านค้า' },
];

/**
 * minimal = true → หน้าสำหรับพนักงาน (User): ไม่มีแถบด้านบนและเมนูสลับหน้า
 */
export function initLayout(active, { minimal = false } = {}) {
  if (minimal) {
    document.body.classList.add('minimal');
    addConfigBanner((b) => document.body.prepend(b));
    return;
  }
  const links = (cls) => NAV.map((n) => `
    <a href="${n.href}" class="${cls} ${n.key === active ? 'active' : ''}" ${n.key === active ? 'aria-current="page"' : ''}>
      <span class="nav-icon" aria-hidden="true">${n.icon}</span><span>${n.label}</span>
    </a>`).join('');

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="index.html"><span class="brand-logo" aria-hidden="true">🐀</span>
        <span><strong>Pest Inspect</strong><small>ระบบตรวจร้านค้า & ศัตรูพืช</small></span></a>
      <nav class="topnav">${links('topnav-link')}</nav>
      <div id="authSlot" class="auth-slot"></div>
    </div>`;
  document.body.prepend(header);

  const bottom = document.createElement('nav');
  bottom.className = 'bottomnav';
  bottom.innerHTML = links('bottomnav-link');
  document.body.appendChild(bottom);

  addConfigBanner((b) => header.after(b));
}

function addConfigBanner(insert) {
  if (isConfigured && window.supabase) return;
  const b = document.createElement('div');
  b.className = 'config-banner';
  b.innerHTML = !isConfigured
    ? '⚠️ ยังไม่ได้ตั้งค่า Supabase — กรุณาแก้ไข <code>SUPABASE_URL</code> และ <code>SUPABASE_ANON_KEY</code> ในไฟล์ <code>js/config.js</code>'
    : '⚠️ โหลดไลบรารี Supabase ไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
  insert(b);
}
