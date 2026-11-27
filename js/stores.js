/* =====================================================================
 *  stores.js — จัดการรายชื่อร้านค้า (Admin Only)
 *  แบ่งเป็นหน้าย่อย: รายชื่อร้านค้า | เพิ่มร้านค้า | นำเข้าหลายร้าน | Admin
 *  ใช้ Supabase Auth (อีเมล/รหัสผ่าน) + Row Level Security ฝั่งฐานข้อมูล
 *  -> ต่อให้มีคนแก้โค้ดฝั่งหน้าเว็บ ก็แก้ไขข้อมูลไม่ได้ถ้าไม่ได้ล็อกอิน
 * ===================================================================== */
(() => {
  const LS_SIZE = 'pest.storePageSize';
  let stores = [];
  let isAdmin = false;
  let status = 'all';
  let page = 1;
  let size = 10;
  try { size = Number(localStorage.getItem(LS_SIZE)) || 10; } catch (_) { /* ignore */ }

  /* ---------- หน้าย่อย (Sub-pages) ---------- */
  function showSub(name) {
    $$('.subnav .tab').forEach((t) => t.classList.toggle('active', t.dataset.sub === name));
    $$('.subpage').forEach((p) => p.classList.toggle('active', p.dataset.subpage === name));
    try { history.replaceState(null, '', `#${name}`); } catch (_) { /* ignore */ }
    if (name === 'add' && isAdmin) setTimeout(() => $('#addCode').focus(), 50);
  }
  $$('.subnav .tab').forEach((t) => t.addEventListener('click', () => showSub(t.dataset.sub)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) showSub(g.dataset.goto);
  });

  // หน้าย่อยที่ต้องเป็น Admin: ถ้ายังไม่ล็อกอินให้แสดงกล่อง "ล็อก" แทนฟอร์ม
  function applyLock() {
    $$('.admin-panel').forEach((panel) => {
      panel.classList.toggle('hidden', !isAdmin);
      const sec = panel.parentElement;
      $('.locked', sec)?.remove();
      if (!isAdmin) sec.appendChild($('#lockedTpl').content.cloneNode(true));
    });
  }

  /* ---------- Auth ---------- */
  function setAdmin(session) {
    const was = isAdmin;
    isAdmin = !!session;
    const email = session ? session.user.email : '';
    $('#adminBar').classList.toggle('hidden', !isAdmin);
    $('#adminEmail').textContent = email ? `👤 ${email}` : '';
    $('#loginCard').classList.toggle('hidden', isAdmin);
    $('#loggedCard').classList.toggle('hidden', !isAdmin);
    $('#loggedEmail').textContent = email;
    $('#tabLogin').innerHTML = isAdmin ? '<span class="tab-ico">✅ </span>Admin' : '<span class="tab-ico">🔐 </span>Admin';
    $$('.admin-only').forEach((x) => x.classList.toggle('hidden', !isAdmin));
    applyLock();
    renderTable();
    // เพิ่งล็อกอินจากหน้า Admin -> พาไปหน้ารายชื่อ
    if (isAdmin && !was && $('.subpage.active')?.dataset.subpage === 'login') showSub('list');
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

  const logout = async () => { await db.auth.signOut(); toast('ออกจากระบบแล้ว'); };
  $('#btnLogout').addEventListener('click', logout);
  $('#btnLogout2').addEventListener('click', logout);

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
    const active = stores.filter((s) => s.is_active).length;
    $('#cAll').textContent = stores.length;
    $('#cActive').textContent = active;
    $('#cInactive').textContent = stores.length - active;

    const rows = stores.filter((s) =>
      (status === 'all' || (status === 'active') === s.is_active) &&
      (!q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));

    page = renderPager($('#storePager'), {
      total: rows.length, page, size,
      onChange: (p, sz) => {
        page = p;
        if (sz !== size) { size = sz; try { localStorage.setItem(LS_SIZE, sz); } catch (_) { /* ignore */ } }
        renderTable();
        $('#storeTbody').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    });

    $('#storeTbody').innerHTML = rows.length ? pageSlice(rows, page, size).map((s) => `
      <tr class="${s.is_active ? '' : 'inactive'}">
        <td class="c-code"><b>${escapeHtml(s.code)}</b></td>
        <td class="c-name">${escapeHtml(s.name)}</td>
        <td>${s.is_active ? '<span class="badge badge-ok">Active</span>' : '<span class="badge badge-muted">Inactive</span>'}</td>
        ${isAdmin ? `<td class="actions">
          <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${s.id}">✏️ แก้ไข</button>
          <button class="btn ${s.is_active ? 'btn-ghost' : 'btn-outline'} btn-sm" data-act="toggle" data-id="${s.id}">
            ${s.is_active ? '⏸ ปิดใช้งาน' : '▶ เปิดใช้งาน'}</button>
          <button class="btn btn-danger-outline btn-sm" data-act="delete" data-id="${s.id}" aria-label="ลบ">🗑</button>
        </td>` : ''}
      </tr>`).join('') : `<tr><td colspan="4" class="empty">${stores.length ? 'ไม่พบร้านค้าที่ค้นหา' : 'ยังไม่มีร้านค้า'}</td></tr>`;
  }

  $('#search').addEventListener('input', () => { page = 1; renderTable(); });
  $('#statusChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-status]');
    if (!c) return;
    status = c.dataset.status;
    $$('#statusChips .chip').forEach((x) => x.classList.toggle('active', x === c));
    page = 1;
    renderTable();
  });

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
    $('#lastAdded').textContent = `✅ เพิ่มล่าสุด: ${code} — ${name}`;
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
  function parseBulk() {
    const rows = $('#bulkText').value.split(/\r?\n/)
      .map((line) => line.split(/\t|,/).map((x) => x.trim()))
      .filter(([code, ...rest]) => code && rest.join(' ').trim())
      .map(([code, ...rest]) => ({ code, name: rest.join(' ').trim(), is_active: true }));
    return [...new Map(rows.map((r) => [r.code, r])).values()];
  }
  $('#bulkText').addEventListener('input', () => {
    const list = parseBulk();
    const existing = new Set(stores.map((s) => s.code));
    const upd = list.filter((r) => existing.has(r.code)).length;
    $('#bulkPreview').textContent = list.length
      ? `พบ ${list.length} ร้าน (ใหม่ ${list.length - upd} · อัปเดตชื่อ ${upd})` : '';
  });
  $('#bulkGo').addEventListener('click', async () => {
    const unique = parseBulk();
    if (!unique.length) return toast('ไม่พบข้อมูลที่ถูกต้อง', 'warn');
    showLoading(`กำลังนำเข้า ${unique.length} ร้าน...`);
    const { error } = await db.from('stores').upsert(unique, { onConflict: 'code' });
    hideLoading();
    if (error) return toast(errMsg(error), 'error');
    $('#bulkText').value = '';
    $('#bulkPreview').textContent = '';
    toast(`นำเข้า/อัปเดต ${unique.length} ร้านแล้ว`, 'success');
    await loadStores();
    showSub('list');
  });

  /* ---------- Init ---------- */
  const initial = location.hash.slice(1);
  if (['list', 'add', 'import', 'login'].includes(initial)) showSub(initial);
  applyLock();
  if (requireConfig()) {
    db.auth.getSession().then(({ data }) => setAdmin(data.session));
    db.auth.onAuthStateChange((_evt, session) => setAdmin(session));
    loadStores();
  } else {
    $('#storeTbody').innerHTML = '<tr><td colspan="4" class="empty">ยังไม่ได้เชื่อมต่อฐานข้อมูล</td></tr>';
  }
})();
