import { FLOORS, STORAGE_BUCKET, NO_PROBLEM, PROBLEM_OPTIONS, SOLUTION_OPTIONS } from './config.js?v=20261128c';
import { sb, renderAuthChip } from './supabase-client.js?v=20261128c';
import {
  initLayout, THAI_MONTHS, getFloor, compareStores, hasPest, escapeHtml, formatDateTime,
  paginate, renderPagination, renderFloorTabs, toast, setBusy, openModal,
  openLightbox, confirmDialog, initSortToggle, floorsInOrder,
} from './utils.js?v=20261128c';

initLayout('dashboard');

const $ = (id) => document.getElementById(id);

/* ================= สี (ตรวจสอบด้วย palette validator แล้ว) ================= */
const PROBLEM_COLORS = {
  'หนู': '#257de0',          // blue
  'แมลงสาบ': '#f47230',      // orange
  'หนู-แมลงสาบ': '#00b894',  // aqua
  'ไม่พบปัญหา': '#cbd5e1',   // neutral
};
const CURRENT_COLOR = '#0f766e';
const PREVIOUS_COLOR = '#94a3b8';

/* ================= วันที่ ================= */
const MODES = [
  { k: 'day', l: 'รายวัน' },
  { k: 'week', l: 'รายสัปดาห์' },
  { k: 'month', l: 'รายเดือน' },
  { k: 'year', l: 'รายปี' },
  { k: 'custom', l: 'กำหนดเอง' },
];
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((sod(b) - sod(a)) / 86400000);
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = (d) => `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
const fmtRange = (a, b) => (isoDate(a) === isoDate(b) ? fmtD(a) : `${fmtD(a)} – ${fmtD(b)}`);

/** คำนวณช่วงเวลา [start, end) + ช่วงก่อนหน้า + หน่วยของกราฟ */
function computeRange(p) {
  const a = sod(p.anchor);
  let start, end, prevStart, prevEnd, bucket, label;
  switch (p.mode) {
    case 'day':
      start = a; end = addDays(a, 1); prevStart = addDays(a, -1); prevEnd = a; bucket = 'hour';
      label = `วันที่ ${fmtD(start)}`;
      break;
    case 'week': {
      start = addDays(a, -((a.getDay() + 6) % 7)); // เริ่มวันจันทร์
      end = addDays(start, 7); prevStart = addDays(start, -7); prevEnd = start; bucket = 'day';
      label = `สัปดาห์ ${fmtRange(start, addDays(end, -1))}`;
      break;
    }
    case 'month':
      start = new Date(a.getFullYear(), a.getMonth(), 1); end = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      prevStart = new Date(a.getFullYear(), a.getMonth() - 1, 1); prevEnd = start; bucket = 'day';
      label = `เดือน${THAI_MONTHS[start.getMonth()]} พ.ศ. ${start.getFullYear() + 543}`;
      break;
    case 'year':
      start = new Date(a.getFullYear(), 0, 1); end = new Date(a.getFullYear() + 1, 0, 1);
      prevStart = new Date(a.getFullYear() - 1, 0, 1); prevEnd = start; bucket = 'month';
      label = `ปี พ.ศ. ${start.getFullYear() + 543}`;
      break;
    default: { // custom
      let f = sod(p.from); let t = sod(p.to);
      if (t < f) [f, t] = [t, f];
      const len = dayDiff(f, t) + 1;
      start = f; end = addDays(t, 1); prevStart = addDays(f, -len); prevEnd = f;
      bucket = len <= 62 ? 'day' : 'month';
      label = `ช่วง ${fmtRange(start, t)} (${len} วัน)`;
    }
  }
  return { start, end, prevStart, prevEnd, bucket, label, prevLabel: fmtRange(prevStart, addDays(prevEnd, -1)) };
}

/* ================= State ================= */
const today = new Date();
const state = {
  period: { mode: 'month', anchor: today, from: addDays(today, -29), to: today },
  range: null,
  stores: [],
  cur: null, prev: null,   // ผลสรุปช่วงปัจจุบัน / ช่วงก่อนหน้า
  tab: 'done', floor: 'ALL', search: '', page: 1, dir: 'asc',
  admin: false, loaded: false,
  charts: {},
};
try {
  const saved = JSON.parse(localStorage.getItem('dashPeriodMode') || 'null');
  if (MODES.some((m) => m.k === saved)) state.period.mode = saved;
} catch { /* ignore */ }

/* ================= ตัวเลือกช่วงเวลา ================= */
function renderModeTabs() {
  $('modeTabs').innerHTML = MODES.map((m) =>
    `<button type="button" role="tab" class="seg-tab ${m.k === state.period.mode ? 'active' : ''}" data-mode="${m.k}"
      aria-selected="${m.k === state.period.mode}">${m.l.replace(/^ราย/, '<span class="m-hide">ราย</span>')}</button>`).join('');
  $('modeTabs').querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    state.period.mode = b.dataset.mode;
    try { localStorage.setItem('dashPeriodMode', JSON.stringify(state.period.mode)); } catch { /* ignore */ }
    renderModeTabs(); renderFields(); load();
  }));
}

function yearOptions(sel) {
  const ys = [];
  for (let y = today.getFullYear() + 1; y >= today.getFullYear() - 6; y--) ys.push(y);
  return ys.map((y) => `<option value="${y}" ${y === sel ? 'selected' : ''}>${y + 543}</option>`).join('');
}

function renderFields() {
  const p = state.period;
  const a = p.anchor;
  const f = $('periodFields');
  if (p.mode === 'day' || p.mode === 'week') {
    f.innerHTML = `<label class="field"><span class="label">${p.mode === 'day' ? 'วันที่' : 'เลือกวันใดก็ได้ในสัปดาห์'}</span>
      <input type="date" class="input" id="fDate" value="${isoDate(a)}"></label>`;
  } else if (p.mode === 'month') {
    f.innerHTML = `<label class="field"><span class="label">เดือน</span><select class="input" id="fMonth">
        ${THAI_MONTHS.map((m, i) => `<option value="${i}" ${i === a.getMonth() ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="field"><span class="label">ปี (พ.ศ.)</span><select class="input" id="fYear">${yearOptions(a.getFullYear())}</select></label>`;
  } else if (p.mode === 'year') {
    f.innerHTML = `<label class="field"><span class="label">ปี (พ.ศ.)</span><select class="input" id="fYear">${yearOptions(a.getFullYear())}</select></label>`;
  } else {
    f.innerHTML = `<label class="field"><span class="label">ตั้งแต่วันที่</span><input type="date" class="input" id="fFrom" value="${isoDate(p.from)}"></label>
      <label class="field"><span class="label">ถึงวันที่</span><input type="date" class="input" id="fTo" value="${isoDate(p.to)}"></label>`;
  }
  f.dataset.mode = p.mode;
  f.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', () => { readFields(); load(); }));
}

