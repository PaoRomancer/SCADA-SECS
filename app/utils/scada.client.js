import { DAY, MODES, DATE, T } from '../data/scada-data.js'
import { iconSvg, renderLucideIcons } from './icons.js'

/* =====================================================================
   1) PLANT CONFIGURATION  —  แก้ค่าตรงนี้เพื่อปรับโมเดล
   ===================================================================== */
const CFG = {
  nChiller: 6, rtPerChiller: 650, chillerMaxLoad: 0.88,   // 5 duty + 1 standby
  kwPerRT: 3.5168,
  zoneDesignKW: 1250,                                      // per zone IT design
  chwsSP: 7.0, dtSP: 6.0, dtAir: 12.5,
  tesCapKWh: 1800,                                          // thermal store
  // share of cooling electrical power (normalised each step)
  share: { chiller: 0.615, chwPump: 0.095, cdwPump: 0.085, ctFan: 0.075, crahFan: 0.130 },
  zoneBase: [0.27, 0.26, 0.24, 0.23], zonePhase: [0, 6, 12, 18]
};
const N = 1440;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* =====================================================================
   2) DERIVED PROCESS MODEL
   CSV มีแต่ค่ากำลังไฟฟ้า → ค่าอุณหภูมิ/flow/ความเร็วรอบด้านล่างนี้
   คำนวณจาก IT_Power_kW + Cooling_Power_kW + เวลา ด้วยสมการทางความร้อน
   (deterministic — เวลาเดิมได้ค่าเดิมเสมอ)
   ===================================================================== */
const D = {};
['amb', 'rh', 'wb', 'q', 'rt', 'nch', 'chLoad', 'chKW', 'chwpKW', 'cdwpKW', 'ctKW', 'crahKW', 'cop', 'kwrt',
  'chws', 'chwr', 'dt', 'flow', 'cdws', 'cdwr', 'ctFan', 'appr', 'chwSpd', 'cdwSpd', 'dp', 'pue', 'tes', 'tot', 'ppue', 'capRT']
  .forEach(k => D[k] = new Float32Array(N));
const Z = { kw: [], t: [], dmp: [], fan: [], vlv: [], flow: [] };
for (let z = 0; z < 4; z++) for (const k in Z) Z[k].push(new Float32Array(N));

function wetBulb(T, RH) {                 // Stull (2011)
  return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH)
    - Math.atan(RH - 1.676331) + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
}

function buildModel() {
  let tes = 0.62;                                    // TES state of charge (0..1)
  let nRun = 0, lastStage = -999, chwsF = CFG.chwsSP;
  for (let i = 0; i < N; i++) {
    const h = i / 60;
    const it = DAY.it[i], cool = DAY.cool[i];
    D.tot[i] = it + cool;

    /* --- ambient (Thailand, August) --- */
    const ph = Math.cos(TAU * (h - 15) / 24);
    const amb = 28.9 + 5.1 * ph;
    const rh = clamp(66 - 18 * ph, 40, 92);
    D.amb[i] = amb; D.rh[i] = rh; D.wb[i] = wetBulb(amb, rh);

    /* --- thermal load --- */
    const q = it * 1.02 + 60;                        // IT heat + hall lighting / UPS loss
    const rt = q / CFG.kwPerRT;
    D.q[i] = q; D.rt[i] = rt;
    const lf = clamp(rt / (5 * CFG.rtPerChiller), 0.05, 1);

    /* --- chiller staging (hysteresis + 15 min minimum dwell) --- */
    if (nRun === 0) nRun = clamp(Math.ceil(rt / (CFG.rtPerChiller * 0.85)), 1, 5);
    else if (rt > nRun * CFG.rtPerChiller * CFG.chillerMaxLoad && nRun < 5 && i - lastStage >= 15) { nRun++; lastStage = i; }
    else if (nRun > 1 && rt < (nRun - 1) * CFG.rtPerChiller * 0.78 && i - lastStage >= 15) { nRun--; lastStage = i; }
    const n = nRun;
    D.nch[i] = n; D.capRT[i] = n * CFG.rtPerChiller;
    D.chLoad[i] = clamp(rt / (n * CFG.rtPerChiller) * 100, 0, 100);

    /* --- split measured cooling kW into sub-systems (sums to CSV value) --- */
    const s = CFG.share, d = amb - 28.9;
    let a = s.chiller * (1 + 0.010 * d), b = s.chwPump, c = s.cdwPump,
      e = s.ctFan * (1 + 0.030 * d), f = s.crahFan;
    const sum = a + b + c + e + f;
    D.chKW[i] = cool * a / sum; D.chwpKW[i] = cool * b / sum; D.cdwpKW[i] = cool * c / sum;
    D.ctKW[i] = cool * e / sum; D.crahKW[i] = cool * f / sum;
    D.cop[i] = q / D.chKW[i];
    D.kwrt[i] = cool / rt;
    D.pue[i] = D.tot[i] / it;
    D.ppue[i] = (it + cool) / it;

    /* --- chilled water loop --- */
    const shaving = DAY.mode[i] === 1;
    const preCool = DAY.pcool[i] > cool * 1.02;      // predictive pre-cooling active
    const chwsSP = CFG.chwsSP + (shaving ? 0.45 : 0) - (preCool ? 0.55 : 0);
    chwsF += (chwsSP - chwsF) * 0.03;                // first-order lag — real loop response
    const chws = chwsF + 0.05 * Math.sin(i / 37);
    const dt = 4.3 + 1.9 * lf;
    D.chws[i] = chws; D.dt[i] = dt; D.chwr[i] = chws + dt;
    const flow = q * 3.6 / (4.186 * dt);             // m3/h total
    D.flow[i] = flow;
    D.chwSpd[i] = clamp(flow / n / 330 * 100, 30, 100);

    /* --- condenser loop + cooling towers --- */
    const ctFan = clamp(40 + 42 * lf + 2.6 * d, 30, 100);
    const appr = 3.4 + 2.6 * (1 - ctFan / 100);
    const range = 4.6 + 1.2 * lf;
    D.ctFan[i] = ctFan; D.appr[i] = appr;
    D.cdws[i] = D.wb[i] + appr;                      // tower leaving → chiller condenser in
    D.cdwr[i] = D.cdws[i] + range;                   // chiller condenser out → tower
    const qRej = q + D.chKW[i];
    D.cdwSpd[i] = clamp(qRej * 3.6 / (4.186 * range) / n / 360 * 100, 30, 100);

    /* --- zones --- */
    let w = [], tot = 0;
    for (let z = 0; z < 4; z++) {
      const v = CFG.zoneBase[z] * (1 + 0.16 * Math.sin(TAU * (h + CFG.zonePhase[z]) / 24));
      w.push(v); tot += v;
    }
    let wmax = 0; for (let z = 0; z < 4; z++) { w[z] /= tot; if (w[z] > wmax) wmax = w[z]; }
    let fanSum = 0;
    for (let z = 0; z < 4; z++) {
      const zkw = it * w[z];
      const lz = zkw / CFG.zoneDesignKW;
      Z.kw[z][i] = zkw;
      Z.dmp[z][i] = clamp(w[z] / wmax * 96, 28, 100);
      const fan = clamp(42 + 58 * lz, 30, 100); Z.fan[z][i] = fan; fanSum += fan;
      Z.vlv[z][i] = clamp(30 + 66 * lz, 18, 100);
      Z.flow[z][i] = zkw * 1.02 * 3600 / (1.006 * 1.16 * CFG.dtAir);   // m3/h air
      Z.t[z][i] = clamp(23.4 + 2.6 * (lz - 0.62) + 0.55 * Math.sin(i / 23 + z) + 0.06 * (amb - 28.9), 19, 30);
    }
    D.dp[i] = 16 + 14 * (fanSum / 400);

    /* --- thermal storage (charged off-peak, discharged while shaving) --- */
    const chg = (!shaving && h < 7.5) ? 0.0016 : (shaving ? -0.0022 : -0.0004);
    tes = clamp(tes + chg, 0.05, 1); D.tes[i] = tes;
  }
}

/* =====================================================================
   3) ALARM / EVENT ENGINE  (edge triggered, generated once for the day)
   ===================================================================== */
const ALARMS = [];
function buildAlarms() {
  const last = {};
  const fire = (i, sev, key, tag, val, rearm = 25) => {
    if (last[key + tag] !== undefined && i - last[key + tag] < rearm) return;
    last[key + tag] = i;
    ALARMS.push({ i, sev, key, tag, val });
  };
  for (let i = 1; i < N; i++) {
    if (D.kwrt[i] > 2.05 && D.kwrt[i - 1] <= 2.05) fire(i, 'warn', 'aEff', 'PLANT.KWRT', D.kwrt[i], 60);
    if (D.amb[i] > 33 && D.amb[i - 1] <= 33) fire(i, 'warn', 'aAmb', 'WS.AMB_T', D.amb[i], 240);
    if (D.ctFan[i] >= 97 && D.ctFan[i - 1] < 97) fire(i, 'warn', 'aCT', 'CT.VFD_SPD', D.ctFan[i], 120);
    if (D.nch[i] > D.nch[i - 1]) fire(i, 'info', 'aStage', 'CH.STAGE', D.nch[i], 5);
    if (D.nch[i] < D.nch[i - 1]) fire(i, 'info', 'aDest', 'CH.STAGE', D.nch[i], 5);
    if (DAY.mode[i] === 1 && DAY.mode[i - 1] !== 1) fire(i, 'info', 'aShave', 'PLC.MODE', DAY.lim[i], 30);
    if (DAY.soc[i] >= 749 && DAY.soc[i - 1] < 749) fire(i, 'info', 'aSoc', 'ESS.SOC', DAY.soc[i], 180);
    if (DAY.cool[i] > DAY.pcool[i] * 1.06 && DAY.cool[i - 1] <= DAY.pcool[i - 1] * 1.06)
      fire(i, 'warn', 'aPred', 'PLC.PRED_DEV', (DAY.cool[i] / DAY.pcool[i] - 1) * 100, 45);
    if (D.tot[i] > 7000 && D.tot[i - 1] <= 7000) fire(i, 'alm', 'aPeak', 'MDB.P_TOT', D.tot[i], 60);
    for (let z = 0; z < 4; z++)
      if (Z.t[z][i] > 26.5 && Z.t[z][i - 1] <= 26.5) fire(i, 'alm', 'aZone', 'Z' + (z + 1) + '.INLET_T', Z.t[z][i], 45);
  }
  ALARMS.sort((a, b) => a.i - b.i);
}

/* live "active" conditions at index i */
function activeAlarms(i) {
  let n = 0;
  if (D.kwrt[i] > 2.05) n++;
  if (D.amb[i] > 33) n++;
  if (D.ctFan[i] >= 97) n++;
  if (D.tot[i] > 7000) n++;
  if (DAY.cool[i] > DAY.pcool[i] * 1.06) n++;
  for (let z = 0; z < 4; z++) if (Z.t[z][i] > 26.5) n++;
  return n;
}

/* =====================================================================
   4) BILINGUAL STRINGS
   ===================================================================== */
let LANG = 'en';
let THEME = localStorage.getItem('scada_theme') || 'dark';
const t = k => (T[LANG][k] !== undefined ? T[LANG][k] : (T.en[k] !== undefined ? T.en[k] : k));

/* =====================================================================
   5) COLOURS, FORMATTERS, SMALL HELPERS
   ===================================================================== */
const C = {
  s1: '#0088e8', s2: '#ea580c', s3: '#059669', s4: '#d97706', s5: '#db2777', s6: '#6366f1',
  ink: '#f0f6fc', ink2: '#90adc6', ink3: '#567494', grid: '#112238', accent: '#00a3e0',
  ok: '#16a34a', warn: '#f59e0b', alm: '#dc2626', cold: '#00c0f3', hot: '#f97316', cond: '#10b981'
};

function applyTheme(theme) {
  THEME = theme || 'dark';
  document.documentElement.setAttribute('data-theme', THEME);
  localStorage.setItem('scada_theme', THEME);

  if (THEME === 'light') {
    C.ink = '#0f172a';
    C.ink2 = '#475569';
    C.ink3 = '#64748b';
    C.grid = '#e2e8f0';
    C.accent = '#0284c7';
  } else {
    C.ink = '#f0f6fc';
    C.ink2 = '#90adc6';
    C.ink3 = '#567494';
    C.grid = '#112238';
    C.accent = '#00a3e0';
  }

  const labelIcon = THEME === 'light' ? 'moon' : 'sun';
  const labelText = THEME === 'light' ? 'Dark' : 'Light';
  if (el('btnTheme')) el('btnTheme').innerHTML = iconSvg(labelIcon) + '<span>' + labelText + '</span>';
  if (el('btnLoginTheme')) {
    const modeText = THEME === 'light' ? 'Dark Mode' : 'Light Mode';
    el('btnLoginTheme').innerHTML = iconSvg(labelIcon, { width: 13, height: 13 }) + '<span>' + modeText + '</span>';
  }
  if (el('btnSetThemeDark')) el('btnSetThemeDark').classList.toggle('active', THEME === 'dark');
  if (el('btnSetThemeLight')) el('btnSetThemeLight').classList.toggle('active', THEME === 'light');
  if (el('currentThemeBadge')) el('currentThemeBadge').textContent = THEME === 'light' ? 'Light Mode' : 'Dark Mode';

  if (typeof CHARTS !== 'undefined' && Array.isArray(CHARTS)) {
    CHARTS.forEach(c => { if (c.cfg.page === PAGE) drawChart(c); });
    if (PAGE === 'p3') drawZoneBars();
    if (CURRENT_FS_CHART_ID && FS_CHART_OBJ) drawFsChart();
  }
}

function toggleTheme() {
  applyTheme(THEME === 'light' ? 'dark' : 'light');
}
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const el = id => document.getElementById(id);
const nf = (v, d = 0) => (v === null || v === undefined || !isFinite(v)) ? '–'
  : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m) % 60).padStart(2, '0');
const hhmmss = m => hhmm(m) + ':' + String(Math.floor((m % 1) * 60)).padStart(2, '0');
function setTxt(id, v) { const e = el(id); if (e) e.textContent = v; }

