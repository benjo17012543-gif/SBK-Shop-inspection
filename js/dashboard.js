/* =====================================================================
 *  dashboard.js — แดชบอร์ดสรุปผลประจำเดือน
 * ===================================================================== */
(() => {
  let report = null;   // ผลการคำนวณของเดือนที่โหลดล่าสุด (ใช้ร่วมกับ Export)
  let activeTab = 'done';
  let listPage = 1;
  let listSize = 10;
  let listFloor = 'all';

  const selMonth = $('#selMonth');
  const selYear = $('#selYear');

  /* ---------- ตัวเลือกเดือน/ปี ---------- */
  const now = new Date();
  THAI_MONTHS.forEach((m, i) => selMonth.insertAdjacentHTML('beforeend', `<option value="${i + 1}">${m}</option>`));
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y--) {
    selYear.insertAdjacentHTML('beforeend', `<option value="${y}">${y + 543}</option>`);
  }
  selMonth.value = now.getMonth() + 1;
  selYear.value = now.getFullYear();

  /* ---------- โหลดข้อมูล ---------- */
  async function fetchAll(query) {
    // ดึงทีละ 1000 แถว (ข้อจำกัดค่าเริ่มต้นของ Supabase)
    const size = 1000;
    let from = 0;
    const rows = [];
    for (;;) {
      const { data, error } = await query().range(from, from + size - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < size) break;
      from += size;
    }
    return rows;
  }

  async function load() {
    if (!db) return;
    const year = Number(selYear.value);
    const month = Number(selMonth.value);
    const { start, end } = monthRange(year, month);
    showLoading('กำลังโหลดข้อมูล...');
    try {
      const [stores, inspections] = await Promise.all([
        fetchAll(() => db.from('stores').select('*').order('code')),
        fetchAll(() => db.from('inspections').select('*')
          .gte('inspected_at', start).lt('inspected_at', end)
          .order('inspected_at', { ascending: false })),
      ]);
      report = compute(year, month, stores, inspections);
      listPage = 1;
      listFloor = 'all';
      render();
      ['#btnPdf', '#btnExcel', '#btnCsv'].forEach((s) => { $(s).disabled = false; });
    } catch (err) {
      toast('โหลดข้อมูลไม่สำเร็จ: ' + errMsg(err), 'error', 6000);
    } finally {
      hideLoading();
    }
  }

  /* ---------- คำนวณสถิติ ---------- */
  function compute(year, month, stores, inspections) {
    stores = [...stores].sort(byFloorCode);
    const storeById = new Map(stores.map((s) => [s.id, s]));
    const byStore = new Map();
    inspections.forEach((r) => {
      // ชั้นของบันทึก: ใช้ชั้นปัจจุบันของร้าน (ถ้าไม่มี ใช้ชั้น ณ วันที่ตรวจ)
      r.floor = storeById.get(r.store_id)?.floor ?? r.store_floor ?? null;
      if (!byStore.has(r.store_id)) byStore.set(r.store_id, []);
      byStore.get(r.store_id).push(r);
    });

    const active = stores.filter((s) => s.is_active);
    const decorate = (s) => {
      const list = byStore.get(s.id) || [];
      return {
        ...s,
        inspections: list,
        last: list[0] || null,
        rat: list.some((r) => hasRat(r.problem)),
        roach: list.some((r) => hasRoach(r.problem)),
      };
    };
    const inspected = active.filter((s) => byStore.has(s.id)).map(decorate);
    const notInspected = active.filter((s) => !byStore.has(s.id)).map(decorate);
    const ratStores = inspected.filter((s) => s.rat);
    const roachStores = inspected.filter((s) => s.roach);

    // สรุปรายชั้น
    const floors = floorsOf(active).map((f) => {
      const total = active.filter((s) => (s.floor || '') === f).length;
      const done = inspected.filter((s) => (s.floor || '') === f);
      return {
        floor: f,
        total,
        done: done.length,
        todo: total - done.length,
        pct: total ? Math.round((done.length / total) * 1000) / 10 : 0,
        rat: done.filter((s) => s.rat).length,
        roach: done.filter((s) => s.roach).length,
      };
    });

    return {
      floors,
      year, month,
      label: monthLabel(year, month),
      stores, inspections, byStore,
      totalActive: active.length,
      inspected, notInspected,
      pct: active.length ? Math.round((inspected.length / active.length) * 1000) / 10 : 0,
      ratStores, roachStores,
      noRat: inspected.length - ratStores.length,
      noRoach: inspected.length - roachStores.length,
      ratRecords: inspections.filter((r) => hasRat(r.problem)).length,
      roachRecords: inspections.filter((r) => hasRoach(r.problem)).length,
    };
  }

  /* ---------- แสดงผล ---------- */
  function render() {
    const r = report;
    $('#periodLabel').textContent = `ข้อมูลประจำเดือน ${r.label}`;
    $('#kTotal').textContent = r.totalActive.toLocaleString();
    $('#kDone').textContent = r.inspected.length.toLocaleString();
    $('#kTodo').textContent = r.notInspected.length.toLocaleString();
    $('#kRecords').textContent = r.inspections.length.toLocaleString();
    $('#kPct').textContent = `${r.pct}% (${r.inspected.length}/${r.totalActive})`;
    $('#kBar').style.width = `${Math.min(100, r.pct)}%`;

    $('#kRat').textContent = r.ratStores.length;
    $('#kRatSub').textContent = `ร้าน · ${r.ratRecords} ครั้ง`;
    $('#kNoRat').textContent = r.noRat;
    $('#kRoach').textContent = r.roachStores.length;
    $('#kRoachSub').textContent = `ร้าน · ${r.roachRecords} ครั้ง`;
    $('#kNoRoach').textContent = r.noRoach;

    const bar = (pct) => `<div class="mini-bar"><div class="progress"><div style="width:${Math.min(100, pct)}%"></div></div><span>${pct}%</span></div>`;
    $('#floorTbody').innerHTML = r.floors.map((f) => `
      <tr data-floor-row="${escapeHtml(f.floor)}">
        <td>${floorBadge(f.floor)}</td>
        <td>${f.total}</td>
        <td>${f.done}</td>
        <td>${f.todo ? `<b style="color:var(--warn)">${f.todo}</b>` : '0'}</td>
        <td>${bar(f.pct)}</td>
        <td>${f.rat ? `<span class="count-red">${f.rat}</span>` : '0'}</td>
        <td>${f.roach ? `<span class="count-red">${f.roach}</span>` : '0'}</td>
      </tr>`).join('') + `
      <tr class="total"><td>รวม</td><td>${r.totalActive}</td><td>${r.inspected.length}</td><td>${r.notInspected.length}</td>
        <td>${bar(r.pct)}</td><td>${r.ratStores.length}</td><td>${r.roachStores.length}</td></tr>`;

    $('#tcDone').textContent = r.inspected.length;
    $('#tcTodo').textContent = r.notInspected.length;
    $('#tcLog').textContent = r.inspections.length;
    renderList();
  }

  function matches(q, ...fields) {
    return !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q));
  }

  function renderList() {
    const box = $('#listBox');
    if (!report) return;
    const q = $('#listSearch').value.trim().toLowerCase();
    $('#listPager').innerHTML = '';

    // ปุ่มเลือกชั้น (นับตามแท็บที่เปิดอยู่)
    const chipSource = activeTab === 'done' ? report.inspected
      : activeTab === 'todo' ? report.notInspected
        : report.inspections.map((i) => ({ floor: i.floor }));
    renderFloorChips($('#listFloorChips'), {
      stores: chipSource, value: listFloor,
      onChange: (v) => { listFloor = v; listPage = 1; renderList(); },
    });
    const inFloor = (x) => floorMatch(listFloor, x.floor);
    // หัวข้อชั้นคั่นระหว่างกลุ่ม
    let prevFloor = null;
    const floorHead = (s, all) => {
      const f = s.floor || '';
      if (f === prevFloor) return '';
      prevFloor = f;
      return `<div class="floor-head"><span>🏢 ${escapeHtml(floorLabel(f))}</span><span class="muted">${all.filter((x) => (x.floor || '') === f).length} ร้าน</span></div>`;
    };
    // แบ่งหน้า: คืนรายการเฉพาะหน้าปัจจุบัน
    const paged = (items) => {
      listPage = renderPager($('#listPager'), {
        total: items.length, page: listPage, size: listSize,
        onChange: (p, sz) => {
          listPage = p; listSize = sz;
          renderList();
          $('.tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      });
      return pageSlice(items, listPage, listSize);
    };

    if (activeTab === 'done') {
      const items = report.inspected.filter((s) => inFloor(s) && matches(q, s.name, s.code, ...s.inspections.map((i) => i.inspector_name)));
      box.innerHTML = items.length ? paged(items).map((s) => `${floorHead(s, items)}
        <div class="list-item clickable" data-store="${s.id}">
          <div class="main"><b>${escapeHtml(s.name)}</b>
            <span>รหัส ${escapeHtml(s.code)} · ตรวจล่าสุด ${fmtDateTime(s.last.inspected_at)} · ${escapeHtml(s.last.inspector_name || '-')}</span></div>
          <div class="side">${problemBadge(s.last.problem)}<span class="muted" style="font-size:12px">${s.inspections.length} ครั้ง ›</span></div>
        </div>`).join('') : '<div class="empty">ไม่มีรายการ</div>';
    } else if (activeTab === 'todo') {
      const items = report.notInspected.filter((s) => inFloor(s) && matches(q, s.name, s.code));
      box.innerHTML = items.length ? paged(items).map((s) => `${floorHead(s, items)}
        <div class="list-item">
          <div class="main"><b>${escapeHtml(s.name)}</b><span>รหัส ${escapeHtml(s.code)}</span></div>
          <div class="side"><span class="badge badge-warn">ยังไม่ได้ตรวจ</span></div>
        </div>`).join('') : `<div class="empty">${q ? 'ไม่มีรายการ' : `🎉 ตรวจครบทุกร้าน${listFloor === 'all' ? '' : 'ใน' + floorLabel(listFloor)}แล้ว`}</div>`;
    } else {
      const items = report.inspections.filter((i) => inFloor(i) && matches(q, i.store_name, i.store_code, i.inspector_name, i.problem, i.solution_method));
      box.innerHTML = items.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>วันที่/เวลา</th><th>ร้านค้า</th><th>ชั้น</th><th>ปัญหา</th><th>วิธีแก้ไข</th><th>ผู้ตรวจ</th><th>รูป</th></tr></thead>
          <tbody>${paged(items).map((i) => `
            <tr class="clickable" data-insp="${i.id}" style="cursor:pointer">
              <td>${fmtDateTime(i.inspected_at)}</td>
              <td><b>${escapeHtml(i.store_name)}</b><br><span class="muted">${escapeHtml(i.store_code || '')}</span></td>
              <td>${floorBadge(i.floor)}</td>
              <td>${problemBadge(i.problem)}</td>
              <td>${escapeHtml(i.solution_method || '-')}</td>
              <td>${escapeHtml(i.inspector_name || '-')}</td>
              <td>${(i.photo_urls || []).length}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<div class="empty">ไม่มีรายการ</div>';
    }
  }

  /* ---------- รายละเอียดการตรวจ (ใช้ใน Modal) ---------- */
  function inspectionCard(i) {
    const photos = (i.photo_urls || []).map((u) =>
      `<img src="${escapeHtml(u)}" alt="รูปประกอบ" loading="lazy" data-lightbox="${escapeHtml(u)}">`).join('');
    const sig = i.signature_url
      ? `<img class="sig" src="${escapeHtml(i.signature_url)}" alt="ลายเซ็น" loading="lazy" data-lightbox="${escapeHtml(i.signature_url)}">` : '';
    return `
      <div class="insp-card avoid-break">
        <div class="head"><b>🕒 ${fmtDateTime(i.inspected_at)}</b>${problemBadge(i.problem)}</div>
        <dl>
          <dt>วิธีแก้ไข</dt><dd>${escapeHtml(i.solution_method || '-')}</dd>
          <dt>รายละเอียด</dt><dd>${escapeHtml(i.solution_detail || '-')}</dd>
          <dt>หมายเหตุ</dt><dd>${escapeHtml(i.note || '-')}</dd>
          <dt>ผู้ตรวจ</dt><dd>${escapeHtml(i.inspector_name || '-')}</dd>
        </dl>
        ${photos || sig ? `<div class="thumbs">${photos}${sig}</div>` : ''}
      </div>`;
  }

  function showPestDetail(kind) {
    if (!report) return;
    const isRat = kind === 'rat';
    const list = isRat ? report.ratStores : report.roachStores;
    const test = isRat ? hasRat : hasRoach;
    const title = `${isRat ? '🐀 ร้านที่พบหนู' : '🪳 ร้านที่พบแมลงสาบ'} — ${report.label} (${list.length} ร้าน)`;
    const html = list.length ? list.map((s) => {
      const recs = s.inspections.filter((r) => test(r.problem));
      return `<div class="store-group">
        <h4>${escapeHtml(s.name)} ${floorBadge(s.floor)} <span class="badge badge-muted">รหัส ${escapeHtml(s.code)}</span>
          <span class="badge badge-both">พบ ${recs.length} ครั้ง</span></h4>
        ${recs.map(inspectionCard).join('')}
      </div>`;
    }).join('') : '<div class="empty">🎉 ไม่พบปัญหาในเดือนนี้</div>';
    openModal(title, html, { wide: true });
  }

  function showStoreDetail(storeId) {
    const s = report.inspected.find((x) => x.id === storeId);
    if (!s) return;
    openModal(`${s.name} (${floorLabel(s.floor)} · รหัส ${s.code}) — ${report.label}`, s.inspections.map(inspectionCard).join(''), { wide: true });
  }

  function showInspection(id) {
    const i = report.inspections.find((x) => x.id === id);
    if (i) openModal(`${i.store_name} (รหัส ${i.store_code || '-'})`, inspectionCard(i), { wide: true });
  }

  /* ---------- Events ---------- */
  $('#btnLoad').addEventListener('click', load);
  $('#cardRat').addEventListener('click', () => showPestDetail('rat'));
  $('#cardRoach').addEventListener('click', () => showPestDetail('roach'));
  ['#cardRat', '#cardRoach'].forEach((sel) => $(sel).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(sel).click(); }
  }));
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    listPage = 1;
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    renderList();
  }));
  $('#floorTbody').addEventListener('click', (e) => {
    const tr = e.target.closest('[data-floor-row]');
    if (!tr || !report) return;
    listFloor = tr.dataset.floorRow;
    listPage = 1;
    // ชั้นที่ยังตรวจไม่ครบ -> เปิดแท็บ "ยังไม่ได้ตรวจ" ให้เลย
    const f = report.floors.find((x) => x.floor === listFloor);
    activeTab = f && f.todo > 0 ? 'todo' : 'done';
    $$('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === activeTab));
    renderList();
    $('#listFloorChips').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#listSearch').addEventListener('input', () => { listPage = 1; renderList(); });
  $('#listBox').addEventListener('click', (e) => {
    const st = e.target.closest('[data-store]');
    if (st) return showStoreDetail(st.dataset.store);
    const ins = e.target.closest('[data-insp]');
    if (ins) showInspection(ins.dataset.insp);
  });

  const guard = (fn) => async () => {
    if (!report) return toast('กรุณากด "ดูข้อมูล" ก่อน', 'warn');
    try { await fn(report); } catch (err) { hideLoading(); toast('Export ไม่สำเร็จ: ' + errMsg(err), 'error'); }
  };
  $('#btnCsv').addEventListener('click', guard(ReportExporter.csv));
  $('#btnExcel').addEventListener('click', guard(ReportExporter.excel));
  $('#btnPdf').addEventListener('click', guard(ReportExporter.pdf));

  /* ---------- Init ---------- */
  if (requireConfig()) load();
})();