function readFields() {
  const p = state.period;
  const v = (id) => $(id)?.value;
  if (p.mode === 'day' || p.mode === 'week') { if (v('fDate')) p.anchor = parseDate(v('fDate')); }
  else if (p.mode === 'month') p.anchor = new Date(Number(v('fYear')), Number(v('fMonth')), 1);
  else if (p.mode === 'year') p.anchor = new Date(Number(v('fYear')), 0, 1);
  else {
    if (v('fFrom')) p.from = parseDate(v('fFrom'));
    if (v('fTo')) p.to = parseDate(v('fTo'));
  }
}

function shift(dir) {
  const p = state.period;
  const a = p.anchor;
  if (p.mode === 'day') p.anchor = addDays(a, dir);
  else if (p.mode === 'week') p.anchor = addDays(a, 7 * dir);
  else if (p.mode === 'month') p.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
  else if (p.mode === 'year') p.anchor = new Date(a.getFullYear() + dir, 0, 1);
  else {
    const len = Math.abs(dayDiff(p.from, p.to)) + 1;
    p.from = addDays(p.from, len * dir); p.to = addDays(p.to, len * dir);
  }
  renderFields(); load();
}
$('prevBtn').addEventListener('click', () => shift(-1));
$('nextBtn').addEventListener('click', () => shift(1));
$('viewBtn').addEventListener('click', () => { readFields(); load(); });

/* ================= โหลดข้อมูล ================= */
async function fetchAll(buildQuery) {
  const size = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return out;
}