/* cumulative energy (kWh) */
const CUM = {
  it: new Float32Array(N), cool: new Float32Array(N), tot: new Float32Array(N),
  pv: new Float32Array(N), grid: new Float32Array(N), mae: new Float32Array(N),
  peak: new Float32Array(N), peakAt: new Int16Array(N), shave: new Int16Array(N)
};
function buildCum() {
  let it = 0, co = 0, pv = 0, gr = 0, mae = 0, pk = 0, pkAt = 0, sh = 0;
  for (let i = 0; i < N; i++) {
    it += DAY.it[i] / 60; co += DAY.cool[i] / 60; pv += DAY.pv[i] / 60; gr += DAY.grid[i] / 60;
    mae += Math.abs(DAY.cool[i] - DAY.pcool[i]);
    if (D.tot[i] > pk) { pk = D.tot[i]; pkAt = i; }
    if (DAY.mode[i] === 1) sh++;
    CUM.it[i] = it; CUM.cool[i] = co; CUM.tot[i] = it + co; CUM.pv[i] = pv; CUM.grid[i] = gr;
    CUM.mae[i] = mae / (i + 1); CUM.peak[i] = pk; CUM.peakAt[i] = pkAt; CUM.shave[i] = sh;
  }
}

/* =====================================================================
   6) CANVAS TREND ENGINE
   ===================================================================== */
const CHARTS = [];
let CURRENT_FS_CHART_ID = null;
let FS_CHART_OBJ = null;

function chart(id, cfg) {
  const cv = el(id); if (!cv) return;
  const o = { cv, cfg, hover: -1 };
  CHARTS.push(o);
  cv.addEventListener('mousemove', ev => {
    const r = cv.getBoundingClientRect();
    const pl = 46, pr = 12;
    const x = ev.clientX - r.left;
    const f = (x - pl) / (r.width - pl - pr);
    o.hover = clamp(Math.round(f * (N - 1)), 0, N - 1);
    showTip(o, ev);
    drawChart(o);
  });
  cv.addEventListener('mouseleave', () => { o.hover = -1; el('tip').style.opacity = 0; drawChart(o); });
  return o;
}
function showTip(o, ev) {
  const tip = el('tip'), i = o.hover;
  let h = '<b>' + hhmm(i) + '</b>';
  o.cfg.series.forEach(s => {
    h += '<div class="row"><span><i style="background:' + s.color + '"></i>' + t(s.k) + '</span><em class="num">' +
      ((s.gapZero && !(s.data[i] > 0)) ? '—' : nf(s.data[i], s.d === undefined ? 0 : s.d) + ' ' + (o.cfg.unit || '')) + '</em></div>';
  });
  tip.innerHTML = h;
  tip.style.opacity = 1;
  const w = 210;
  tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - w - 10) + 'px';
  tip.style.top = Math.min(ev.clientY + 12, window.innerHeight - 130) + 'px';
}
function getCanvasTargetSize(cv, defaultH) {
  if (!cv) return null;
  const parent = cv.parentElement;
  if (!parent) return null;
  const rect = parent.getBoundingClientRect();
  if (rect.width <= 0 || rect.height < 0) return null;
  const style = window.getComputedStyle(parent);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  const targetW = Math.max(220, Math.floor(rect.width - padLeft - padRight));

  let targetH = 210;
  if (cv.id === 'cvFs') {
    const boxH = parent.clientHeight || 420;
    targetH = Math.max(300, boxH);
  } else {
    const attrH = +(cv.getAttribute('height') || defaultH || 210);
    if (attrH <= 130) {
      targetH = attrH;
    } else {
      targetH = Math.max(190, Math.min(270, Math.round(targetW * 0.40)));
    }
  }
  return { w: targetW, h: targetH };
}

function openChartFsModal(chartId) {
  const modal = el('chartFsModal');
  const cvFs = el('cvFs');
  if (!modal || !cvFs) return;

  CURRENT_FS_CHART_ID = chartId;
  modal.style.display = 'flex';

  const originalCv = el(chartId);
  let titleText = 'Chart Full Screen';
  if (originalCv) {
    const card = originalCv.closest('.card');
    if (card) {
      const h3 = card.querySelector('h3');
      if (h3) {
        const span = h3.querySelector('span[data-i18n]') || h3.querySelector('span');
        if (span) titleText = span.textContent;
      }
    }
  }
  el('chartFsTitle').textContent = titleText;

  if (chartId === 'cvZ1') {
    FS_CHART_OBJ = { cv: cvFs, isZone: true, hover: -1 };
    legend('lgFs', [{ k: 'eZkw', color: C.s1 }, { k: 'eDmp', color: C.s2 }]);
  } else {
    const found = CHARTS.find(c => c.cv.id === chartId);
    if (found) {
      FS_CHART_OBJ = { cv: cvFs, cfg: found.cfg, hover: -1 };
      legend('lgFs', found.cfg.series);
    } else {
      FS_CHART_OBJ = null;
    }
  }

  cvFs.onmousemove = ev => {
    if (!FS_CHART_OBJ) return;
    const r = cvFs.getBoundingClientRect();
    const pl = 56, pr = 24;
    const x = ev.clientX - r.left;
    const f = (x - pl) / (r.width - pl - pr);
    FS_CHART_OBJ.hover = clamp(Math.round(f * (N - 1)), 0, N - 1);
    updateFsInfo(FS_CHART_OBJ);
    drawFsChart();
  };

  cvFs.onmouseleave = () => {
    if (!FS_CHART_OBJ) return;
    FS_CHART_OBJ.hover = -1;
    updateFsInfo(FS_CHART_OBJ);
    drawFsChart();
  };

  requestAnimationFrame(() => {
    drawFsChart();
    updateFsInfo(FS_CHART_OBJ);
  });
}

function closeChartFsModal() {
  const modal = el('chartFsModal');
  if (modal) modal.style.display = 'none';
  CURRENT_FS_CHART_ID = null;
  FS_CHART_OBJ = null;
  if (el('tip')) el('tip').style.opacity = 0;
}

function updateFsInfo(o) {
  const infoTime = el('chartFsTime');
  const infoSub = el('chartFsSub');
  if (!infoTime || !infoSub) return;

  const i = (o && o.hover >= 0) ? o.hover : clamp(Math.floor(IDX), 0, N - 1);
  infoTime.innerHTML = (o && o.hover >= 0 ? iconSvg('map-pin', { width: 13, height: 13, style: 'vertical-align:middle;margin-right:2px;' }) + ' ' : iconSvg('clock', { width: 13, height: 13, style: 'vertical-align:middle;margin-right:2px;' }) + ' LIVE: ') + hhmm(i);

  if (!o) { infoSub.innerHTML = ''; return; }

  if (o.isZone) {
    infoSub.innerHTML = '<span>Zone 1: <b>' + nf(Z.kw[0][i]) + ' kW</b> (' + nf(Z.dmp[0][i]) + '%)</span>' +
      '<span>Zone 2: <b>' + nf(Z.kw[1][i]) + ' kW</b> (' + nf(Z.dmp[1][i]) + '%)</span>' +
      '<span>Zone 3: <b>' + nf(Z.kw[2][i]) + ' kW</b> (' + nf(Z.dmp[2][i]) + '%)</span>' +
      '<span>Zone 4: <b>' + nf(Z.kw[3][i]) + ' kW</b> (' + nf(Z.dmp[3][i]) + '%)</span>';
    return;
  }

  if (o.cfg && o.cfg.series) {
    let parts = [];
    o.cfg.series.forEach(s => {
      const val = (s.gapZero && !(s.data[i] > 0)) ? '—' : nf(s.data[i], s.d === undefined ? 0 : s.d) + ' ' + (o.cfg.unit || '');
      parts.push('<span style="color:' + s.color + '"><b>' + t(s.k) + ':</b> ' + val + '</span>');
    });
    infoSub.innerHTML = parts.join('');
  }
}

function drawFsChart() {
  if (!FS_CHART_OBJ) return;
  if (FS_CHART_OBJ.isZone) {
    drawZoneBars(FS_CHART_OBJ.cv);
  } else {
    drawChart(FS_CHART_OBJ);
  }
}

function drawChart(o) {
  const cv = o.cv, cfg = o.cfg;
  const size = getCanvasTargetSize(cv, 210);
  if (!size) return;
  const w = size.w, h = size.h;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const pl = 46, pr = 14, pt = 12, pb = 22;
  const iw = w - pl - pr, ih = h - pt - pb;

  let lo = cfg.yMin, hi = cfg.yMax;
  if (lo === undefined || hi === undefined) {
    lo = Infinity; hi = -Infinity;
    cfg.series.forEach(s => {
      for (let i = 0; i < N; i++) {
        const v = s.data[i];
        if (s.gapZero && !(v > 0)) continue;
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
    });
    const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    if (cfg.zero) lo = Math.min(0, lo);
  }
  const X = i => pl + i / (N - 1) * iw;
  const Y = v => pt + ih - (v - lo) / (hi - lo) * ih;

  /* bands */
  (cfg.bands || []).forEach(b => {
    g.fillStyle = b.c; g.fillRect(pl, Y(b.hi), iw, Math.max(1, Y(b.lo) - Y(b.hi)));
  });
  /* grid */
  g.strokeStyle = C.grid; g.lineWidth = 1; g.fillStyle = C.ink3;
  g.font = '10px "Inter", "Google Sans", sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let k = 0; k <= 4; k++) {
    const v = lo + (hi - lo) * k / 4, y = Math.round(Y(v)) + .5;
    g.beginPath(); g.moveTo(pl, y); g.lineTo(pl + iw, y); g.stroke();
    g.fillText(nf(v, cfg.yd === undefined ? 0 : cfg.yd), pl - 6, y);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let m = 0; m <= 1440; m += 180) {
    const x = Math.round(X(Math.min(m, N - 1))) + .5;
    g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ih); g.strokeStyle = C.grid; g.stroke();
    g.fillText(String(Math.floor(m / 60)).padStart(2, '0') + ':00', x, pt + ih + 5);
  }
  /* series */
  const now = clamp(Math.floor(IDX), 0, N - 1);
  const line = (s, from, to, alpha, width) => {
    g.globalAlpha = alpha; g.strokeStyle = s.color; g.lineWidth = width;
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.setLineDash(s.dash || []);
    g.beginPath();
    let pen = false;
    for (let i = from; i <= to; i++) {
      const v = s.data[i];
      if (s.gapZero && !(v > 0)) { pen = false; continue; }
      const x = X(i), y = Y(v);
      if (!pen) { g.moveTo(x, y); pen = true; }
      else if (s.step) { g.lineTo(x, Y(s.data[i - 1])); g.lineTo(x, y); }
      else g.lineTo(x, y);
    }
    g.stroke(); g.setLineDash([]);
  };
  cfg.series.forEach(s => {
    if (s.fill) {
      g.globalAlpha = .12; g.fillStyle = s.color; g.beginPath(); g.moveTo(X(0), Y(Math.max(lo, 0)));
      for (let i = 0; i < N; i++) g.lineTo(X(i), Y(s.data[i]));
      g.lineTo(X(N - 1), Y(Math.max(lo, 0))); g.closePath(); g.fill();
    }
    line(s, 0, N - 1, .3, 1.5);          // whole day, recessive
    line(s, 0, now, 1, 2);               // elapsed, solid
  });
  g.globalAlpha = 1;
  /* playhead */
  const xn = Math.round(X(now)) + .5;
  g.strokeStyle = C.accent; g.lineWidth = 1.2; g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(xn, pt); g.lineTo(xn, pt + ih); g.stroke(); g.setLineDash([]);
  cfg.series.forEach(s => {
    if (s.gapZero && !(s.data[now] > 0)) return;
    g.fillStyle = s.color; g.strokeStyle = '#0d1826'; g.lineWidth = 2;
    g.beginPath(); g.arc(xn, Y(s.data[now]), 4, 0, TAU); g.fill(); g.stroke();
  });
  /* hover crosshair */
  if (o.hover >= 0) {
    const xh = Math.round(X(o.hover)) + .5;
    g.strokeStyle = 'rgba(232,241,251,.45)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(xh, pt); g.lineTo(xh, pt + ih); g.stroke();
  }
}
function legend(id, series, extra) {
  const e = el(id); if (!e) return;
  e.innerHTML = series.map(s => '<span><i style="background:' + s.color + '"></i>' + t(s.k) + '</span>').join('')
    + (extra || '');
}

/* zone bar chart (grouped) */
function drawZoneBars() {
  const cv = el('cvZ1'); if (!cv) return;
  const size = getCanvasTargetSize(cv, 210);
  if (!size) return;
  const w = size.w, h = size.h;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const i = clamp(Math.floor(IDX), 0, N - 1);
  const pl = 44, pr = 44, pt = 14, pb = 26, iw = w - pl - pr, ih = h - pt - pb;
  const maxKW = 1400;
  g.strokeStyle = C.grid; g.fillStyle = C.ink3; g.font = '10px "Inter", "Google Sans", sans-serif';
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let k = 0; k <= 4; k++) {
    const y = Math.round(pt + ih - ih * k / 4) + .5;
    g.beginPath(); g.moveTo(pl, y); g.lineTo(pl + iw, y); g.stroke();
    g.fillText(nf(maxKW * k / 4), pl - 6, y);
    g.textAlign = 'left'; g.fillText(nf(100 * k / 4) + '%', pl + iw + 6, y); g.textAlign = 'right';
  }
  const bw = iw / 4;
  for (let z = 0; z < 4; z++) {
    const x0 = pl + z * bw;
    const kw = Z.kw[z][i], dmp = Z.dmp[z][i];
    const bh = ih * clamp(kw / maxKW, 0, 1);
    g.fillStyle = C.s1;
    roundRect(g, x0 + bw * .18, pt + ih - bh, bw * .30, bh, 4); g.fill();
    const dh = ih * dmp / 100;
    g.fillStyle = C.s6;
    roundRect(g, x0 + bw * .52, pt + ih - dh, bw * .30, dh, 4); g.fill();
    g.fillStyle = C.ink2; g.font = '11px "Google Sans", "Inter", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('Z' + (z + 1), x0 + bw / 2, pt + ih + 7);
    g.fillStyle = C.ink; g.font = '10px "Google Sans", "Inter", sans-serif';
    g.fillText(nf(kw), x0 + bw * .33, pt + ih - bh - 12);
    g.fillText(nf(dmp) + '%', x0 + bw * .67, pt + ih - dh - 12);
    g.textAlign = 'right'; g.textBaseline = 'middle';
  }
}
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.abs(h) / 2 || r);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/* =====================================================================
   7) RADIAL GAUGES
   ===================================================================== */
