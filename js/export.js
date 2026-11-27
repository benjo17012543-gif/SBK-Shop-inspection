/* =====================================================================
 *  export.js — Export รายงานประจำเดือน (CSV / Excel / PDF)
 *  - CSV : ใส่ BOM เพื่อให้ Excel แสดงภาษาไทยถูกต้อง
 *  - Excel: SheetJS หลายชีต (สรุป / บันทึกการตรวจ / ตรวจแล้ว / ยังไม่ได้ตรวจ)
 *  - PDF : html2pdf (เรนเดอร์ HTML -> ภาพ) เพื่อให้สระ/วรรณยุกต์ไทยแสดงถูกต้อง
 * ===================================================================== */
const ReportExporter = (() => {
  const fileBase = (r) => `pest-report-${r.year + 543}-${String(r.month).padStart(2, '0')}`;

  function recordRows(r) {
    return r.inspections.map((i, n) => ({
      'ลำดับ': n + 1,
      'วันที่': fmtDate(i.inspected_at),
      'เวลา': fmtTime(i.inspected_at),
      'รหัสร้านค้า': i.store_code || '',
      'ชื่อร้านค้า': i.store_name || '',
      'ชั้น': i.floor || '',
      'ปัญหาที่พบ': i.problem,
      'วิธีแก้ไข': i.solution_method || '',
      'รายละเอียดวิธีแก้ไข': i.solution_detail || '',
      'หมายเหตุ': i.note || '',
      'ผู้ตรวจ': i.inspector_name || '',
      'จำนวนรูป': (i.photo_urls || []).length,
      'ลิงก์รูปภาพ': (i.photo_urls || []).join(' | '),
      'ลิงก์ลายเซ็น': i.signature_url || '',
    }));
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- CSV ---------- */
  function csv(r) {
    const rows = recordRows(r);
    const headers = rows.length ? Object.keys(rows[0]) : Object.keys(recordRows({ inspections: [{}] })[0]);
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(esc).join(','), ...rows.map((row) => headers.map((h) => esc(row[h])).join(','))];
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${fileBase(r)}.csv`);
    toast('ดาวน์โหลด CSV แล้ว', 'success');
  }

  /* ---------- Excel ---------- */
  function excel(r) {
    if (!window.XLSX) throw new Error('ไลบรารี Excel ยังโหลดไม่เสร็จ กรุณาลองใหม่');
    const wb = XLSX.utils.book_new();

    const summary = [
      [CFG.ORG_NAME || 'รายงานการตรวจร้านค้า'],
      [`รายงานประจำเดือน ${r.label}`],
      [`ออกรายงานเมื่อ ${fmtDateTime(new Date().toISOString())}`],
      [],
      ['หัวข้อ', 'จำนวน', 'หน่วย'],
      ['ร้านทั้งหมด (เปิดใช้งาน)', r.totalActive, 'ร้าน'],
      ['ตรวจแล้ว', r.inspected.length, 'ร้าน'],
      ['ยังไม่ได้ตรวจ', r.notInspected.length, 'ร้าน'],
      ['ความคืบหน้า', r.pct, '%'],
      ['จำนวนบันทึกการตรวจ', r.inspections.length, 'ครั้ง'],
      [],
      ['สถิติศัตรูพืช', 'จำนวนร้าน', 'จำนวนครั้งที่พบ'],
      ['พบหนู', r.ratStores.length, r.ratRecords],
      ['ไม่พบหนู', r.noRat, ''],
      ['พบแมลงสาบ', r.roachStores.length, r.roachRecords],
      ['ไม่พบแมลงสาบ', r.noRoach, ''],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'สรุป');

    const wsF = XLSX.utils.json_to_sheet(r.floors.map((f) => ({
      'ชั้น': floorLabel(f.floor),
      'ร้านทั้งหมด': f.total,
      'ตรวจแล้ว': f.done,
      'ยังไม่ได้ตรวจ': f.todo,
      'ความคืบหน้า (%)': f.pct,
      'พบหนู (ร้าน)': f.rat,
      'พบแมลงสาบ (ร้าน)': f.roach,
    })));
    wsF['!cols'] = [14, 12, 10, 14, 16, 14, 18].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, wsF, 'สรุปรายชั้น');

    const ws2 = XLSX.utils.json_to_sheet(recordRows(r));
    ws2['!cols'] = [6, 14, 8, 12, 28, 8, 14, 18, 36, 30, 20, 9, 50, 50].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws2, 'บันทึกการตรวจ');

    const ws3 = XLSX.utils.json_to_sheet(r.inspected.map((s, n) => ({
      'ลำดับ': n + 1,
      'รหัสร้านค้า': s.code,
      'ชื่อร้านค้า': s.name,
      'ชั้น': s.floor || '',
      'จำนวนครั้งที่ตรวจ': s.inspections.length,
      'ตรวจล่าสุด': fmtDateTime(s.last.inspected_at),
      'ผลล่าสุด': s.last.problem,
      'พบหนู (ในเดือน)': s.rat ? 'พบ' : 'ไม่พบ',
      'พบแมลงสาบ (ในเดือน)': s.roach ? 'พบ' : 'ไม่พบ',
    })));
    ws3['!cols'] = [6, 12, 30, 8, 14, 22, 14, 14, 18].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws3, 'ร้านที่ตรวจแล้ว');

    const ws4 = XLSX.utils.json_to_sheet(r.notInspected.map((s, n) => ({
      'ลำดับ': n + 1, 'รหัสร้านค้า': s.code, 'ชื่อร้านค้า': s.name, 'ชั้น': s.floor || '',
    })));
    ws4['!cols'] = [6, 12, 34, 8].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws4, 'ร้านที่ยังไม่ได้ตรวจ');

    XLSX.writeFile(wb, `${fileBase(r)}.xlsx`);
    toast('ดาวน์โหลด Excel แล้ว', 'success');
  }

  /* ---------- PDF ---------- */
  function reportHtml(r) {
    const e = escapeHtml;
    return `
      <h1>${e(CFG.ORG_NAME || 'รายงานการตรวจร้านค้า')}</h1>
      <div class="meta">รายงานสรุปการตรวจร้านค้าและการควบคุมศัตรูพืช ประจำเดือน <b>${e(r.label)}</b><br>
        ออกรายงานเมื่อ ${fmtDateTime(new Date().toISOString())}</div>

      <h2>1. สรุปภาพรวม</h2>
      <div class="kpis avoid-break">
        <div class="kpi">ร้านทั้งหมด<b>${r.totalActive}</b></div>
        <div class="kpi">ตรวจแล้ว<b>${r.inspected.length}</b></div>
        <div class="kpi">ยังไม่ได้ตรวจ<b>${r.notInspected.length}</b></div>
        <div class="kpi">ความคืบหน้า<b>${r.pct}%</b></div>
      </div>

      <h2>2. สถิติการพบศัตรูพืช (สะสมทั้งเดือน)</h2>
      <table class="avoid-break">
        <thead><tr><th>ประเภท</th><th>พบ (ร้าน)</th><th>ไม่พบ (ร้าน)</th><th>จำนวนครั้งที่พบ</th></tr></thead>
        <tbody>
          <tr><td>หนู</td><td>${r.ratStores.length}</td><td>${r.noRat}</td><td>${r.ratRecords}</td></tr>
          <tr><td>แมลงสาบ</td><td>${r.roachStores.length}</td><td>${r.noRoach}</td><td>${r.roachRecords}</td></tr>
        </tbody>
      </table>

      <h2>สรุปรายชั้น</h2>
      <table class="avoid-break">
        <thead><tr><th>ชั้น</th><th>ร้านทั้งหมด</th><th>ตรวจแล้ว</th><th>ยังไม่ตรวจ</th><th>ความคืบหน้า</th><th>พบหนู</th><th>พบแมลงสาบ</th></tr></thead>
        <tbody>${r.floors.map((f) => `<tr><td>${e(floorLabel(f.floor))}</td><td>${f.total}</td><td>${f.done}</td><td>${f.todo}</td><td>${f.pct}%</td><td>${f.rat}</td><td>${f.roach}</td></tr>`).join('')}
          <tr><th>รวม</th><th>${r.totalActive}</th><th>${r.inspected.length}</th><th>${r.notInspected.length}</th><th>${r.pct}%</th><th>${r.ratStores.length}</th><th>${r.roachStores.length}</th></tr></tbody>
      </table>

      <h2>3. รายชื่อร้านค้าที่ตรวจแล้ว (${r.inspected.length} ร้าน)</h2>
      ${r.inspected.length ? `<table>
        <thead><tr><th>#</th><th>รหัส</th><th>ชื่อร้านค้า</th><th>ชั้น</th><th>ครั้ง</th><th>ตรวจล่าสุด</th><th>หนู</th><th>แมลงสาบ</th></tr></thead>
        <tbody>${r.inspected.map((s, n) => `<tr><td>${n + 1}</td><td>${e(s.code)}</td><td>${e(s.name)}</td><td>${e(s.floor || '-')}</td>
          <td>${s.inspections.length}</td><td>${fmtDateTime(s.last.inspected_at)}</td>
          <td>${s.rat ? 'พบ' : '-'}</td><td>${s.roach ? 'พบ' : '-'}</td></tr>`).join('')}</tbody>
      </table>` : '<p>- ไม่มี -</p>'}

      <h2>4. รายชื่อร้านค้าที่ยังไม่ได้ตรวจ (${r.notInspected.length} ร้าน)</h2>
      ${r.notInspected.length ? `<table>
        <thead><tr><th style="width:40px">#</th><th style="width:110px">รหัส</th><th>ชื่อร้านค้า</th><th style="width:80px">ชั้น</th></tr></thead>
        <tbody>${r.notInspected.map((s, n) => `<tr><td>${n + 1}</td><td>${e(s.code)}</td><td>${e(s.name)}</td><td>${e(s.floor || '-')}</td></tr>`).join('')}</tbody>
      </table>` : '<p>- ตรวจครบทุกร้าน -</p>'}

      <h2>5. รายละเอียดบันทึกการตรวจ (${r.inspections.length} ครั้ง)</h2>
      ${r.inspections.length ? `<table>
        <thead><tr><th>วันที่/เวลา</th><th>ร้านค้า</th><th>ปัญหา</th><th>วิธีแก้ไข / รายละเอียด</th><th>ผู้ตรวจ</th></tr></thead>
        <tbody>${r.inspections.map((i) => `<tr>
          <td style="white-space:nowrap">${fmtDate(i.inspected_at)}<br>${fmtTime(i.inspected_at)}</td>
          <td>${e(i.store_name)}<br><small>${e(i.store_code || '')}${i.floor ? ` · ชั้น ${e(i.floor)}` : ''}</small></td>
          <td>${e(i.problem)}</td>
          <td>${e(i.solution_method || '-')}${i.solution_detail ? `<br><small>${e(i.solution_detail)}</small>` : ''}${i.note ? `<br><small>หมายเหตุ: ${e(i.note)}</small>` : ''}</td>
          <td>${e(i.inspector_name || '-')}</td></tr>`).join('')}</tbody>
      </table>` : '<p>- ไม่มี -</p>'}

      <div class="sign avoid-break"><div>
        ลงชื่อ ..................................................<br>
        (..................................................)<br>ผู้จัดการ / ผู้ตรวจสอบ
      </div></div>`;
  }

  function printFallback(r) {
    const w = window.open('', '_blank');
    if (!w) throw new Error('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up');
    const css = new URL('./css/style.css', location.href).href;
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${fileBase(r)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="${css}"><style>body{background:#fff;padding:0}.report{width:auto}@page{size:A4;margin:12mm}</style>
      </head><body><div class="report">${reportHtml(r)}</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  }

  async function pdf(r) {
    if (!window.html2pdf) { printFallback(r); return; }
    showLoading('กำลังสร้างไฟล์ PDF...');
    const node = document.createElement('div');
    node.className = 'report';
    node.innerHTML = reportHtml(r);
    // ลดความละเอียดเมื่อรายงานยาวมาก เพื่อไม่ให้เกินขนาด canvas ของเบราว์เซอร์มือถือ
    const rows = r.inspections.length + r.inspected.length + r.notInspected.length;
    const scale = rows > 400 ? 1 : rows > 150 ? 1.4 : 2;
    try {
      await document.fonts?.ready;
      await html2pdf().set({
        margin: [10, 8, 12, 8],
        filename: `${fileBase(r)}.pdf`,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.avoid-break', 'h2'] },
      }).from(node).save();
      toast('ดาวน์โหลด PDF แล้ว', 'success');
    } catch (err) {
      console.warn('html2pdf failed, fallback to print', err);
      printFallback(r);
    } finally {
      hideLoading();
    }
  }

  return { csv, excel, pdf };
})();