let loadSeq = 0;
async function load() {
  state.range = computeRange(state.period);
  $('periodLabel').textContent = state.range.label;
  if (!sb) { renderAll(); return; }
  const seq = ++loadSeq;
  const btn = $('viewBtn');
  setBusy(btn, true, 'กำลังโหลด...');
  try {
    const r = state.range;
    const [stores, rows] = await Promise.all([
      fetchAll(() => sb.from('stores').select('id, store_code, store_name, is_active').eq('is_active', true).order('store_code')),
      fetchAll(() => sb.from('inspections').select('*')
        .gte('created_at', r.prevStart.toISOString()).lt('created_at', r.end.toISOString())
        .order('created_at', { ascending: false })),
    ]);
    if (seq !== loadSeq) return; // มีการโหลดใหม่ซ้อนเข้ามา
    state.stores = stores;
    const startMs = r.start.getTime();
    state.cur = summarize(rows.filter((i) => new Date(i.created_at).getTime() >= startMs));
    state.prev = summarize(rows.filter((i) => new Date(i.created_at).getTime() < startMs));
    state.loaded = true;
  } catch (err) {
    console.error(err);
    toast(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`, 'error', 5000);
  } finally {
    if (seq === loadSeq) setBusy(btn, false);
  }
  state.page = 1;
  renderAll();
}

/** สรุปผลของชุดบันทึกการตรวจ (นับตามร้าน Active) */
function summarize(inspections) {
  const byStore = new Map();
  for (const ins of inspections) {
    if (!byStore.has(ins.store_id)) byStore.set(ins.store_id, []);
    byStore.get(ins.store_id).push(ins); // ใหม่ → เก่า
  }
  const done = state.stores.filter((s) => byStore.has(s.id));
  const pending = state.stores.filter((s) => !byStore.has(s.id));
  const withPest = (pest) => done.filter((s) => byStore.get(s.id).some((i) => hasPest(i.problem, pest)));
  return { inspections, byStore, done, pending, ratStores: withPest('หนู'), roachStores: withPest('แมลงสาบ') };
}

const empty = () => ({ inspections: [], byStore: new Map(), done: [], pending: [], ratStores: [], roachStores: [] });

/* ================= แสดงผล ================= */
function deltaHtml(cur, prev, { goodWhenUp = true } = {}) {
  const d = cur - prev;
  if (!state.loaded) return '';
  if (d === 0) return '<span class="delta flat">● เท่าเดิมจากช่วงก่อน</span>';
  const up = d > 0;
  const good = up === goodWhenUp;
  const pct = prev ? ` (${Math.round(Math.abs(d) / prev * 100)}%)` : '';
  return `<span class="delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(d)}${pct} จากช่วงก่อน</span>`;
}

function renderAll() {
  const cur = state.cur || empty();
  const prev = state.prev || empty();
  const total = state.stores.length;
  const done = cur.done.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  $('statTotal').textContent = total;
  $('statDone').textContent = done;
  $('statPending').textContent = total - done;
  $('statRecords').textContent = cur.inspections.length;
  $('deltaDone').innerHTML = deltaHtml(done, prev.done.length);
  $('deltaPending').innerHTML = deltaHtml(total - done, total - prev.done.length, { goodWhenUp: false });
  $('deltaRecords').innerHTML = deltaHtml(cur.inspections.length, prev.inspections.length);
  $('progressPct').textContent = `${pct}%`;
  $('progressFill').style.width = `${pct}%`;
  $('progressBar').setAttribute('aria-valuenow', pct);

  $('floorProgress').innerHTML = floorsInOrder(state.dir).map((f) => {
    const t = state.stores.filter((s) => getFloor(s.store_code) === f).length;
    const d = cur.done.filter((s) => getFloor(s.store_code) === f).length;
    const p = t ? Math.round((d / t) * 100) : 0;
    return `<div class="fp-item"><span class="fp-label">ชั้น ${f}</span>
      <div class="progress sm"><div class="progress-fill" style="width:${p}%"></div></div>
      <span class="fp-num">${d}/${t}</span></div>`;
  }).join('');

  const setPest = (id, n, prevN) => {
    $(id).querySelector('.pest-value').textContent = n;
    const dEl = $(id).querySelector('[data-delta]');
    if (dEl) dEl.innerHTML = deltaHtml(n, prevN, { goodWhenUp: false });
  };
  setPest('ratFound', cur.ratStores.length, prev.ratStores.length);
  setPest('ratClear', done - cur.ratStores.length);
  setPest('roachFound', cur.roachStores.length, prev.roachStores.length);
  setPest('roachClear', done - cur.roachStores.length);
  $('ratFound').disabled = !cur.ratStores.length;
  $('roachFound').disabled = !cur.roachStores.length;

  // วิธีแก้ไขที่ใช้
  const methodCount = {};
  cur.inspections.forEach((i) => { if (i.solution_method) methodCount[i.solution_method] = (methodCount[i.solution_method] || 0) + 1; });
  const maxM = Math.max(1, ...Object.values(methodCount));
  $('methodStats').innerHTML = Object.keys(methodCount).length
    ? SOLUTION_OPTIONS.filter((m) => methodCount[m]).map((m) => `
      <div class="bar-row"><span class="bar-label">${m}</span>
        <div class="bar"><div class="bar-fill" style="width:${(methodCount[m] / maxM) * 100}%"></div></div>
        <span class="bar-num">${methodCount[m]}</span></div>`).join('')
    : '<div class="empty">ไม่มีข้อมูลในช่วงนี้</div>';

  $('tabDoneCount').textContent = done;
  $('tabPendingCount').textContent = total - done;
  $('compareLabel').textContent = state.range ? `ช่วงนี้: ${state.range.label.replace(/^(วันที่|สัปดาห์|ช่วง) /, '')} · ช่วงก่อน: ${state.range.prevLabel}` : '';
  renderCharts(cur, prev);
  renderList();
}

/* ================= กราฟ (Chart.js) ================= */
function bucketsFor(range) {
  const out = [];
  if (range.bucket === 'hour') {
    for (let h = 0; h < 24; h++) out.push({ key: h, label: `${String(h).padStart(2, '0')}:00`, full: `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59` });
  } else if (range.bucket === 'day') {
    const multiMonth = range.start.getMonth() !== addDays(range.end, -1).getMonth();
    for (let d = range.start; d < range.end; d = addDays(d, 1)) {
      const label = state.period.mode === 'week'
        ? `${THAI_DOW[d.getDay()]} ${d.getDate()}`
        : (multiMonth ? `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}` : `${d.getDate()}`);
      out.push({ key: isoDate(d), label, full: `${THAI_DOW[d.getDay()]} ${fmtD(d)}` });
    }
  } else {
    for (let d = new Date(range.start.getFullYear(), range.start.getMonth(), 1); d < range.end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const multiYear = range.start.getFullYear() !== addDays(range.end, -1).getFullYear();
      out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: multiYear ? `${THAI_MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}` : THAI_MONTHS_SHORT[d.getMonth()], full: `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}` });
    }
  }
  return out;
}
function bucketKey(range, iso) {
  const d = new Date(iso);
  if (range.bucket === 'hour') return d.getHours();
  if (range.bucket === 'day') return isoDate(d);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function chartDefaults() {
  const C = window.Chart;
  C.defaults.font.family = "'Sarabun', system-ui, sans-serif";
  C.defaults.font.size = 13;
  C.defaults.color = '#64748b';
  C.defaults.borderColor = '#eef2f6';
  C.defaults.plugins.legend.position = 'bottom';
  C.defaults.plugins.legend.labels.usePointStyle = true;
  C.defaults.plugins.legend.labels.pointStyle = 'rectRounded';
  C.defaults.plugins.legend.labels.color = '#0f172a';
  C.defaults.plugins.tooltip.backgroundColor = '#0f172a';
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.cornerRadius = 8;
  C.defaults.plugins.tooltip.boxPadding = 4;
  C.defaults.maintainAspectRatio = false;
}

const barStyle = { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 36, categoryPercentage: 0.7, barPercentage: 0.9 };
const intAxis = { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f6' }, border: { display: false } };
const catAxis = { grid: { display: false }, border: { color: '#cbd5e1' } };

function upsertChart(id, config) {
  if (!window.Chart) return;
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new window.Chart($(id), config);
}

function renderCharts(cur, prev) {
  if (!window.Chart || !state.range) return;
  const range = state.range;

  // 1) แนวโน้ม: stacked bar แยกตามปัญหา
  const buckets = bucketsFor(range);
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  const series = PROBLEM_OPTIONS.map((p) => ({ p, data: new Array(buckets.length).fill(0) }));
  cur.inspections.forEach((i) => {
    const bi = idx.get(bucketKey(range, i.created_at));
    const s = series.find((x) => x.p === i.problem);
    if (bi !== undefined && s) s.data[bi]++;
  });
  $('trendUnit').textContent = { hour: 'หน่วย: ชั่วโมง', day: 'หน่วย: วัน', month: 'หน่วย: เดือน' }[range.bucket] + ' · จำนวนครั้งที่ตรวจ';
  upsertChart('trendChart', {
    type: 'bar',
    data: {
      labels: buckets.map((b) => b.label),
      datasets: series.map((s) => ({
        label: s.p, data: s.data, backgroundColor: PROBLEM_COLORS[s.p],
        borderColor: '#ffffff', borderWidth: { top: 2 }, ...barStyle,
      })),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: { ...catAxis, stacked: true, ticks: { autoSkip: true, maxRotation: 0 } }, y: { ...intAxis, stacked: true, title: { display: true, text: 'ครั้ง' } } },
      plugins: {
        tooltip: {
          filter: (item) => item.raw > 0,
          callbacks: {
            title: (items) => buckets[items[0].dataIndex].full,
            footer: (items) => `รวม ${items.reduce((a, b) => a + b.raw, 0)} ครั้ง`,
          },
        },
      },
    },
  });
  // ตารางข้อมูล (สำหรับผู้ที่แยกสีได้ยาก / ต้องการตัวเลข)
  const nonEmpty = buckets.map((b, i) => ({ b, i })).filter(({ i }) => series.some((s) => s.data[i]));
  $('trendTable').innerHTML = nonEmpty.length ? `<table class="table">
    <thead><tr><th>ช่วงเวลา</th>${PROBLEM_OPTIONS.map((p) => `<th class="right">${p}</th>`).join('')}<th class="right">รวม</th></tr></thead>
    <tbody>${nonEmpty.map(({ b, i }) => `<tr><td>${b.full}</td>${series.map((s) => `<td class="right">${s.data[i]}</td>`).join('')}
      <td class="right"><b>${series.reduce((a, s) => a + s.data[i], 0)}</b></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">ไม่มีข้อมูลในช่วงนี้</div>';

  // 2) เปรียบเทียบรายชั้น: พบหนู / พบแมลงสาบ
  const floors = floorsInOrder(state.dir);
  const countBy = (list) => floors.map((f) => list.filter((s) => getFloor(s.store_code) === f).length);
  upsertChart('floorChart', {
    type: 'bar',
    data: {
      labels: floors.map((f) => `ชั้น ${f}`),
      datasets: [
        { label: 'พบหนู', data: countBy(cur.ratStores), backgroundColor: PROBLEM_COLORS['หนู'], ...barStyle },
        { label: 'พบแมลงสาบ', data: countBy(cur.roachStores), backgroundColor: PROBLEM_COLORS['แมลงสาบ'], ...barStyle },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: catAxis, y: { ...intAxis, title: { display: true, text: 'ร้าน' } } },
      plugins: {
        tooltip: {
          callbacks: {
            afterTitle: (items) => {
              const f = floors[items[0].dataIndex];
              return `ตรวจแล้ว ${cur.done.filter((s) => getFloor(s.store_code) === f).length} ร้าน`;
            },
            label: (it) => ` ${it.dataset.label}: ${it.raw} ร้าน`,
          },
        },
      },
    },
  });

  // 3) เทียบช่วงก่อนหน้า
  const labels = ['ร้านที่ตรวจ', 'ครั้งที่บันทึก', 'ร้านที่พบหนู', 'ร้านที่พบแมลงสาบ'];
  const pick = (s) => [s.done.length, s.inspections.length, s.ratStores.length, s.roachStores.length];
  upsertChart('compareChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'ช่วงก่อนหน้า', data: pick(prev), backgroundColor: PREVIOUS_COLOR, ...barStyle },
        { label: 'ช่วงนี้', data: pick(cur), backgroundColor: CURRENT_COLOR, ...barStyle },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: catAxis, y: intAxis },
      plugins: {
        tooltip: {
          callbacks: {
            footer: (items) => {
              const p = items.find((i) => i.datasetIndex === 0)?.raw ?? 0;
              const c = items.find((i) => i.datasetIndex === 1)?.raw ?? 0;
              const d = c - p;
              return d === 0 ? 'เท่าเดิม' : `${d > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(d)}${p ? ` (${Math.round(Math.abs(d) / p * 100)}%)` : ''}`;
            },
          },
        },
      },
    },
  });
}

