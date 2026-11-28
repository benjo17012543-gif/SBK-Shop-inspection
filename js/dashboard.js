import { FLOORS, STORAGE_BUCKET, NO_PROBLEM, SOLUTION_OPTIONS } from './config.js';
import { sb, renderAuthChip } from './supabase-client.js';
import {
  initLayout, THAI_MONTHS, getFloor, compareStores, hasPest, escapeHtml, formatDateTime,
  monthRange, paginate, renderPagination, renderFloorTabs, toast, setBusy, openModal,
  openLightbox, confirmDialog,
} from './utils.js';

initLayout('dashboard');

const $ = (id) => document.getElementById(id);
const now = new Date();
const state = {
  year: now.getFullYear(),
  month: now.getMonth(),
  stores: [],        // ร้าน active ทั้งหมด
  inspections: [],   // บันทึกของเดือนที่เลือก
  byStore: new Map(),
  done: [], pending: [],
  ratStores: [], roachStores: [],
  tab: 'done', floor: 'ALL', search: '', page: 1,
  admin: false,
  loaded: false,
};

/* ================= ตัวเลือกเดือน/ปี ================= */
$('monthSel').innerHTML = THAI_MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
const years = [];
for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y--) years.push(y);
$('yearSel').innerHTML = years.map((y) => `<option value="${y}">${y + 543}</option>`).join('');
$('monthSel').value = state.month;
$('yearSel').value = state.year;

$('viewBtn').addEventListener('click', () => {
  state.month = Number($('monthSel').value);
  state.year = Number($('yearSel').value);
  load();
});

const periodText = () => `${THAI_MONTHS[state.month]} พ.ศ. ${state.year + 543}`;