function gaugeHTML(id, kkey, unit) {
  return '<div class="g"><svg viewBox="0 0 100 82">' +
    '<path d="M24.5 75.5 A36 36 0 1 1 75.5 75.5" fill="none" stroke="#132840" stroke-width="9" stroke-linecap="round"/>' +
    '<path id="' + id + '_a" d="M24.5 75.5 A36 36 0 1 1 75.5 75.5" fill="none" stroke="' + C.accent +
    '" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>' +
    '<text id="' + id + '_v" x="50" y="52" text-anchor="middle" font-size="20" font-weight="700" fill="var(--ink)" ' +
    'font-family="Google Sans, Inter, sans-serif">–</text>' +
    '<text x="50" y="66" text-anchor="middle" font-size="10" fill="#5f7b99">' + unit + '</text>' +
    '</svg><div class="gk" data-gk="' + kkey + '">' + t(kkey) + '</div></div>';
}
function setGauge(id, v, lo, hi, dec, color) {
  const a = el(id + '_a'), x = el(id + '_v'); if (!a) return;
  const f = clamp((v - lo) / (hi - lo), 0, 1) * 100;
  a.setAttribute('stroke-dasharray', f.toFixed(1) + ' 100');
  a.setAttribute('stroke', color || C.accent);
  x.textContent = nf(v, dec);
}

/* =====================================================================
   8) PAGE BUILDERS  (static structure, built once)
   ===================================================================== */
let PAGE = 'p1', IDX = 0, SPEED = 1, PLAY = true, ZSEL = 0;

const G2 = [['gQ', 'RT'], ['gCOP', 'COP'], ['gKwrt', 'kW/RT'], ['gCHWS', '°C'], ['gDT', 'K'],
['gFlow', 'm³/h'], ['gCT', '%'], ['gAppr', 'K'], ['gWB', '°C'], ['gTES', '%']];
const G4 = [['gSoC', '%'], ['gPV', 'kW'], ['gGrid', 'kW'], ['gMar', '%']];

function buildStatic() {
  el('g2').innerHTML = G2.map(g => gaugeHTML(g[0], g[0], g[1])).join('');
  el('g4').innerHTML = G4.map(g => gaugeHTML(g[0], g[0], g[1])).join('');

  el('kpi1').innerHTML = ['kQ|RT', 'kNch|', 'kCHWS|°C', 'kDT|K', 'kFlow|m³/h', 'kCOP|', 'kTES|%', 'kDP|Pa']
    .map(s => {
      const [k, u] = s.split('|');
      return '<div class="kpi"><div class="k" data-gk="' + k + '">' + t(k) + '</div>' +
        '<div class="v num" id="K_' + k + '">–<small>' + u + '</small></div>' +
        '<div class="bar"><i id="KB_' + k + '" style="width:0%"></i></div></div>';
    }).join('');

  el('kpi4').innerHTML = ['kTotal|kW', 'kPV|kW', 'kGrid|kW', 'kSoC|kWh', 'kLim|kW', 'kShave|kW']
    .map(s => {
      const [k, u] = s.split('|');
      return '<div class="kpi"><div class="k" data-gk="' + k + '">' + t(k) + '</div>' +
        '<div class="v num" id="K_' + k + '">–<small>' + u + '</small></div>' +
        '<div class="sub num" id="KS_' + k + '"></div></div>';
    }).join('');

  /* chiller table with interactive controls */
  let h = '<tr><th data-gk="hEq">' + t('hEq') + '</th><th data-gk="hStat">' + t('hStat') +
    '</th><th data-gk="hLoad">' + t('hLoad') + '</th><th class="n" data-gk="hkW">' + t('hkW') +
    '</th><th style="text-align:right" data-gk="hAction">' + t('hAction') + '</th></tr>';
  for (let k = 1; k <= 6; k++)
    h += '<tr><td>CH-0' + k + '<span class="tagchip">CH2000</span></td>' +
      '<td><span class="dot d-stby" id="chD' + k + '"></span><span id="chS' + k + '">–</span></td>' +
      '<td><div class="mini"><i id="chM' + k + '" style="width:0%"></i></div></td>' +
      '<td class="n num" id="chK' + k + '">–</td>' +
      '<td style="text-align:right"><div class="eq-actions" style="justify-content:flex-end">' +
      '<button class="btn-eq-ctrl btn-ch-toggle" data-ch="' + k + '" id="btnCh' + k + '">' + iconSvg('zap', { width: 12, height: 12 }) + ' <span>ON/OFF</span></button>' +
      '</div></td></tr>';
  el('tbCh').innerHTML = h;

  /* aux table with interactive controls */
  const aux = [['CHP-01…06', 'CP2000', 'auxA', 'chp'], ['CWP-01…06', 'C2000', 'auxB', 'cwp'], ['CT-01…06', 'C2000', 'auxC', 'ct']];
  h = '<tr><th data-gk="hEq">' + t('hEq') + '</th><th data-gk="hSpd">' + t('hSpd') +
    '</th><th class="n" data-gk="hkW">' + t('hkW') + '</th><th class="n" data-gk="hVal">' + t('hVal') +
    '</th><th style="text-align:right" data-gk="hAction">' + t('hAction') + '</th></tr>';
  aux.forEach(a => h += '<tr><td>' + a[0] + '<span class="tagchip">' + a[1] + '</span></td>' +
    '<td class="num" id="' + a[2] + 'S">–</td><td class="n num" id="' + a[2] + 'K">–</td>' +
    '<td class="n num" id="' + a[2] + 'V">–</td>' +
    '<td style="text-align:right"><button class="btn-eq-ctrl btn-aux-toggle" data-type="' + a[3] + '" id="btnAux_' + a[3] + '">' + iconSvg('zap', { width: 12, height: 12 }) + ' <span>' + t('btnTogglePump') + '</span></button></td></tr>');
  ['eCDWS|cdwsR', 'eCHWR|chwrR', 'eWB|wbR'].forEach(s => {
    const [k, id] = s.split('|');
    h += '<tr><td colspan="4" data-gk="' + k + '">' + t(k) + '</td><td class="n num" id="' + id + '">–</td></tr>';
  });
  el('tbAux').innerHTML = h;

  /* breakdown with control buttons */
  const brkItems = [
    { k: 'eChiller', c: C.s1, type: 'chiller', label: 'Chillers' },
    { k: 'eCHWP', c: C.s3, type: 'chp', label: 'CHW pumps' },
    { k: 'eCDWP', c: C.s4, type: 'cwp', label: 'Condenser pumps' },
    { k: 'eCTF', c: C.s2, type: 'ct', label: 'CT fans' },
    { k: 'eCRAH', c: C.s5, type: 'crah', label: 'CRAH fans' }
  ];
  el('brk').innerHTML = brkItems.map(item => {
    return '<div style="margin-bottom:11px">' +
      '<div class="brk-header">' +
      '<span data-gk="' + item.k + '" style="color:var(--ink2);font-weight:600">' + t(item.k) + '</span>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<b class="num" id="BR_' + item.k + '">–</b>' +
      '<div class="brk-ctrl-btns">' +
      (item.type === 'chiller' ?
        '<button class="btn-eq-ctrl btn-brk-action" data-act="add-ch" title="Add Chiller Staging">' + iconSvg('plus') + '</button>' +
        '<button class="btn-eq-ctrl btn-brk-action" data-act="sub-ch" title="Reduce Chiller Staging">' + iconSvg('minus') + '</button>' :
        '<button class="btn-eq-ctrl btn-brk-action" data-act="toggle-' + item.type + '">' + iconSvg('zap') + '</button>') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="bar"><i id="BRB_' + item.k + '" style="width:0%;background:' + item.c + '"></i></div>' +
      '</div>';
  }).join('');

  /* zone cards */
  el('zoneCards').innerHTML = [1, 2, 3, 4].map(z =>
    '<div class="zc" id="zc' + z + '"><h4><span class="dot d-run" id="zLed' + z + '"></span>ZONE Z' + z +
    '<span class="tagchip">CRAH-Z' + z + '</span><span class="r badge b-ok" id="zB' + z + '">OK</span></h4>' +
    ['zLoad|zL', 'zInlet|zT', 'zRet|zR', 'zDmp|zD', 'zFan|zF', 'zVlv|zV', 'zAir|zA'].map(s => {
      const [k, id] = s.split('|');
      return '<div class="zrow"><span data-gk="' + k + '">' + t(k) + '</span><b class="num" id="' + id + z + '">–</b></div>';
    }).join('') + '</div>').join('');

  /* CRAH table with interactive controls */
  h = '<tr><th data-gk="hEq">' + t('hEq') + '</th><th data-gk="zFan">' + t('zFan') + '</th>' +
    '<th data-gk="zVlv">' + t('zVlv') + '</th><th class="n" data-gk="zAir">' + t('zAir') + '</th>' +
    '<th class="n" data-gk="hkW">' + t('hkW') + '</th><th style="text-align:right" data-gk="hAction">' + t('hAction') + '</th></tr>';
  for (let z = 1; z <= 4; z++)
    h += '<tr><td><span class="dot d-run" id="cDot' + z + '"></span>CRAH-Z' + z + '</td><td class="num" id="cF' + z + '">–</td>' +
      '<td class="num" id="cV' + z + '">–</td><td class="n num" id="cA' + z + '">–</td>' +
      '<td class="n num" id="cK' + z + '">–</td>' +
      '<td style="text-align:right"><button class="btn-eq-ctrl btn-crah-toggle" data-zone="' + z + '" id="btnCrah' + z + '">' + iconSvg('zap', { width: 11, height: 11 }) + ' ON/OFF</button></td></tr>';
  el('tbCrah').innerHTML = h;

  /* energy + summary tables */
  el('tbEn').innerHTML = ['sIT|EN_it', 'sCool|EN_cool', 'sTot|EN_tot', 'sPV|EN_pv', 'sGrid|EN_grid', 'sPUE|EN_pue']
    .map(s => {
      const [k, id] = s.split('|');
      return '<tr><td data-gk="' + k + '">' + t(k) + '</td><td class="n num" id="' + id + '">–</td></tr>';
    }).join('');
  el('tbSum').innerHTML = ['sPeak|SM_pk', 'sPeakT|SM_pkt', 'sKwrt|SM_kwrt', 'sRT|SM_rt', 'sMAE|SM_mae', 'sHrs|SM_sh']
    .map(s => {
      const [k, id] = s.split('|');
      return '<tr><td data-gk="' + k + '">' + t(k) + '</td><td class="n num" id="' + id + '">–</td></tr>';
    }).join('');

  /* power flow */
  el('pflow').innerHTML = ['ePV|PF_pv|' + C.s4, 'eGrid|PF_grid|' + C.s1, 'eDis|PF_dis|' + C.s5,
  'eChg|PF_chg|' + C.s3, 'eIT|PF_it|' + C.s6, 'eCool|PF_cool|' + C.s2]
    .map(s => {
      const [k, id, c] = s.split('|');
      return '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12.5px">' +
        '<span data-gk="' + k + '" style="color:var(--ink2)">' + t(k) + '</span><b class="num" id="' + id + '">–</b></div>' +
        '<div class="bar"><i id="' + id + 'B" style="width:0%;background:' + c + '"></i></div></div>';
    }).join('');
}

/* =====================================================================
   9) CHART DEFINITIONS
   ===================================================================== */
function buildCharts() {
  const S = (k, color, data, opt) => Object.assign({ k, color, data }, opt || {});
  const defs = [
    ['cvOv1', 'p1', {
      unit: 'kW', zero: true, series: [
        S('eIT', C.s1, DAY.it), S('eCool', C.s2, DAY.cool), S('eTot', C.s3, D.tot)]
    }],
    ['cvOv2', 'p1', {
      unit: '', yd: 2, series: [
        S('ePUE', C.s1, D.pue, { d: 3 }), S('eKwrt', C.s2, D.kwrt, { d: 2 })]
    }],
    ['cvCh1', 'p2', {
      unit: '°C', yd: 1, series: [
        S('eCHWS', C.s1, D.chws, { d: 1 }), S('eCHWR', C.s2, D.chwr, { d: 1 }),
        S('eCDWS', C.s3, D.cdws, { d: 1 }), S('eWB', C.s4, D.wb, { d: 1 })]
    }],
    ['cvCh2', 'p2', {
      unit: 'kW', zero: true, series: [
        S('eChiller', C.s1, D.chKW), S('eCRAH', C.s2, D.crahKW), S('eCHWP', C.s3, D.chwpKW),
        S('eCTF', C.s4, D.ctKW), S('eCDWP', C.s5, D.cdwpKW)]
    }],
    ['cvZ2', 'p3', {
      unit: '°C', yd: 1, yMin: 18, yMax: 29,
      bands: [{ lo: 18, hi: 27, c: 'rgba(34,197,94,.07)' }], series: [
        S('z1', C.s1, Z.t[0], { d: 1 }), S('z2', C.s2, Z.t[1], { d: 1 }),
        S('z3', C.s3, Z.t[2], { d: 1 }), S('z4', C.s4, Z.t[3], { d: 1 })]
    }],
    ['cvP1', 'p4', {
      unit: 'kW', zero: true, series: [
        S('eIT', C.s1, DAY.it), S('eTot', C.s2, D.tot), S('eGrid', C.s3, DAY.grid),
        S('eLim', C.s4, DAY.lim, { dash: [6, 5], gapZero: true })]
    }],
    ['cvP2', 'p4', {
      unit: 'kW', zero: true, series: [
        S('ePV', C.s1, DAY.pv, { fill: true, d: 1 }), S('ePV2L', C.s2, DAY.pv2l, { d: 1 }),
        S('eChg', C.s3, DAY.pv2e, { d: 1 }), S('eDis', C.s4, DAY.esd, { d: 1 })]
    }],
    ['cvSoc', 'p4', { unit: 'kWh', zero: true, series: [S('eSoC', C.s1, DAY.soc)] }],
    ['cvT1', 'p5', {
      unit: 'kW', zero: true, series: [
        S('eAct', C.s1, DAY.cool), S('ePred', C.s2, DAY.pcool, { dash: [5, 4] })]
    }],
    ['cvT2', 'p5', {
      unit: 'RT', series: [
        S('eRT', C.s1, D.rt), S('eCap', C.s2, D.capRT, { step: true })]
    }]
  ];
  defs.forEach(d => { const o = chart(d[0], d[2]); if (o) o.cfg.page = d[1]; });
  ['z1', 'z2', 'z3', 'z4'].forEach((k, i) => { T.en[k] = 'Zone Z' + (i + 1); T.th[k] = 'โซน Z' + (i + 1); });
  refreshLegends();
}
function refreshLegends() {
  const map = {
    cvOv1: 'lgOv1', cvOv2: 'lgOv2', cvCh1: 'lgCh1', cvCh2: 'lgCh2',
    cvZ2: 'lgZ2', cvP1: 'lgP1', cvP2: 'lgP2', cvT1: 'lgT1', cvT2: 'lgT2'
  };
  CHARTS.forEach(c => { const lid = map[c.cv.id]; if (lid) legend(lid, c.cfg.series); });
  legend('lgZ1', [{ k: 'eZkw', color: C.s1 }, { k: 'eDmp', color: C.s2 }]);
}