/* ================= รายชื่อร้าน ================= */
function renderList() {
  const cur = state.cur || empty();
  const source = (state.tab === 'done' ? cur.done : cur.pending).slice().sort((a, b) => compareStores(a, b, state.dir));
  const counts = {};
  source.forEach((s) => { const f = getFloor(s.store_code); counts[f] = (counts[f] || 0) + 1; });
  renderFloorTabs($('listFloorTabs'), counts, state.floor, (f) => { state.floor = f; state.page = 1; renderList(); }, { includeAll: true, dir: state.dir });

  const q = state.search.trim().toLowerCase();
  const rows = source.filter((s) => (state.floor === 'ALL' || getFloor(s.store_code) === state.floor)
    && (!q || `${s.store_code} ${s.store_name}`.toLowerCase().includes(q)));
  const pg = paginate(rows, state.page);
  state.page = pg.page;

  const el = $('storeTable');
  if (!sb) {
    el.innerHTML = '<div class="empty">ยังไม่ได้เชื่อมต่อฐานข้อมูล</div>';
  } else if (!pg.items.length) {
    el.innerHTML = `<div class="empty">${state.tab === 'done' ? 'ยังไม่มีร้านที่ตรวจแล้วในช่วงนี้' : '🎉 ตรวจครบทุกร้านแล้ว'}</div>`;
  } else if (state.tab === 'done') {
    el.innerHTML = `<table class="table responsive">
      <thead><tr><th>ชั้น</th><th>รหัสร้าน</th><th>ชื่อร้าน</th><th>ตรวจล่าสุด</th><th>ปัญหาล่าสุด</th><th>ครั้ง</th><th></th></tr></thead>
      <tbody>${pg.items.map((s) => {
        const list = cur.byStore.get(s.id);
        const last = list[0];
        return `<tr class="clickable" data-id="${s.id}">
          <td data-th="ชั้น">${getFloor(s.store_code)}</td>
          <td data-th="รหัสร้าน"><span class="store-code">${escapeHtml(s.store_code)}</span></td>
          <td data-th="ชื่อร้าน">${escapeHtml(s.store_name)}</td>
          <td data-th="ตรวจล่าสุด">${formatDateTime(last.created_at)}</td>
          <td data-th="ปัญหา">${problemBadge(last.problem)}</td>
          <td data-th="จำนวนครั้ง">${list.length}</td>
          <td class="td-action"><span class="link">ดูรายละเอียด ›</span></td></tr>`;
      }).join('')}</tbody></table>`;
    el.querySelectorAll('[data-id]').forEach((tr) => tr.addEventListener('click', () => {
      const s = state.stores.find((x) => x.id === tr.dataset.id);
      showStoreDetail(`${s.store_code} · ${s.store_name}`, [s], () => true);
    }));
  } else {
    el.innerHTML = `<table class="table responsive">
      <thead><tr><th>ชั้น</th><th>รหัสร้าน</th><th>ชื่อร้าน</th><th>สถานะ</th></tr></thead>
      <tbody>${pg.items.map((s) => `<tr>
          <td data-th="ชั้น">${getFloor(s.store_code)}</td>
          <td data-th="รหัสร้าน"><span class="store-code">${escapeHtml(s.store_code)}</span></td>
          <td data-th="ชื่อร้าน">${escapeHtml(s.store_name)}</td>
          <td data-th="สถานะ"><span class="badge badge-warn">ยังไม่ได้ตรวจ</span></td></tr>`).join('')}</tbody></table>`;
  }
  renderPagination($('listPager'), pg, (p) => { state.page = p; renderList(); });
}

