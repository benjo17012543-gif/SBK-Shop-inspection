import { FLOORS } from './config.js';
import { sb, getSession, signIn, renderAuthChip } from './supabase-client.js';
import {
  initLayout, getFloor, compareStores, escapeHtml, paginate, renderPagination, renderFloorTabs,
  toast, setBusy, openModal, confirmDialog, randomStoreCode, initSortToggle,
} from './utils.js';

initLayout('stores');

const $ = (id) => document.getElementById(id);
const state = { stores: [], floor: 'ALL', search: '', status: 'all', page: 1, dir: 'asc' };
const sortStores = () => state.stores.sort((a, b) => compareStores(a, b, state.dir));
state.dir = initSortToggle($('sortBtn'), (dir) => { state.dir = dir; sortStores(); state.page = 1; render(); });

/* ================= Auth ================= */
async function boot() {
  const session = await renderAuthChip();
  $('loginCard').classList.toggle('hidden', !!session);
  $('manager').classList.toggle('hidden', !session);
  if (session) loadStores();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('loginBtn');
  setBusy(btn, true, 'กำลังเข้าสู่ระบบ...');
  try {
    await signIn($('email').value.trim(), $('password').value);
    toast('เข้าสู่ระบบสำเร็จ', 'success');
    $('password').value = '';
    await boot();
  } catch (err) {
    toast(err.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : err.message, 'error');
  } finally {
    setBusy(btn, false);
  }
});

/** ตรวจสิทธิ์ซ้ำก่อนทุกการแก้ไข (กรณี session หมดอายุ) */
async function requireAdmin() {
  if (await getSession()) return true;
  toast('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 'warn');
  boot();
  return false;
}

/* ================= ข้อมูล ================= */
async function loadStores() {
  $('table').innerHTML = '<div class="empty"><span class="spinner dark"></span> กำลังโหลด...</div>';
  const { data, error } = await sb.from('stores').select('*').order('store_code');
  if (error) { toast(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error'); return; }
  state.stores = data;
  sortStores();
  render();
}

function render() {
  const statusOk = (s) => state.status === 'all' || (state.status === 'active' ? s.is_active : !s.is_active);
  const q = state.search.trim().toLowerCase();
  const base = state.stores.filter((s) => statusOk(s) && (!q || `${s.store_code} ${s.store_name}`.toLowerCase().includes(q)));

  const counts = {};
  base.forEach((s) => { const f = getFloor(s.store_code); counts[f] = (counts[f] || 0) + 1; });
  renderFloorTabs($('floorTabs'), counts, state.floor, (f) => { state.floor = f; state.page = 1; render(); }, { includeAll: true, dir: state.dir });

  const rows = base.filter((s) => state.floor === 'ALL' || getFloor(s.store_code) === state.floor);
  const pg = paginate(rows, state.page);
  state.page = pg.page;

  $('table').innerHTML = !pg.items.length ? '<div class="empty">ไม่พบร้านค้า</div>' : `
    <table class="table responsive">
      <thead><tr><th>ชั้น</th><th>รหัสร้าน</th><th>ชื่อร้าน</th><th>สถานะ</th><th class="right">จัดการ</th></tr></thead>
      <tbody>${pg.items.map((s) => `
        <tr class="${s.is_active ? '' : 'row-inactive'}">
          <td data-th="ชั้น">${getFloor(s.store_code)}</td>
          <td data-th="รหัสร้าน"><span class="store-code">${escapeHtml(s.store_code)}</span></td>
          <td data-th="ชื่อร้าน">${escapeHtml(s.store_name)}</td>
          <td data-th="สถานะ">
            <label class="switch" title="เปิด/ปิดการใช้งาน">
              <input type="checkbox" data-toggle="${s.id}" ${s.is_active ? 'checked' : ''}>
              <span class="slider"></span><span class="switch-text">${s.is_active ? 'Active' : 'Inactive'}</span>
            </label>
          </td>
          <td class="td-action right">
            <button type="button" class="btn btn-ghost btn-sm" data-edit="${s.id}">✏️ แก้ไข</button>
            <button type="button" class="btn btn-ghost btn-sm danger" data-del="${s.id}">🗑️ ลบ</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  $('table').querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(state.stores.find((s) => s.id === b.dataset.edit))));
  $('table').querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => removeStore(state.stores.find((s) => s.id === b.dataset.del))));
  $('table').querySelectorAll('[data-toggle]').forEach((c) =>
    c.addEventListener('change', () => toggleActive(state.stores.find((s) => s.id === c.dataset.toggle), c)));

  renderPagination($('pager'), pg, (p) => { state.page = p; render(); });
}

