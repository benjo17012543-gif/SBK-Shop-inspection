# 🐀 ระบบบันทึกการตรวจร้านค้าและติดตามการแก้ไขปัญหาศัตรูพืช

เว็บแอปบันทึกการตรวจร้านค้า (หนู / แมลงสาบ) พร้อมแดชบอร์ดสรุปผลและรายงานประจำเดือน
เป็น **Static Web App** (HTML + CSS + JavaScript) ไม่ต้อง build ใช้ **Supabase** เป็นฐานข้อมูลและที่เก็บรูป และ deploy บน **GitHub Pages** ได้ทันที

## หน้าในระบบ

| หน้า | ไฟล์ | ผู้ใช้ | ความสามารถ |
|---|---|---|---|
| บันทึกการตรวจ | `index.html` | พนักงานหน้างาน (มือถือ) | ค้นหา/เลือกร้าน, เลือกปัญหา & วิธีแก้ไข, ถ่ายรูป (บีบอัดอัตโนมัติ), เซ็นชื่อ, หมายเหตุ, เวลาอัตโนมัติ |
| แดชบอร์ด | `dashboard.html` | Admin / ผู้จัดการ | เลือกเดือน/ปี, การ์ดสรุป + % ความคืบหน้า, สถิติพบ/ไม่พบหนูและแมลงสาบ (คลิกดูรูป), แท็บร้านตรวจแล้ว/ยังไม่ตรวจ/บันทึกทั้งหมด, Export PDF / Excel / CSV |
| จัดการร้านค้า | `stores.html` | Admin เท่านั้น | ล็อกอิน, เพิ่ม / แก้ไข / เปิด-ปิดใช้งาน / ลบ, นำเข้าหลายร้านจาก Excel |

## โครงสร้างไฟล์

```
pest-inspection/
├── index.html            หน้าบันทึกการตรวจ
├── dashboard.html        หน้าแดชบอร์ด
├── stores.html           หน้าจัดการร้านค้า
├── .nojekyll             ให้ GitHub Pages เสิร์ฟไฟล์ตรงๆ
├── css/style.css
├── js/
│   ├── config.js         ⚙️ ใส่ SUPABASE_URL / SUPABASE_ANON_KEY ที่นี่
│   ├── common.js         ตัวช่วยที่ใช้ร่วมกัน
│   ├── image-compress.js บีบอัดรูปด้วย Canvas
│   ├── signature-pad.js  ช่องวาดลายเซ็น
│   ├── inspection.js     ตรรกะหน้าบันทึกการตรวจ
│   ├── dashboard.js      ตรรกะหน้าแดชบอร์ด
│   ├── export.js         Export PDF / Excel / CSV
│   └── stores.js         ตรรกะหน้าจัดการร้านค้า
└── supabase/schema.sql   สร้างตาราง, RLS, Storage bucket
```

ทุก path เป็นแบบ relative (`./css/...`, `./js/...`) จึงใช้งานได้ทั้งบน `https://<user>.github.io/<repo>/` และเปิดผ่าน local server

## ขั้นตอนติดตั้ง

### 1. ตั้งค่า Supabase
1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com)
2. ไปที่ **SQL Editor → New query** วางเนื้อหาไฟล์ `supabase/schema.sql` แล้วกด **Run**
   (สร้างตาราง `stores`, `inspections`, นโยบาย RLS และ bucket `inspection-photos`)
3. สร้างบัญชี Admin: **Authentication → Users → Add user** (ใส่อีเมล/รหัสผ่าน, ติ๊ก Auto Confirm)
4. **สำคัญ:** ปิดการสมัครสมาชิกเอง: **Authentication → Sign In / Providers → ปิด "Allow new users to sign up"**
   (เพราะผู้ที่ล็อกอินได้ทุกคนถือเป็น Admin)
5. คัดลอก **Project URL** และ **anon public key** จาก **Project Settings → API**