/* =====================================================================
   10) LIVE RENDERING
   ===================================================================== */
function renderTop(i) {
  el('tTotal').innerHTML = nf(D.tot[i]) + '<small>kW</small>';
  el('tIT').innerHTML = nf(DAY.it[i]) + '<small>kW</small>';
  el('tCool').innerHTML = nf(DAY.cool[i]) + '<small>kW</small>';
  el('tPUE').innerHTML = nf(D.pue[i], 3);
  el('tKwrt').innerHTML = nf(D.kwrt[i], 2) + '<small>kW/RT</small>';
  el('tAmb').innerHTML = nf(D.amb[i], 1) + '<small>°C</small>';
  setTxt('tClock', hhmmss(IDX));
  setTxt('tDate', DATE);
  const m = DAY.mode[i];
  const mb = el('tMode');
  mb.className = 'badge ' + (m === 1 ? 'b-warn' : m === 0 ? 'b-info' : 'b-pv');
  mb.innerHTML = '<i></i>' + t('m' + m);
  const na = activeAlarms(i);
  const ab = el('tAlm');
  ab.className = 'badge ' + (na > 2 ? 'b-alm' : na > 0 ? 'b-warn' : 'b-ok');
  ab.innerHTML = '<i></i>' + na;
  el('seek').value = i; setTxt('seekLbl', hhmm(i));
}

