/* =====================================================================
 *  CONFIG — แก้ไขค่าตรงนี้ที่เดียว
 *  นำค่ามาจาก Supabase Dashboard > Project Settings > API
 * ===================================================================== */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-SUPABASE-ANON-KEY',

  // ชื่อ Bucket ใน Supabase Storage (ต้องตรงกับ supabase/schema.sql)
  STORAGE_BUCKET: 'inspection-photos',

  // ชื่อหน่วยงาน (แสดงบนหัวรายงาน PDF / Excel)
  ORG_NAME: 'ระบบตรวจร้านค้าและควบคุมศัตรูพืช',

  // การบีบอัดรูปภาพฝั่ง Client
  IMAGE_MAX_DIMENSION: 1280, // ด้านยาวสุด (px)
  IMAGE_QUALITY: 0.65,       // คุณภาพเริ่มต้น 0-1
  IMAGE_TARGET_KB: 180,      // พยายามบีบให้ไม่เกินขนาดนี้ (KB)
  MAX_PHOTOS: 5,             // จำนวนรูปสูงสุดต่อการตรวจ 1 ครั้ง
  REQUIRE_PHOTO: true,       // บังคับแนบรูปอย่างน้อย 1 รูป
};