/* ================= โหลดข้อมูล ================= */
async function fetchAll(buildQuery) {
  const size = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function load() {
  if (!sb) { render(); return; }
  const btn = $('viewBtn');
  setBusy(btn, true, 'กำลังโหลด...');
  try {
    const { start, end } = monthRange(state.year, state.month);
    const [stores, inspections] = await Promise.all([
      fetchAll(() => sb.from('stores').select('id, store_code, store_name, is_active').eq('is_active', true).order('store_code')),
      fetchAll(() => sb.from('inspections').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false })),
    ]);
    state.stores = stores.sort(compareStores);
    state.inspections = inspections;
    state.loaded = true;
    compute();
  } catch (err) {
    console.error(err);
    toast(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`, 'error', 5000);
  } finally {
    setBusy(btn, false);
  }
  state.page = 1;
  render();
}

function compute() {
  state.byStore = new Map();
  for (const ins of state.inspections) {
    if (!state.byStore.has(ins.store_id)) state.byStore.set(ins.store_id, []);
    state.byStore.get(ins.store_id).push(ins); // เรียงใหม่ → เก่า
  }
  state.done = state.stores.filter((s) => state.byStore.has(s.id));
  state.pending = state.stores.filter((s) => !state.byStore.has(s.id));
  const withPest = (pest) => state.done.filter((s) => state.byStore.get(s.id).some((i) => hasPest(i.problem, pest)));
  state.ratStores = withPest('หนู');
  state.roachStores = withPest('แมลงสาบ');
}

/* ================= แสดงผล ================= */
function render() {
  $('periodLabel').textContent = `ข้อมูลประจำเดือน ${periodText()}`;
  const total = state.stores.length;
  const done = state.done.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  $('statTotal').textContent = total;
  $('statDone').textContent = done;
  $('statPending').textContent = total - done;
  $('statRecords').textContent = state.inspections.length;
  $('progressPct').textContent = `${pct}%`;
  $('progressFill').style.width = `${pct}%`;
  $('progressBar').setAttribute('aria-valuenow', pct);

  // ความคืบหน้ารายชั้น
  $('floorProgress').innerHTML = FLOORS.map((f) => {
    const t = state.stores.filter((s) => getFloor(s.store_code) === f).length;
    const d = state.done.filter((s) => getFloor(s.store_code) === f).length;
    const p = t ? Math.round((d / t) * 100) : 0;
    return `<div class="fp-item"><span class="fp-label">ชั้น ${f}</span>
      <div class="progress sm"><div class="progress-fill" style="width:${p}%"></div></div>
      <span class="fp-num">${d}/${t}</span></div>`;
  }).join('');

  // สถิติศัตรูพืช
  const setPest = (id, n) => { $(id).querySelector('.pest-value').textContent = n; };
  setPest('ratFound', state.ratStores.length);
  setPest('ratClear', done - state.ratStores.length);
  setPest('roachFound', state.roachStores.length);
  setPest('roachClear', done - state.roachStores.length);
  $('ratFound').disabled = !state.ratStores.length;
  $('roachFound').disabled = !state.roachStores.length;

  // วิธีแก้ไขที่ใช้
  const methodCount = {};
  state.inspections.forEach((i) => { if (i.solution_method) methodCount[i.solution_method] = (methodCount[i.solution_method] || 0) + 1; });
  const maxM = Math.max(1, ...Object.values(methodCount));
  $('methodStats').innerHTML = Object.keys(methodCount).length ? `
    <h4>วิธีแก้ไขที่ใช้ (จำนวนครั้ง)</h4>
    ${SOLUTION_OPTIONS.filter((m) => methodCount[m]).map((m) => `
      <div class="bar-row"><span class="bar-label">${m}</span>
        <div class="bar"><div class="bar-fill" style="width:${(methodCount[m] / maxM) * 100}%"></div></div>
        <span class="bar-num">${methodCount[m]}</span></div>`).join('')}` : '';

  $('tabDoneCount').textContent = done;
  $('tabPendingCount').textContent = total - done;
  renderList();
}

function renderList() {
  const source = state.tab === 'done' ? state.done : state.pending;
  const counts = {};
  source.forEach((s) => { const f = getFloor(s.store_code); counts[f] = (counts[f] || 0) + 1; });
  renderFloorTabs($('listFloorTabs'), counts, state.floor, (f) => { state.floor = f; state.page = 1; renderList(); }, { includeAll: true });

  const q = state.search.trim().toLowerCase();
  const rows = source.filter((s) => (state.floor === 'ALL' || getFloor(s.store_code) === state.floor)
    && (!q || `${s.store_code} ${s.store_name}`.toLowerCase().includes(q)));
  const pg = paginate(rows, state.page);
  state.page = pg.page;

  const el = $('storeTable');
  if (!sb) {
    el.innerHTML = '<div class="empty">ยังไม่ได้เชื่อมต่อฐานข้อมูล</div>';
  } else if (!pg.items.length) {
    el.innerHTML = `<div class="empty">${state.tab === 'done' ? 'ยังไม่มีร้านที่ตรวจแล้ว' : '🎉 ตรวจครบทุกร้านแล้ว'}</div>`;
  } else if (state.tab === 'done') {
    el.innerHTML = `<table class="table responsive">
      <thead><tr><th>ชั้น</th><th>รหัสร้าน</th><th>ชื่อร้าน</th><th>ตรวจล่าสุด</th><th>ปัญหาล่าสุด</th><th>ครั้ง</th><th></th></tr></thead>
      <tbody>${pg.items.map((s) => {
        const list = state.byStore.get(s.id);
        const last = list[0];
        return `<tr class="clickable" data-id="${s.id}">
          <td data-th="ชั้น">${getFloor(s.store_code)}</td>
          <td data-th="รหัสร้าน"><span class="store-code">${escapeHtml(s.store_code)}</span></td>
          <td data-th="ชื่อร้าน">${escapeHtml(s.store_name)}</td>
          <td data-th="ตรวจล่าสุด">${formatDateTime(last.created_at)}</td>
          <td data-th="ปัญหา">${problemBadge(last.problem)}</td>
          <td data-th="จำนวนครั้ง">${list.length}</td>
          <td class="td-action"><span class="link">ดูรายละเอียด ›</span></td></tr>`;
      }).join('')}</tbody></table>`;
    el.querySelectorAll('[data-id]').forEach((tr) => tr.addEventListener('click', () => {
      const s = state.stores.find((x) => x.id === tr.dataset.id);
      showStoreDetail(`${s.store_code} · ${s.store_name}`, [s], () => true);
    }));
  } else {
    el.innerHTML = `<table class="table responsive">
      <thead><tr><th>ชั้น</th><th>รหัสร้าน</th><th>ชื่อร้าน</th><th>สถานะ</th></tr></thead>
      <tbody>${pg.items.map((s) => `<tr>
          <td data-th="ชั้น">${getFloor(s.store_code)}</td>
          <td data-th="รหัสร้าน"><span class="store-code">${escapeHtml(s.store_code)}</span></td>
          <td data-th="ชื่อร้าน">${escapeHtml(s.store_name)}</td>
          <td data-th="สถานะ"><span class="badge badge-warn">ยังไม่ได้ตรวจ</span></td></tr>`).join('')}</tbody></table>`;
  }
  renderPagination($('listPager'), pg, (p) => { state.page = p; renderList(); });
}

function problemBadge(p) {
  const cls = p === NO_PROBLEM ? 'badge-ok' : p === 'หนู-แมลงสาบ' ? 'badge-danger' : 'badge-warn';
  return `<span class="badge ${cls}">${escapeHtml(p)}</span>`;
}

/* ---------- แท็บ / ค้นหา ---------- */
document.querySelectorAll('.seg-tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.seg-tab').forEach((x) => x.classList.toggle('active', x === b));
  state.tab = b.dataset.tab; state.floor = 'ALL'; state.page = 1;
  renderList();
}));
let st;
$('listSearch').addEventListener('input', (e) => {
  clearTimeout(st);
  st = setTimeout(() => { state.search = e.target.value; state.page = 1; renderList(); }, 200);
});

/* ================= Modal รายละเอียด ================= */
function inspectionHtml(i) {
  const imgs = (i.image_urls || []).map((u) =>
    `<img src="${escapeHtml(u)}" alt="รูปประกอบ" loading="lazy" data-zoom="${escapeHtml(u)}">`).join('');
  return `<article class="ins-item" data-ins="${i.id}">
    <div class="ins-head">
      <span>🕒 ${formatDateTime(i.created_at)}</span>
      ${problemBadge(i.problem)}
    </div>
    <dl class="ins-dl">
      ${i.solution_method ? `<dt>วิธีแก้ไข</dt><dd>${escapeHtml(i.solution_method)}</dd>` : ''}
      ${i.solution_detail ? `<dt>รายละเอียด</dt><dd>${escapeHtml(i.solution_detail)}</dd>` : ''}
      ${i.remarks ? `<dt>หมายเหตุ</dt><dd>${escapeHtml(i.remarks)}</dd>` : ''}
      <dt>ผู้ตรวจ</dt><dd>${escapeHtml(i.inspector_name || '-')}</dd>
    </dl>
    ${imgs ? `<div class="ins-photos">${imgs}</div>` : '<p class="muted small">ไม่มีรูปภาพประกอบ</p>'}
    ${i.signature_url ? `<div class="ins-sig"><span class="muted small">ลายเซ็น</span><img src="${escapeHtml(i.signature_url)}" alt="ลายเซ็น" data-zoom="${escapeHtml(i.signature_url)}"></div>` : ''}
    ${state.admin ? `<div class="btn-row end"><button type="button" class="btn btn-danger btn-sm" data-delete="${i.id}">🗑️ ลบบันทึกนี้</button></div>` : ''}
  </article>`;
}

/** stores: รายการร้าน, filter: เลือกเฉพาะบันทึกที่เกี่ยวข้อง */
function showStoreDetail(title, stores, filter) {
  const body = stores.map((s) => {
    const list = (state.byStore.get(s.id) || []).filter(filter);
    return `<section class="detail-store">
      <h4><span class="store-code">${escapeHtml(s.store_code)}</span> ${escapeHtml(s.store_name)}
        <span class="tag">ชั้น ${getFloor(s.store_code)}</span></h4>
      ${list.map(inspectionHtml).join('')}
    </section>`;
  }).join('') || '<div class="empty">ไม่มีข้อมูล</div>';

  const m = openModal({ title, body, wide: true });
  m.el.querySelectorAll('[data-zoom]').forEach((img) => img.addEventListener('click', () => openLightbox(img.dataset.zoom)));
  m.el.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('ต้องการลบบันทึกการตรวจนี้ใช่หรือไม่? (ลบรูปภาพด้วย)', 'ลบ'))) return;
    try {
      await deleteInspection(b.dataset.delete);
      b.closest('.ins-item').remove();
      toast('ลบบันทึกเรียบร้อย', 'success');
      compute(); render();
    } catch (err) { toast(`ลบไม่สำเร็จ: ${err.message}`, 'error'); }
  }));
}

async function deleteInspection(id) {
  const ins = state.inspections.find((i) => i.id === id);
  const { error } = await sb.from('inspections').delete().eq('id', id);
  if (error) throw error;
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const paths = [...(ins?.image_urls || []), ins?.signature_url].filter(Boolean)
    .map((u) => decodeURIComponent(u.split(marker)[1] || '')).filter(Boolean);
  if (paths.length) await sb.storage.from(STORAGE_BUCKET).remove(paths); // best-effort
  state.inspections = state.inspections.filter((i) => i.id !== id);
}

$('ratFound').addEventListener('click', () =>
  showStoreDetail(`ร้านที่พบหนู (${state.ratStores.length} ร้าน) · ${periodText()}`, state.ratStores, (i) => hasPest(i.problem, 'หนู')));
$('roachFound').addEventListener('click', () =>
  showStoreDetail(`ร้านที่พบแมลงสาบ (${state.roachStores.length} ร้าน) · ${periodText()}`, state.roachStores, (i) => hasPest(i.problem, 'แมลงสาบ')));

/* ================= ข้อมูลสำหรับ Export ================= */
function reportData() {
  const total = state.stores.length;
  const done = state.done.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const summary = [
    ['ร้านทั้งหมด', total],
    ['ตรวจแล้ว', done],
    ['ยังไม่ได้ตรวจ', total - done],
    ['ความคืบหน้า (%)', pct],
    ['จำนวนครั้งที่บันทึก', state.inspections.length],
  ];
  const pest = [
    ['หนู', state.ratStores.length, done - state.ratStores.length],
    ['แมลงสาบ', state.roachStores.length, done - state.roachStores.length],
  ];
  const floors = FLOORS.map((f) => {
    const t = state.stores.filter((s) => getFloor(s.store_code) === f).length;
    const d = state.done.filter((s) => getFloor(s.store_code) === f).length;
    return [`ชั้น ${f}`, t, d, t - d, t ? Math.round((d / t) * 100) : 0];
  });
  const inspections = [...state.inspections].reverse().map((i, idx) => [
    idx + 1, formatDateTime(i.created_at), getFloor(i.store_code), i.store_code, i.store_name,
    i.problem, i.solution_method || '-', i.solution_detail || '', i.remarks || '', i.inspector_name || '',
    (i.image_urls || []).length, (i.image_urls || []).join(' '), i.signature_url || '',
  ]);
  const pending = state.pending.map((s, idx) => [idx + 1, getFloor(s.store_code), s.store_code, s.store_name]);
  return { summary, pest, floors, inspections, pending, pct };
}

const INS_HEAD = ['ลำดับ', 'วันที่-เวลา', 'ชั้น', 'รหัสร้าน', 'ชื่อร้าน', 'ปัญหาที่พบ', 'วิธีแก้ไข',
  'รายละเอียดวิธีแก้ไข', 'หมายเหตุ', 'ผู้ตรวจ', 'จำนวนรูป', 'ลิงก์รูปภาพ', 'ลิงก์ลายเซ็น'];
const fileBase = () => `pest-report-${state.year}-${String(state.month + 1).padStart(2, '0')}`;

function ensureLoaded() {
  if (!state.loaded) { toast('กรุณากด "ดูข้อมูล" ก่อน Export', 'warn'); return false; }
  return true;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- CSV ---------- */
function exportCsv() {
  if (!ensureLoaded()) return;
  const d = reportData();
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['สถานะ', ...INS_HEAD.slice(1)];
  const rows = [
    [`รายงานการตรวจร้านค้าและศัตรูพืช ประจำเดือน ${periodText()}`],
    [],
    head,
    ...d.inspections.map((r) => ['ตรวจแล้ว', ...r.slice(1)]),
    ...state.pending.map((s) => ['ยังไม่ได้ตรวจ', '', getFloor(s.store_code), s.store_code, s.store_name]),
  ];
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n'); // BOM ให้ Excel อ่านภาษาไทยได้
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`);
  toast('ส่งออก CSV เรียบร้อย', 'success');
}

