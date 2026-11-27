-- =====================================================================
--  อัปเดตเพิ่ม "ชั้น" ให้ฐานข้อมูลที่ติดตั้งไปแล้ว
--  วิธีใช้: Supabase > SQL Editor > New query > วางทั้งไฟล์ > Run (รันซ้ำได้)
-- =====================================================================
alter table public.stores      add column if not exists floor text;        -- ชั้นของร้าน: B, 1, 2, 3, 4, 5
alter table public.inspections add column if not exists store_floor text;  -- ชั้น ณ วันที่ตรวจ

create index if not exists stores_floor_idx on public.stores (floor, code);

-- ให้ API ของ Supabase รู้จักคอลัมน์ใหม่ทันที
notify pgrst, 'reload schema';

-- ตัวอย่างการกำหนดชั้นให้ร้านเดิม (แก้รหัสร้านตามจริง):
-- update public.stores set floor = 'B' where code in ('S001', 'S002');
-- update public.stores set floor = '1' where code in ('S003', 'S004');