function problemBadge(p) {
  const cls = p === NO_PROBLEM ? 'badge-ok' : p === 'หนู-แมลงสาบ' ? 'badge-danger' : 'badge-warn';
  return `<span class="badge ${cls}">${escapeHtml(p)}</span>`;
}

document.querySelectorAll('.seg-tab[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.seg-tab[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  state.tab = b.dataset.tab; state.floor = 'ALL'; state.page = 1;
  renderList();
}));
let st;
$('listSearch').addEventListener('input', (e) => {
  clearTimeout(st);
  st = setTimeout(() => { state.search = e.target.value; state.page = 1; renderList(); }, 200);
});
state.dir = initSortToggle($('sortBtn'), (dir) => { state.dir = dir; state.page = 1; renderAll(); });

/* ================= Modal รายละเอียด ================= */
function inspectionHtml(i) {
  const imgs = (i.image_urls || []).map((u) =>
    `<img src="${escapeHtml(u)}" alt="รูปประกอบ" loading="lazy" data-zoom="${escapeHtml(u)}">`).join('');
  return `<article class="ins-item" data-ins="${i.id}">
    <div class="ins-head">
      <span>🕒 ${formatDateTime(i.created_at)}</span>
      ${problemBadge(i.problem)}
    </div>
    <dl class="ins-dl">
      ${i.solution_method ? `<dt>วิธีแก้ไข</dt><dd>${escapeHtml(i.solution_method)}</dd>` : ''}
      ${i.solution_detail ? `<dt>รายละเอียด</dt><dd>${escapeHtml(i.solution_detail)}</dd>` : ''}
      ${i.remarks ? `<dt>หมายเหตุ</dt><dd>${escapeHtml(i.remarks)}</dd>` : ''}
      <dt>ผู้ตรวจ</dt><dd>${escapeHtml(i.inspector_name || '-')}</dd>
    </dl>
    ${imgs ? `<div class="ins-photos">${imgs}</div>` : '<p class="muted small">ไม่มีรูปภาพประกอบ</p>'}
    ${i.signature_url ? `<div class="ins-sig"><span class="muted small">ลายเซ็น</span><img src="${escapeHtml(i.signature_url)}" alt="ลายเซ็น" data-zoom="${escapeHtml(i.signature_url)}"></div>` : ''}
    ${state.admin ? `<div class="btn-row end"><button type="button" class="btn btn-danger btn-sm" data-delete="${i.id}">🗑️ ลบบันทึกนี้</button></div>` : ''}
  </article>`;
}

