/**
 * บีบอัด/ลดขนาดรูปภาพฝั่ง Client ด้วย Canvas ก่อนอัปโหลด
 * - ย่อด้านยาวสุดไม่เกิน maxDim (คงสัดส่วน, แก้การหมุนภาพตาม EXIF)
 * - เข้ารหัสเป็น WebP (ถ้าเบราว์เซอร์รองรับ) มิฉะนั้นเป็น JPEG
 * - ลด quality ทีละขั้นจนขนาด <= targetBytes หรือถึง minQuality
 *   ถ้ายังใหญ่อยู่ ย่อขนาดภาพลงอีกรอบ
 */

let webpSupport;
function supportsWebp() {
  if (webpSupport === undefined) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupport;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('แปลงรูปภาพไม่สำเร็จ'))), type, quality));
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fallback ด้านล่าง */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้')); };
    img.src = url;
  });
}

function draw(source, maxDim) {
  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // พื้นขาวสำหรับภาพโปร่งใส (JPEG)
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return { canvas, w, h };
}

export async function compressImage(file, {
  maxDim = 1280, quality = 0.6, minQuality = 0.4, targetBytes = 200 * 1024,
} = {}) {
  if (!file.type.startsWith('image/')) throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');
  const source = await decode(file);
  const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
  const ext = type === 'image/webp' ? 'webp' : 'jpg';

  let dim = maxDim;
  let result;
  // สูงสุด 3 รอบของการย่อขนาด
  for (let round = 0; round < 3; round++) {
    const { canvas, w, h } = draw(source, dim);
    let q = quality;
    let blob = await canvasToBlob(canvas, type, q);
    while (blob.size > targetBytes && q > minQuality + 0.001) {
      q = Math.max(minQuality, +(q - 0.1).toFixed(2));
      blob = await canvasToBlob(canvas, type, q);
    }
    canvas.width = canvas.height = 0; // คืนหน่วยความจำ (สำคัญบนมือถือ)
    result = { blob, width: w, height: h, quality: q };
    if (blob.size <= targetBytes || Math.max(w, h) <= 800) break;
    dim = Math.round(Math.max(w, h) * 0.75);
  }
  source.close?.();

  return {
    blob: result.blob,
    type,
    ext,
    width: result.width,
    height: result.height,
    quality: result.quality,
    originalSize: file.size,
    size: result.blob.size,
  };
}
