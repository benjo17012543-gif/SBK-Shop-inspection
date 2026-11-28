import {
  STORAGE_BUCKET, FLOORS, PROBLEM_OPTIONS, NO_PROBLEM, SOLUTION_OPTIONS, OTHER_SOLUTION,
  IMAGE_OPTIONS, MAX_PHOTOS,
} from './config.js';
import { sb, uploadBlob, renderAuthChip } from './supabase-client.js';
import {
  initLayout, getFloor, compareStores, escapeHtml, paginate, renderPagination, renderFloorTabs,
  toast, setBusy, monthRange, monthKey, uuid, formatBytes, openLightbox,
} from './utils.js';
import { compressImage } from './image-compress.js';
import { SignaturePad } from './signature-pad.js';

initLayout('inspect');
renderAuthChip();

const $ = (id) => document.getElementById(id);
const els = {
  form: $('inspectionForm'),
  search: $('storeSearch'), tabs: $('floorTabs'), list: $('storeList'), pager: $('storePager'),
  picker: $('storePicker'), selected: $('selectedStore'),
  problem: $('problem'), solutionSection: $('solutionSection'),
  method: $('solutionMethod'), detail: $('solutionDetail'), detailReq: $('detailReq'),
  camera: $('cameraInput'), gallery: $('galleryInput'), photoGrid: $('photoGrid'), photoCount: $('photoCount'),
  inspector: $('inspectorName'), remarks: $('remarks'),
  sigCanvas: $('sigCanvas'), sigPlaceholder: $('sigPlaceholder'), clearSig: $('clearSig'),
  submit: $('submitBtn'), clock: $('clock'),
};

const state = {
  stores: [],
  inspectedIds: new Set(),
  floor: FLOORS[0],
  search: '',
  page: 1,
  selected: null,
  photos: [], // { id, blob, ext, type, url, originalSize, size }
};

/* ---------- ตัวเลือก dropdown ---------- */
els.problem.insertAdjacentHTML('beforeend',
  PROBLEM_OPTIONS.map((p) => `<option value="${p}">${p}</option>`).join(''));
els.method.insertAdjacentHTML('beforeend',
  SOLUTION_OPTIONS.map((p) => `<option value="${p}">${p}</option>`).join(''));