function showStoreDetail(title, stores, filter) {
  const cur = state.cur || empty();
  const body = stores.map((s) => {
    const list = (cur.byStore.get(s.id) || []).filter(filter);
    return `<section class="detail-store">
      <h4><span class="store-code">${escapeHtml(s.store_code)}</span> ${escapeHtml(s.store_name)}
        <span class="tag">ชั้น ${getFloor(s.store_code)}</span></h4>
      ${list.map(inspectionHtml).join('')}
    </section>`;
  }).join('') || '<div class="empty">ไม่มีข้อมูล</div>';

  const m = openModal({ title, body, wide: true });
  m.el.querySelectorAll('[data-zoom]').forEach((img) => img.addEventListener('click', () => openLightbox(img.dataset.zoom)));
  m.el.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('ต้องการลบบันทึกการตรวจนี้ใช่หรือไม่? (ลบรูปภาพด้วย)', 'ลบ'))) return;
    try {
      await deleteInspection(b.dataset.delete);
      b.closest('.ins-item').remove();
      toast('ลบบันทึกเรียบร้อย', 'success');
      renderAll();
    } catch (err) { toast(`ลบไม่สำเร็จ: ${err.message}`, 'error'); }
  }));
}

async function deleteInspection(id) {
  const ins = state.cur.inspections.find((i) => i.id === id);
  const { error } = await sb.from('inspections').delete().eq('id', id);
  if (error) throw error;
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const paths = [...(ins?.image_urls || []), ins?.signature_url].filter(Boolean)
    .map((u) => decodeURIComponent(u.split(marker)[1] || '')).filter(Boolean);
  if (paths.length) await sb.storage.from(STORAGE_BUCKET).remove(paths); // best-effort
  state.cur = summarize(state.cur.inspections.filter((i) => i.id !== id));
}

$('ratFound').addEventListener('click', () =>
  showStoreDetail(`ร้านที่พบหนู (${state.cur.ratStores.length} ร้าน) · ${state.range.label}`, state.cur.ratStores, (i) => hasPest(i.problem, 'หนู')));
$('roachFound').addEventListener('click', () =>
  showStoreDetail(`ร้านที่พบแมลงสาบ (${state.cur.roachStores.length} ร้าน) · ${state.range.label}`, state.cur.roachStores, (i) => hasPest(i.problem, 'แมลงสาบ')));

/* ================= ข้อมูลสำหรับ Export ================= */
function reportData() {
  const cur = state.cur || empty();
  const prev = state.prev || empty();
  const total = state.stores.length;
  const done = cur.done.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const summary = [
    ['ร้านทั้งหมด', total],
    ['ตรวจแล้ว', done],
    ['ยังไม่ได้ตรวจ', total - done],
    ['ความคืบหน้า (%)', pct],
    ['จำนวนครั้งที่บันทึก', cur.inspections.length],
  ];
  const pest = [
    ['หนู', cur.ratStores.length, done - cur.ratStores.length],
    ['แมลงสาบ', cur.roachStores.length, done - cur.roachStores.length],
  ];
  const compare = [
    ['ร้านที่ตรวจ', done, prev.done.length],
    ['ครั้งที่บันทึก', cur.inspections.length, prev.inspections.length],
    ['ร้านที่พบหนู', cur.ratStores.length, prev.ratStores.length],
    ['ร้านที่พบแมลงสาบ', cur.roachStores.length, prev.roachStores.length],
  ].map(([k, c, p]) => [k, c, p, c - p]);
  const floors = floorsInOrder(state.dir).map((f) => {
    const on = (list) => list.filter((s) => getFloor(s.store_code) === f).length;
    const t = on(state.stores);
    const d = on(cur.done);
    return [`ชั้น ${f}`, t, d, t - d, t ? Math.round((d / t) * 100) : 0, on(cur.ratStores), on(cur.roachStores)];
  });
  const sorted = [...cur.inspections].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const inspections = sorted.map((i, idx) => [
    idx + 1, formatDateTime(i.created_at), getFloor(i.store_code), i.store_code, i.store_name,
    i.problem, i.solution_method || '-', i.solution_detail || '', i.remarks || '', i.inspector_name || '',
    (i.image_urls || []).length, (i.image_urls || []).join(' '), i.signature_url || '',
  ]);
  const pending = cur.pending.slice().sort((a, b) => compareStores(a, b, state.dir))
    .map((s, idx) => [idx + 1, getFloor(s.store_code), s.store_code, s.store_name]);
  // แนวโน้มตามหน่วยเวลา
  const buckets = bucketsFor(state.range);
  const idxMap = new Map(buckets.map((b, i) => [b.key, i]));
  const trend = buckets.map((b) => [b.full, ...PROBLEM_OPTIONS.map(() => 0), 0]);
  cur.inspections.forEach((i) => {
    const bi = idxMap.get(bucketKey(state.range, i.created_at));
    const pi = PROBLEM_OPTIONS.indexOf(i.problem);
    if (bi !== undefined && pi >= 0) { trend[bi][pi + 1]++; trend[bi][PROBLEM_OPTIONS.length + 1]++; }
  });
  return { summary, pest, compare, floors, inspections, pending, trend, pct };
}