/* ================= เพิ่ม / แก้ไข ================= */
const CODE_RE = new RegExp(`^[${FLOORS.join('')}]`, 'i');

const existingCodes = (exceptId) => new Set(state.stores.filter((s) => s.id !== exceptId).map((s) => s.store_code));

/** เพิ่ม/แก้ไขร้าน: เลือกชั้นจาก Dropdown + พิมพ์ชื่อร้าน → รหัสร้าน = <ชั้น>-<เลขสุ่ม 3 หลัก> */
function openForm(store = null) {
  const curFloor = store ? getFloor(store.store_code) : (state.floor !== 'ALL' ? state.floor : FLOORS[0]);
  const m = openModal({
    title: store ? 'แก้ไขร้านค้า' : 'เพิ่มร้านค้า',
    body: `<form id="storeForm" novalidate>
      <label class="label" for="fFloor">ชั้น <span class="req">*</span></label>
      <select id="fFloor" class="input">
        ${FLOORS.map((f) => `<option value="${f}" ${f === curFloor ? 'selected' : ''}>ชั้น ${f}</option>`).join('')}
      </select>
      <label class="label" for="fName">ชื่อร้านค้า <span class="req">*</span></label>
      <input id="fName" class="input" required maxlength="120" value="${escapeHtml(store?.store_name || '')}" placeholder="พิมพ์ชื่อร้านค้า">
      <label class="label">รหัสร้านค้า (สร้างอัตโนมัติ)</label>
      <div class="code-preview">
        <span class="store-code big" id="fCode"></span>
        <button type="button" class="btn btn-ghost btn-sm" id="reroll">🎲 สุ่มใหม่</button>
      </div>
      <p class="hint">รูปแบบ: ชั้น-เลขสุ่ม 3 หลัก (ไม่ซ้ำกับร้านอื่น)</p>
      <label class="checkbox mt"><input type="checkbox" id="fActive" ${store?.is_active === false ? '' : 'checked'}> เปิดใช้งาน (Active)</label>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
             <button type="submit" form="storeForm" class="btn btn-primary" id="saveStore">💾 บันทึก</button>`,
  });
  const floorSel = m.el.querySelector('#fFloor');
  const codeEl = m.el.querySelector('#fCode');
  const name = m.el.querySelector('#fName');
  let code = store?.store_code || '';
  const roll = () => {
    try { code = randomStoreCode(floorSel.value, existingCodes(store?.id)); } catch (err) { code = ''; toast(err.message, 'error'); }
    codeEl.textContent = code || '—';
  };
  // แก้ไข: คงรหัสเดิมถ้ายังอยู่ชั้นเดิม ; เปลี่ยนชั้น → สุ่มรหัสใหม่ในชั้นนั้น
  floorSel.addEventListener('change', () => {
    if (store && floorSel.value === getFloor(store.store_code)) { code = store.store_code; codeEl.textContent = code; } else roll();
  });
  m.el.querySelector('#reroll').addEventListener('click', roll);
  if (store) codeEl.textContent = code; else roll();
  setTimeout(() => name.focus(), 50);

  m.el.querySelector('#storeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { store_code: code, store_name: name.value.replace(/\s+/g, ' ').trim(), is_active: m.el.querySelector('#fActive').checked };
    if (!payload.store_name) { toast('กรุณากรอกชื่อร้านค้า', 'warn'); name.focus(); return; }
    if (!payload.store_code) return;
    const dup = state.stores.find((s) => s.id !== store?.id && getFloor(s.store_code) === floorSel.value
      && s.store_name.toLowerCase() === payload.store_name.toLowerCase());
    if (dup && !(await confirmDialog(`ชั้น ${floorSel.value} มีร้าน "${dup.store_name}" (${dup.store_code}) อยู่แล้ว ต้องการบันทึกซ้ำหรือไม่?`, 'บันทึก', false))) return;
    if (!(await requireAdmin())) return;
    const btn = m.el.querySelector('#saveStore');
    setBusy(btn, true, 'กำลังบันทึก...');
    let { error } = store
      ? await sb.from('stores').update(payload).eq('id', store.id)
      : await sb.from('stores').insert(payload);
    if (error?.code === '23505' && payload.store_code !== store?.store_code) { // รหัสชนกับร้านที่เพิ่งเพิ่มจากเครื่องอื่น → สุ่มใหม่ 1 ครั้ง
      roll(); payload.store_code = code;
      ({ error } = store ? await sb.from('stores').update(payload).eq('id', store.id) : await sb.from('stores').insert(payload));
    }
    setBusy(btn, false);
    if (error) { toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error'); return; }
    toast(`${store ? 'แก้ไข' : 'เพิ่ม'}ร้าน ${payload.store_code} เรียบร้อย`, 'success');
    m.close();
    loadStores();
  });
}

