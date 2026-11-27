/* =====================================================================
 *  image-compress.js — บีบอัด/ลดขนาดรูปฝั่ง Client ด้วย Canvas
 *  - ย่อด้านยาวสุดไม่เกิน maxDimension
 *  - พยายามใช้ WebP (เล็กกว่า) ถ้าเบราว์เซอร์ไม่รองรับจะใช้ JPEG
 *  - ลดคุณภาพ/ขนาดลงเรื่อยๆ จนไม่เกิน targetKB
 * ===================================================================== */
const ImageCompressor = (() => {
  let webpSupported = null;

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function detectWebp() {
    if (webpSupported !== null) return webpSupported;
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const b = await canvasToBlob(c, 'image/webp', 0.5);
    webpSupported = !!b && b.type === 'image/webp';
    return webpSupported;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ไม่สามารถอ่านไฟล์รูปได้')); };
      img.src = url; // เบราว์เซอร์สมัยใหม่หมุนรูปตาม EXIF ให้อัตโนมัติ
    });
  }

  function draw(img, maxDim) {
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // พื้นขาวกันรูปโปร่งใสกลายเป็นสีดำใน JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  /**
   * @param {File|Blob} file
   * @returns {Promise<{blob: Blob, width: number, height: number, ext: string}>}
   */
  async function compress(file, opts = {}) {
    const maxDim0 = opts.maxDimension || CFG.IMAGE_MAX_DIMENSION || 1280;
    const quality0 = opts.quality || CFG.IMAGE_QUALITY || 0.65;
    const targetBytes = (opts.targetKB || CFG.IMAGE_TARGET_KB || 180) * 1024;

    const type = (await detectWebp()) ? 'image/webp' : 'image/jpeg';
    const img = await loadImage(file);

    let maxDim = maxDim0;
    let quality = quality0;
    let canvas = draw(img, maxDim);
    let blob = await canvasToBlob(canvas, type, quality);

    // วนลดคุณภาพก่อน แล้วค่อยลดขนาดภาพ (สูงสุด 8 รอบ)
    for (let i = 0; i < 8 && blob && blob.size > targetBytes; i++) {
      if (quality > 0.42) {
        quality = Math.round((quality - 0.1) * 100) / 100;
      } else if (maxDim > 640) {
        maxDim = Math.round(maxDim * 0.8);
        canvas = draw(img, maxDim);
      } else {
        break;
      }
      blob = await canvasToBlob(canvas, type, quality);
    }
    if (!blob) throw new Error('บีบอัดรูปไม่สำเร็จ');

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      ext: blob.type === 'image/webp' ? 'webp' : 'jpg',
    };
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  return { compress, formatBytes };
})();
