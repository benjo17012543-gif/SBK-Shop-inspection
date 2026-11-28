-- =====================================================================
--  Pest Inspect — Supabase schema
--  วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
--  (รันซ้ำได้อย่างปลอดภัย)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ตารางร้านค้า
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  store_code  text not null unique,
  store_name  text not null,
  -- ชั้น = อักษรตัวแรกของรหัสร้าน (B, 1, 2, 3, 4, 5)
  floor       text generated always as (upper(substr(store_code, 1, 1))) stored,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint stores_code_floor_chk check (store_code ~* '^[B1-5]')
);
create index if not exists stores_floor_idx on public.stores (floor);

-- ---------------------------------------------------------------------
-- ตารางบันทึกการตรวจ
-- ---------------------------------------------------------------------
create table if not exists public.inspections (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on delete restrict,
  store_code       text not null,          -- snapshot ณ เวลาที่ตรวจ
  store_name       text not null,          -- snapshot ณ เวลาที่ตรวจ
  problem          text not null
                   check (problem in ('หนู', 'แมลงสาบ', 'หนู-แมลงสาบ', 'ไม่พบปัญหา')),
  solution_method  text
                   check (solution_method in ('หยอดเจล', 'วางกรงดักหนู', 'วางถาดกาวดักหนู', 'โยนยาเบื่อหนู', 'อื่นๆ')),
  solution_detail  text,
  image_urls       text[] not null default '{}',
  signature_url    text,
  inspector_name   text,
  remarks          text,
  created_at       timestamptz not null default now(),   -- วันที่และเวลาที่บันทึก (อัตโนมัติ)
  constraint inspections_solution_chk
    check (problem = 'ไม่พบปัญหา' or solution_method is not null),
  constraint inspections_images_chk
    check (coalesce(array_length(image_urls, 1), 0) <= 5)
);
create index if not exists inspections_created_idx on public.inspections (created_at desc);
create index if not exists inspections_store_idx   on public.inspections (store_id, created_at desc);

-- updated_at อัตโนมัติ
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists stores_updated_at on public.stores;
create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

-- บังคับ created_at = เวลาเซิร์ฟเวอร์เสมอ (ป้องกันการปลอมเวลา)
create or replace function public.force_created_at() returns trigger
language plpgsql as $$ begin new.created_at = now(); return new; end $$;
drop trigger if exists inspections_created_at on public.inspections;
create trigger inspections_created_at before insert on public.inspections
  for each row execute function public.force_created_at();

-- ---------------------------------------------------------------------
-- Row Level Security
--   anon (พนักงานหน้างาน)      : อ่านร้าน Active, เพิ่ม/อ่านบันทึกการตรวจ
--   authenticated (Admin)      : จัดการทุกอย่าง
--   ⚠ ปิด "Allow new users to sign up" ใน Authentication เพื่อให้มีเฉพาะ Admin ที่สร้างเอง
-- ---------------------------------------------------------------------
alter table public.stores      enable row level security;
alter table public.inspections enable row level security;

drop policy if exists stores_select_anon on public.stores;
drop policy if exists stores_admin_all   on public.stores;
create policy stores_select_anon on public.stores
  for select to anon using (is_active);
create policy stores_admin_all on public.stores
  for all to authenticated using (true) with check (true);

drop policy if exists inspections_select on public.inspections;
drop policy if exists inspections_insert on public.inspections;
drop policy if exists inspections_update on public.inspections;
drop policy if exists inspections_delete on public.inspections;
create policy inspections_select on public.inspections
  for select to anon, authenticated using (true);
create policy inspections_insert on public.inspections
  for insert to anon, authenticated
  with check (exists (select 1 from public.stores s where s.id = store_id and s.is_active));
create policy inspections_update on public.inspections
  for update to authenticated using (true) with check (true);
create policy inspections_delete on public.inspections
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------
-- Storage: bucket รูปภาพ + ลายเซ็น (public read, จำกัดขนาด/ชนิดไฟล์)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-images', 'inspection-images', true, 2097152,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inspection images read"   on storage.objects;
drop policy if exists "inspection images upload" on storage.objects;
drop policy if exists "inspection images delete" on storage.objects;
create policy "inspection images read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'inspection-images');
create policy "inspection images upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'inspection-images'
              and (storage.foldername(name))[1] in ('photos', 'signatures'));
create policy "inspection images delete" on storage.objects
  for delete to authenticated using (bucket_id = 'inspection-images');

-- ---------------------------------------------------------------------
-- ข้อมูลตัวอย่าง (ลบส่วนนี้ได้หากไม่ต้องการ)
-- ---------------------------------------------------------------------
insert into public.stores (store_code, store_name) values
  ('B01', 'ซูเปอร์มาร์เก็ต'),      ('B02', 'ร้านเบเกอรี่ชั้นใต้ดิน'), ('B03', 'ฟู้ดคอร์ท โซน A'),
  ('B04', 'ฟู้ดคอร์ท โซน B'),     ('B05', 'ร้านผลไม้สด'),            ('B06', 'ร้านข้าวมันไก่'),
  ('B07', 'ร้านก๋วยเตี๋ยวเรือ'),   ('B08', 'ร้านชานมไข่มุก'),         ('B09', 'ร้านข้าวแกง'),
  ('B10', 'ร้านติ่มซำ'),           ('B11', 'ร้านน้ำผลไม้ปั่น'),
  ('101', 'ร้านกาแฟ The Bean'),    ('102', 'ร้านขนมหวาน'),            ('103', 'ร้านโดนัท'),
  ('104', 'ร้านไอศกรีม'),          ('105', 'ร้านเครื่องสำอาง'),
  ('201', 'ร้านอาหารญี่ปุ่น'),      ('202', 'ร้านชาบู'),               ('203', 'ร้านพิซซ่า'),
  ('204', 'ร้านเสื้อผ้า'),
  ('301', 'ร้านหมูกระทะ'),         ('302', 'ร้านอาหารเกาหลี'),        ('303', 'ร้านสเต๊ก'),
  ('401', 'โรงภาพยนตร์ - ป๊อปคอร์น'), ('402', 'ร้านเกม'),
  ('501', 'ร้านอาหารบุฟเฟต์'),     ('502', 'ร้านบาร์บีคิว')
on conflict (store_code) do nothing;