async function toggleActive(store, checkbox) {
  if (!(await requireAdmin())) { checkbox.checked = store.is_active; return; }
  const { error } = await sb.from('stores').update({ is_active: checkbox.checked }).eq('id', store.id);
  if (error) {
    checkbox.checked = store.is_active;
    toast(`เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`, 'error');
    return;
  }
  store.is_active = checkbox.checked;
  toast(`${store.store_code}: ${store.is_active ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'}แล้ว`, 'success');
  render();
}

async function removeStore(store) {
  if (!(await requireAdmin())) return;
  const { count, error: cErr } = await sb.from('inspections')
    .select('id', { count: 'exact', head: true }).eq('store_id', store.id);
  if (cErr) { toast(cErr.message, 'error'); return; }
  if (count > 0) {
    if (store.is_active && await confirmDialog(
      `ร้าน ${store.store_code} มีประวัติการตรวจ ${count} รายการ จึงไม่สามารถลบถาวรได้ (เพื่อรักษารายงาน) ต้องการ "ปิดการใช้งาน" แทนหรือไม่?`,
      'ปิดการใช้งาน', false)) {
      const { error } = await sb.from('stores').update({ is_active: false }).eq('id', store.id);
      if (error) toast(error.message, 'error');
      else { toast('ปิดการใช้งานแล้ว', 'success'); loadStores(); }
    } else if (!store.is_active) {
      toast('ร้านนี้มีประวัติการตรวจ จึงลบถาวรไม่ได้ (ปิดการใช้งานอยู่แล้ว)', 'warn');
    }
    return;
  }
  if (!(await confirmDialog(`ลบร้าน ${store.store_code} · ${store.store_name} ถาวรหรือไม่?`, 'ลบถาวร'))) return;
  const { error } = await sb.from('stores').delete().eq('id', store.id);
  if (error) { toast(`ลบไม่สำเร็จ: ${error.message}`, 'error'); return; }
  toast('ลบร้านค้าเรียบร้อย', 'success');
  loadStores();
}

/* ================= นำเข้า CSV (store_code,store_name[,is_active]) ================= */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** อ่านไฟล์ได้ทั้ง UTF-8 และภาษาไทยแบบเก่า (TIS-620 / Windows-874 ที่ Excel บันทึก) */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* not UTF-8 */ }
  return new TextDecoder('windows-874').decode(buf);
}

