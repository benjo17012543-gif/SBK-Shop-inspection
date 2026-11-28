/**
 * หน้าต้อนรับก่อนเข้าหน้าบันทึกการตรวจ
 * - นาฬิกา + วันที่ภาษาไทย (อัปเดตทุกวินาที)
 * - แถบความคืบหน้า = การโหลดรายชื่อร้าน (ready: Promise<number จำนวนร้าน>)
 * - กด "เข้าสู่ระบบ" แล้วซ่อน splash เข้าสู่ฟอร์ม
 */
import { THAI_MONTHS } from './utils.js';

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export function initSplash(ready) {
  const el = document.getElementById('splash');
  if (!el) return;
  const clock = document.getElementById('splashClock');
  const date = document.getElementById('splashDate');
  const bar = document.getElementById('splashBar');
  const status = document.getElementById('splashStatus');
  const btn = document.getElementById('enterBtn');
  document.body.classList.add('no-scroll');

  const tick = () => {
    const now = new Date();
    clock.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0')).join(':');
    date.textContent = `วัน${DAYS[now.getDay()]}ที่ ${now.getDate()} ${THAI_MONTHS[now.getMonth()]} พ.ศ. ${now.getFullYear() + 543}`;
  };
  tick();
  const timer = setInterval(tick, 1000);

  // ความคืบหน้าค่อยๆ เพิ่มจนถึง 90% ระหว่างรอ แล้วเต็ม 100% เมื่อโหลดเสร็จ
  let pct = 8;
  bar.style.width = `${pct}%`;
  const creep = setInterval(() => {
    pct = Math.min(90, pct + Math.max(1, (90 - pct) * 0.12));
    bar.style.width = `${pct}%`;
  }, 180);
  Promise.resolve(ready).then((count) => {
    clearInterval(creep);
    bar.style.width = '100%';
    el.classList.add('ready');
    status.textContent = typeof count === 'number' && count > 0
      ? `✓ พร้อมใช้งาน · ร้านค้า ${count} ร้าน`
      : '✓ พร้อมใช้งาน';
  }).catch(() => {
    clearInterval(creep);
    bar.style.width = '100%';
    status.textContent = '⚠️ โหลดข้อมูลไม่สำเร็จ ลองเข้าสู่ระบบแล้วรีเฟรชอีกครั้ง';
  });

  btn.addEventListener('click', () => {
    clearInterval(timer);
    el.classList.add('leaving');
    document.body.classList.remove('no-scroll');
    setTimeout(() => {
      el.remove();
      document.getElementById('storeSearch')?.focus({ preventScroll: true });
    }, 450);
  });
  setTimeout(() => btn.focus({ preventScroll: true }), 300);
}
