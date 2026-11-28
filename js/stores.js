import { FLOORS } from './config.js';
import { sb, getSession, signIn, renderAuthChip } from './supabase-client.js';
import {
  initLayout, getFloor, compareStores, escapeHtml, paginate, renderPagination, renderFloorTabs,
  toast, setBusy, openModal, confirmDialog,
} from './utils.js';

initLayout('stores');

const $ = (id) => document.getElementById(id);
const state = { stores: [], floor: 'ALL', search: '', status: 'all', page: 1 };

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
  state.stores = data.sort(compareStores);
  render();
}

function render() {
  const statusOk = (s) => state.status === 'all' || (state.status === 'active' ? s.is_active : !s.is_active);
  const q = state.search.trim().toLowerCase();
  const base = state.stores.filter((s) => statusOk(s) && (!q || `${s.store_code} ${s.store_name}`.toLowerCase().includes(q)));

  const counts = {};
  base.forEach((s) => { const f = getFloor(s.store_code); counts[f] = (counts[f] || 0) + 1; });
  renderFloorTabs($('floorTabs'), counts, state.floor, (f) => { state.floor = f; state.page = 1; render(); }, { includeAll: true });

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

function openForm(store = null) {
  const m = openModal({
    title: store ? 'แก้ไขร้านค้า' : 'เพิ่มร้านค้า',
    body: `<form id="storeForm" novalidate>
      <label class="label" for="fCode">รหัสร้านค้า <span class="req">*</span></label>
      <input id="fCode" class="input" required maxlength="20" value="${escapeHtml(store?.store_code || '')}" placeholder="เช่น B01, 1A05, 3-12">
      <p class="hint">อักษรตัวแรกคือชั้น: ${FLOORS.join(', ')} <span id="floorPreview" class="tag"></span></p>
      <label class="label" for="fName">ชื่อร้านค้า <span class="req">*</span></label>
      <input id="fName" class="input" required maxlength="120" value="${escapeHtml(store?.store_name || '')}">
      <label class="checkbox mt"><input type="checkbox" id="fActive" ${store?.is_active === false ? '' : 'checked'}> เปิดใช้งาน (Active)</label>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
             <button type="submit" form="storeForm" class="btn btn-primary" id="saveStore">💾 บันทึก</button>`,
  });
  const code = m.el.querySelector('#fCode');
  const preview = () => {
    const f = getFloor(code.value);
    m.el.querySelector('#floorPreview').textContent = code.value ? (f === '?' ? 'รหัสไม่ถูกต้อง' : `→ ชั้น ${f}`) : '';
  };
  code.addEventListener('input', preview);
  preview();
  setTimeout(() => code.focus(), 50);

  m.el.querySelector('#storeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      store_code: code.value.trim().toUpperCase(),
      store_name: m.el.querySelector('#fName').value.trim(),
      is_active: m.el.querySelector('#fActive').checked,
    };
    if (!CODE_RE.test(payload.store_code)) { toast(`รหัสร้านต้องขึ้นต้นด้วย ${FLOORS.join(', ')}`, 'warn'); return; }
    if (!payload.store_name) { toast('กรุณากรอกชื่อร้านค้า', 'warn'); return; }
    if (state.stores.some((s) => s.store_code.toUpperCase() === payload.store_code && s.id !== store?.id)) {
      toast('รหัสร้านนี้มีอยู่แล้ว', 'warn'); return;
    }
    if (!(await requireAdmin())) return;
    const btn = m.el.querySelector('#saveStore');
    setBusy(btn, true, 'กำลังบันทึก...');
    const { error } = store
      ? await sb.from('stores').update(payload).eq('id', store.id)
      : await sb.from('stores').insert(payload);
    setBusy(btn, false);
    if (error) { toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error'); return; }
    toast(store ? 'แก้ไขร้านค้าเรียบร้อย' : 'เพิ่มร้านค้าเรียบร้อย', 'success');
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

$('importCsv').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !(await requireAdmin())) return;
  const rows = parseCsv((await file.text()).replace(/^﻿/, ''));
  if (rows.length && !CODE_RE.test(rows[0][0].trim())) rows.shift(); // ข้ามหัวตาราง
  const items = rows.map((r) => ({
    store_code: (r[0] || '').trim().toUpperCase(),
    store_name: (r[1] || '').trim(),
    is_active: !/^(false|0|inactive|n|no)$/i.test((r[2] || '').trim()),
  }));
  const valid = items.filter((i) => CODE_RE.test(i.store_code) && i.store_name);
  const invalid = items.length - valid.length;
  if (!valid.length) { toast('ไม่พบข้อมูลที่ถูกต้องในไฟล์ (รูปแบบ: รหัสร้าน,ชื่อร้าน)', 'error'); return; }
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