const cleanName = (s) => String(s || '').replace(/\b([Cc])af\?/g, '$1afé').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

/** รูปแบบ 1: store_code,store_name[,is_active] */
function fromCodeFormat(rows) {
  if (rows.length && !CODE_RE.test(rows[0][0].trim())) rows = rows.slice(1); // ข้ามหัวตาราง
  return rows.map((r) => ({
    store_code: (r[0] || '').trim().toUpperCase(),
    store_name: cleanName(r[1]),
    is_active: !/^(false|0|inactive|n|no)$/i.test((r[2] || '').trim()),
  }));
}

/** รูปแบบ 2: ลำดับ,ชื่อร้านค้า,ชั้น (ไม่มีรหัสร้าน) → สร้างรหัสอัตโนมัติ เช่น B-001, 3-012 */
function isFloorFormat(rows) {
  if (!rows.length) return false;
  if (rows[0].some((c) => c.includes('ชั้น'))) return true;
  const sample = rows.slice(0, 20);
  return sample.every((r) => /^\d+$/.test((r[0] || '').trim()) && FLOORS.includes((r[2] || '').trim().toUpperCase()));
}

function fromFloorFormat(rows) {
  if (rows[0].some((c) => c.includes('ชั้น') || c.includes('ชื่อ'))) rows = rows.slice(1);
  // ร้านที่มีอยู่แล้ว (ชื่อ+ชั้นเดียวกัน) ใช้รหัสเดิม → นำเข้าซ้ำได้โดยไม่เกิดร้านซ้ำ
  const existing = new Map(state.stores.map((s) => [`${getFloor(s.store_code)}|${s.store_name}`, s.store_code]));
  const used = new Set(state.stores.map((s) => s.store_code));
  return rows.map((r) => {
    const floor = (r[2] || '').trim().toUpperCase();
    const name = cleanName(r[1]);
    let code = existing.get(`${floor}|${name}`);
    if (!code && FLOORS.includes(floor)) {
      code = randomStoreCode(floor, used); // รหัสสุ่ม 3 หลัก
      existing.set(`${floor}|${name}`, code);
    }
    if (code) used.add(code);
    return { store_code: code || '', store_name: name, is_active: true };
  });
}

$('importCsv').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !(await requireAdmin())) return;
  const rows = parseCsv(decodeText(await file.arrayBuffer()).replace(/^﻿/, ''));
  const items = isFloorFormat(rows) ? fromFloorFormat(rows) : fromCodeFormat(rows);
  const valid = items.filter((i) => CODE_RE.test(i.store_code) && i.store_name);
  const invalid = items.length - valid.length;
  if (!valid.length) { toast('ไม่พบข้อมูลที่ถูกต้องในไฟล์ (รูปแบบ: รหัสร้าน,ชื่อร้าน หรือ ลำดับ,ชื่อร้านค้า,ชั้น)', 'error'); return; }
  if (!(await confirmDialog(`นำเข้า/อัปเดต ${valid.length} ร้าน${invalid ? ` (ข้าม ${invalid} แถวที่ไม่ถูกต้อง)` : ''} ใช่หรือไม่?`, 'นำเข้า', false))) return;
  const { error } = await sb.from('stores').upsert(valid, { onConflict: 'store_code' });
  if (error) { toast(`นำเข้าไม่สำเร็จ: ${error.message}`, 'error'); return; }
  toast(`นำเข้า ${valid.length} ร้านเรียบร้อย`, 'success');
  loadStores();
});

/* ================= Events ================= */
$('addBtn').addEventListener('click', () => openForm());
let st;
$('search').addEventListener('input', (e) => {
  clearTimeout(st);
  st = setTimeout(() => { state.search = e.target.value; state.page = 1; render(); }, 200);
});
$('statusFilter').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; render(); });

if (sb) {
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') boot(); });
  boot();
} else {
  $('loginCard').classList.remove('hidden');
}