### 2. ใส่ค่าการเชื่อมต่อ
แก้ไข `js/config.js`:
```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```
> anon key เปิดเผยในหน้าเว็บได้ตามปกติ ความปลอดภัยควบคุมด้วย Row Level Security ใน `schema.sql`
> **ห้าม** ใส่ `service_role` key ลงในไฟล์นี้เด็ดขาด

### 3. Deploy บน GitHub Pages
```bash
git init
git add .
git commit -m "Pest inspection web app"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
จากนั้นไปที่ **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save
รอ 1–2 นาที เว็บจะอยู่ที่ `https://<user>.github.io/<repo>/`

### ทดสอบบนเครื่อง
```bash
python3 -m http.server 8080
```
เปิด `http://localhost:8080` (กล้องบนมือถือต้องใช้ HTTPS — GitHub Pages เป็น HTTPS อยู่แล้ว)

## รายละเอียดทางเทคนิค

- **บีบอัดรูป:** ย่อด้านยาวสุดเหลือ 1280px, ใช้ WebP (ถ้าเบราว์เซอร์รองรับ) หรือ JPEG แล้วลดคุณภาพ/ขนาดซ้ำจนไม่เกิน ~180 KB ต่อรูป (ปรับได้ใน `config.js`) — รูปจากมือถือ 3–5 MB จะเหลือประมาณ 100–200 KB
- **ลายเซ็น:** Pointer Events รองรับนิ้ว/ปากกา/เมาส์ และจอ HiDPI, ตัดขอบว่างอัตโนมัติ แล้วบันทึกเป็น PNG ขนาดเล็ก
- **เวลาบันทึก:** ใช้เวลาเซิร์ฟเวอร์ (trigger `force_inspected_at`) ปลอมจากเครื่องผู้ใช้ไม่ได้
- **ไฟล์ใน Storage:** `inspection-photos/ปี/เดือน/<inspection-id>/photo-1.webp`, `signature.png`
- **สถิติศัตรูพืช:** นับเป็น *จำนวนร้าน* — ร้านที่พบอย่างน้อย 1 ครั้งในเดือนนับเป็น "พบ" และแสดงจำนวนครั้งที่พบประกอบ
- **ร้านทั้งหมด / ยังไม่ได้ตรวจ:** คิดจากร้านที่สถานะ Active เท่านั้น
- **PDF:** สร้างด้วย html2pdf (เรนเดอร์เป็นภาพ) เพื่อให้สระและวรรณยุกต์ภาษาไทยแสดงถูกต้อง หากสร้างไม่ได้จะเปิดหน้าพิมพ์ให้เลือก "บันทึกเป็น PDF" แทน
- **Excel:** 4 ชีต — สรุป, บันทึกการตรวจ, ร้านที่ตรวจแล้ว, ร้านที่ยังไม่ได้ตรวจ
- **CSV:** UTF-8 พร้อม BOM เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน
- **ลบร้านค้า:** ถ้ามีประวัติการตรวจจะลบไม่ได้ (foreign key) ให้ใช้ "ปิดใช้งาน" แทนเพื่อเก็บประวัติ

## สิทธิ์การเข้าถึง (RLS)

| | ผู้ใช้ทั่วไป (ไม่ล็อกอิน) | Admin (ล็อกอิน) |
|---|---|---|
| อ่านร้านค้า | ✅ | ✅ |
| เพิ่ม/แก้ไข/ลบร้านค้า | ❌ | ✅ |
| บันทึกการตรวจ (เฉพาะร้าน Active) | ✅ | ✅ |
| อ่านบันทึกการตรวจ / แดชบอร์ด | ✅ | ✅ |
| อัปโหลดรูป | ✅ | ✅ |

> ถ้าต้องการให้แดชบอร์ดดูได้เฉพาะ Admin: แก้ policy `inspections_read_all` ให้เป็น `to authenticated` และเพิ่มการล็อกอินในหน้าแดชบอร์ด