/* ---------- นาฬิกา ---------- */
function tick() {
  els.clock.textContent = new Date().toLocaleString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
tick();
setInterval(tick, 1000);

/* ---------- ลายเซ็น ---------- */
const sig = new SignaturePad(els.sigCanvas, {
  onChange: (pad) => els.sigPlaceholder.classList.toggle('hidden', !pad.isEmpty()),
});
els.sigCanvas.addEventListener('pointerdown', () => els.sigPlaceholder.classList.add('hidden'));
els.clearSig.addEventListener('click', () => sig.clear());

/* ---------- ชื่อผู้ตรวจ (จำไว้ในเครื่อง) ---------- */
try { els.inspector.value = localStorage.getItem('inspectorName') || ''; } catch { /* ignore */ }

/* ---------- โหลดร้านค้า ---------- */
async function loadStores() {
  if (!sb) { renderStores(); return; }
  els.list.innerHTML = '<div class="empty"><span class="spinner dark"></span> กำลังโหลดรายชื่อร้าน...</div>';
  try {
    const now = new Date();
    const { start, end } = monthRange(now.getFullYear(), now.getMonth());
    const [storesRes, insRes] = await Promise.all([
      sb.from('stores').select('id, store_code, store_name, is_active').eq('is_active', true),
      sb.from('inspections').select('store_id').gte('created_at', start).lt('created_at', end),
    ]);
    if (storesRes.error) throw storesRes.error;
    state.stores = (storesRes.data || []).sort(compareStores);
    state.inspectedIds = new Set((insRes.data || []).map((r) => r.store_id));
    const firstFloor = FLOORS.find((f) => state.stores.some((s) => getFloor(s.store_code) === f));
    if (firstFloor) state.floor = firstFloor;
  } catch (err) {
    console.error(err);
    toast(`โหลดรายชื่อร้านไม่สำเร็จ: ${err.message}`, 'error');
  }
  renderStores();
}

function renderStores() {
  const q = state.search.trim().toLowerCase();
  const counts = {};
  state.stores.forEach((s) => { const f = getFloor(s.store_code); counts[f] = (counts[f] || 0) + 1; });

  // ค้นหา → ค้นทุกชั้น ; ไม่ค้นหา → แสดงตามแท็บชั้น
  els.tabs.classList.toggle('dimmed', !!q);
  renderFloorTabs(els.tabs, counts, q ? null : state.floor, (f) => {
    state.floor = f; state.page = 1; state.search = ''; els.search.value = ''; renderStores();
  });

  const filtered = state.stores.filter((s) => (q
    ? `${s.store_code} ${s.store_name}`.toLowerCase().includes(q)
    : getFloor(s.store_code) === state.floor));
  const pg = paginate(filtered, state.page);
  state.page = pg.page;

  if (!sb) {
    els.list.innerHTML = '<div class="empty">ยังไม่ได้เชื่อมต่อฐานข้อมูล</div>';
  } else if (!pg.items.length) {
    els.list.innerHTML = `<div class="empty">${q ? 'ไม่พบร้านที่ค้นหา' : 'ไม่มีร้านในชั้นนี้'}</div>`;
  } else {
    els.list.innerHTML = pg.items.map((s) => {
      const done = state.inspectedIds.has(s.id);
      return `
        <button type="button" class="store-item ${state.selected?.id === s.id ? 'active' : ''}" data-id="${s.id}">
          <span class="store-code">${escapeHtml(s.store_code)}</span>
          <span class="store-name">${escapeHtml(s.store_name)}</span>
          ${q ? `<span class="tag">ชั้น ${getFloor(s.store_code)}</span>` : ''}
          ${done ? '<span class="badge badge-ok" title="ตรวจแล้วในเดือนนี้">✓ ตรวจแล้ว</span>' : ''}
        </button>`;
    }).join('');
    els.list.querySelectorAll('[data-id]').forEach((b) =>
      b.addEventListener('click', () => selectStore(state.stores.find((s) => s.id === b.dataset.id))));
  }
  renderPagination(els.pager, pg, (p) => { state.page = p; renderStores(); });
}

function selectStore(store) {
  state.selected = store;
  if (!store) {
    els.selected.classList.add('hidden');
    els.picker.classList.remove('hidden');
    renderStores();
    return;
  }
  const done = state.inspectedIds.has(store.id);
  els.selected.innerHTML = `
    <div>
      <div class="muted small">ร้านที่เลือก · ชั้น ${getFloor(store.store_code)}</div>
      <div class="selected-name"><span class="store-code">${escapeHtml(store.store_code)}</span> ${escapeHtml(store.store_name)}</div>
      ${done ? '<span class="badge badge-ok">✓ เดือนนี้ตรวจแล้ว (บันทึกเพิ่มได้)</span>' : ''}
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="changeStore">เปลี่ยนร้าน</button>`;
  els.selected.querySelector('#changeStore').addEventListener('click', () => selectStore(null));
  els.selected.classList.remove('hidden');
  els.picker.classList.add('hidden');
  els.problem.focus({ preventScroll: true });
  els.problem.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = els.search.value; state.page = 1; renderStores(); }, 200);
});

/* ---------- ปัญหา / วิธีแก้ไข ---------- */
function syncSolution() {
  const none = els.problem.value === NO_PROBLEM;
  els.solutionSection.classList.toggle('hidden', none);
  if (none) { els.method.value = ''; els.detail.value = ''; }
  els.detailReq.classList.toggle('hidden', els.method.value !== OTHER_SOLUTION);
}
els.problem.addEventListener('change', syncSolution);
els.method.addEventListener('change', syncSolution);

