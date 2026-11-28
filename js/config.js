/* =====================================================================
 *  ★ ตั้งค่าการเชื่อมต่อ Supabase — แก้ไขเฉพาะ 2 บรรทัดนี้ ★
 *  หาได้จาก Supabase Dashboard → Project Settings → API
 *  (anon key เปิดเผยได้ ความปลอดภัยควบคุมด้วย Row Level Security ใน schema.sql)
 * ===================================================================== */
export const SUPABASE_URL = 'https://tkklsupaxezxnxpacidk.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Ji9G34XqBU8-zHAyRRevQQ_IIWtUuUz';

/* ---------------------------------------------------------------------
 *  ค่าตั้งค่าอื่นๆ (แก้ไขได้ตามต้องการ)
 * ------------------------------------------------------------------- */
export const STORAGE_BUCKET = 'inspection-images';

/** ชั้นของร้านค้า — ใช้อักษรตัวแรกของรหัสร้านเป็นชั้น */
export const FLOORS = ['B', '1', '2', '3', '4', '5'];

/** จำนวนร้านต่อหน้า (การแบ่งหน้า) */
export const PAGE_SIZE = 10;

/** ตัวเลือก "ปัญหาที่พบ" */
export const PROBLEM_OPTIONS = ['หนู', 'แมลงสาบ', 'หนู-แมลงสาบ', 'ไม่พบปัญหา'];
export const NO_PROBLEM = 'ไม่พบปัญหา';

/** ตัวเลือก "วิธีการแก้ไขปัญหา" */
export const SOLUTION_OPTIONS = ['หยอดเจล', 'วางกรงดักหนู', 'วางถาดกาวดักหนู', 'โยนยาเบื่อหนู', 'อื่นๆ'];
export const OTHER_SOLUTION = 'อื่นๆ';

/** การบีบอัดรูปภาพฝั่ง Client */
export const IMAGE_OPTIONS = {
  maxDim: 1280,        // ด้านยาวสุด (px)
  quality: 0.6,        // คุณภาพเริ่มต้น
  minQuality: 0.4,     // คุณภาพต่ำสุดที่ยอมรับ
  targetBytes: 200 * 1024, // เป้าหมายขนาดไฟล์ต่อรูป (~200KB)
};
export const MAX_PHOTOS = 5;
