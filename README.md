# 🐀 Pest Inspect — ระบบบันทึกการตรวจร้านค้า & ติดตามศัตรูพืช

เว็บแอปสำหรับบันทึกผลการตรวจหนู/แมลงสาบในร้านค้า พร้อม Dashboard สรุปผลรายเดือนและ Export รายงาน (PDF / Excel / CSV)
เป็น **Static Web App** (HTML + Vanilla JS) ไม่ต้อง build ใช้ **Supabase** เป็นฐานข้อมูลและที่เก็บรูปภาพ → Deploy บน **GitHub Pages** ได้ทันที

| หน้า | ไฟล์ | ผู้ใช้ |
|---|---|---|
| บันทึกการตรวจ | `index.html` | พนักงานหน้างาน (มือถือ) |
| Dashboard สรุปผล + Export | `dashboard.html` | Admin / ผู้จัดการ |
| จัดการรายชื่อร้านค้า | `stores.html` | Admin (ต้องล็อกอิน) |

## ✨ ความสามารถหลัก
- เลือกร้านแยก **ตามชั้น** (B, 1–5 จากอักษรตัวแรกของรหัสร้าน) + ค้นหาข้ามชั้น + **แบ่งหน้า** (10 ร้าน/หน้า)
- Dropdown ปัญหาที่พบ / วิธีแก้ไข + รายละเอียด + หมายเหตุ
- ถ่ายภาพ/เลือกรูป (สูงสุด 5 รูป) **บีบอัดด้วย Canvas ฝั่ง Client** (WebP/JPEG, ≤1280px, ~≤200KB) ก่อนอัปโหลด
- **ลายเซ็นดิจิทัล** บน Canvas พร้อมปุ่มล้าง
- Timestamp อัตโนมัติจากเซิร์ฟเวอร์ (ปลอมเวลาไม่ได้)
- Dashboard: เลือกเดือน/ปี, การ์ดสรุป, Progress รวม & รายชั้น, แท็บ **ตรวจแล้ว / ยังไม่ได้ตรวจ**, สถิติ **พบ/ไม่พบ หนู & แมลงสาบ** (คลิกดูรายละเอียด+รูป)
- Export รายงานเดือนที่เลือกเป็น **PDF** (ภาษาไทยถูกต้อง), **Excel** (3 ชีท), **CSV** (UTF-8 BOM)
- จัดการร้าน: เพิ่ม/แก้ไข/เปิด-ปิดการใช้งาน/ลบ (เฉพาะร้านที่ไม่มีประวัติ) / นำเข้า CSV

---

## 🚀 ติดตั้ง (ประมาณ 10 นาที)

