/* =====================================================================
 *  inspection.js — หน้าบันทึกการตรวจร้านค้า (สำหรับพนักงานหน้างาน)
 * ===================================================================== */
(() => {
  const MAX_PHOTOS = CFG.MAX_PHOTOS || 5;
  const LS_INSPECTOR = 'pest.inspectorName';

  let stores = [];
  let inspectedThisMonth = new Map(); // store_id -> จำนวนครั้งที่ตรวจในเดือนนี้
  let photos = []; // { id, blob, url, origSize, ext }
  let processing = 0;
  let hlIndex = -1;
  let floor = 'all';

  const el = {
    form: $('#inspectionForm'),
    search: $('#storeSearch'),
    list: $('#storeList'),
    storeId: $('#storeId'),
    selected: $('#selectedStore'),
    selName: $('#selStoreName'),
    selMeta: $('#selStoreMeta'),
    storeHint: $('#storeHint'),
    inspector: $('#inspectorName'),
    problem: $('#problem'),
    method: $('#solutionMethod'),
    methodReq: $('#methodReq'),
    detail: $('#solutionDetail'),
    detailReq: $('#detailReq'),
    note: $('#note'),
    photoGrid: $('#photoGrid'),
    photoCount: $('#photoCount'),
    camera: $('#cameraInput'),
    gallery: $('#galleryInput'),
    sigWrap: $('#sigWrap'),
    submit: $('#btnSubmit'),
  };

  /* ---------- Dropdowns ---------- */
  PROBLEMS.forEach((p) => el.problem.insertAdjacentHTML('beforeend', `<option value="${p}">${p}</option>`));
  METHODS.forEach((m) => el.method.insertAdjacentHTML('beforeend', `<option value="${m}">${m}</option>`));

  function syncMethodState() {
    const noProblem = el.problem.value === 'ไม่พบปัญหา';
    el.method.disabled = noProblem;
    if (noProblem) el.method.value = '';
    el.methodReq.classList.toggle('hidden', noProblem);
    el.detailReq.classList.toggle('hidden', el.method.value !== 'อื่นๆ');
    el.detail.placeholder = el.method.value === 'อื่นๆ'
      ? 'โปรดระบุวิธีแก้ไขที่ใช้ (จำเป็น)'
      : 'เช่น ตำแหน่งที่วาง จำนวนจุด ปริมาณที่ใช้';
  }
  el.problem.addEventListener('change', () => { syncMethodState(); el.problem.classList.remove('invalid'); });
  el.method.addEventListener('change', () => { syncMethodState(); el.method.classList.remove('invalid'); });

  /* ---------- Inspector name (จำไว้ในเครื่อง) ---------- */
  try { el.inspector.value = localStorage.getItem(LS_INSPECTOR) || ''; } catch (_) { /* ignore */ }

  /* ---------- Live clock ---------- */
  const tick = () => {
    $('#nowClock').textContent = new Date().toLocaleString('th-TH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };
  tick();
  setInterval(tick, 1000);

  /* ---------- Store combobox ---------- */
  async function loadStores() {
    if (!db) { el.storeHint.textContent = 'ยังไม่ได้เชื่อมต่อฐานข้อมูล'; return; }
    try {
      const now = new Date();
      const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);
      const [s, i] = await Promise.all([
        db.from('stores').select('*').eq('is_active', true).order('code'),
        db.from('inspections').select('store_id').gte('inspected_at', start).lt('inspected_at', end),
      ]);
      if (s.error) throw s.error;
      stores = (s.data || []).sort(byFloorCode);
      inspectedThisMonth = new Map();
      (i.data || []).forEach((r) => inspectedThisMonth.set(r.store_id, (inspectedThisMonth.get(r.store_id) || 0) + 1));
      const done = stores.filter((x) => inspectedThisMonth.has(x.id)).length;
      el.storeHint.textContent = `ร้านค้าที่เปิดใช้งาน ${stores.length} ร้าน · ตรวจแล้วเดือนนี้ ${done} ร้าน`;
      renderChips();
    } catch (err) {
      el.storeHint.textContent = 'โหลดรายชื่อร้านค้าไม่สำเร็จ: ' + errMsg(err);
      toast(errMsg(err), 'error');
    }
  }

  function renderChips() {
    renderFloorChips($('#floorChips'), {
      stores, value: floor,
      countFn: (list) => `${list.filter((x) => inspectedThisMonth.has(x.id)).length}/${list.length}`,
      onChange: (v) => {
        floor = v;
        renderChips();
        if (el.storeId.value) clearStore();
        el.search.focus();
        renderList();
      },
    });
  }

  function filterStores(q) {
    q = q.trim().toLowerCase();
    const list = stores.filter((s) => floorMatch(floor, s.floor) &&
      (!q || s.name.toLowerCase().includes(q) || String(s.code).toLowerCase().includes(q)));
    // เรียงตามชั้น -> ร้านที่ยังไม่ได้ตรวจเดือนนี้ขึ้นก่อน -> รหัส
    return list.sort((a, b) => floorRank(a.floor) - floorRank(b.floor) ||
      (inspectedThisMonth.has(a.id) - inspectedThisMonth.has(b.id)) || byFloorCode(a, b)).slice(0, 80);
  }

  function renderList() {
    const items = filterStores(el.search.value);
    hlIndex = -1;
    if (!items.length) {
      el.list.innerHTML = `<div class="combo-empty">${stores.length ? `ไม่พบร้านค้า${floor === 'all' ? '' : 'ใน' + floorLabel(floor)}` : 'ยังไม่มีรายชื่อร้านค้า'}</div>`;
    } else {
      let prev = null;
      el.list.innerHTML = items.map((s) => {
        const n = inspectedThisMonth.get(s.id);
        const f = s.floor || '';
        const head = f !== prev ? `<div class="combo-floor">🏢 ${escapeHtml(floorLabel(f))}</div>` : '';
        prev = f;
        return `${head}<div class="combo-item" role="option" data-id="${s.id}">
          <div><div>${escapeHtml(s.name)}</div><div class="code">รหัส ${escapeHtml(s.code)} · ${escapeHtml(floorLabel(s.floor))}</div></div>
          ${n ? `<span class="badge badge-ok">ตรวจแล้ว ${n} ครั้ง</span>` : '<span class="badge badge-warn">ยังไม่ตรวจ</span>'}
        </div>`;
      }).join('');
    }
    el.list.classList.add('open');
  }

  function selectStore(id) {
    const s = stores.find((x) => x.id === id);
    if (!s) return;
    el.storeId.value = s.id;
    el.selName.textContent = s.name;
    const n = inspectedThisMonth.get(s.id);
    el.selMeta.textContent = `รหัส ${s.code} · ${floorLabel(s.floor)}` + (n ? ` · เดือนนี้ตรวจแล้ว ${n} ครั้ง` : ' · ยังไม่ได้ตรวจเดือนนี้');
    el.selected.classList.add('show');
    el.search.closest('.combo').classList.add('hidden');
    el.list.classList.remove('open');
    el.search.classList.remove('invalid');
  }

  function clearStore() {
    el.storeId.value = '';
    el.search.value = '';
    el.selected.classList.remove('show');
    el.search.closest('.combo').classList.remove('hidden');
  }

  el.search.addEventListener('focus', renderList);
  el.search.addEventListener('input', renderList);
  el.search.addEventListener('keydown', (e) => {
    const items = $$('.combo-item', el.list);
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hlIndex = (hlIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('hl', i === hlIndex));
      items[hlIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectStore((items[hlIndex] || items[0]).dataset.id);
    }
  });
  el.list.addEventListener('mousedown', (e) => e.preventDefault()); // กัน blur ก่อน click
  el.list.addEventListener('click', (e) => {
    const it = e.target.closest('.combo-item');
    if (it) selectStore(it.dataset.id);
  });
  el.search.addEventListener('blur', () => setTimeout(() => el.list.classList.remove('open'), 120));
  $('#btnChangeStore').addEventListener('click', () => { clearStore(); el.search.focus(); });

  /* ---------- Photos ---------- */
  $('#btnCamera').addEventListener('click', () => el.camera.click());
  $('#btnGallery').addEventListener('click', () => el.gallery.click());
  el.camera.addEventListener('change', (e) => handleFiles(e.target.files));
  el.gallery.addEventListener('change', (e) => handleFiles(e.target.files));

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    el.camera.value = '';
    el.gallery.value = '';
    const room = MAX_PHOTOS - photos.length - processing;
    if (room <= 0) { toast(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูป`, 'warn'); return; }
    if (files.length > room) toast(`เลือกได้อีก ${room} รูป (สูงสุด ${MAX_PHOTOS} รูป)`, 'warn');

    for (const file of files.slice(0, room)) {
      processing++;
      renderPhotos();
      try {
        const out = await ImageCompressor.compress(file);
        photos.push({ id: uuid(), blob: out.blob, ext: out.ext, url: URL.createObjectURL(out.blob), origSize: file.size });
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'error');
      } finally {
        processing--;
        renderPhotos();
      }
    }
  }

  function renderPhotos() {
    el.photoGrid.innerHTML = photos.map((p) => `
      <div class="photo-item">
        <img src="${p.url}" alt="รูปประกอบ" data-lightbox="${p.url}">
        <button type="button" class="rm" data-rm="${p.id}" aria-label="ลบรูป">✕</button>
        <div class="size">${ImageCompressor.formatBytes(p.origSize)} → ${ImageCompressor.formatBytes(p.blob.size)}</div>
      </div>`).join('') +
      Array.from({ length: processing }, () => '<div class="photo-item processing"><div class="spinner sm"></div></div>').join('');
    el.photoCount.textContent = `(${photos.length}/${MAX_PHOTOS})`;
  }
  el.photoGrid.addEventListener('click', (e) => {
    const id = e.target.closest('[data-rm]')?.dataset.rm;
    if (!id) return;
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    photos = photos.filter((x) => x.id !== id);
    renderPhotos();
  });
  renderPhotos();

  /* ---------- Signature ---------- */
  const sig = new SignaturePad($('#sigCanvas'), {
    onChange: (empty) => el.sigWrap.classList.toggle('signed', !empty),
  });
  $('#btnClearSig').addEventListener('click', () => sig.clear());

  /* ---------- Validate ---------- */
  function validate() {
    $$('.invalid', el.form).forEach((x) => x.classList.remove('invalid'));
    const errors = [];
    const mark = (node, msg) => { node.classList.add('invalid'); errors.push({ node, msg }); };

    if (!el.storeId.value) mark(el.search, 'กรุณาเลือกร้านค้า');
    if (!el.inspector.value.trim()) mark(el.inspector, 'กรุณากรอกชื่อพนักงานผู้ตรวจ');
    if (!el.problem.value) mark(el.problem, 'กรุณาเลือกปัญหาที่พบ');
    if (el.problem.value && el.problem.value !== 'ไม่พบปัญหา' && !el.method.value) mark(el.method, 'กรุณาเลือกวิธีการแก้ไข');
    if (el.method.value === 'อื่นๆ' && !el.detail.value.trim()) mark(el.detail, 'กรุณาระบุรายละเอียดวิธีแก้ไข (อื่นๆ)');
    if (processing > 0) errors.push({ node: el.photoGrid, msg: 'กรุณารอให้บีบอัดรูปเสร็จก่อน' });
    if (CFG.REQUIRE_PHOTO && photos.length === 0) errors.push({ node: el.photoGrid, msg: 'กรุณาแนบรูปภาพอย่างน้อย 1 รูป' });
    if (sig.isEmpty()) { el.sigWrap.classList.add('invalid'); errors.push({ node: el.sigWrap, msg: 'กรุณาเซ็นชื่อ' }); }

    if (errors.length) {
      toast(errors[0].msg, 'error');
      errors[0].node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  /* ---------- Submit ---------- */
  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!db) { toast('ยังไม่ได้เชื่อมต่อ Supabase (แก้ไข js/config.js)', 'error'); return; }
    if (!validate()) return;

    const store = stores.find((s) => s.id === el.storeId.value);
    const id = uuid();
    const now = new Date();
    const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${id}`;
    const bucket = db.storage.from(CFG.STORAGE_BUCKET);
    const uploaded = [];

    el.submit.disabled = true;
    try {
      // 1) อัปโหลดรูป
      const photoUrls = [];
      for (let i = 0; i < photos.length; i++) {
        showLoading(`กำลังอัปโหลดรูป ${i + 1}/${photos.length}...`);
        const path = `${folder}/photo-${i + 1}.${photos[i].ext}`;
        const { error } = await bucket.upload(path, photos[i].blob, { contentType: photos[i].blob.type, upsert: false });
        if (error) throw error;
        uploaded.push(path);
        photoUrls.push(bucket.getPublicUrl(path).data.publicUrl);
      }

      // 2) อัปโหลดลายเซ็น
      showLoading('กำลังบันทึกลายเซ็น...');
      const sigBlob = await sig.toBlob();
      const sigPath = `${folder}/signature.png`;
      const sigUp = await bucket.upload(sigPath, sigBlob, { contentType: 'image/png', upsert: false });
      if (sigUp.error) throw sigUp.error;
      uploaded.push(sigPath);
      const signatureUrl = bucket.getPublicUrl(sigPath).data.publicUrl;

      // 3) บันทึกข้อมูล (timestamp ใช้เวลาเซิร์ฟเวอร์อัตโนมัติ)
      showLoading('กำลังบันทึกข้อมูล...');
      const row = {
        id,
        store_id: store.id,
        store_code: store.code,
        store_name: store.name,
        store_floor: store.floor || null,
        inspector_name: el.inspector.value.trim(),
        problem: el.problem.value,
        solution_method: el.problem.value === 'ไม่พบปัญหา' ? null : el.method.value,
        solution_detail: el.detail.value.trim() || null,
        note: el.note.value.trim() || null,
        photo_urls: photoUrls,
        signature_url: signatureUrl,
      };
      let { error } = await db.from('inspections').insert(row);
      // ฐานข้อมูลเวอร์ชันเก่ายังไม่มีคอลัมน์ store_floor -> บันทึกโดยไม่ใส่ชั้น
      if (error && /store_floor/.test(error.message || '')) {
        delete row.store_floor;
        ({ error } = await db.from('inspections').insert(row));
      }
      if (error) throw error;

      try { localStorage.setItem(LS_INSPECTOR, el.inspector.value.trim()); } catch (_) { /* ignore */ }
      inspectedThisMonth.set(store.id, (inspectedThisMonth.get(store.id) || 0) + 1);
      renderChips();
      hideLoading();
      toast(`บันทึกการตรวจ "${store.name}" เรียบร้อยแล้ว ✅`, 'success', 4000);
      resetForm();
    } catch (err) {
      hideLoading();
      // พยายามลบไฟล์ที่อัปโหลดไปแล้ว (อาจไม่มีสิทธิ์ลบ ไม่เป็นไร)
      if (uploaded.length) bucket.remove(uploaded).catch(() => {});
      toast('บันทึกไม่สำเร็จ: ' + errMsg(err), 'error', 6000);
    } finally {
      el.submit.disabled = false;
    }
  });

  function resetForm() {
    clearStore();
    el.problem.value = '';
    el.method.value = '';
    el.detail.value = '';
    el.note.value = '';
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    renderPhotos();
    sig.clear();
    syncMethodState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const done = stores.filter((x) => inspectedThisMonth.has(x.id)).length;
    el.storeHint.textContent = `ร้านค้าที่เปิดใช้งาน ${stores.length} ร้าน · ตรวจแล้วเดือนนี้ ${done} ร้าน`;
  }

  // เตือนก่อนออกจากหน้าเมื่อกรอกข้อมูลค้างไว้
  window.addEventListener('beforeunload', (e) => {
    if (photos.length || !sig.isEmpty() || el.storeId.value) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Init ---------- */
  syncMethodState();
  if (requireConfig()) loadStores();
})();