const INS_HEAD = ['ลำดับ', 'วันที่-เวลา', 'ชั้น', 'รหัสร้าน', 'ชื่อร้าน', 'ปัญหาที่พบ', 'วิธีแก้ไข',
  'รายละเอียดวิธีแก้ไข', 'หมายเหตุ', 'ผู้ตรวจ', 'จำนวนรูป', 'ลิงก์รูปภาพ', 'ลิงก์ลายเซ็น'];
const FLOOR_HEAD = ['ชั้น', 'ร้านทั้งหมด', 'ตรวจแล้ว', 'ยังไม่ได้ตรวจ', '%', 'พบหนู', 'พบแมลงสาบ'];
const COMPARE_HEAD = ['ตัวชี้วัด', 'ช่วงนี้', 'ช่วงก่อนหน้า', 'เปลี่ยนแปลง'];
const reportTitle = () => `รายงานการตรวจร้านค้าและศัตรูพืช ${state.range.label}`;
const fileBase = () => {
  const r = state.range;
  const a = isoDate(r.start); const b = isoDate(addDays(r.end, -1));
  return `pest-report-${state.period.mode}-${a === b ? a : `${a}_to_${b}`}`;
};

function ensureLoaded() {
  if (!state.loaded) { toast('กรุณากด "ดูข้อมูล" ก่อน Export', 'warn'); return false; }
  return true;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- CSV ---------- */
function exportCsv() {
  if (!ensureLoaded()) return;
  const d = reportData();
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    [reportTitle()],
    [],
    ['สถานะ', ...INS_HEAD.slice(1)],
    ...d.inspections.map((r) => ['ตรวจแล้ว', ...r.slice(1)]),
    ...d.pending.map((r) => ['ยังไม่ได้ตรวจ', '', r[1], r[2], r[3]]),
  ];
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`);
  toast('ส่งออก CSV เรียบร้อย', 'success');
}

/* ---------- Excel ---------- */
function exportXlsx() {
  if (!ensureLoaded()) return;
  if (!window.XLSX) { toast('ไลบรารี Excel ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง', 'warn'); return; }
  const d = reportData();
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([
    [reportTitle()], [`ช่วงก่อนหน้าที่ใช้เปรียบเทียบ: ${state.range.prevLabel}`], [],
    ['สรุปภาพรวม', 'จำนวน'], ...d.summary, [],
    ['สถิติศัตรูพืช', 'พบ (ร้าน)', 'ไม่พบ (ร้าน)'], ...d.pest, [],
    COMPARE_HEAD, ...d.compare, [],
    FLOOR_HEAD, ...d.floors,
  ]);
  ws1['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'สรุป');

  const ws2 = XLSX.utils.aoa_to_sheet([['ช่วงเวลา', ...PROBLEM_OPTIONS, 'รวม'], ...d.trend]);
  ws2['!cols'] = [{ wch: 26 }, ...PROBLEM_OPTIONS.map(() => ({ wch: 12 })), { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'แนวโน้ม');

  const ws3 = XLSX.utils.aoa_to_sheet([INS_HEAD, ...d.inspections]);
  ws3['!cols'] = [6, 20, 6, 10, 30, 14, 18, 30, 30, 18, 9, 50, 50].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws3, 'รายการตรวจ');

  const ws4 = XLSX.utils.aoa_to_sheet([['ลำดับ', 'ชั้น', 'รหัสร้าน', 'ชื่อร้าน'], ...d.pending]);
  ws4['!cols'] = [{ wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'ยังไม่ได้ตรวจ');

  XLSX.writeFile(wb, `${fileBase()}.xlsx`);
  toast('ส่งออก Excel เรียบร้อย', 'success');
}

/* ---------- PDF (HTML → Canvas → PDF เพื่อรองรับภาษาไทย) ---------- */
async function exportPdf() {
  if (!ensureLoaded()) return;
  if (!window.jspdf || !window.html2canvas) { toast('ไลบรารี PDF ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง', 'warn'); return; }
  const btn = $('exportPdf');
  setBusy(btn, true, 'กำลังสร้าง PDF...');
  const root = document.createElement('div');
  root.className = 'pdf-root';
  document.body.appendChild(root);
  try {
    await document.fonts.ready;
    const pages = buildPdfPages(root, reportData());
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < pages.length; i++) {
      pages[i].querySelector('.pdf-footer').textContent =
        `พิมพ์เมื่อ ${formatDateTime(new Date().toISOString())} · หน้า ${i + 1}/${pages.length}`;
      const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    pdf.save(`${fileBase()}.pdf`);
    toast('ส่งออก PDF เรียบร้อย', 'success');
  } catch (err) {
    console.error(err);
    toast(`สร้าง PDF ไม่สำเร็จ: ${err.message}`, 'error');
  } finally {
    root.remove();
    setBusy(btn, false);
  }
}

/** ภาพกราฟบนพื้นขาวสำหรับใส่ใน PDF */
function chartImage(id) {
  const c = state.charts[id];
  if (!c) return '';
  const src = c.canvas;
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out.toDataURL('image/png');
}

function buildPdfPages(root, d) {
  const pages = [];
  let content;
  const newPage = () => {
    const page = document.createElement('div');
    page.className = 'pdf-page';
    page.innerHTML = '<div class="pdf-content"></div><div class="pdf-footer"></div>';
    root.appendChild(page);
    pages.push(page);
    content = page.querySelector('.pdf-content');
  };
  const overflow = () => content.scrollHeight > content.clientHeight + 1;
  const addBlock = (html) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    content.appendChild(node);
    if (overflow() && content.children.length > 1) { node.remove(); newPage(); content.appendChild(node); }
  };
  const addTable = (title, head, rows, colClass = '') => {
    const start = () => {
      addBlock(`<div class="pdf-table-wrap"><h3>${escapeHtml(title)}</h3>
        <table class="pdf-table ${colClass}"><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`);
      return content.lastElementChild.querySelector('tbody');
    };
    let tbody = start();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${head.length}" class="center">— ไม่มีข้อมูล —</td></tr>`;
      return;
    }
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = r.map((c) => `<td>${escapeHtml(c)}</td>`).join('');
      tbody.appendChild(tr);
      if (overflow()) {
        tr.remove();
        newPage();
        tbody = start();
        content.lastElementChild.querySelector('h3').textContent = `${title} (ต่อ)`;
        tbody.appendChild(tr);
      }
    }
  };
  const addChart = (title, id, h = 250) => {
    const src = chartImage(id);
    if (src) addBlock(`<div class="pdf-chart"><h3>${escapeHtml(title)}</h3><img src="${src}" style="height:${h}px"></div>`);
  };

  newPage();
  addBlock(`<div class="pdf-header">
      <div><h1>รายงานการตรวจร้านค้าและติดตามศัตรูพืช</h1><h2>${escapeHtml(state.range.label)}</h2>
      <p class="pdf-sub">เปรียบเทียบกับช่วงก่อนหน้า: ${escapeHtml(state.range.prevLabel)}</p></div>
      <div class="pdf-logo">🐀🪳</div></div>`);
  addBlock(`<div class="pdf-summary">${d.summary.slice(0, 3).map(([k, v]) =>
    `<div class="pdf-stat"><span>${k}</span><b>${v}</b></div>`).join('')}
    <div class="pdf-stat"><span>ความคืบหน้า</span><b>${d.pct}%</b></div></div>`);
  addTable('สถิติการพบศัตรูพืช (จำนวนร้าน)', ['ประเภท', 'พบ', 'ไม่พบ'], d.pest);
  addTable('เทียบกับช่วงก่อนหน้า', COMPARE_HEAD, d.compare.map((r) => [r[0], r[1], r[2], r[3] > 0 ? `+${r[3]}` : r[3]]));
  addChart('แนวโน้มการตรวจและปัญหาที่พบ', 'trendChart', 240);
  addChart('เปรียบเทียบรายชั้น (จำนวนร้านที่พบ)', 'floorChart', 220);
  addTable('สรุปรายชั้น', FLOOR_HEAD, d.floors);
  addTable('รายการบันทึกการตรวจ', ['#', 'วันที่-เวลา', 'รหัสร้าน', 'ชื่อร้าน', 'ปัญหา', 'วิธีแก้ไข', 'รายละเอียด / หมายเหตุ', 'ผู้ตรวจ'],
    d.inspections.map((r) => [r[0], r[1], r[3], r[4], r[5], r[6], [r[7], r[8]].filter(Boolean).join(' / '), r[9]]), 'ins');
  addTable('รายชื่อร้านที่ยังไม่ได้ตรวจ', ['#', 'ชั้น', 'รหัสร้าน', 'ชื่อร้าน'], d.pending);
  return pages;
}

$('exportCsv').addEventListener('click', exportCsv);
$('exportXlsx').addEventListener('click', exportXlsx);
$('exportPdf').addEventListener('click', exportPdf);

/* ================= เริ่มต้น ================= */
(async () => {
  if (window.Chart) chartDefaults();
  else toast('โหลดไลบรารีกราฟไม่สำเร็จ', 'warn');
  renderModeTabs();
  renderFields();
  state.admin = !!(await renderAuthChip());
  load();
})();