/* ---------- รูปภาพ ---------- */
async function addFiles(fileList) {
  const files = [...fileList];
  const room = MAX_PHOTOS - state.photos.length;
  if (room <= 0) { toast(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูป`, 'warn'); return; }
  if (files.length > room) toast(`แนบได้อีก ${room} รูป (สูงสุด ${MAX_PHOTOS})`, 'warn');

  for (const file of files.slice(0, room)) {
    const id = uuid();
    state.photos.push({ id, pending: true });
    renderPhotos();
    try {
      const r = await compressImage(file, IMAGE_OPTIONS);
      Object.assign(state.photos.find((p) => p.id === id), {
        pending: false, blob: r.blob, ext: r.ext, type: r.type,
        url: URL.createObjectURL(r.blob), originalSize: r.originalSize, size: r.size,
      });
    } catch (err) {
      state.photos = state.photos.filter((p) => p.id !== id);
      toast(err.message, 'error');
    }
    renderPhotos();
  }
}

function renderPhotos() {
  els.photoCount.textContent = `(${state.photos.length}/${MAX_PHOTOS})`;
  els.photoGrid.innerHTML = state.photos.map((p) => (p.pending
    ? '<div class="photo-item loading"><span class="spinner dark"></span><small>กำลังบีบอัด...</small></div>'
    : `<div class="photo-item">
         <img src="${p.url}" alt="รูปประกอบ" data-view="${p.id}">
         <button type="button" class="photo-del" data-del="${p.id}" aria-label="ลบรูป">✕</button>
         <small class="photo-size">${formatBytes(p.originalSize)} → <b>${formatBytes(p.size)}</b></small>
       </div>`)).join('');
  els.photoGrid.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const p = state.photos.find((x) => x.id === b.dataset.del);
    if (p?.url) URL.revokeObjectURL(p.url);
    state.photos = state.photos.filter((x) => x.id !== b.dataset.del);
    renderPhotos();
  }));
  els.photoGrid.querySelectorAll('[data-view]').forEach((img) =>
    img.addEventListener('click', () => openLightbox(img.src)));
}

[els.camera, els.gallery].forEach((input) => input.addEventListener('change', async () => {
  if (input.files.length) await addFiles(input.files);
  input.value = '';
}));

/* ---------- บันทึก ---------- */
function validate() {
  const problem = els.problem.value;
  if (!state.selected) return ['กรุณาเลือกร้านค้า', els.search];
  if (!problem) return ['กรุณาเลือกปัญหาที่พบ', els.problem];
  if (problem !== NO_PROBLEM && !els.method.value) return ['กรุณาเลือกวิธีการแก้ไขปัญหา', els.method];
  if (els.method.value === OTHER_SOLUTION && !els.detail.value.trim())
    return ['กรุณากรอกรายละเอียดวิธีแก้ไข (เลือก "อื่นๆ")', els.detail];
  if (state.photos.some((p) => p.pending)) return ['กรุณารอให้บีบอัดรูปภาพเสร็จก่อน', null];
  if (!els.inspector.value.trim()) return ['กรุณากรอกชื่อพนักงานผู้ตรวจ', els.inspector];
  if (sig.isEmpty()) return ['กรุณาเซ็นชื่อก่อนบันทึก', els.sigCanvas];
  return null;
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) { toast('ยังไม่ได้ตั้งค่า Supabase ใน js/config.js', 'error'); return; }
  const invalid = validate();
  if (invalid) {
    toast(invalid[0], 'warn');
    invalid[1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    invalid[1]?.focus?.({ preventScroll: true });
    return;
  }

  setBusy(els.submit, true, 'กำลังอัปโหลด...');
  const folder = monthKey();
  try {
    const imageUrls = [];
    for (let i = 0; i < state.photos.length; i++) {
      const p = state.photos[i];
      els.submit.lastChild.textContent = `กำลังอัปโหลดรูป ${i + 1}/${state.photos.length}...`;
      imageUrls.push(await uploadBlob(STORAGE_BUCKET, `photos/${folder}/${uuid()}.${p.ext}`, p.blob, p.type));
    }
    els.submit.lastChild.textContent = 'กำลังบันทึกลายเซ็น...';
    const sigBlob = await sig.toBlob();
    const signatureUrl = await uploadBlob(STORAGE_BUCKET, `signatures/${folder}/${uuid()}.png`, sigBlob, 'image/png');

    els.submit.lastChild.textContent = 'กำลังบันทึกข้อมูล...';
    const problem = els.problem.value;
    const payload = {
      store_id: state.selected.id,
      store_code: state.selected.store_code,
      store_name: state.selected.store_name,
      problem,
      solution_method: problem === NO_PROBLEM ? null : els.method.value,
      solution_detail: els.detail.value.trim() || null,
      image_urls: imageUrls,
      signature_url: signatureUrl,
      inspector_name: els.inspector.value.trim(),
      remarks: els.remarks.value.trim() || null,
    };
    const { error } = await sb.from('inspections').insert(payload);
    if (error) throw error;

    try { localStorage.setItem('inspectorName', payload.inspector_name); } catch { /* ignore */ }
    state.inspectedIds.add(state.selected.id);
    toast(`บันทึกการตรวจร้าน ${payload.store_code} เรียบร้อย ✓`, 'success');
    resetForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    toast(`บันทึกไม่สำเร็จ: ${err.message}`, 'error', 5000);
  } finally {
    setBusy(els.submit, false);
  }
});

function resetForm() {
  els.problem.value = '';
  els.method.value = '';
  els.detail.value = '';
  els.remarks.value = '';
  state.photos.forEach((p) => p.url && URL.revokeObjectURL(p.url));
  state.photos = [];
  renderPhotos();
  sig.clear();
  syncSolution();
  selectStore(null);
}

renderPhotos();
syncSolution();
loadStores();
