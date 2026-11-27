/* =====================================================================
 *  stores.js — จัดการรายชื่อร้านค้า (Admin Only)
 *  ใช้ Supabase Auth (อีเมล/รหัสผ่าน) + Row Level Security ฝั่งฐานข้อมูล
 *  -> ต่อให้มีคนแก้โค้ดฝั่งหน้าเว็บ ก็แก้ไขข้อมูลไม่ได้ถ้าไม่ได้ล็อกอิน
 * ===================================================================== */
(() => {
  let stores = [];
  let isAdmin = false;

  /* ---------- Auth ---------- */
  function setAdmin(session) {
    isAdmin = !!session;
    $('#loginCard').classList.toggle('hidden', isAdmin);
    $('#addCard').classList.toggle('hidden', !isAdmin);
    $('#adminBar').classList.toggle('hidden', !isAdmin);
    $$('.admin-only').forEach((x) => x.classList.toggle('hidden', !isAdmin));
    $('#adminEmail').textContent = session ? `👤 ${session.user.email}` : '';
    renderTable();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!db) return;
    showLoading('กำลังเข้าสู่ระบบ...');
    const { error } = await db.auth.signInWithPassword({
      email: $('#loginEmail').value.trim(),
      password: $('#loginPassword').value,
    });
    hideLoading();
    if (error) return toast(errMsg(error), 'error');
    $('#loginPassword').value = '';
    toast('เข้าสู่ระบบสำเร็จ', 'success');
  });

  $('#btnLogout').addEventListener('click', async () => {
    await db.auth.signOut();
    toast('ออกจากระบบแล้ว');
  });

  /* ---------- Load / Render ---------- */
  async function loadStores() {
    const { data, error } = await db.from('stores').select('*').order('code');
    if (error) {
      $('#storeTbody').innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(errMsg(error))}</td></tr>`;
      return;
    }
    stores = data || [];
    renderTable();
  }

  function renderTable() {
    const q = $('#search').value.trim().toLowerCase();
    const st = $('#statusFilter').value;
    const rows = stores.filter((s) =>
      (st === 'all' || (st === 'active') === s.is_active) &&
      (!q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));

    const active = stores.filter((s) => s.is_active).length;
    $('#storeCount').textContent = `(ทั้งหมด ${stores.length} · Active ${active} · Inactive ${stores.length - active})`;

    $('#storeTbody').innerHTML = rows.length ? rows.map((s) => `
      <tr class="${s.is_active ? '' : 'inactive'}">
        <td><b>${escapeHtml(s.code)}</b></td>
        <td>${escapeHtml(s.name)}</td>
        <td>${s.is_active ? '<span class="badge badge-ok">Active</span>' : '<span class="badge badge-muted">Inactive</span>'}</td>
        ${isAdmin ? `<td class="actions">
          <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${s.id}">✏️ แก้ไข</button>
          <button class="btn ${s.is_active ? 'btn-ghost' : 'btn-outline'} btn-sm" data-act="toggle" data-id="${s.id}">
            ${s.is_active ? '⏸ ปิดใช้งาน' : '▶ เปิดใช้งาน'}</button>
          <button class="btn btn-danger-outline btn-sm" data-act="delete" data-id="${s.id}">🗑</button>
        </td>` : ''}
      </tr>`).join('') : `<tr><td colspan="4" class="empty">${stores.length ? 'ไม่พบร้านค้าที่ค้นหา' : 'ยังไม่มีร้านค้า'}</td></tr>`;
  }

  $('#search').addEventListener('input', renderTable);
  $('#statusFilter').addEventListener('change', renderTable);

  /* ---------- Add ---------- */
  $('#addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#addCode').value.trim();
    const name = $('#addName').value.trim();
    if (!code || !name) return toast('กรุณากรอกรหัสและชื่อร้านค้า', 'warn');
    showLoading('กำลังบันทึก...');
    const { error } = await db.from('stores').insert({ code, name, is_active: true });
    hideLoading();
    if (error) return toast(errMsg(error), 'error');
    $('#addCode').value = '';
    $('#addName').value = '';
    toast(`เพิ่มร้าน "${name}" แล้ว`, 'success');
    $('#addCode').focus();
    loadStores();
  });

  /* ---------- Edit / Toggle / Delete ---------- */
  $('#storeTbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !isAdmin) return;
    const s = stores.find((x) => x.id === btn.dataset.id);
    if (!s) return;

    if (btn.dataset.act === 'edit') return openEdit(s);

    if (btn.dataset.act === 'toggle') {
      const { error } = await db.from('stores').update({ is_active: !s.is_active }).eq('id', s.id);
      if (error) return toast(errMsg(error), 'error');
      toast(`${s.is_active ? 'ปิด' : 'เปิด'}ใช้งาน "${s.name}" แล้ว`, 'success');
      return loadStores();
    }

    if (btn.dataset.act === 'delete') {
      if (!confirm(`ลบร้าน "${s.name}" (รหัส ${s.code}) ถาวร?\n\nหากร้านนี้มีประวัติการตรวจ ระบบจะไม่อนุญาตให้ลบ (ให้ใช้ "ปิดใช้งาน" แทน)`)) return;
      const { error } = await db.from('stores').delete().eq('id', s.id);
      if (error) return toast(errMsg(error), 'error', 6000);
      toast(`ลบร้าน "${s.name}" แล้ว`, 'success');
      loadStores();
    }
  });

  function openEdit(s) {
    const m = openModal(`แก้ไขร้านค้า: ${s.name}`, `
      <form id="editForm">
        <div class="field"><label for="eCode">รหัสร้านค้า</label><input type="text" id="eCode" value="${escapeHtml(s.code)}" required></div>
        <div class="field"><label for="eName">ชื่อร้านค้า</label><input type="text" id="eName" value="${escapeHtml(s.name)}" required></div>
        <div class="field"><label for="eActive">สถานะการใช้งาน</label>
          <select id="eActive"><option value="true">Active</option><option value="false">Inactive</option></select></div>
        <div class="btn-row mt-16">
          <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
          <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
        </div>
      </form>`);
    $('#eActive', m).value = String(s.is_active);
    $('#editForm', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        code: $('#eCode', m).value.trim(),
        name: $('#eName', m).value.trim(),
        is_active: $('#eActive', m).value === 'true',
      };
      if (!payload.code || !payload.name) return toast('กรุณากรอกข้อมูลให้ครบ', 'warn');
      const { error } = await db.from('stores').update(payload).eq('id', s.id);
      if (error) return toast(errMsg(error), 'error');
      closeModal();
      toast('บันทึกการแก้ไขแล้ว', 'success');
      loadStores();
    });
  }

  /* ---------- Bulk import ---------- */
  $('#btnBulk').addEventListener('click', () => {
    const m = openModal('นำเข้าร้านค้าหลายร้าน', `
      <p class="hint" style="margin-top:0">วางข้อมูล 1 ร้านต่อ 1 บรรทัด รูปแบบ <code>รหัส,ชื่อร้าน</code>
      (คัดลอกจาก Excel 2 คอลัมน์มาวางได้เลย) — ถ้ารหัสซ้ำกับที่มีอยู่ ระบบจะอัปเดตชื่อให้</p>
      <textarea id="bulkText" style="min-height:200px" placeholder="S001,ร้านสมใจ&#10;S002,ร้านมีชัย"></textarea>
      <div class="btn-row mt-12">
        <button class="btn btn-primary" id="bulkGo">นำเข้า</button>
        <button class="btn btn-ghost" data-close>ยกเลิก</button>
      </div>`);
    $('#bulkGo', m).addEventListener('click', async () => {
      const rows = $('#bulkText', m).value.split(/\r?\n/)
        .map((line) => line.split(/\t|,/).map((x) => x.trim()))
        .filter(([code, ...rest]) => code && rest.join(' ').trim())
        .map(([code, ...rest]) => ({ code, name: rest.join(' ').trim(), is_active: true }));
      const unique = [...new Map(rows.map((r) => [r.code, r])).values()];
      if (!unique.length) return toast('ไม่พบข้อมูลที่ถูกต้อง', 'warn');
      showLoading(`กำลังนำเข้า ${unique.length} ร้าน...`);
      const { error } = await db.from('stores').upsert(unique, { onConflict: 'code' });
      hideLoading();
      if (error) return toast(errMsg(error), 'error');
      closeModal();
      toast(`นำเข้า/อัปเดต ${unique.length} ร้านแล้ว`, 'success');
      loadStores();
    });
  });

  /* ---------- Init ---------- */
  if (requireConfig()) {
    db.auth.getSession().then(({ data }) => setAdmin(data.session));
    db.auth.onAuthStateChange((_evt, session) => setAdmin(session));
    loadStores();
  } else {
    $('#storeTbody').innerHTML = '<tr><td colspan="4" class="empty">ยังไม่ได้เชื่อมต่อฐานข้อมูล</td></tr>';
  }
})();