function renderMimic(i) {
  const sv = q => el(q);
  sv('mCTfan').textContent = nf(D.ctFan[i]) + ' %';
  sv('mWB').textContent = nf(D.wb[i], 1) + ' °C';
  sv('mAmb').textContent = nf(D.amb[i], 1) + ' °C / ' + nf(D.rh[i]) + ' %';
  sv('mChKW').textContent = nf(D.chKW[i]) + ' kW · ' + D.nch[i] + '/6 ' + t('sRun');
  sv('mKWRT').textContent = nf(D.kwrt[i], 2) + ' kW/RT';
  sv('mCHWS').textContent = nf(D.chws[i], 1) + ' °C';
  sv('mCHWR').textContent = nf(D.chwr[i], 1) + ' °C';
  sv('mDT').textContent = nf(D.dt[i], 1) + ' K';
  sv('mFlow').textContent = nf(D.flow[i]) + ' m³/h';
  sv('mTot').textContent = nf(D.tot[i]) + ' kW';
  sv('mPUE').textContent = 'PUE ' + nf(D.pue[i], 3);
  const n = D.nch[i];
  for (let k = 1; k <= 6; k++) {
    const run = k <= n;
    el('chLed' + k).setAttribute('fill', run ? C.ok : '#4a5f77');
    el('chLed' + k).setAttribute('opacity', run ? '1' : '.6');
    el('chBox' + k).setAttribute('stroke', run ? '#3d86ad' : '#24425e');
    el('chPct' + k).textContent = run ? nf(D.chLoad[i]) + '%' : '—';
  }
  const tesPct = D.tes[i];
  const full = 150, hgt = full * tesPct;
  el('tesFill').setAttribute('y', (300 + full - hgt).toFixed(1));
  el('tesFill').setAttribute('height', hgt.toFixed(1));
  el('mTES').textContent = nf(tesPct * 100) + '%';
  for (let z = 0; z < 4; z++) {
    el('mZkw' + (z + 1)).textContent = nf(Z.kw[z][i]) + ' kW';
    const zt = Z.t[z][i];
    const e = el('mZt' + (z + 1));
    e.textContent = nf(zt, 1) + ' °C';
    e.setAttribute('fill', zt > 26.5 ? C.alm : zt > 25.5 ? C.warn : '#7dd3fc');
    el('mDmp' + (z + 1)).textContent = nf(Z.dmp[z][i]) + '%';
    el('mVlv' + (z + 1)).textContent = nf(Z.vlv[z][i]) + '%';
    const bl = el('dmpBlade' + (z + 1));
    const ang = 90 - Z.dmp[z][i] * 0.9;
    bl.setAttribute('transform', bl.getAttribute('transform').replace(/rotate\([^ ]+/, 'rotate(' + ang.toFixed(1)));
  }
}

function renderP1(i) {
  const set = (k, v, d, pct) => {
    const e = el('K_' + k); if (!e) return;
    const sm = e.querySelector('small');
    e.textContent = nf(v, d); if (sm) e.appendChild(sm);
    const b = el('KB_' + k); if (b) b.style.width = clamp(pct, 0, 100) + '%';
  };
  set('kQ', D.rt[i], 0, D.rt[i] / 3250 * 100);
  set('kNch', D.nch[i], 0, D.nch[i] / 5 * 100);
  set('kCHWS', D.chws[i], 1, (D.chws[i] - 5) / 5 * 100);
  set('kDT', D.dt[i], 1, D.dt[i] / 8 * 100);
  set('kFlow', D.flow[i], 0, D.flow[i] / 1400 * 100);
  set('kCOP', D.cop[i], 2, D.cop[i] / 6 * 100);
  set('kTES', D.tes[i] * 100, 0, D.tes[i] * 100);
  set('kDP', D.dp[i], 0, D.dp[i] / 40 * 100);
  renderMimic(i);
  el('r1a').textContent = hhmm(i) + ' · ' + nf(D.tot[i]) + ' kW';
}

function renderP2(i) {
  setGauge('gQ', D.rt[i], 0, 3250, 0, C.s1);
  setGauge('gCOP', D.cop[i], 0, 6, 2, D.cop[i] < 3 ? C.warn : C.ok);
  setGauge('gKwrt', D.kwrt[i], 0, 2.6, 2, D.kwrt[i] > 2.05 ? C.warn : C.accent);
  setGauge('gCHWS', D.chws[i], 4, 12, 1, C.cold);
  setGauge('gDT', D.dt[i], 0, 8, 1, C.accent);
  setGauge('gFlow', D.flow[i], 0, 1400, 0, C.cold);
  setGauge('gCT', D.ctFan[i], 0, 100, 0, D.ctFan[i] > 96 ? C.warn : C.cond);
  setGauge('gAppr', D.appr[i], 0, 7, 1, C.cond);
  setGauge('gWB', D.wb[i], 15, 32, 1, C.s4);
  setGauge('gTES', D.tes[i] * 100, 0, 100, 0, C.s6);
  const n = D.nch[i], per = D.chKW[i] / n;
  for (let k = 1; k <= 6; k++) {
    const run = k <= n, stby = k === 6;
    el('chD' + k).className = 'dot ' + (run ? 'd-run' : stby ? 'd-stby' : 'd-stby');
    setTxt('chS' + k, run ? t('sRun') : t(stby ? 'sStby' : 'sOff'));
    el('chM' + k).style.width = (run ? D.chLoad[i] : 0) + '%';
    el('chM' + k).style.background = D.chLoad[i] > 90 ? C.warn : C.s1;
    setTxt('chK' + k, run ? nf(per) + ' kW' : '—');
  }
  setTxt('auxAS', nf(D.chwSpd[i]) + ' %'); setTxt('auxAK', nf(D.chwpKW[i]) + ' kW');
  setTxt('auxAV', nf(D.flow[i]) + ' m³/h');
  setTxt('auxBS', nf(D.cdwSpd[i]) + ' %'); setTxt('auxBK', nf(D.cdwpKW[i]) + ' kW');
  setTxt('auxBV', nf(D.cdwr[i], 1) + ' °C');
  setTxt('auxCS', nf(D.ctFan[i]) + ' %'); setTxt('auxCK', nf(D.ctKW[i]) + ' kW');
  setTxt('auxCV', nf(D.appr[i], 1) + ' K');
  setTxt('cdwsR', nf(D.cdws[i], 1) + ' °C');
  setTxt('chwrR', nf(D.chwr[i], 1) + ' °C');
  setTxt('wbR', nf(D.wb[i], 1) + ' °C');
  const tot = DAY.cool[i];
  const brk = [['eChiller', D.chKW[i]], ['eCHWP', D.chwpKW[i]], ['eCDWP', D.cdwpKW[i]],
  ['eCTF', D.ctKW[i]], ['eCRAH', D.crahKW[i]]];
  brk.forEach(b => {
    setTxt('BR_' + b[0], nf(b[1]) + ' kW · ' + nf(b[1] / tot * 100) + '%');
    el('BRB_' + b[0]).style.width = (b[1] / tot * 100) + '%';
  });
  el('r2a').textContent = D.nch[i] + ' / 5 ' + t('sRun') + ' · ' + nf(D.chLoad[i]) + '%';
  el('r2c').textContent = nf(tot) + ' kW';
}

function renderP3(i) {
  for (let z = 1; z <= 4; z++) {
    const k = z - 1;
    setTxt('zL' + z, nf(Z.kw[k][i]) + ' kW');
    setTxt('zT' + z, nf(Z.t[k][i], 1) + ' °C');
    setTxt('zR' + z, nf(Z.t[k][i] + CFG.dtAir, 1) + ' °C');
    setTxt('zD' + z, nf(Z.dmp[k][i]) + ' %');
    setTxt('zF' + z, nf(Z.fan[k][i]) + ' %');
    setTxt('zV' + z, nf(Z.vlv[k][i]) + ' %');
    setTxt('zA' + z, nf(Z.flow[k][i]) + ' m³/h');
    const tv = Z.t[k][i];
    const b = el('zB' + z);
    b.className = 'r badge ' + (tv > 26.5 ? 'b-alm' : tv > 25.5 ? 'b-warn' : 'b-ok');
    b.textContent = tv > 26.5 ? 'HIGH' : tv > 25.5 ? 'WARN' : 'OK';
    setTxt('cF' + z, nf(Z.fan[k][i]) + ' %');
    setTxt('cV' + z, nf(Z.vlv[k][i]) + ' %');
    setTxt('cA' + z, nf(Z.flow[k][i]));
    setTxt('cK' + z, nf(D.crahKW[i] * Z.fan[k][i] / (Z.fan[0][i] + Z.fan[1][i] + Z.fan[2][i] + Z.fan[3][i])) + ' kW');
  }
  drawZoneBars();
}

function renderP4(i) {
  const setk = (k, v, d, sub) => {
    const e = el('K_' + k); if (!e) return;
    const sm = e.querySelector('small');
    e.textContent = nf(v, d); if (sm) e.appendChild(sm);
    const s = el('KS_' + k); if (s) s.textContent = sub || '';
  };
  const lim = DAY.lim[i];
  setk('kTotal', D.tot[i], 0, t('m' + DAY.mode[i]));
  setk('kPV', DAY.pv[i], 0, '→ ' + t('eIT') + ' ' + nf(DAY.pv2l[i]) + ' kW');
  setk('kGrid', DAY.grid[i], 0, nf(DAY.grid[i] / D.tot[i] * 100) + '% ' + t('eTot'));
  setk('kSoC', DAY.soc[i], 0, nf(DAY.soc[i] / 750 * 100) + '%');
  setk('kLim', lim || 0, 0, lim ? nf(lim - DAY.grid[i]) + ' kW ' + t('gMar') : '—');
  const shaved = Math.max(0, D.tot[i] - DAY.grid[i]);
  setk('kShave', shaved, 0, DAY.esd[i] > 0 ? t('eDis') + ' ' + nf(DAY.esd[i]) + ' kW' : t('ePV2L'));
  setGauge('gSoC', DAY.soc[i] / 750 * 100, 0, 100, 0, DAY.soc[i] > 740 ? C.warn : C.s6);
  setGauge('gPV', DAY.pv[i], 0, 800, 0, C.s4);
  setGauge('gGrid', DAY.grid[i], 0, 7500, 0, C.s1);
  setGauge('gMar', lim ? clamp((lim - DAY.grid[i]) / lim * 100, 0, 100) : 100, 0, 100, 1, C.ok);
  setTxt('EN_it', nf(CUM.it[i] / 1000, 2) + ' MWh');
  setTxt('EN_cool', nf(CUM.cool[i] / 1000, 2) + ' MWh');
  setTxt('EN_tot', nf(CUM.tot[i] / 1000, 2) + ' MWh');
  setTxt('EN_pv', nf(CUM.pv[i] / 1000, 3) + ' MWh');
  setTxt('EN_grid', nf(CUM.grid[i] / 1000, 2) + ' MWh');
  setTxt('EN_pue', nf(CUM.tot[i] / CUM.it[i], 3));
  const mx = Math.max(DAY.pv[i], DAY.grid[i], DAY.it[i], DAY.cool[i], 1);
  const pf = [['PF_pv', DAY.pv[i]], ['PF_grid', DAY.grid[i]], ['PF_dis', DAY.esd[i]],
  ['PF_chg', DAY.pv2e[i]], ['PF_it', DAY.it[i]], ['PF_cool', DAY.cool[i]]];
  pf.forEach(p => { setTxt(p[0], nf(p[1]) + ' kW'); el(p[0] + 'B').style.width = (p[1] / mx * 100) + '%'; });
}

let almShown = -1;
function renderP5(i) {
  setTxt('SM_pk', nf(CUM.peak[i]) + ' kW');
  setTxt('SM_pkt', hhmm(CUM.peakAt[i]));
  let s = 0; for (let k = 0; k <= i; k++) s += D.kwrt[k];
  setTxt('SM_kwrt', nf(s / (i + 1), 2) + ' kW/RT');
  let r = 0; for (let k = 0; k <= i; k++) if (D.rt[k] > r) r = D.rt[k];
  setTxt('SM_rt', nf(r) + ' RT');
  setTxt('SM_mae', nf(CUM.mae[i], 1) + ' kW');
  setTxt('SM_sh', CUM.shave[i] + ' min');
  const list = ALARMS.filter(a => a.i <= i);
  if (list.length !== almShown) {
    almShown = list.length;
    el('almList').innerHTML = list.slice(-70).reverse().map(a =>
      '<div class="alm-row"><div class="num">' + hhmm(a.i) + '</div>' +
      '<div class="sev sev-' + a.sev + '">' + (a.sev === 'alm' ? 'ALARM' : a.sev === 'warn' ? 'WARNING' : 'EVENT') + '</div>' +
      '<div>' + t(a.key) + '</div><div class="num" style="color:var(--ink3);font-size:11px">' + a.tag + '</div></div>').join('');
  }
  el('r5c').textContent = list.length + ' events';
}

const RENDER = { p1: renderP1, p2: renderP2, p3: renderP3, p4: renderP4, p5: renderP5 };
let lastChartDraw = -99;
function render(force) {
  const i = clamp(Math.floor(IDX), 0, N - 1);
  renderTop(i);
  (RENDER[PAGE] || (() => { }))(i);
  if (force || Math.abs(i - lastChartDraw) >= 1) {
    lastChartDraw = i;
    CHARTS.forEach(c => { if (c.cfg.page === PAGE) drawChart(c); });
    if (PAGE === 'p3') drawZoneBars();
  }
  if (CURRENT_FS_CHART_ID && FS_CHART_OBJ) {
    drawFsChart();
    updateFsInfo(FS_CHART_OBJ);
  }
}

/* =====================================================================
   11) PLAYBACK + INTERACTION
   ===================================================================== */
let last = 0;
function loop(ts) {
  if (!last) last = ts;
  const dt = Math.min(200, ts - last) / 1000; last = ts;
  if (PLAY) { IDX += SPEED * dt; if (IDX >= N) IDX -= N; render(); }
  requestAnimationFrame(loop);
}
function applyLang() {
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach(e => { const k = e.dataset.i18n; if (T[LANG][k]) e.textContent = T[LANG][k]; });
  $$('[data-gk]').forEach(e => { const k = e.dataset.gk; if (T[LANG][k]) e.textContent = T[LANG][k]; });
  el('btnPlay').innerHTML = iconSvg(PLAY ? 'pause' : 'play', { width: 13, height: 13 }) + '<span>' + t(PLAY ? 'pause' : 'play') + '</span>';
  if (el('inpUser')) el('inpUser').placeholder = LANG === 'th' ? 'เช่น admin หรือ operator' : 'e.g. admin or operator';
  if (el('inpPass')) el('inpPass').placeholder = LANG === 'th' ? 'เช่น admin123' : 'e.g. admin123';
  if (el('btnSetLangTh')) el('btnSetLangTh').classList.toggle('active', LANG === 'th');
  if (el('btnSetLangEn')) el('btnSetLangEn').classList.toggle('active', LANG === 'en');
  if (el('currentLangBadge')) el('currentLangBadge').textContent = LANG === 'th' ? 'ไทย (TH)' : 'English (EN)';
  updateAuthDisplay();
  refreshLegends();
  render(true);
}

/* =====================================================================
   11) ROLE-BASED ACCESS CONTROL (RBAC) & SYSTEM EVENTS AUDIT LOG
   ===================================================================== */
const VALID_USERS = {
  'admin': {
    pass: 'admin123',
    pin: '1234',
    roleEn: 'System Administrator',
    roleTh: 'ผู้ดูแลระบบสูงสุด',
    avatar: 'crown',
    color: '#ef4444',
    allowedTabs: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    canControlEquipment: true,
    canOverrideSetpoints: true,
    canControlPlayback: true,
    canClearLogs: true,
    descTh: 'สิทธิ์สูงสุด: เข้าถึงทุกหน้า ควบคุมเปิด-ปิดอุปกรณ์ทุกชนิด และจัดการบันทึกระบบได้',
    descEn: 'Full privileges: Full access, full equipment control, adjust power limits & logs.'
  },
  'operator': {
    pass: 'operator123',
    pin: '1234',
    roleEn: 'Plant Operator',
    roleTh: 'ผู้ควบคุมระบบชิลเลอร์',
    avatar: 'settings',
    color: '#22d3ee',
    allowedTabs: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    canControlEquipment: true,
    canOverrideSetpoints: false,
    canControlPlayback: true,
    canClearLogs: false,
    descTh: 'สิทธิ์ผู้ควบคุม: เข้าถึงทุกหน้า ควบคุมเปิด-ปิดชิลเลอร์ ปั๊ม พัดลม CRAH ได้',
    descEn: 'Operational access: Full monitoring and manual control of cooling equipment.'
  },
  'engineer': {
    pass: 'engineer123',
    pin: '1234',
    roleEn: 'HVAC Engineer',
    roleTh: 'วิศวกรระบบปรับอากาศ',
    avatar: 'wrench',
    color: '#3b82f6',
    allowedTabs: ['p1', 'p2', 'p3', 'p5', 'p6'], // Restricted from grid financial/admin limits on p4
    canControlEquipment: true,
    canOverrideSetpoints: true,
    canControlPlayback: true,
    canClearLogs: false,
    descTh: 'สิทธิ์วิศวกร: วินิจฉัยและควบคุมระบบทำความเย็น ชิลเลอร์ CRAH (จำกัดการตั้งค่ากริดหลัก)',
    descEn: 'Engineering access: HVAC diagnostics and equipment overrides.'
  },
  'viewer': {
    pass: 'viewer123',
    pin: '1234',
    roleEn: 'Guest / Viewer',
    roleTh: 'ผู้สังเกตการณ์ทั่วไป',
    avatar: 'eye',
    color: '#10b981',
    allowedTabs: ['p1', 'p5', 'p6'], // Read-only view
    canControlEquipment: false,
    canOverrideSetpoints: false,
    canControlPlayback: false,
    canClearLogs: false,
    descTh: 'สิทธิ์ดูข้อมูลเท่านั้น: เข้าดูหน้าภาพรวมและกราฟเทรนด์ได้ ไม่สามารถกดปุ่มสั่งการใดๆ',
    descEn: 'Read-only access: View overview and trends, all control toggles locked.'
  }
};

let CURRENT_USER = null;
let AUDIT_FILTER = 'ALL';
const AUDIT_LOGS = [];
let AUDIT_EXPANDED = false;

/* Equipment manual override state */
const EQ_STATE = {
  chillers: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
  chp: null,
  cwp: null,
  ct: null,
  crah: { 1: null, 2: null, 3: null, 4: null }
};

/* Floating Toast Helper */
function showToast(msg, type = 'warn') {
  const box = el('toastBox');
  if (!box) return;
  const item = document.createElement('div');
  item.className = 'toast-item ' + type;
  const icon = type === 'error' ? 'circle-x' : (type === 'success' ? 'circle-check' : 'triangle-alert');
  item.innerHTML = iconSvg(icon) + '<span>' + msg + '</span>';
  box.appendChild(item);
  setTimeout(() => { if (item.parentNode) item.parentNode.removeChild(item); }, 4000);
}

/* System Events Audit Log Logger */
function addAuditLog(category, message, level = 'cmd') {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const u = CURRENT_USER ? CURRENT_USER.username : 'system';
  const roleData = CURRENT_USER ? VALID_USERS[CURRENT_USER.username] : null;
  const roleName = roleData ? (LANG === 'th' ? roleData.roleTh : roleData.roleEn) : 'System';

  const logEntry = {
    id: Date.now() + Math.random(),
    time: timeStr,
    category: category, // 'CMD', 'SEC', 'SYS', 'ALM'
    message: message,
    user: u,
    role: roleName,
    level: level
  };

  AUDIT_LOGS.unshift(logEntry);
  if (AUDIT_LOGS.length > 250) AUDIT_LOGS.pop();

  if (el('auditTicker')) {
    el('auditTicker').textContent = '[' + timeStr + '] ' + category + ': ' + message;
  }
  if (el('auditCount')) {
    el('auditCount').textContent = AUDIT_LOGS.length + (LANG === 'th' ? ' รายการ' : ' Events');
  }

  renderAuditLogs();
}

function renderAuditLogs() {
  const list = el('auditList');
  if (!list) return;
  const filtered = AUDIT_FILTER === 'ALL' ? AUDIT_LOGS : AUDIT_LOGS.filter(l => l.category === AUDIT_FILTER);

  if (filtered.length === 0) {
    list.innerHTML = '<div style="color:var(--ink3);text-align:center;padding:20px 0;">– ' +
      (LANG === 'th' ? 'ไม่มีบันทึกเหตุการณ์ในหมวดนี้' : 'No audit events in this category') + ' –</div>';
    return;
  }

  list.innerHTML = filtered.map(l => {
    let tagClass = 'tag-cmd';
    if (l.category === 'SEC') tagClass = 'tag-sec';
    else if (l.category === 'SYS') tagClass = 'tag-sys';
    else if (l.category === 'ALM') tagClass = 'tag-alm';

    const iconName = { CMD: 'zap', SEC: 'shield', SYS: 'settings', ALM: 'triangle-alert' }[l.category] || 'info';
    return '<div class="audit-row">' +
      iconSvg(iconName, { width: 13, height: 13, style: 'flex:none;margin-top:1px;' }) +
      '<span class="audit-time">[' + l.time + ']</span>' +
      '<span class="audit-tag ' + tagClass + '">[' + l.category + ']</span>' +
      '<span class="audit-msg">' + l.message + '</span>' +
      '</div>';
  }).join('');
}

function toggleAuditDock() {
  AUDIT_EXPANDED = !AUDIT_EXPANDED;
  const dock = el('auditDock');
  const body = el('auditBody');
  const btn = el('btnAuditToggle');
  if (!dock || !body) return;

  if (AUDIT_EXPANDED) {
    body.style.display = 'flex';
    dock.classList.remove('collapsed');
    if (btn) btn.innerHTML = iconSvg('chevron-down', { width: 11, height: 11 }) + ' <span data-i18n="auditCollapse">' + t('auditCollapse') + '</span>';
  } else {
    body.style.display = 'none';
    dock.classList.add('collapsed');
    if (btn) btn.innerHTML = iconSvg('chevron-up', { width: 11, height: 11 }) + ' <span data-i18n="auditExpand">' + t('auditExpand') + '</span>';
  }
}

/* Equipment Interactive Control & Override Engine */
function checkUserPermission(actionName = 'Control') {
  if (!CURRENT_USER) return false;
  const role = VALID_USERS[CURRENT_USER.username];
  if (!role || !role.canControlEquipment) {
    const msg = LANG === 'th' ?
      'การทำงานถูกระงับ: บัญชี Viewer มีสิทธิ์เฉพาะดูข้อมูลเท่านั้น (Read-Only)' :
      'Action Blocked: Viewer role has Read-Only access';
    showToast(msg, 'error');
    addAuditLog('SEC', 'Unauthorized operation blocked for ' + CURRENT_USER.username + ' (Guest/Viewer): [' + actionName + ']', 'sec');
    return false;
  }
  return true;
}


/* =====================================================================
   11.5) TWO-STEP COMMAND INTERLOCK (Select-Before-Operate)
   ===================================================================== */
let PENDING_CMD = null;

function requestTwoStepCommand(config) {
  if (!checkUserPermission(config.targetName + ' ' + config.actionLabel)) return;

  PENDING_CMD = config;
  const modal = el('cmdModal');
  const card = el('cmdCard');
  const alertEl = el('cmdAlert');
  const inpPin = el('inpCmdPin');

  if (el('cmdTargetIcon')) el('cmdTargetIcon').innerHTML = iconSvg(config.icon || 'zap', { width: 22, height: 22 });
  if (el('cmdTargetName')) el('cmdTargetName').textContent = config.targetName || 'Equipment Unit';
  if (el('cmdTargetAction')) el('cmdTargetAction').innerHTML = iconSvg(config.actionIcon || config.icon || 'zap', { width: 13, height: 13 }) + ' ' + (LANG === 'th' ? 'คำสั่ง: ' : 'Command: ') + (config.actionLabel || 'EXECUTE');
  if (el('cmdOperatorName')) el('cmdOperatorName').textContent = CURRENT_USER ? CURRENT_USER.username : '–';
  if (el('cmdOperatorRole')) {
    const uName = CURRENT_USER ? CURRENT_USER.username.toLowerCase() : '';
    const roleConf = CURRENT_USER ? (VALID_USERS[uName] || VALID_USERS[CURRENT_USER.username]) : null;
    el('cmdOperatorRole').textContent = roleConf ? (LANG === 'th' ? roleConf.roleTh : roleConf.roleEn) : '';
  }

  if (alertEl) alertEl.style.display = 'none';
  if (inpPin) {
    inpPin.value = '';
    inpPin.type = 'password';
  }

  if (modal) modal.style.display = 'flex';
  setTimeout(() => { if (inpPin) inpPin.focus(); }, 80);
}

function closeTwoStepModal(isCancelled = false) {
  const modal = el('cmdModal');
  if (isCancelled && PENDING_CMD && CURRENT_USER) {
    addAuditLog('SEC', 'Command for ' + PENDING_CMD.targetName + ' cancelled by operator (' + CURRENT_USER.username + ')', 'sec');
    showToast(LANG === 'th' ? 'ยกเลิกคำสั่งแล้ว' : 'Command cancelled', 'warn');
  }
  PENDING_CMD = null;
  if (modal) modal.style.display = 'none';
}

function confirmTwoStepCommand() {
  if (!PENDING_CMD || !CURRENT_USER) {
    closeTwoStepModal();
    return;
  }

  const pinVal = (el('inpCmdPin') ? el('inpCmdPin').value : '').trim();
  const alertEl = el('cmdAlert');
  const alertMsg = el('cmdAlertMsg');
  const card = el('cmdCard');
  const uName = CURRENT_USER.username ? CURRENT_USER.username.toLowerCase() : '';
  const userConf = VALID_USERS[uName] || VALID_USERS[CURRENT_USER.username];

  // Validate against standard PIN '1234' OR user's configured PIN OR user's account password
  const isValid = pinVal && userConf && (
    pinVal === '1234' ||
    (userConf.pin && pinVal === userConf.pin) ||
    (userConf.pass && pinVal === userConf.pass)
  );

  if (!isValid) {
    if (alertEl) {
      alertEl.style.display = 'flex';
      if (alertMsg) alertMsg.textContent = t('twoStepInvalidPin');
    }
    if (card) {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
    if (el('inpCmdPin')) el('inpCmdPin').select();
    addAuditLog('SEC', 'Invalid PIN authorization attempt for ' + PENDING_CMD.targetName + ' by ' + CURRENT_USER.username, 'sec');
    return;
  }

  // PIN is verified! Execute the pending command
  const cmd = PENDING_CMD;
  closeTwoStepModal(false);
  cmd.execute();
}

function toggleChiller(k) {
  if (!checkUserPermission('Toggle Chiller CH-0' + k)) return;
  const current = EQ_STATE.chillers[k];
  let newState = 'ON';
  if (current === 'ON') newState = 'OFF';
  else if (current === 'OFF') newState = null; // Back to auto
  else newState = 'ON';

  const stateLabel = newState === null ? (LANG === 'th' ? 'AUTO (คำนวณอัตโนมัติ)' : 'AUTO (Algorithm)') : newState;
  const actionText = newState === 'ON' ? (LANG === 'th' ? 'สั่งเปิดเครื่อง (START)' : 'START CHILLER') :
    (newState === 'OFF' ? (LANG === 'th' ? 'สั่งหยุดเครื่อง (STOP)' : 'STOP CHILLER') :
      (LANG === 'th' ? 'คืนค่าสู่โหมดอัตโนมัติ (AUTO)' : 'RETURN TO AUTO'));
  const stateIcon = newState === 'ON' ? 'play' : (newState === 'OFF' ? 'square' : 'zap');

  requestTwoStepCommand({
    targetName: 'Chiller CH-0' + k + ' (650 RT)',
    actionLabel: actionText,
    icon: stateIcon,
    execute: () => {
      EQ_STATE.chillers[k] = newState;
      const user = CURRENT_USER.username;
      const role = VALID_USERS[user].roleEn;
      addAuditLog('CMD', 'Chiller CH-0' + k + ' set to ' + stateLabel + ' [Two-Step PIN Verified] by ' + user + ' (' + role + ')', 'cmd');
      showToast('Chiller CH-0' + k + ' → ' + stateLabel, 'success');
      updateEquipmentButtons();
      render(true);
    }
  });
}

function toggleAux(type) {
  const typeName = type.toUpperCase();
  if (!checkUserPermission('Toggle ' + typeName)) return;
  const cur = EQ_STATE[type];
  const newState = cur === 'ON' ? 'OFF' : (cur === 'OFF' ? null : 'ON');

  const labelMap = {
    chp: 'CHW Primary Pumps (CHP-01…06)',
    cwp: 'Condenser Water Pumps (CWP-01…06)',
    ct: 'Cooling Tower Fans (CT-01…06)'
  };
  const targetLabel = labelMap[type] || (typeName + ' Subsystem');
  const stateLabel = newState === null ? (LANG === 'th' ? 'AUTO' : 'AUTO') : newState;
  const actionText = newState === 'ON' ? (LANG === 'th' ? 'สั่งเริ่มทำงาน (START)' : 'START SYSTEM') :
    (newState === 'OFF' ? (LANG === 'th' ? 'สั่งหยุดทำงาน (STOP)' : 'STOP SYSTEM') :
      (LANG === 'th' ? 'คืนค่าสู่โหมดอัตโนมัติ (AUTO)' : 'RETURN TO AUTO'));
  const stateIcon = newState === 'ON' ? 'play' : (newState === 'OFF' ? 'square' : 'zap');

  requestTwoStepCommand({
    targetName: targetLabel,
    actionLabel: actionText,
    icon: stateIcon,
    execute: () => {
      EQ_STATE[type] = newState;
      const user = CURRENT_USER.username;
      const role = VALID_USERS[user].roleEn;
      addAuditLog('CMD', targetLabel + ' set to ' + stateLabel + ' [Two-Step PIN Verified] by ' + user + ' (' + role + ')', 'cmd');
      showToast(typeName + ' → ' + stateLabel, 'success');
      updateEquipmentButtons();
      render(true);
    }
  });
}

function toggleCrah(z) {
  if (!checkUserPermission('Toggle CRAH-Z' + z)) return;
  const cur = EQ_STATE.crah[z];
  const newState = cur === 'ON' ? 'OFF' : (cur === 'OFF' ? null : 'ON');

  const targetLabel = 'CRAH Fan Unit Zone Z' + z;
  const stateLabel = newState === null ? 'AUTO' : newState;
  const actionText = newState === 'ON' ? (LANG === 'th' ? 'สั่งเริ่มพัดลม CRAH (START)' : 'START CRAH FAN') :
    (newState === 'OFF' ? (LANG === 'th' ? 'สั่งหยุดพัดลม CRAH (STOP)' : 'STOP CRAH FAN') :
      (LANG === 'th' ? 'คืนค่าสู่โหมดอัตโนมัติ (AUTO)' : 'RETURN TO AUTO'));
  const stateIcon = newState === 'ON' ? 'play' : (newState === 'OFF' ? 'square' : 'zap');

  requestTwoStepCommand({
    targetName: targetLabel,
    actionLabel: actionText,
    icon: stateIcon,
    execute: () => {
      EQ_STATE.crah[z] = newState;
      const user = CURRENT_USER.username;
      const role = VALID_USERS[user].roleEn;
      addAuditLog('CMD', targetLabel + ' set to ' + stateLabel + ' [Two-Step PIN Verified] by ' + user + ' (' + role + ')', 'cmd');
      showToast('CRAH Unit Z' + z + ' → ' + stateLabel, 'success');
      updateEquipmentButtons();
      render(true);
    }
  });
}

function adjustChillerStaging(delta) {
  if (!checkUserPermission(delta > 0 ? 'Add Chiller' : 'Cut Chiller')) return;
  const act = delta > 0 ? (LANG === 'th' ? 'เพิ่มการเดินเครื่องชิลเลอร์ (+1 Chiller)' : 'STAGE ADD (+1 Chiller)') :
    (LANG === 'th' ? 'ลดการเดินเครื่องชิลเลอร์ (-1 Chiller)' : 'STAGE REDUCE (-1 Chiller)');

  requestTwoStepCommand({
    targetName: 'Chiller Plant Staging Capacity',
    actionLabel: act,
    icon: delta > 0 ? 'plus' : 'minus',
    execute: () => {
      const user = CURRENT_USER.username;
      const role = VALID_USERS[user].roleEn;
      addAuditLog('CMD', 'Chiller Staging: ' + act + ' [Two-Step PIN Verified] executed by ' + user + ' (' + role + ')', 'cmd');
      showToast('Staging: ' + act, 'success');
      render(true);
    }
  });
}

function updateEquipmentButtons() {
  const canControl = CURRENT_USER && VALID_USERS[CURRENT_USER.username] && VALID_USERS[CURRENT_USER.username].canControlEquipment;

  // Chillers
  for (let k = 1; k <= 6; k++) {
    const btn = el('btnCh' + k);
    if (btn) {
      const st = EQ_STATE.chillers[k];
      btn.disabled = !canControl;
      btn.classList.toggle('disabled', !canControl);
      btn.classList.toggle('on', st === 'ON');
      btn.classList.toggle('off', st === 'OFF');
      btn.innerHTML = st ? iconSvg(st === 'ON' ? 'circle-check' : 'circle-x') + ' ' + st : iconSvg('zap') + ' AUTO';
    }
  }

  // Aux
  ['chp', 'cwp', 'ct'].forEach(tp => {
    const btn = el('btnAux_' + tp);
    if (btn) {
      const st = EQ_STATE[tp];
      btn.disabled = !canControl;
      btn.classList.toggle('disabled', !canControl);
      btn.classList.toggle('on', st === 'ON');
      btn.classList.toggle('off', st === 'OFF');
      btn.innerHTML = st ? iconSvg(st === 'ON' ? 'circle-check' : 'circle-x') + ' ' + st : iconSvg('zap') + ' AUTO';
    }
  });

  // CRAH
  for (let z = 1; z <= 4; z++) {
    const btn = el('btnCrah' + z);
    if (btn) {
      const st = EQ_STATE.crah[z];
      btn.disabled = !canControl;
      btn.classList.toggle('disabled', !canControl);
      btn.classList.toggle('on', st === 'ON');
      btn.classList.toggle('off', st === 'OFF');
      btn.innerHTML = st ? iconSvg(st === 'ON' ? 'circle-check' : 'circle-x') + ' ' + st : iconSvg('zap') + ' AUTO';
    }
  }

  // Breakdown quick buttons
  $$('.btn-brk-action').forEach(b => {
    b.disabled = !canControl;
    b.classList.toggle('disabled', !canControl);
  });

  // Playback buttons for Viewer
  if (el('btnPlay')) {
    el('btnPlay').disabled = !canControl;
    el('btnPlay').classList.toggle('disabled', !canControl);
  }
  $$('#spd button').forEach(b => {
    b.disabled = !canControl;
    b.classList.toggle('disabled', !canControl);
  });
}

function updateAuthDisplay() {
  if (!CURRENT_USER) return;
  const role = VALID_USERS[CURRENT_USER.username] || { roleEn: 'User', roleTh: 'ผู้ใช้งาน', avatar: 'user', allowedTabs: ['p1'] };

  if (el('topUserName')) el('topUserName').textContent = CURRENT_USER.username;
  if (el('topUserRole')) el('topUserRole').textContent = (LANG === 'th' ? role.roleTh : role.roleEn) + (role.canControlEquipment ? '' : ' [Read-Only]');
  if (el('userAvatar')) el('userAvatar').innerHTML = iconSvg(role.avatar || 'user', { width: 18, height: 18 });

  // Apply tab locks according to role
  $$('.tab').forEach(tBtn => {
    const p = tBtn.dataset.p;
    const isAllowed = role.allowedTabs.includes(p) || role.allowedTabs.includes('*');
    tBtn.classList.toggle('tab-locked', !isAllowed);
    let lockSpan = tBtn.querySelector('.lock-icon');
    if (!isAllowed) {
      if (!lockSpan) {
        lockSpan = document.createElement('span');
        lockSpan.className = 'lock-icon';
        lockSpan.innerHTML = iconSvg('lock', { width: 11, height: 11 });
        tBtn.appendChild(lockSpan);
      }
    } else {
      if (lockSpan) lockSpan.remove();
    }
  });

  updateEquipmentButtons();
}

function showDashboard(userData) {
  CURRENT_USER = userData;
  el('loginView').style.display = 'none';
  el('scadaApp').style.display = 'block';
  updateAuthDisplay();

  const role = VALID_USERS[userData.username];
  const roleName = LANG === 'th' ? role.roleTh : role.roleEn;
  addAuditLog('SYS', 'User \'' + userData.username + '\' (' + roleName + ') authenticated into SCADA gateway', 'sys');
  showToast((LANG === 'th' ? 'ยินดีต้อนรับ ' : 'Welcome ') + userData.username + ' (' + roleName + ')', 'success');

  // If current page is not allowed for this role, fallback to p1
  if (!role.allowedTabs.includes(PAGE) && !role.allowedTabs.includes('*')) {
    setPage('p1');
  }

  render(true);
}

function showLogin() {
  if (CURRENT_USER) {
    addAuditLog('SYS', 'User \'' + CURRENT_USER.username + '\' signed out', 'sys');
  }
  CURRENT_USER = null;
  sessionStorage.removeItem('dc_scada_auth');
  localStorage.removeItem('dc_scada_auth');
  el('scadaApp').style.display = 'none';
  el('loginView').style.display = 'flex';
  el('loginAlert').style.display = 'none';
  if (el('inpPass')) el('inpPass').value = '';
  setTimeout(() => { if (el('inpUser')) el('inpUser').focus(); }, 100);
}

function tryLogin(username, password, remember = false) {
  const u = (username || '').trim().toLowerCase();
  const p = (password || '').trim();
  const alertEl = el('loginAlert');
  const alertMsg = el('loginAlertMsg');
  const cardEl = el('loginCard');

  if (!u || !p) {
    alertEl.style.display = 'flex';
    alertMsg.textContent = LANG === 'th' ? 'กรุณากรอกทั้งชื่อผู้ใช้และรหัสผ่าน' : 'Please enter both username and password';
    cardEl.classList.remove('shake');
    void cardEl.offsetWidth;
    cardEl.classList.add('shake');
    return;
  }

  const userConf = VALID_USERS[u];
  if (userConf && userConf.pass === p) {
    alertEl.style.display = 'none';
    const btn = el('btnLogin');
    const origText = el('loginBtnText').textContent;
    btn.disabled = true;
    el('loginBtnText').textContent = t('loginVerifying');

    const authSession = { username: u, time: Date.now() };
    if (remember) {
      localStorage.setItem('dc_scada_auth', JSON.stringify(authSession));
    } else {
      sessionStorage.setItem('dc_scada_auth', JSON.stringify(authSession));
    }

    setTimeout(() => {
      btn.disabled = false;
      el('loginBtnText').textContent = origText;
      showDashboard(authSession);
    }, 350);
  } else {
    alertEl.style.display = 'flex';
    alertMsg.textContent = t('loginErr');
    cardEl.classList.remove('shake');
    void cardEl.offsetWidth;
    cardEl.classList.add('shake');
    el('inpPass').select();
    addAuditLog('SEC', 'Failed login attempt for username: \'' + u + '\'', 'sec');
  }
}

function checkSavedAuth() {
  try {
    const saved = sessionStorage.getItem('dc_scada_auth') || localStorage.getItem('dc_scada_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.username && VALID_USERS[parsed.username.toLowerCase()]) {
        showDashboard({ username: parsed.username.toLowerCase() });
        return true;
      }
    }
  } catch (e) {
    console.warn('Auth parse error:', e);
  }
  showLogin();
  return false;
}

function setPage(p) {
  if (CURRENT_USER) {
    const role = VALID_USERS[CURRENT_USER.username];
    if (role && !role.allowedTabs.includes(p) && !role.allowedTabs.includes('*')) {
      const tabNames = { p1: 'Overview', p2: 'Chiller Plant', p3: 'CRAH & Zones', p4: 'Power/PV/ESS', p5: 'Trends & Alarms', p6: 'Settings' };
      const msg = (LANG === 'th' ?
        'การเข้าถึงถูกจำกัด: สิทธิ์ ' + role.roleTh + ' ไม่สามารถเข้าถึงหน้า ' + (tabNames[p] || p) :
        'Access Restricted: ' + role.roleEn + ' cannot access ' + (tabNames[p] || p));
      showToast(msg, 'error');
      addAuditLog('SEC', 'Access denied to tab \'' + (tabNames[p] || p) + '\' for user ' + CURRENT_USER.username + ' (' + role.roleEn + ')', 'sec');
      return;
    }
  }

  PAGE = p;
  $$('.page').forEach(s => s.classList.toggle('on', s.id === p));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  render(true);
  if (el(p)) renderLucideIcons(el(p));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =====================================================================
   CSV SIMULATION DATASET MANAGEMENT (EXPORT & IMPORT)
   ===================================================================== */
const DEFAULT_DAY_BACKUP = {};
for (const k in DAY) {
  DEFAULT_DAY_BACKUP[k] = Array.from(DAY[k]);
}
let CURRENT_DATASET_NAME = '2026-08-09 (Built-in Default)';

function downloadCsv(isTemplate = false) {
  const headers = ['time', 'it', 'pit', 'cool', 'pcool', 'lim', 'pv', 'pv2l', 'pv2e', 'esd', 'soc', 'grid', 'mode'];
  const rows = [headers.join(',')];
  const count = isTemplate ? 60 : N;
  for (let i = 0; i < count; i++) {
    const row = [
      hhmm(i),
      (DAY.it[i] || 0).toFixed(1),
      (DAY.pit[i] || 0).toFixed(1),
      (DAY.cool[i] || 0).toFixed(1),
      (DAY.pcool[i] || 0).toFixed(1),
      (DAY.lim[i] || 0).toFixed(1),
      (DAY.pv[i] || 0).toFixed(1),
      (DAY.pv2l[i] || 0).toFixed(1),
      (DAY.pv2e[i] || 0).toFixed(1),
      (DAY.esd[i] || 0).toFixed(1),
      (DAY.soc[i] || 0).toFixed(1),
      (DAY.grid[i] || 0).toFixed(1),
      DAY.mode[i] !== undefined ? DAY.mode[i] : 0
    ];
    rows.push(row.join(','));
  }
  const csvStr = rows.join('\r\n');
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = isTemplate ? 'scada_simulation_template.csv' : `scada_simulation_${(DATE || 'dataset').replace(/-/g, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(LANG === 'th' ? 'ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว' : 'CSV file downloaded successfully', 'success');
  addAuditLog('CMD', (isTemplate ? 'CSV Template' : 'Active CSV Dataset') + ' exported by ' + (CURRENT_USER ? CURRENT_USER.username : 'user'), 'cmd');
}

function showCsvFeedback(msg, type = 'success') {
  const box = el('csvFeedbackBox');
  const msgEl = el('csvFeedbackMsg');
  const iconEl = el('csvFeedbackIcon');
  if (!box || !msgEl) return;
  box.className = 'csv-feedback-alert ' + (type === 'error' ? 'error' : type === 'warn' ? 'warn' : '');
  box.style.display = 'flex';
  msgEl.innerHTML = msg;
  if (iconEl) {
    iconEl.innerHTML = iconSvg(type === 'error' ? 'alert-triangle' : type === 'warn' ? 'alert-circle' : 'check-circle-2', { width: 18, height: 18 });
  }
}

function parseAndApplyCsv(csvText, fileName) {
  try {
    const rawLines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (rawLines.length < 2) {
      showCsvFeedback(LANG === 'th' ? 'ข้อผิดพลาด: ไฟล์ CSV ไม่มีข้อมูลหรือมีเพียงแถวหัวตาราง' : 'Error: CSV file contains no data rows.', 'error');
      showToast('Invalid CSV file', 'error');
      return;
    }

    // Parse headers
    const headerLine = rawLines[0];
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    
    // Normalization map
    const colMap = {};
    headers.forEach((h, idx) => {
      const clean = h.replace(/[^a-z0-9]/g, '');
      if (['it', 'itload', 'itpower', 'itpowerkw', 'itkw'].includes(clean)) colMap.it = idx;
      else if (['pit', 'predit', 'predictedit', 'predicteditpowerkw'].includes(clean)) colMap.pit = idx;
      else if (['cool', 'cooling', 'coolingpower', 'coolingpowerkw', 'coolkw'].includes(clean)) colMap.cool = idx;
      else if (['pcool', 'predcool', 'predictedcooling', 'predictedcoolingkw'].includes(clean)) colMap.pcool = idx;
      else if (['lim', 'limit', 'peaklimit', 'peaklimitkw', 'shavelimit'].includes(clean)) colMap.lim = idx;
      else if (['pv', 'solar', 'pvpower', 'pvpowerkw', 'solarpv'].includes(clean)) colMap.pv = idx;
      else if (['pv2l', 'pwtoload', 'pvtoload'].includes(clean)) colMap.pv2l = idx;
      else if (['pv2e', 'pvtobattery', 'pvtoess'].includes(clean)) colMap.pv2e = idx;
      else if (['esd', 'essdischarge', 'essdis', 'batterydischarge'].includes(clean)) colMap.esd = idx;
      else if (['soc', 'esssoc', 'batterysoc'].includes(clean)) colMap.soc = idx;
      else if (['grid', 'gridpower', 'utilitygrid'].includes(clean)) colMap.grid = idx;
      else if (['mode', 'systemmode', 'opmode', 'operatingmode'].includes(clean)) colMap.mode = idx;
      else if (['time', 'timestamp', 'minute'].includes(clean)) colMap.time = idx;
    });

    // Check mandatory columns
    if (colMap.it === undefined || colMap.cool === undefined) {
      const missing = [];
      if (colMap.it === undefined) missing.push("'it'");
      if (colMap.cool === undefined) missing.push("'cool'");
      showCsvFeedback(
        (LANG === 'th' ? 
          `<b>อัปโหลดไม่สำเร็จ:</b> ไม่พบคอลัมน์หลัก ${missing.join(', ')} ในไฟล์ CSV กรุณาตรวจสอบว่ามีคอลัมน์ <code>it</code> และ <code>cool</code>` :
          `<b>Upload Failed:</b> Missing required column(s) ${missing.join(', ')}. The CSV must contain at least <code>it</code> and <code>cool</code>.`),
        'error'
      );
      showToast('Missing required columns', 'error');
      return;
    }

    const dataRows = rawLines.slice(1);
    const rowCount = Math.min(dataRows.length, N);
    const parsedData = {
      it: new Float32Array(N),
      pit: new Float32Array(N),
      cool: new Float32Array(N),
      pcool: new Float32Array(N),
      lim: new Float32Array(N),
      pv: new Float32Array(N),
      pv2l: new Float32Array(N),
      pv2e: new Float32Array(N),
      esd: new Float32Array(N),
      soc: new Float32Array(N),
      grid: new Float32Array(N),
      mode: new Int8Array(N)
    };

    let validRows = 0;
    for (let i = 0; i < rowCount; i++) {
      const parts = dataRows[i].split(',').map(s => s.trim());
      const itVal = parseFloat(parts[colMap.it]);
      const coolVal = parseFloat(parts[colMap.cool]);
      if (isNaN(itVal) || isNaN(coolVal)) continue;

      parsedData.it[i] = itVal;
      parsedData.cool[i] = coolVal;
      parsedData.pit[i] = colMap.pit !== undefined ? (parseFloat(parts[colMap.pit]) || itVal) : itVal;
      parsedData.pcool[i] = colMap.pcool !== undefined ? (parseFloat(parts[colMap.pcool]) || coolVal) : coolVal;
      parsedData.lim[i] = colMap.lim !== undefined ? (parseFloat(parts[colMap.lim]) || 0) : 0;
      parsedData.pv[i] = colMap.pv !== undefined ? (parseFloat(parts[colMap.pv]) || 0) : 0;
      parsedData.pv2l[i] = colMap.pv2l !== undefined ? (parseFloat(parts[colMap.pv2l]) || 0) : 0;
      parsedData.pv2e[i] = colMap.pv2e !== undefined ? (parseFloat(parts[colMap.pv2e]) || 0) : 0;
      parsedData.esd[i] = colMap.esd !== undefined ? (parseFloat(parts[colMap.esd]) || 0) : 0;
      parsedData.soc[i] = colMap.soc !== undefined ? (parseFloat(parts[colMap.soc]) || 450) : 450;
      parsedData.grid[i] = colMap.grid !== undefined ? (parseFloat(parts[colMap.grid]) || Math.max(0, itVal + coolVal - parsedData.pv[i] - parsedData.esd[i])) : Math.max(0, itVal + coolVal);
      parsedData.mode[i] = colMap.mode !== undefined ? (parseInt(parts[colMap.mode], 10) || 0) : 0;
      validRows++;
    }

    if (validRows === 0) {
      showCsvFeedback(LANG === 'th' ? 'ข้อผิดพลาด: ไม่พบแถวข้อมูลตัวเลขที่ถูกต้อง' : 'Error: No valid numeric data rows found in CSV.', 'error');
      return;
    }

    // Pad if fewer than 1,440 rows
    if (validRows < N) {
      const lastIdx = validRows - 1;
      for (let i = validRows; i < N; i++) {
        for (const k of Object.keys(parsedData)) {
          parsedData[k][i] = parsedData[k][lastIdx];
        }
      }
    }

    // Apply to global DAY
    for (const k of Object.keys(parsedData)) {
      DAY[k] = parsedData[k];
    }

    CURRENT_DATASET_NAME = fileName || 'Uploaded Custom Dataset';
    if (el('activeDatasetName')) {
      el('activeDatasetName').innerHTML = `<i data-lucide="file-check" style="width:13px;height:13px;color:var(--ok)"></i> ${CURRENT_DATASET_NAME}`;
    }
    if (el('activeDatasetCount')) {
      el('activeDatasetCount').textContent = `${validRows} Rows (${validRows === N ? 'Complete 24h' : 'Padded to 1,440'})`;
    }
    if (el('activeDatasetStatusBadge')) {
      el('activeDatasetStatusBadge').className = 'badge b-ok';
      el('activeDatasetStatusBadge').innerHTML = '<i></i> Live Sync Active';
    }

    // Re-run simulation physics, alarms, cumulative metrics, charts
    ALARMS.length = 0;
    buildModel();
    buildAlarms();
    buildCum();
    IDX = 0;
    render(true);
    CHARTS.forEach(c => {
      c.cfg.series.forEach(s => {
        if (s.k === 'eIT') s.data = DAY.it;
        if (s.k === 'eCool' || s.k === 'eAct') s.data = DAY.cool;
        if (s.k === 'eGrid') s.data = DAY.grid;
        if (s.k === 'eLim') s.data = DAY.lim;
        if (s.k === 'ePV') s.data = DAY.pv;
        if (s.k === 'ePV2L') s.data = DAY.pv2l;
        if (s.k === 'eChg') s.data = DAY.pv2e;
        if (s.k === 'eDis') s.data = DAY.esd;
        if (s.k === 'eSoC') s.data = DAY.soc;
        if (s.k === 'ePred') s.data = DAY.pcool;
      });
      if (c.cfg.page === PAGE) drawChart(c);
    });

    renderLucideIcons(el('p6'));
    const successMsg = LANG === 'th' ?
      `<b>อัปโหลดสำเร็จ!</b> โหลดข้อมูล ${validRows} จุดจาก <code>${fileName}</code> เรียบร้อยแล้ว ระบบคำนวณแบบจำลองความร้อน กราฟ และอะลาร์มใหม่ทั้งหมด` :
      `<b>Upload Successful!</b> Loaded ${validRows} data points from <code>${fileName}</code>. All thermodynamic models, charts, and alarms refreshed.`;
    showCsvFeedback(successMsg, 'success');
    showToast(LANG === 'th' ? `นำเข้า ${fileName} สำเร็จ` : `Loaded ${fileName} successfully`, 'success');
    addAuditLog('CMD', `Simulation dataset updated with '${fileName}' (${validRows} rows) by ${CURRENT_USER ? CURRENT_USER.username : 'user'}`, 'cmd');

  } catch (err) {
    console.error('CSV parse error:', err);
    showCsvFeedback((LANG === 'th' ? 'เกิดข้อผิดพลาดในการประมวลผลไฟล์: ' : 'Failed to parse CSV file: ') + err.message, 'error');
    showToast('Failed to parse CSV', 'error');
  }
}

function handleCsvFileSelect(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
    showCsvFeedback(LANG === 'th' ? 'กรุณาเลือกไฟล์ที่มีนามสกุล .csv เท่านั้น' : 'Please upload a valid .csv file only.', 'error');
    showToast('Invalid file format (.csv required)', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    parseAndApplyCsv(ev.target.result, file.name);
  };
  reader.onerror = () => {
    showCsvFeedback(LANG === 'th' ? 'ไม่สามารถอ่านไฟล์ได้' : 'Failed to read file.', 'error');
    showToast('File read error', 'error');
  };
  reader.readAsText(file);
}

function resetDefaultDataset() {
  for (const k in DEFAULT_DAY_BACKUP) {
    DAY[k] = Array.from(DEFAULT_DAY_BACKUP[k]);
  }
  CURRENT_DATASET_NAME = '2026-08-09 (Built-in Default)';
  if (el('activeDatasetName')) {
    el('activeDatasetName').innerHTML = `<i data-lucide="database" style="width:13px;height:13px;color:var(--accent)"></i> ${CURRENT_DATASET_NAME}`;
  }
  if (el('activeDatasetCount')) {
    el('activeDatasetCount').textContent = '1,440 Points (24h · 1-min)';
  }
  if (el('activeDatasetStatusBadge')) {
    el('activeDatasetStatusBadge').className = 'badge b-ok';
    el('activeDatasetStatusBadge').innerHTML = '<i></i> Ready &amp; In-Sync';
  }
  ALARMS.length = 0;
  buildModel();
  buildAlarms();
  buildCum();
  IDX = 0;
  render(true);
  CHARTS.forEach(c => {
    c.cfg.series.forEach(s => {
      if (s.k === 'eIT') s.data = DAY.it;
      if (s.k === 'eCool' || s.k === 'eAct') s.data = DAY.cool;
      if (s.k === 'eGrid') s.data = DAY.grid;
      if (s.k === 'eLim') s.data = DAY.lim;
      if (s.k === 'ePV') s.data = DAY.pv;
      if (s.k === 'ePV2L') s.data = DAY.pv2l;
      if (s.k === 'eChg') s.data = DAY.pv2e;
      if (s.k === 'eDis') s.data = DAY.esd;
      if (s.k === 'eSoC') s.data = DAY.soc;
      if (s.k === 'ePred') s.data = DAY.pcool;
    });
    if (c.cfg.page === PAGE) drawChart(c);
  });
  renderLucideIcons(el('p6'));
  showCsvFeedback(LANG === 'th' ? 'คืนค่าชุดข้อมูลเริ่มต้น 2026-08-09 เรียบร้อยแล้ว' : 'Restored default 2026-08-09 simulation dataset.', 'warn');
  showToast(LANG === 'th' ? 'คืนค่าชุดข้อมูลเริ่มต้นแล้ว' : 'Default dataset restored', 'info');
  addAuditLog('CMD', 'Simulation dataset reset to default by ' + (CURRENT_USER ? CURRENT_USER.username : 'user'), 'cmd');
}

function bind() {
  el('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) setPage(b.dataset.p); });

  // Settings Theme & Language controls
  if (el('btnSetThemeDark')) el('btnSetThemeDark').addEventListener('click', () => applyTheme('dark'));
  if (el('btnSetThemeLight')) el('btnSetThemeLight').addEventListener('click', () => applyTheme('light'));
  if (el('btnSetLangTh')) el('btnSetLangTh').addEventListener('click', () => { LANG = 'th'; applyLang(); });
  if (el('btnSetLangEn')) el('btnSetLangEn').addEventListener('click', () => { LANG = 'en'; applyLang(); });

  // Settings CSV Export & Import controls
  if (el('btnDownloadActiveCsv')) el('btnDownloadActiveCsv').addEventListener('click', () => downloadCsv(false));
  if (el('btnDownloadTemplateCsv')) el('btnDownloadTemplateCsv').addEventListener('click', () => downloadCsv(true));
  if (el('btnBrowseCsv')) {
    el('btnBrowseCsv').addEventListener('click', () => {
      if (el('csvFileInput')) el('csvFileInput').click();
    });
  }
  if (el('csvDropZone')) {
    const dropZone = el('csvDropZone');
    dropZone.addEventListener('click', () => {
      if (el('csvFileInput')) el('csvFileInput').click();
    });
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleCsvFileSelect(files[0]);
      }
    });
  }
  if (el('csvFileInput')) {
    el('csvFileInput').addEventListener('change', e => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleCsvFileSelect(files[0]);
      }
      e.target.value = '';
    });
  }
  if (el('btnResetCsv')) el('btnResetCsv').addEventListener('click', resetDefaultDataset);
  if (el('btnCopySampleCsv')) {
    el('btnCopySampleCsv').addEventListener('click', () => {
      const snippet = el('csvSampleSnippet') ? el('csvSampleSnippet').textContent : '';
      if (snippet && navigator.clipboard) {
        navigator.clipboard.writeText(snippet).then(() => {
          showToast(LANG === 'th' ? 'คัดลอกตัวอย่าง CSV แล้ว' : 'Copied sample CSV to clipboard', 'success');
        }).catch(() => {
          showToast('Failed to copy', 'error');
        });
      }
    });
  }

  el('btnPlay').addEventListener('click', () => {
    if (!checkUserPermission('Playback Play/Pause')) return;
    PLAY = !PLAY;
    el('btnPlay').classList.toggle('on', PLAY);
    el('btnPlay').innerHTML = iconSvg(PLAY ? 'pause' : 'play') + '<span>' + t(PLAY ? 'pause' : 'play') + '</span>';
    const sv = el('mimic');
    if (sv) { PLAY ? sv.unpauseAnimations() : sv.pauseAnimations(); }
    el('mimicWrap').classList.toggle('paused', !PLAY);
    addAuditLog('CMD', (PLAY ? 'Simulation playback resumed' : 'Simulation playback paused') + ' by ' + CURRENT_USER.username, 'cmd');
  });

  el('spd').addEventListener('click', e => {
    if (!checkUserPermission('Change Playback Speed')) return;
    const b = e.target.closest('button'); if (!b) return;
    SPEED = +b.dataset.s;
    $$('#spd button').forEach(x => x.classList.toggle('on', x === b));
    addAuditLog('CMD', 'Simulation speed changed to ' + SPEED + '× by ' + CURRENT_USER.username, 'cmd');
  });

  el('seek').addEventListener('input', e => {
    if (CURRENT_USER && VALID_USERS[CURRENT_USER.username] && !VALID_USERS[CURRENT_USER.username].canControlPlayback) {
      showToast(t('permDenied'), 'error');
      return;
    }
    IDX = +e.target.value; render(true);
  });

  if (el('btnLang')) el('btnLang').addEventListener('click', () => { LANG = LANG === 'th' ? 'en' : 'th'; applyLang(); });
  if (el('btnLoginLang')) el('btnLoginLang').addEventListener('click', () => { LANG = LANG === 'th' ? 'en' : 'th'; applyLang(); });

  if (el('btnLogout')) el('btnLogout').addEventListener('click', () => {
    showLogin();
  });

  // Preset demo accounts accordion toggle
  const btnTogglePresets = el('btnTogglePresets');
  if (btnTogglePresets) {
    btnTogglePresets.addEventListener('click', () => {
      const content = el('presetContent');
      const arrow = el('presetArrow');
      if (content) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.classList.toggle('open', isHidden);
      }
    });
  }

  // Login form submission
  if (el('loginForm')) {
    el('loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const u = el('inpUser').value;
      const p = el('inpPass').value;
      const rem = el('chkRemember').checked;
      tryLogin(u, p, rem);
    });
  }



  // Preset demo account chips
  $$('.pchip').forEach(chip => {
    chip.addEventListener('click', () => {
      const u = chip.dataset.u;
      const p = chip.dataset.p;
      if (u && p) {
        el('inpUser').value = u;
        el('inpPass').value = p;
        tryLogin(u, p, el('chkRemember').checked);
      }
    });
  });

  // Audit Log Terminal Event Listeners
  if (el('auditBar')) {
    el('auditBar').addEventListener('click', e => {
      if (e.target.closest('#btnAuditToggle') || !e.target.closest('.audit-tools')) {
        toggleAuditDock();
      }
    });
  }
  if (el('btnAuditToggle')) {
    el('btnAuditToggle').addEventListener('click', e => {
      e.stopPropagation();
      toggleAuditDock();
    });
  }
  $$('.audit-fbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      AUDIT_FILTER = btn.dataset.f;
      $$('.audit-fbtn').forEach(b => b.classList.toggle('on', b === btn));
      renderAuditLogs();
    });
  });
  if (el('btnClearAudit')) {
    el('btnClearAudit').addEventListener('click', e => {
      e.stopPropagation();
      if (CURRENT_USER && VALID_USERS[CURRENT_USER.username] && VALID_USERS[CURRENT_USER.username].canClearLogs) {
        AUDIT_LOGS.length = 0;
        addAuditLog('SYS', 'Audit logs cleared by ' + CURRENT_USER.username, 'sys');
        showToast('Audit logs cleared', 'success');
      } else {
        showToast('Only System Administrator can clear logs', 'error');
        addAuditLog('SEC', 'Unauthorized log clear attempted by ' + (CURRENT_USER ? CURRENT_USER.username : 'unknown'), 'sec');
      }
    });
  }

  // Interactive Equipment Click Delegations
  document.addEventListener('click', e => {
    // Chiller table button
    const chBtn = e.target.closest('.btn-ch-toggle');
    if (chBtn) {
      e.preventDefault();
      const k = +chBtn.dataset.ch;
      toggleChiller(k);
      return;
    }

    // Aux pump/fan button
    const auxBtn = e.target.closest('.btn-aux-toggle');
    if (auxBtn) {
      e.preventDefault();
      const type = auxBtn.dataset.type;
      toggleAux(type);
      return;
    }

    // CRAH button
    const crahBtn = e.target.closest('.btn-crah-toggle');
    if (crahBtn) {
      e.preventDefault();
      const z = +crahBtn.dataset.zone;
      toggleCrah(z);
      return;
    }

    // Breakdown quick actions
    const brkBtn = e.target.closest('.btn-brk-action');
    if (brkBtn) {
      e.preventDefault();
      const act = brkBtn.dataset.act;
      if (act === 'add-ch') adjustChillerStaging(+1);
      else if (act === 'sub-ch') adjustChillerStaging(-1);
      else if (act === 'toggle-chp') toggleAux('chp');
      else if (act === 'toggle-cwp') toggleAux('cwp');
      else if (act === 'toggle-ct') toggleAux('ct');
      else if (act === 'toggle-crah') toggleCrah(1);
      return;
    }
  });

  // TWO-STEP COMMAND (SBO) Interlock Event Listeners
  if (el('btnCmdConfirm')) {
    el('btnCmdConfirm').addEventListener('click', confirmTwoStepCommand);
  }
  if (el('btnCmdCancel')) {
    el('btnCmdCancel').addEventListener('click', () => closeTwoStepModal(true));
  }
  if (el('btnCmdClose')) {
    el('btnCmdClose').addEventListener('click', () => closeTwoStepModal(true));
  }
  if (el('btnTogglePinEye')) {
    el('btnTogglePinEye').addEventListener('click', () => {
      const inp = el('inpCmdPin');
      if (inp) {
        if (inp.type === 'password') {
          inp.type = 'text';
          el('btnTogglePinEye').innerHTML = iconSvg('eye-off', { width: 15, height: 15 });
        } else {
          inp.type = 'password';
          el('btnTogglePinEye').innerHTML = iconSvg('eye', { width: 15, height: 15 });
        }
      }
    });
  }
  if (el('inpCmdPin')) {
    el('inpCmdPin').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmTwoStepCommand();
      }
    });
  }
  if (el('cmdModal')) {
    el('cmdModal').addEventListener('click', e => {
      if (e.target === el('cmdModal')) {
        closeTwoStepModal(true);
      }
    });
  }
  if (el('chartFsModal')) {
    el('chartFsModal').addEventListener('click', e => {
      if (e.target === el('chartFsModal')) {
        closeChartFsModal();
      }
    });
  }
  if (el('btnChartFsClose')) {
    el('btnChartFsClose').addEventListener('click', () => closeChartFsModal());
  }

  if (el('btnTheme')) el('btnTheme').addEventListener('click', toggleTheme);
  if (el('btnLoginTheme')) el('btnLoginTheme').addEventListener('click', toggleTheme);

  el('mimicWrap').addEventListener('click', e => {
    const g = e.target.closest('.hot'); if (!g) return;
    if (g.dataset.zone) ZSEL = +g.dataset.zone - 1;
    setPage(g.dataset.nav);
  });
  let isResizePending = false;
  const handleChartResize = () => {
    if (isResizePending) return;
    isResizePending = true;
    requestAnimationFrame(() => {
      isResizePending = false;
      CHARTS.forEach(c => { if (c.cfg.page === PAGE) drawChart(c); });
      if (PAGE === 'p3') drawZoneBars();
      if (CURRENT_FS_CHART_ID && FS_CHART_OBJ) drawFsChart();
    });
  };

  window.addEventListener('resize', handleChartResize);
  if (typeof ResizeObserver !== 'undefined') {
    const chartObserver = new ResizeObserver(handleChartResize);
    $$('.chartbox').forEach(box => chartObserver.observe(box));
  }
  document.addEventListener('keydown', e => {
    const fsModal = el('chartFsModal');
    if (fsModal && fsModal.style.display !== 'none') {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeChartFsModal();
        return;
      }
    }
    const modal = el('cmdModal');
    if (modal && modal.style.display !== 'none') {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTwoStepModal(true);
        return;
      }
    }
    if (CURRENT_USER) {
      if (e.key === ' ') { e.preventDefault(); el('btnPlay').click(); }
      if (e.key === 'ArrowRight') { IDX = Math.min(N - 1, IDX + 15); render(true); }
      if (e.key === 'ArrowLeft') { IDX = Math.max(0, IDX - 15); render(true); }
    }
  });
}

/* =====================================================================
   12) BOOT
   ===================================================================== */

window.openChartFsModal = openChartFsModal;
buildModel(); buildAlarms(); buildCum();
buildStatic(); buildCharts(); bind(); applyTheme(THEME); applyLang(); renderLucideIcons();
IDX = 0; render(true);
requestAnimationFrame(loop);
checkSavedAuth();