/* ---------- Excel ---------- */
function exportXlsx() {
  if (!ensureLoaded()) return;
  if (!window.XLSX) { toast('ไลบรารี Excel ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง', 'warn'); return; }
  const d = reportData();
  const wb = XLSX.utils.book_new();

  const summary = [
    [`รายงานการตรวจร้านค้าและศัตรูพืช ประจำเดือน ${periodText()}`], [],
    ['สรุปภาพรวม', 'จำนวน'], ...d.summary, [],
    ['สถิติศัตรูพืช', 'พบ (ร้าน)', 'ไม่พบ (ร้าน)'], ...d.pest, [],
    ['ชั้น', 'ร้านทั้งหมด', 'ตรวจแล้ว', 'ยังไม่ได้ตรวจ', 'ความคืบหน้า (%)'], ...d.floors,
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'สรุป');

  const ws2 = XLSX.utils.aoa_to_sheet([INS_HEAD, ...d.inspections]);
  ws2['!cols'] = [6, 20, 6, 12, 26, 14, 18, 30, 30, 18, 9, 50, 50].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws2, 'รายการตรวจ');

  const ws3 = XLSX.utils.aoa_to_sheet([['ลำดับ', 'ชั้น', 'รหัสร้าน', 'ชื่อร้าน'], ...d.pending]);
  ws3['!cols'] = [{ wch: 6 }, { wch: 6 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'ยังไม่ได้ตรวจ');

  XLSX.writeFile(wb, `${fileBase()}.xlsx`);
  toast('ส่งออก Excel เรียบร้อย', 'success');
}

