import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

/** true เมื่อผู้ใช้ใส่ค่า URL/KEY จริงใน config.js แล้ว */
export const isConfigured =
  !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');

/** Supabase client (null ถ้ายังไม่ได้ตั้งค่า หรือโหลดไลบรารีไม่สำเร็จ) */
export const sb = isConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export async function getSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

export async function signIn(email, password) {
  if (!sb) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
}

/** แสดงสถานะ Admin ในแถบด้านบน (slot #authSlot) */
export async function renderAuthChip() {
  const slot = document.getElementById('authSlot');
  if (!slot) return;
  const session = await getSession();
  if (session) {
    slot.innerHTML = `
      <span class="auth-chip" title="${session.user.email}">
        <span class="dot"></span>Admin
      </span>
      <button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">ออกจากระบบ</button>`;
    slot.querySelector('#logoutBtn').addEventListener('click', async () => {
      await signOut();
      location.reload();
    });
  } else {
    slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="stores.html">เข้าสู่ระบบ Admin</a>`;
  }
  return session;
}

/** อัปโหลด Blob ขึ้น Storage แล้วคืน public URL */
export async function uploadBlob(bucket, path, blob, contentType) {
  const { error } = await sb.storage.from(bucket).upload(path, blob, {
    contentType, cacheControl: '31536000', upsert: false,
  });
  if (error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