### 1) สร้างโปรเจกต์ Supabase
1. สมัคร/เข้าสู่ระบบที่ [supabase.com](https://supabase.com) → **New project**
2. ไปที่ **SQL Editor → New query** → คัดลอกเนื้อหาไฟล์ [`supabase/schema.sql`](supabase/schema.sql) ทั้งหมด → **Run**
   (สร้างตาราง `stores`, `inspections`, Row Level Security, Storage bucket `inspection-images` และข้อมูลร้านตัวอย่าง)

### 2) สร้างบัญชี Admin
1. **Authentication → Users → Add user → Create new user** ใส่อีเมล/รหัสผ่าน (ติ๊ก *Auto Confirm User*)
2. **Authentication → Sign In / Providers** → ปิด **Allow new users to sign up**
   > สำคัญ: ผู้ที่ล็อกอินได้ทุกคนถือเป็น Admin จึงต้องปิดการสมัครเอง

### 3) ใส่ค่าเชื่อมต่อ
เปิดไฟล์ [`js/config.js`](js/config.js) แก้ 2 บรรทัดบนสุด (ค่าจาก **Project Settings → API**):
```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```
> `anon key` เปิดเผยบนเว็บได้ ความปลอดภัยควบคุมด้วย RLS — **ห้ามใส่ `service_role` key เด็ดขาด**

### 4) Deploy บน GitHub Pages
```bash
git init
git add .
git commit -m "Pest Inspect"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
จากนั้นที่ GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**
รอสักครู่ เว็บจะอยู่ที่ `https://<user>.github.io/<repo>/`

### ทดสอบบนเครื่อง
ต้องเปิดผ่านเว็บเซิร์ฟเวอร์ (ES modules ใช้ `file://` ไม่ได้):
```bash
python3 -m http.server 8080
```
แล้วเปิด http://localhost:8080 (กล้องมือถือต้องใช้ HTTPS — GitHub Pages รองรับอยู่แล้ว)

---

## 🗂️ โครงสร้างโปรเจกต์
```
├── index.html              หน้าบันทึกการตรวจ
├── dashboard.html          Dashboard + Export
├── stores.html             จัดการร้านค้า (Admin)
├── css/style.css           สไตล์ (mobile-first, responsive)
├── js/
│   ├── config.js           ★ ตั้งค่า Supabase / ตัวเลือก Dropdown / การบีบอัดรูป
│   ├── supabase-client.js  Supabase client, auth, upload
│   ├── utils.js            ฟังก์ชันกลาง (ชั้น, แบ่งหน้า, modal, toast, nav)
│   ├── image-compress.js   บีบอัดรูปด้วย Canvas
│   ├── signature-pad.js    ช่องเซ็นชื่อ Canvas
│   ├── inspection.js       logic หน้าบันทึกการตรวจ
│   ├── dashboard.js        logic Dashboard + Export PDF/Excel/CSV
│   └── stores.js           logic จัดการร้านค้า
├── supabase/
│   ├── schema.sql          ตาราง + RLS + Storage
│   └── stores-sample.csv   ตัวอย่างไฟล์นำเข้าร้าน
└── .nojekyll
```

## 🧾 โครงสร้างข้อมูล
**stores**: `id`, `store_code` (unique, ขึ้นต้น B/1–5), `store_name`, `floor` (คำนวณอัตโนมัติ), `is_active`
**inspections**: `id`, `store_id`, `store_code`, `store_name`, `problem`, `solution_method`, `solution_detail`, `image_urls[]`, `signature_url`, `inspector_name`, `remarks`, `created_at`

รูปเก็บที่ Storage: `inspection-images/photos/YYYY-MM/*.webp` และ `signatures/YYYY-MM/*.png`

## 🔐 สิทธิ์การเข้าถึง (RLS)
| | พนักงาน (ไม่ล็อกอิน) | Admin (ล็อกอิน) |
|---|---|---|
| ดูร้าน | เฉพาะ Active | ทั้งหมด |
| เพิ่ม/แก้ไข/ลบร้าน | ✗ | ✓ |
| บันทึกการตรวจ | ✓ (เฉพาะร้าน Active) | ✓ |
| ดู Dashboard | ✓ | ✓ |
| ลบบันทึกการตรวจ | ✗ | ✓ |

## 📐 หลักการนับใน Dashboard
- **ตรวจแล้ว** = ร้าน Active ที่มีบันทึก ≥ 1 ครั้งในเดือนที่เลือก
- **พบหนู** = ร้านที่มีบันทึก "หนู" หรือ "หนู-แมลงสาบ" อย่างน้อย 1 ครั้งในเดือน, **ไม่พบหนู** = ร้านที่ตรวจแล้ว − พบหนู (แมลงสาบเช่นเดียวกัน)

## 📥 นำเข้าร้านจาก CSV
รูปแบบ `store_code,store_name,is_active` (แถวหัวตารางมีหรือไม่มีก็ได้, `is_active` ไม่ใส่ = true) ถ้ารหัสซ้ำจะอัปเดตชื่อ/สถานะ ดูตัวอย่าง `supabase/stores-sample.csv`
