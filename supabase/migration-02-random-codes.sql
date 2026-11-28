-- =====================================================================
--  เปลี่ยนรหัสร้านเดิม (เช่น B-001, B-002 ...) เป็น "ชั้น-เลขสุ่ม 3 หลัก" (เช่น B-472)
--  ใช้เมื่อเคยนำเข้า stores-import.csv ฉบับเก่า (รหัสเรียงลำดับ)
--  วิธีใช้: SQL Editor → วางทั้งไฟล์ → Run   (⚠ รันแล้วรหัสร้านทุกร้านจะเปลี่ยน)
-- =====================================================================
do $$
declare
  r     record;
  code  text;
  tries int;
begin
  -- ย้ายรหัสเดิมไปเป็นรหัสชั่วคราวก่อน เพื่อไม่ให้ชนกับรหัสใหม่
  update public.stores set store_code = store_code || '~' || left(id::text, 8);

  for r in select id, upper(substr(store_code, 1, 1)) as fl from public.stores loop
    tries := 0;
    loop
      tries := tries + 1;
      code := r.fl || '-' || lpad((1 + trunc(random() * 999))::int::text, 3, '0');
      exit when not exists (select 1 from public.stores where store_code = code);
      if tries > 5000 then raise exception 'ชั้น % มีร้านเกิน 999 ร้าน', r.fl; end if;
    end loop;
    update public.stores set store_code = code where id = r.id;
  end loop;

  -- อัปเดตรหัสร้านในบันทึกการตรวจเดิมให้ตรงกัน
  update public.inspections i set store_code = s.store_code
  from public.stores s where s.id = i.store_id and i.store_code <> s.store_code;
end $$;

select upper(substr(store_code,1,1)) as ชั้น, count(*) as จำนวนร้าน from public.stores group by 1 order by 1;