/* ---------- PDF (HTML → Canvas → PDF เพื่อรองรับภาษาไทย) ---------- */
async function exportPdf() {
  if (!ensureLoaded()) return;
  if (!window.jspdf || !window.html2canvas) { toast('ไลบรารี PDF ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง', 'warn'); return; }
  const btn = $('exportPdf');
  setBusy(btn, true, 'กำลังสร้าง PDF...');
  const root = document.createElement('div');
  root.className = 'pdf-root';
  document.body.appendChild(root);
  try {
    await document.fonts.ready;
    const d = reportData();
    const pages = buildPdfPages(root, d);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < pages.length; i++) {
      pages[i].querySelector('.pdf-footer').textContent =
        `พิมพ์เมื่อ ${formatDateTime(new Date().toISOString())} · หน้า ${i + 1}/${pages.length}`;
      const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
    }
    pdf.save(`${fileBase()}.pdf`);
    toast('ส่งออก PDF เรียบร้อย', 'success');
  } catch (err) {
    console.error(err);
    toast(`สร้าง PDF ไม่สำเร็จ: ${err.message}`, 'error');
  } finally {
    root.remove();
    setBusy(btn, false);
  }
}

/** สร้างหน้า A4 (794×1123px) แบ่งหน้าอัตโนมัติตามความสูงจริงของเนื้อหา */
function buildPdfPages(root, d) {
  const pages = [];
  let content;
  const newPage = () => {
    const page = document.createElement('div');
    page.className = 'pdf-page';
    page.innerHTML = '<div class="pdf-content"></div><div class="pdf-footer"></div>';
    root.appendChild(page);
    pages.push(page);
    content = page.querySelector('.pdf-content');
  };
  const overflow = () => content.scrollHeight > content.clientHeight + 1;
  const addBlock = (html) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    content.appendChild(node);
    if (overflow() && content.children.length > 1) { node.remove(); newPage(); content.appendChild(node); }
  };
  const addTable = (title, head, rows, colClass = '') => {
    const start = () => {
      addBlock(`<div class="pdf-table-wrap"><h3>${escapeHtml(title)}</h3>
        <table class="pdf-table ${colClass}"><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`);
      return content.lastElementChild.querySelector('tbody');
    };
    let tbody = start();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${head.length}" class="center">— ไม่มีข้อมูล —</td></tr>`;
      return;
    }
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = r.map((c) => `<td>${escapeHtml(c)}</td>`).join('');
      tbody.appendChild(tr);
      if (overflow()) {
        tr.remove();
        newPage();
        tbody = start();
        content.lastElementChild.querySelector('h3').textContent = `${title} (ต่อ)`;
        tbody.appendChild(tr);
      }
    }
  };

  newPage();
  addBlock(`<div class="pdf-header">
      <div><h1>รายงานการตรวจร้านค้าและติดตามศัตรูพืช</h1><h2>ประจำเดือน ${periodText()}</h2></div>
      <div class="pdf-logo">🐀🪳</div></div>`);
  addBlock(`<div class="pdf-summary">${d.summary.slice(0, 3).map(([k, v]) =>
    `<div class="pdf-stat"><span>${k}</span><b>${v}</b></div>`).join('')}
    <div class="pdf-stat"><span>ความคืบหน้า</span><b>${d.pct}%</b></div></div>`);
  addTable('สถิติการพบศัตรูพืช (จำนวนร้าน)', ['ประเภท', 'พบ', 'ไม่พบ'], d.pest);
  addTable('ความคืบหน้ารายชั้น', ['ชั้น', 'ร้านทั้งหมด', 'ตรวจแล้ว', 'ยังไม่ได้ตรวจ', '%'], d.floors);
  addTable('รายการบันทึกการตรวจ', ['#', 'วันที่-เวลา', 'รหัสร้าน', 'ชื่อร้าน', 'ปัญหา', 'วิธีแก้ไข', 'รายละเอียด / หมายเหตุ', 'ผู้ตรวจ'],
    d.inspections.map((r) => [r[0], r[1], r[3], r[4], r[5], r[6], [r[7], r[8]].filter(Boolean).join(' / '), r[9]]), 'ins');
  addTable('รายชื่อร้านที่ยังไม่ได้ตรวจ', ['#', 'ชั้น', 'รหัสร้าน', 'ชื่อร้าน'], d.pending);
  return pages;
}

$('exportCsv').addEventListener('click', exportCsv);
$('exportXlsx').addEventListener('click', exportXlsx);
$('exportPdf').addEventListener('click', exportPdf);

/* ================= เริ่มต้น ================= */
(async () => {
  state.admin = !!(await renderAuthChip());
  render();
  load();
})();
