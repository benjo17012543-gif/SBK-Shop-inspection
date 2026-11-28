-- =====================================================================
--  สำหรับฐานข้อมูลที่รัน schema.sql เวอร์ชันแรกไปแล้ว
--  1) รองรับชั้น 6   2) ลบร้านตัวอย่าง (เฉพาะร้านที่ยังไม่มีประวัติการตรวจ)
--  วิธีใช้: SQL Editor → วางทั้งไฟล์ → Run (รันซ้ำได้)
-- =====================================================================
alter table public.stores drop constraint if exists stores_code_floor_chk;
alter table public.stores add constraint stores_code_floor_chk check (store_code ~* '^[B1-6]');

delete from public.stores s
where s.store_code in (
  'B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11',
  '101','102','103','104','105','201','202','203','204',
  '301','302','303','401','402','501','502')
  and not exists (select 1 from public.inspections i where i.store_id = s.id);
