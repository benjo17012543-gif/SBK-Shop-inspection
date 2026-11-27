-- =====================================================================
--  Pest Inspection System — Supabase schema
--  วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
--  (รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) ตารางร้านค้า
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- รหัสร้านค้า
  name        text not null,                        -- ชื่อร้านค้า
  floor       text,                                 -- ชั้น เช่น B, 1, 2, 3, 4, 5
  is_active   boolean not null default true,        -- Active / Inactive
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) ตารางบันทึกการตรวจ
-- ---------------------------------------------------------------------
create table if not exists public.inspections (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete restrict,
  store_code       text,                            -- snapshot ณ วันที่ตรวจ
  store_name       text not null,                   -- snapshot ณ วันที่ตรวจ
  store_floor      text,                            -- snapshot ชั้น ณ วันที่ตรวจ
  inspector_name   text,
  problem          text not null
                   check (problem in ('หนู', 'แมลงสาบ', 'หนู-แมลงสาบ', 'ไม่พบปัญหา')),
  solution_method  text
                   check (solution_method is null or solution_method in
                         ('หยอดเจล', 'วางกรงดักหนู', 'วางถาดกาวดักหนู', 'โยนยาเบื่อหนู', 'อื่นๆ')),
  solution_detail  text,
  note             text,
  photo_urls       text[] not null default '{}',
  signature_url    text,
  inspected_at     timestamptz not null default now(),  -- Timestamp อัตโนมัติ
  created_at       timestamptz not null default now()
);

-- รองรับฐานข้อมูลที่สร้างจากเวอร์ชันก่อน (ยังไม่มีคอลัมน์ชั้น)
alter table public.stores      add column if not exists floor text;
alter table public.inspections add column if not exists store_floor text;

create index if not exists stores_floor_idx               on public.stores (floor, code);
create index if not exists inspections_inspected_at_idx on public.inspections (inspected_at desc);
create index if not exists inspections_store_month_idx  on public.inspections (store_id, inspected_at desc);
create index if not exists stores_active_idx            on public.stores (is_active);

-- ---------------------------------------------------------------------
-- 3) Triggers
-- ---------------------------------------------------------------------
-- updated_at อัตโนมัติ
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at before update on public.stores
for each row execute function public.set_updated_at();

-- บังคับเวลาบันทึกเป็นเวลาเซิร์ฟเวอร์ (กันการปลอมเวลาจากเครื่องผู้ใช้)
create or replace function public.force_inspected_at() returns trigger
language plpgsql as $$
begin
  new.inspected_at := now();
  new.created_at := now();
  return new;
end $$;

drop trigger if exists trg_inspections_force_time on public.inspections;
create trigger trg_inspections_force_time before insert on public.inspections
for each row execute function public.force_inspected_at();

-- ---------------------------------------------------------------------
-- 4) Row Level Security
--    anon (พนักงานหน้างาน) : อ่านร้านค้า / อ่าน+เพิ่มบันทึกการตรวจ
--    authenticated (Admin)  : ทำได้ทุกอย่าง
-- ---------------------------------------------------------------------
alter table public.stores      enable row level security;
alter table public.inspections enable row level security;

drop policy if exists "stores_read_all"      on public.stores;
drop policy if exists "stores_admin_insert"  on public.stores;
drop policy if exists "stores_admin_update"  on public.stores;
drop policy if exists "stores_admin_delete"  on public.stores;

create policy "stores_read_all"     on public.stores for select to anon, authenticated using (true);
create policy "stores_admin_insert" on public.stores for insert to authenticated with check (true);
create policy "stores_admin_update" on public.stores for update to authenticated using (true) with check (true);
create policy "stores_admin_delete" on public.stores for delete to authenticated using (true);

drop policy if exists "inspections_read_all"     on public.inspections;
drop policy if exists "inspections_insert_all"   on public.inspections;
drop policy if exists "inspections_admin_update" on public.inspections;
drop policy if exists "inspections_admin_delete" on public.inspections;

create policy "inspections_read_all"   on public.inspections for select to anon, authenticated using (true);
-- อนุญาตบันทึกเฉพาะร้านที่ Active เท่านั้น
create policy "inspections_insert_all" on public.inspections for insert to anon, authenticated
  with check (exists (select 1 from public.stores s where s.id = store_id and s.is_active));
create policy "inspections_admin_update" on public.inspections for update to authenticated using (true) with check (true);
create policy "inspections_admin_delete" on public.inspections for delete to authenticated using (true);

grant select on public.stores to anon, authenticated;
grant insert, update, delete on public.stores to authenticated;
grant select, insert on public.inspections to anon, authenticated;
grant update, delete on public.inspections to authenticated;

-- ---------------------------------------------------------------------
-- 5) Storage bucket สำหรับรูปภาพและลายเซ็น (Public read)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', true, 2097152,           -- จำกัด 2 MB/ไฟล์
        array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inspection_photos_upload"       on storage.objects;
drop policy if exists "inspection_photos_admin_delete" on storage.objects;

create policy "inspection_photos_upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'inspection-photos');
create policy "inspection_photos_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-photos');

-- ---------------------------------------------------------------------
-- 6) ข้อมูลตัวอย่าง (ลบ -- ออกถ้าต้องการ)
-- ---------------------------------------------------------------------
-- insert into public.stores (code, name, floor) values
--   ('S001', 'ร้านข้าวมันไก่ป้าศรี', 'B'),
--   ('S002', 'ร้านก๋วยเตี๋ยวเรือ', '1'),
--   ('S003', 'ร้านชาไข่มุกบับเบิ้ล', '2')
-- on conflict (code) do nothing;
notify pgrst, 'reload schema';
