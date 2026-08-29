// dashboard.js — Cakra v2.0.1
// © 2026 Robertino Gladden Narendra. Hak cipta dilindungi.

'use strict';

let DATA   = [];
let EVENTS = [];
let EVENTS_PAGE = 0;
const EVENTS_PER_PAGE = 25;

Object.defineProperty(window, 'DATA',            { get: () => DATA });
Object.defineProperty(window, 'EVENTS',          { get: () => EVENTS });
Object.defineProperty(window, 'EVENTS_PAGE',     { get: () => EVENTS_PAGE });
Object.defineProperty(window, 'EVENTS_PER_PAGE', { get: () => EVENTS_PER_PAGE });

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupSidebar();
  setupChartTabs();
  setupMapLayerBtns();
  setupScrollSpy();
  setupScrollTop();
});

async function loadData() {
  try {
    const raw = sessionStorage.getItem('cakra_data');
    if (!raw) {
      // Tampilkan skeleton sebentar biar ga langsung jump, lalu redirect ke upload
      await new Promise(r => setTimeout(r, 1800));
      window.location.replace('index.html');
      return;
    }
    DATA = JSON.parse(raw);
    const _beforeLen = DATA.length;
    DATA = DATA.filter(d =>
      typeof d.rsrp === 'number' && d.rsrp >= -160 && d.rsrp <= -30 &&
      typeof d.rsrq === 'number' && d.rsrq >= -45  && d.rsrq <= 25  &&
      typeof d.snr  === 'number' && d.snr  >= -25  && d.snr  <= 50
    );
    if (DATA.length < _beforeLen) {
      console.warn(`[Cakra dashboard] Filtered ${_beforeLen - DATA.length} row(s) (range check)`);
    }
    if (!DATA.length) {
      await new Promise(r => setTimeout(r, 1800));
      window.location.replace('index.html');
      return;
    }

    const evRaw = sessionStorage.getItem('cakra_events');
    if (evRaw) EVENTS = JSON.parse(evRaw);

    EVENTS_PAGE = 0;
    const storedFilename = sessionStorage.getItem('cakra_filename');
    const fallbackFiles  = JSON.parse(sessionStorage.getItem('cakra_files') || '[]');
    const filename = storedFilename || (Array.isArray(fallbackFiles) && fallbackFiles.length ? fallbackFiles.join(', ') : 'unknown');
    document.getElementById('fileInfoBadge').textContent = filename;

    const sessionTech = DATA[0]?._sessionTech || '4G';
    const techLabel   = sessionTech === 'NR' ? '5G NR' : sessionTech === 'NSA' ? '5G NSA' : '4G LTE';
    document.getElementById('topbarTitle').textContent = `${filename} · ${DATA.length.toLocaleString()} pts · ${techLabel}`;

    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('noDataState').style.display  = 'none';
    document.getElementById('dashContent').style.display  = 'block';

    await buildAll();
  } catch(e) {
    console.error('loadData error:', e);
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('dashContent').style.display  = 'none';
    showNoData();
  }
}

function showNoData() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('noDataState').style.display  = 'flex';
}

function yieldToUI() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function setLoadingText(txt) {
  const el = document.getElementById('loaderText');
  if (el) el.textContent = txt;
}

async function buildAll() {
  setLoadingText('Menyusun info & KPI...');
  buildInfo();
  buildCell();
  buildKPI();

  await yieldToUI();

  setLoadingText('Membuat grafik...');
  await yieldToUI();
  CakraCharts.buildAll(DATA);

  await yieldToUI();

  setLoadingText('Membangun peta sinyal...');
  await yieldToUI();
  CakraMap.build(DATA);
  if (EVENTS.length) {
    CakraMap.addEvents(EVENTS);
    buildEvents();
  }

  await yieldToUI();

  setLoadingText('Menghitung distribusi & titik rawan...');
  buildDistribution();
  buildRawan();
  checkNrPanels();

  setTimeout(() => { if (typeof CakraMap !== 'undefined' && CakraMap.initAnnotationLayer) CakraMap.initAnnotationLayer(); }, 100);
  setTimeout(() => { if (typeof buildFieldTools === 'function') buildFieldTools(); }, 200);
  setTimeout(() => { if (typeof window._buildNewFeatures === 'function') window._buildNewFeatures(); }, 400);
}

function checkNrPanels() {
  const hasNrRsrp = DATA.some(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp));
  const hasNrSinr = DATA.some(d => d.nr_sinr !== null && !isNaN(d.nr_sinr));

  const nrRsrpNoData = document.getElementById('nrRsrpNoData');
  const nrSinrNoData = document.getElementById('nrSinrNoData');
  const nrRsrpCanvas = document.getElementById('nrRsrpChart');
  const nrSinrCanvas = document.getElementById('nrSinrChart');

  if (nrRsrpNoData) nrRsrpNoData.style.display = hasNrRsrp ? 'none' : 'flex';
  if (nrRsrpCanvas) nrRsrpCanvas.style.display  = hasNrRsrp ? 'block' : 'none';
  if (nrSinrNoData) nrSinrNoData.style.display = hasNrSinr ? 'none' : 'flex';
  if (nrSinrCanvas) nrSinrCanvas.style.display  = hasNrSinr ? 'block' : 'none';

  document.querySelectorAll('.chart-tab').forEach(tab => {
    if (tab.dataset.chart === 'nr_rsrp') tab.style.opacity = hasNrRsrp ? '1' : '0.4';
    if (tab.dataset.chart === 'nr_sinr') tab.style.opacity = hasNrSinr ? '1' : '0.4';
  });
}


function buildInfo() {
  const first = DATA[0], last = DATA[DATA.length-1];
  const dur    = CakraParser.calcDuration(first.ts, last.ts);
  const gps    = DATA.filter(d => d.lat && d.lon);
  const avgSpd = (DATA.reduce((s,d) => s+d.speed, 0) / DATA.length * 3.6).toFixed(1);
  const op     = first.operator || '—';
  const tech   = first._sessionTech === 'NR' ? '5G NR' : first._sessionTech === 'NSA' ? '5G NSA (EN-DC)' : (first.tech || '4G LTE');
  const dev    = (first.device||'').split(':').slice(0,2).join(' ') || '—';
  const dt     = first.ts.substring(0,10).replace(/\./g,'-');

  const hasNr  = DATA.some(d => d.nr_rsrp !== null);
  const nrBand = hasNr ? (DATA.find(d => d.nr_band)?.nr_band || '—') : null;

  document.getElementById('infoGrid').innerHTML = cards([
    { label:'Tanggal',          value: dt,                       sub: (first.tsDisp?.substring(11)||'') + ' — ' + (last.tsDisp?.substring(11)||'') },
    { label:'Durasi',           value: dur,                      sub: 'Total waktu pengukuran' },
    { label:'Operator',         value: op,                       sub: 'Teknologi: ' + tech },
    { label:'Total Data Point', value: DATA.length.toLocaleString(), sub: `GPS valid: ${gps.length.toLocaleString()}` },
    { label:'Kec. Rata-rata',   value: avgSpd + ' km/h',        sub: 'Drive test mode' },
    { label:'Device',           value: dev,                      sub: 'Model perangkat', mono: true },
    ...(hasNr ? [
      { label:'NR Band',        value: nrBand ? 'n' + nrBand : '—', sub: '5G NR band aktif' },
      { label:'Mode 5G',        value: first._sessionTech === 'NSA' ? 'NSA / EN-DC' : 'SA', sub: 'Non-Standalone / Standalone' },
    ] : []),
  ]);
}


function buildCell() {
  const cells = {};
  DATA.forEach(d => { if (d.cellname) cells[d.cellname] = (cells[d.cellname]||0)+1; });
  const dom   = Object.entries(cells).sort((a,b) => b[1]-a[1]);
  const first = DATA[0];
  const hasNr = DATA.some(d => d.nr_rsrp !== null);
  const nrRow = DATA.find(d => d.nr_pci || d.nr_arfcn);

  document.getElementById('cellGrid').innerHTML = cards([
    { label:'eNodeB (Node)',  value: first.node||'—',    sub:'Serving eNB ID', mono:true },
    { label:'Cell ID',        value: first.cellid||'—',  sub:'Cell Identity', mono:true },
    { label:'LAC / TAC',      value: first.lac||'—',     sub:'Location / Tracking Area', mono:true },
    { label:'LTE ARFCN',      value: first.arfcn||'—',   sub:'LTE Absolute RF Channel', mono:true },
    { label:'Band LTE',       value: first.band ? 'Band ' + first.band : '—', sub:'LTE Band' },
    { label:'Bandwidth',      value: first.bw ? first.bw + ' MHz' : '—', sub:'Channel Bandwidth' },
    { label:'Dominant Cell',  value: dom[0]?.[0]||'—',   sub: dom[0] ? dom[0][1].toLocaleString() + ' data points' : '' },
    { label:'Unique Cells',   value: dom.length,          sub: dom.length > 3 ? '<span style="display:inline-flex;align-items:center;gap:3px"><svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 3 4 7l4 4\"/><path d=\"M4 7h16\"/><path d=\"m16 21 4-4-4-4\"/><path d=\"M20 17H4\"/></svg> Banyak handover</span>' : 'Stabil' },
    ...(hasNr ? [
      { label:'NR ARFCN (NR-ARFCN)', value: nrRow?.nr_arfcn || '—', sub:'5G NR Absolute RF Channel', mono:true },
      { label:'NR PCI',         value: nrRow?.nr_pci   || '—', sub:'5G NR Physical Cell ID', mono:true },
    ] : []),
  ]);
}

function cards(items) {
  return items.map(it => `
    <div class="info-card">
      <div class="ic-label">${it.label}</div>
      <div class="ic-value${it.mono?' mono':''}">
        ${it.value}
        ${it.nr ? '<span style="font-size:8px;background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);border-radius:3px;padding:1px 4px;margin-left:4px;vertical-align:middle">NR</span>' : ''}
      </div>
      ${it.sub ? `<div class="ic-sub">${it.sub}</div>` : ''}
    </div>`).join('');
}


function buildKPI() {
  const _vals = k => DATA.map(d => d[k]).filter(v => v !== null && v !== undefined && !isNaN(v));
  const avg = k => { const v = _vals(k); return v.length ? (v.reduce((s,x)=>s+x, 0) / v.length).toFixed(1) : '0'; };
  const min = k => { const v = _vals(k); return v.length ? Math.min(...v).toFixed(1) : '—'; };
  const max = k => { const v = _vals(k); return v.length ? Math.max(...v).toFixed(1) : '—'; };

  const setKpi = (id, val, badgeId, good, warn, labels) => {
    const el  = document.getElementById(id);
    if (!el) return;
    const cls = val > good ? 'kpi-val kpi-v-good' : val > warn ? 'kpi-val kpi-v-warn' : 'kpi-val kpi-v-bad';
    el.className = cls;
    el.textContent = val;
    const bdg  = document.getElementById(badgeId);
    if (!bdg) return;
    const bCls = val > good ? 'kpi-badge badge-best' : val > warn ? 'kpi-badge badge-normal' : 'kpi-badge badge-worst';
    const txt  = val > good ? labels[0] : val > warn ? labels[1] : labels[2];
    bdg.innerHTML = `<span class="${bCls}">${txt}</span>`;
  };

  const aRsrp = parseFloat(avg('rsrp'));
  const aRsrq = parseFloat(avg('rsrq'));
  const aSnr  = parseFloat(avg('snr'));

  setKpi('kpiRsrp', aRsrp, 'kpiRsrpBadge', -80, -100, ['SANGAT BAIK','NORMAL','BURUK']);
  setKpi('kpiRsrq', aRsrq, 'kpiRsrqBadge', -10, -15,  ['EXCELLENT','GOOD','POOR']);
  setKpi('kpiSnr',  aSnr,  'kpiSnrBadge',   10,  0,   ['BAIK','CUKUP','BURUK']);

  const dlArr  = DATA.map(d => d.dl).filter(x => x > 0);
  const ulArr  = DATA.map(d => d.ul).filter(x => x > 0);
  const avgDl  = dlArr.length ? (dlArr.reduce((s,v) => s+v, 0) / dlArr.length / 1000).toFixed(2) : '—';
  const maxDl  = dlArr.length ? (Math.max(...dlArr) / 1000).toFixed(2) : '—';
  const avgUl  = ulArr.length ? (ulArr.reduce((s,v) => s+v, 0) / ulArr.length / 1000).toFixed(2) : '—';
  const maxUl  = ulArr.length ? (Math.max(...ulArr) / 1000).toFixed(2) : '—';

  // NR KPI
  const nrPts   = DATA.filter(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp));
  const hasNr   = nrPts.length > 0;
  const nrSinrPts = DATA.filter(d => d.nr_sinr !== null && !isNaN(d.nr_sinr));
  const avgNrRsrp = hasNr ? (nrPts.reduce((s,d) => s+d.nr_rsrp, 0) / nrPts.length).toFixed(1) : null;
  const avgNrSinr = nrSinrPts.length ? (nrSinrPts.reduce((s,d) => s+d.nr_sinr, 0) / nrSinrPts.length).toFixed(1) : null;
  const nrDlPts = DATA.filter(d => d.nr_dl !== null && d.nr_dl > 0);
  const avgNrDl = nrDlPts.length ? (nrDlPts.reduce((s,d) => s+d.nr_dl, 0) / nrDlPts.length / 1000).toFixed(2) : null;
  const maxNrDl = nrDlPts.length ? (Math.max(...nrDlPts.map(d => d.nr_dl)) / 1000).toFixed(2) : null;

  document.getElementById('rawanBadge').textContent = DATA.filter(d => d.rsrp<-100 || d.rsrq<-19 || d.snr<-10).length;

  document.getElementById('kpiExtra').innerHTML = `
    ${extraCard('RSRP Min', min('rsrp')+' dBm')}
    ${extraCard('RSRP Max', max('rsrp')+' dBm')}
    ${extraCard('RSRQ Min', min('rsrq')+' dB')}
    ${extraCard('RSRQ Max', max('rsrq')+' dB')}
    ${extraCard('SNR Min',  min('snr')+' dB')}
    ${extraCard('SNR Max',  max('snr')+' dB')}
    ${extraCard('Avg DL', avgDl+' Mbps', 'LTE · Max: '+maxDl)}
    ${extraCard('Avg UL', avgUl+' Mbps', 'LTE · Max: '+maxUl)}
    ${hasNr ? extraCard('NR-RSRP avg', avgNrRsrp+' dBm', nrPts.length.toLocaleString()+' pts 5G', '#22c55e') : ''}
    ${avgNrSinr !== null ? extraCard('SS-SINR avg', avgNrSinr+' dB', 'Signal quality 5G', '#a78bfa') : ''}
    ${avgNrDl !== null ? extraCard('NR DL avg', avgNrDl+' Mbps', '5G · Max: '+maxNrDl, '#22c55e') : ''}
  `;
}

function extraCard(label, val, sub='', accent='') {
  const accentStyle = accent ? `style="color:${accent}"` : '';
  return `<div class="info-card">
    <div class="ic-label">${label}</div>
    <div class="ic-value mono" ${accentStyle}>${val}</div>
    ${sub ? `<div class="ic-sub">${sub}</div>` : ''}
  </div>`;
}


function buildEvents() {
  if (!EVENTS.length) return;

  const totalPages = Math.max(1, Math.ceil(EVENTS.length / EVENTS_PER_PAGE));
  if (EVENTS_PAGE >= totalPages) EVENTS_PAGE = totalPages - 1;
  const startIndex = EVENTS_PAGE * EVENTS_PER_PAGE;
  const pageEvents = EVENTS.slice(startIndex, startIndex + EVENTS_PER_PAGE);

  const navEvents = document.getElementById('navEvents');
  const badge     = document.getElementById('eventsBadge');
  if (navEvents) navEvents.style.display = 'flex';
  if (badge) { badge.textContent = EVENTS.length; badge.style.display = 'inline'; }

  const hoCount = EVENTS.filter(e => e.typeCategory === 'HANDOVER' || e.type?.includes('HANDOVER')).length;
  const rsCount = EVENTS.filter(e => e.typeCategory === 'RESELECTION' || e.type?.includes('RESELECTION')).length;
  const nrHoCount = EVENTS.filter(e => e.isNr).length;

  const rows = pageEvents.map((ev, i) => {
    const isHO     = ev.typeCategory === 'HANDOVER' || ev.type?.includes('HANDOVER');
    const isHOcat = (ev.typeCategory||ev.type)==='HANDOVER';
    const tagClass = isHOcat ? 'tag-ho' : 'tag-rs';
    const tagHOIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>';
    const tagRSIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.67"/></svg>';
    const tagLabel = isHOcat ? tagHOIcon + ' HO' : tagRSIcon + ' RS';
    const nrBadge  = ev.isNr ? '<span style="font-size:8px;background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.25);border-radius:3px;padding:1px 3px;margin-left:3px">NR</span>' : '';
    return `<tr>
      <td style="color:var(--text3);font-size:9px">${startIndex + i + 1}</td>
      <td><span class="${tagClass}">${tagLabel}</span>${nrBadge}</td>
      <td style="font-size:9px;color:var(--cyan)">${ev.type || '—'}</td>
      <td>${ev.timeDisp || ev.time}</td>
      <td>${ev.fromCell}</td>
      <td>${ev.toCell}</td>
      <td style="color:${parseInt(ev.rsrp)<-100?'var(--red)':parseInt(ev.rsrp)<-80?'var(--yellow)':'var(--green)'}">${ev.rsrp}</td>
      <td>${ev.rsrq}</td>
      <td>${ev.snr}</td>
      <td style="color:var(--text2)">${ev.enb||'—'}</td>
    </tr>`;
  }).join('');

  const pagination = `
    <div class="tbl-pagination">
      <button class="tbl-pg-btn" onclick="goPrevPage()" ${EVENTS_PAGE===0?'disabled':''}>← Prev</button>
      <span class="tbl-pg-info">${startIndex+1}–${Math.min(startIndex+EVENTS_PER_PAGE,EVENTS.length)} dari ${EVENTS.length}</span>
      <button class="tbl-pg-btn" onclick="goNextPage()" ${EVENTS_PAGE>=totalPages-1?'disabled':''}>Next →</button>
    </div>`;

  document.getElementById('eventsContent').innerHTML = `
    <div class="events-summary">
      <div class="event-stat">
        <div class="event-stat-val">${EVENTS.length}</div>
        <div class="event-stat-lbl">Total Events</div>
      </div>
      <div class="event-stat">
        <div class="event-stat-val" style="color:var(--yellow)">${hoCount}</div>
        <div class="event-stat-lbl">Handover</div>
      </div>
      <div class="event-stat">
        <div class="event-stat-val" style="color:var(--purple)">${rsCount}</div>
        <div class="event-stat-lbl">Reselection</div>
      </div>
      ${nrHoCount > 0 ? `<div class="event-stat">
        <div class="event-stat-val" style="color:#22c55e">${nrHoCount}</div>
        <div class="event-stat-lbl">NR Events</div>
      </div>` : ''}
    </div>
    <div class="events-table-wrap">
      <table class="events-table">
        <thead>
          <tr>
            <th>#</th><th>Tipe</th><th>Event Type</th><th>Waktu</th>
            <th>From Cell</th><th>To Cell</th>
            <th>RSRP</th><th>RSRQ</th><th>SNR</th>
            <th>eNB/gNB</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${pagination}`;
}

window.goPrevPage = function() {
  if (EVENTS_PAGE > 0) { EVENTS_PAGE--; buildEvents(); }
};
window.goNextPage = function() {
  const totalPages = Math.ceil(EVENTS.length / EVENTS_PER_PAGE);
  if (EVENTS_PAGE < totalPages - 1) { EVENTS_PAGE++; buildEvents(); }
};

window.handleInlineKML = async function(input) {
  const f = input.files[0];
  if (!f) return;
  const text = await f.text();
  const events = CakraParser.parseKml ? CakraParser.parseKml(text) : [];
  if (!events.length) { showToast('Tidak ada event dalam file KML'); return; }
  EVENTS = events;
  sessionStorage.setItem('cakra_events', JSON.stringify(EVENTS));
  CakraMap.addEvents(EVENTS);
  buildEvents();
  showToast(`${events.length} event berhasil dimuat`);
};


function buildDistribution() {
  const distRsrp = [
    { label:'> −80',      color:'#60a5fa', count: DATA.filter(d=>d.rsrp>-80).length },
    { label:'−80~−90',   color:'#4ade80', count: DATA.filter(d=>d.rsrp<=-80&&d.rsrp>-90).length },
    { label:'−90~−100',  color:'#facc15', count: DATA.filter(d=>d.rsrp<=-90&&d.rsrp>-100).length },
    { label:'−100~−110', color:'#fb923c', count: DATA.filter(d=>d.rsrp<=-100&&d.rsrp>-110).length },
    { label:'< −110',    color:'#f87171', count: DATA.filter(d=>d.rsrp<=-110).length },
  ];
  const distRsrq = [
    { label:'> −9',      color:'#60a5fa', count: DATA.filter(d=>d.rsrq>-9).length },
    { label:'−9~−10',    color:'#4ade80', count: DATA.filter(d=>d.rsrq<=-9&&d.rsrq>-10).length },
    { label:'−10~−15',  color:'#4ade80', count: DATA.filter(d=>d.rsrq<=-10&&d.rsrq>-15).length },
    { label:'−15~−19',  color:'#fb923c', count: DATA.filter(d=>d.rsrq<=-15&&d.rsrq>-19).length },
    { label:'< −19',     color:'#f87171', count: DATA.filter(d=>d.rsrq<=-19).length },
  ];
  const distSnr = [
    { label:'> 20',      color:'#60a5fa', count: DATA.filter(d=>d.snr>20).length },
    { label:'10~20',     color:'#4ade80', count: DATA.filter(d=>d.snr<=20&&d.snr>10).length },
    { label:'0~10',      color:'#facc15', count: DATA.filter(d=>d.snr<=10&&d.snr>0).length },
    { label:'−10~0',     color:'#fb923c', count: DATA.filter(d=>d.snr<=0&&d.snr>-10).length },
    { label:'< −10',     color:'#f87171', count: DATA.filter(d=>d.snr<=-10).length },
  ];

  renderDist('distRsrp', distRsrp);
  renderDist('distRsrq', distRsrq);
  renderDist('distSnr',  distSnr);

  const nrPts = DATA.filter(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp));
  if (nrPts.length > 0) {
    buildNrDistribution(nrPts);
  }
}

function buildNrDistribution(nrPts) {
  const el = document.getElementById('distNrWrap');
  if (!el) return;

  const distNrRsrp = [
    { label:'> −80',      color:'#22c55e', count: nrPts.filter(d=>d.nr_rsrp>-80).length },
    { label:'−80~−90',   color:'#4ade80', count: nrPts.filter(d=>d.nr_rsrp<=-80&&d.nr_rsrp>-90).length },
    { label:'−90~−100',  color:'#facc15', count: nrPts.filter(d=>d.nr_rsrp<=-90&&d.nr_rsrp>-100).length },
    { label:'−100~−110', color:'#fb923c', count: nrPts.filter(d=>d.nr_rsrp<=-100&&d.nr_rsrp>-110).length },
    { label:'< −110',    color:'#f87171', count: nrPts.filter(d=>d.nr_rsrp<=-110).length },
  ];

  const sinrPts = DATA.filter(d => d.nr_sinr !== null && !isNaN(d.nr_sinr));
  const distSinr = sinrPts.length ? [
    { label:'> 20 dB',   color:'#22c55e', count: sinrPts.filter(d=>d.nr_sinr>20).length },
    { label:'13~20 dB',  color:'#4ade80', count: sinrPts.filter(d=>d.nr_sinr<=20&&d.nr_sinr>13).length },
    { label:'0~13 dB',   color:'#facc15', count: sinrPts.filter(d=>d.nr_sinr<=13&&d.nr_sinr>0).length },
    { label:'−5~0 dB',   color:'#fb923c', count: sinrPts.filter(d=>d.nr_sinr<=0&&d.nr_sinr>-5).length },
    { label:'< −5 dB',   color:'#f87171', count: sinrPts.filter(d=>d.nr_sinr<=-5).length },
  ] : null;

  el.style.display = 'block';
  el.innerHTML = `
    <div class="dist-section-label" style="font-family:var(--mono);font-size:10px;color:#22c55e;letter-spacing:0.1em;margin-bottom:8px">
      5G NR DISTRIBUTION — ${nrPts.length.toLocaleString()} pts NR aktif
    </div>
    <div class="dist-cols">
      <div class="dist-col">
        <div class="dist-col-title">NR-RSRP</div>
        <div id="distNrRsrp"></div>
      </div>
      ${sinrPts.length ? `<div class="dist-col">
        <div class="dist-col-title">SS-SINR</div>
        <div id="distSinr"></div>
      </div>` : ''}
    </div>`;

  renderDist('distNrRsrp', distNrRsrp, nrPts.length);
  if (distSinr) renderDist('distSinr', distSinr, sinrPts.length);
}

function renderDist(id, items, totalOverride) {
  const total = totalOverride ?? (items.reduce((s,i) => s+i.count, 0) || 1);
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items.map(item => {
    const pct = ((item.count / total) * 100).toFixed(1);
    return `<div class="dist-row">
      <div class="dist-lbl">${item.label}</div>
      <div class="dist-track">
        <div class="dist-fill" style="width:0%;background:${item.color}28;border-left:2px solid ${item.color}" data-w="${pct}">
          <span class="dist-pct">${pct}%</span>
        </div>
      </div>
      <div class="dist-cnt">${item.count.toLocaleString()}</div>
    </div>`;
  }).join('');

  requestAnimationFrame(() => {
    setTimeout(() => {
      el.querySelectorAll('.dist-fill').forEach(bar => {
        bar.style.width = bar.dataset.w + '%';
      });
    }, 80);
  });
}


let RAWAN_PAGE = 0;
const RAWAN_PER_PAGE = 25;

function buildRawan() {
  const rawan = DATA.filter(d => d.rsrp < -100 || d.rsrq < -19 || d.snr < -10);
  const el    = document.getElementById('rawanContent');
  if (!el) return;

  if (!rawan.length) {
    el.innerHTML = `<div class="info-card" style="text-align:center;padding:32px">
      <div style="color:var(--green);font-family:var(--mono);font-size:16px;font-weight:600">TIDAK ADA TITIK RAWAN</div>
      <div style="color:var(--text3);font-size:12px;margin-top:6px">Semua parameter dalam batas normal</div>
    </div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rawan.length / RAWAN_PER_PAGE));
  if (RAWAN_PAGE >= totalPages) RAWAN_PAGE = totalPages - 1;
  const start   = RAWAN_PAGE * RAWAN_PER_PAGE;
  const sample  = rawan.slice(start, start + RAWAN_PER_PAGE);

  const badRsrp = rawan.filter(d=>d.rsrp<-100).length;
  const badRsrq = rawan.filter(d=>d.rsrq<-19).length;
  const badSnr  = rawan.filter(d=>d.snr<-10).length;
  const pct     = v => ((v/DATA.length)*100).toFixed(1);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px">
      ${extraCard('RSRP Rawan', `<span style="color:var(--red)">${badRsrp}</span>`, pct(badRsrp)+'% dari total')}
      ${extraCard('RSRQ Rawan', `<span style="color:var(--red)">${badRsrq}</span>`, pct(badRsrq)+'% dari total')}
      ${extraCard('SNR Rawan',  `<span style="color:var(--red)">${badSnr}</span>`,  pct(badSnr)+'% dari total')}
      ${extraCard('Total Rawan',`<span style="color:var(--orange)">${rawan.length}</span>`, pct(rawan.length)+'% dari total')}
    </div>
    <div class="danger-wrap">
      <div class="danger-hdr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Daftar Titik Rawan — ${rawan.length} titik</div>
      <div class="danger-scroll">
        <table class="rawan-table">
          <thead><tr>
            <th>#</th><th>Waktu</th><th>RSRP</th><th>RSRQ</th><th>SNR</th>
            <th>Cell</th><th>Lat</th><th>Lon</th><th>Issue</th>
          </tr></thead>
          <tbody>${sample.map((d,i) => {
            const issues = [];
            if (d.rsrp<-100) issues.push('RSRP');
            if (d.rsrq<-19)  issues.push('RSRQ');
            if (d.snr<-10)   issues.push('SNR');
            return `<tr>
              <td style="color:var(--text3);font-size:9px">${start+i+1}</td>
              <td>${d.timePart || (d.tsDisp ? d.tsDisp.substring(11) : '')}</td>
              <td class="${d.rsrp<-100?'td-bad':'td-warn'}">${d.rsrp}</td>
              <td class="${d.rsrq<-19?'td-bad':'td-warn'}">${d.rsrq}</td>
              <td class="${d.snr<-10?'td-bad':d.snr<0?'td-warn':''}">${d.snr}</td>
              <td>${d.cellname||'—'}</td>
              <td style="color:var(--text3);font-size:9px">${d.lat?d.lat.toFixed(5):'—'}</td>
              <td style="color:var(--text3);font-size:9px">${d.lon?d.lon.toFixed(5):'—'}</td>
              <td>${issues.map(is=>`<span class="badge-bad" style="margin-right:2px">${is}</span>`).join('')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      <div class="tbl-pagination">
        <button class="tbl-pg-btn" onclick="goRawanPrev()" ${RAWAN_PAGE===0?'disabled':''}>← Prev</button>
        <span class="tbl-pg-info">${start+1}–${Math.min(start+RAWAN_PER_PAGE,rawan.length)} dari ${rawan.length}</span>
        <button class="tbl-pg-btn" onclick="goRawanNext()" ${RAWAN_PAGE>=totalPages-1?'disabled':''}>Next →</button>
      </div>
    </div>`;
}

window.goRawanPrev = function() {
  if (RAWAN_PAGE > 0) { RAWAN_PAGE--; buildRawan(); }
};
window.goRawanNext = function() {
  const rawan = DATA.filter(d => d.rsrp < -100 || d.rsrq < -19 || d.snr < -10);
  const totalPages = Math.ceil(rawan.length / RAWAN_PER_PAGE);
  if (RAWAN_PAGE < totalPages - 1) { RAWAN_PAGE++; buildRawan(); }
};


function setupSidebar() {
  const toggle  = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const close   = document.getElementById('sidebarClose');

  const open    = () => { sidebar.classList.add('open');    overlay.style.display = 'block'; };
  const closeFn = () => { sidebar.classList.remove('open'); overlay.style.display = 'none'; };

  if (toggle)  toggle.addEventListener('click', () => sidebar.classList.contains('open') ? closeFn() : open());
  if (overlay) overlay.addEventListener('click', closeFn);
  if (close)   close.addEventListener('click', closeFn);

  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
      const sectionId = link.dataset.section;
      if (sectionId) {
        e.preventDefault(); // Cegah default anchor agar kita kontrol scrollnya

        // 1. Pause scroll spy dulu supaya gak override
        pauseScrollSpy(1500);

        // 2. Set active langsung di sidebar
        setNavActive(sectionId);

        // 3. Scroll ke section yang dituju
        const target = document.getElementById(sectionId);
        if (target) {
          const topbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 48;
          const y = target.getBoundingClientRect().top + window.scrollY - topbarH - 8;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }

      // Tutup sidebar di mobile
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.style.display = 'none';
      }
    });
  });
}

function setupChartTabs() {
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('panel-' + tab.dataset.chart);
      if (panel) panel.classList.add('active');
    });
  });
}

function setupMapLayerBtns() {
  document.querySelectorAll('#mapLayerBtns .map-btn').forEach(btn => {
    btn.addEventListener('click', () => CakraMap.switchLayer(btn.dataset.layer));
  });
}

function toggleEventLayer(type) {
  if (CakraMap && CakraMap.toggleEventLayer) {
    CakraMap.toggleEventLayer(type);
    // Update visual state
    const btnId = type === 'handover' ? 'btnHandover' : 'btnReselect';
    const btn = document.getElementById(btnId);
    if (btn) {
      const isActive = btn.getAttribute('data-active') === 'true';
      btn.setAttribute('data-active', !isActive ? 'true' : 'false');
      btn.classList.toggle('active', !isActive);
    }
  }
}

let _scrollSpyPaused = false;
let _scrollSpyTimer  = null;

function pauseScrollSpy(ms = 1200) {
  _scrollSpyPaused = true;
  clearTimeout(_scrollSpyTimer);
  _scrollSpyTimer = setTimeout(() => { _scrollSpyPaused = false; }, ms);
}

function setNavActive(sectionId) {
  const navItems   = document.querySelectorAll('.nav-item[data-section]');
  const sidebarNav = document.querySelector('.sidebar-nav');
  navItems.forEach(n => n.classList.remove('active'));
  const active = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (active) {
    active.classList.add('active');
    // Scroll sidebar nav agar item terlihat
    if (sidebarNav) {
      const itemRect = active.getBoundingClientRect();
      const navRect  = sidebarNav.getBoundingClientRect();
      const itemTop  = itemRect.top - navRect.top;
      if (itemTop < 0 || itemTop > navRect.height - itemRect.height) {
        sidebarNav.scrollTop += itemTop - navRect.height / 3;
      }
    }
  }
}

function setupScrollSpy() {
  const sections   = document.querySelectorAll('.dash-section[id]');

  // Lacak semua section yang sedang intersecting
  const intersecting = new Set();

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) intersecting.add(e.target);
      else                   intersecting.delete(e.target);
    });

    if (_scrollSpyPaused) return; // Jangan override saat sedang klik nav

    // Pilih section yang paling atas di viewport (bukan sembarang yang intersect)
    let topSection = null;
    let minTop     = Infinity;
    intersecting.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < minTop) { minTop = rect.top; topSection = sec; }
      // Kalau semua section di atas viewport, ambil yang paling bawah dari atas
      else if (rect.top < 0 && !topSection) { topSection = sec; minTop = rect.top; }
    });

    // Fallback: ambil yang paling kecil nilai top negatifnya (paling dekat atas)
    if (!topSection && intersecting.size > 0) {
      let closest = Infinity;
      intersecting.forEach(sec => {
        const rect = sec.getBoundingClientRect();
        const dist = Math.abs(rect.top);
        if (dist < closest) { closest = dist; topSection = sec; }
      });
    }

    if (topSection) setNavActive(topSection.id);
  }, {
    threshold: [0, 0.1, 0.5],
    rootMargin: '-48px 0px -30% 0px'
  });

  sections.forEach(s => obs.observe(s));
}

function setupScrollTop() {
  const btn = document.getElementById('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 360);
  }, { passive: true });
}

function showToast(msg, dur = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}



function buildCoverageGapPanel() {
  const el = document.getElementById('coverageGapContent');
  if (!el || !DATA.length) return;

  const gps = DATA.filter(d => d.lat && d.lon);
  const threshold = -100;

  // Segment consecutive points below threshold
  let segment = [], segments = [], totalBad = 0;
  gps.forEach(d => {
    if (d.rsrp <= threshold) { segment.push(d); totalBad++; }
    else { if (segment.length >= 2) segments.push([...segment]); segment = []; }
  });
  if (segment.length >= 2) segments.push(segment);

  const pct = ((totalBad / DATA.length) * 100).toFixed(1);

  if (!segments.length) {
    el.innerHTML = `<div class="info-card" style="text-align:center;padding:28px">
      <div style="color:var(--green);font-family:var(--mono);font-size:15px;font-weight:600">TIDAK ADA COVERAGE GAP</div>
      <div style="color:var(--text3);font-size:12px;margin-top:6px">RSRP ≥ ${threshold} dBm di seluruh rute</div>
    </div>`;
    return;
  }

  const rows = segments.map((seg, i) => {
    const avg = (seg.reduce((a, d) => a + d.rsrp, 0) / seg.length).toFixed(1);
    const min = Math.min(...seg.map(d => d.rsrp)).toFixed(1);
    const start = seg[0].timePart || seg[0].tsDisp?.substring(11) || '';
    const end = seg[seg.length-1].timePart || '';
    const cell = seg[0].cellname || '—';
    return `<tr>
      <td style="color:var(--text3);font-size:9px">${i+1}</td>
      <td style="font-size:10px;color:var(--cyan)">${start}${end&&end!==start?' — '+end:''}</td>
      <td class="td-bad">${avg}</td>
      <td class="td-bad">${min}</td>
      <td style="color:var(--text2)">${seg.length}</td>
      <td style="font-size:10px">${cell}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px">
      ${extraCard('Gap Segmen', `<span style="color:var(--red)">${segments.length}</span>`, 'Segmen RSRP ≤ ' + threshold + ' dBm')}
      ${extraCard('Total Titik Buruk', `<span style="color:var(--red)">${totalBad}</span>`, pct + '% dari total')}
      ${extraCard('Avg Gap Length', (segments.reduce((a,s) => a+s.length, 0) / segments.length).toFixed(0) + ' pts', 'Per segmen')}
      ${extraCard('Gap Terpanjang', Math.max(...segments.map(s => s.length)) + ' pts', 'Segmen terburuk')}
    </div>
    <div class="danger-wrap">
      <div class="danger-hdr" style="display:flex;align-items:center;justify-content:space-between">
        <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/></svg> Coverage Gap — ${segments.length} segmen (RSRP ≤ ${threshold} dBm)</span>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:10px;color:var(--text3)">Threshold</label>
          <select id="gapThresholdSel" onchange="updateGapThreshold()" style="background:var(--bg3);border:1px solid var(--border2);color:var(--text2);font-size:10px;border-radius:4px;padding:2px 6px;font-family:var(--mono)">
            <option value="-90">−90 dBm</option>
            <option value="-95">−95 dBm</option>
            <option value="-100" selected>−100 dBm</option>
            <option value="-105">−105 dBm</option>
            <option value="-110">−110 dBm</option>
          </select>
          <button class="tbl-pg-btn" onclick="showGapOnMap()" style="background:var(--cyan-dim);border-color:rgba(6,182,212,0.3);color:var(--cyan)">
            Tampilkan di Peta →
          </button>
        </div>
      </div>
      <div class="danger-scroll">
        <table class="rawan-table">
          <thead><tr><th>#</th><th>Waktu</th><th>Avg RSRP</th><th>Min RSRP</th><th>Panjang</th><th>Cell</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

window.updateGapThreshold = function() {
  const sel = document.getElementById('gapThresholdSel');
  const thr = parseInt(sel?.value || '-100');
  buildCoverageGapPanel();
  if (typeof CakraMap !== 'undefined') {
    CakraMap.buildAnalysisLayers(DATA, { gapThreshold: thr });
  }
};

window.showGapOnMap = function() {
  const sel = document.getElementById('gapThresholdSel');
  const thr = parseInt(sel?.value || '-100');
  CakraMap.buildAnalysisLayers(DATA, { gapThreshold: thr });
  CakraMap.setAnalysisOverlay('gap', true);
  const mapEl = document.getElementById('peta');
  if (mapEl) {
    const y = mapEl.getBoundingClientRect().top + window.scrollY - 56;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
  showToast('Coverage gap di-overlay di peta');
};

// 2. CELL CHURN / HANDOVER INSTABILITY PANEL
function buildCellChurnPanel() {
  const el = document.getElementById('cellChurnContent');
  if (!el || !DATA.length) return;

  const WIN = 10;
  const gps = DATA.filter(d => d.lat && d.lon && d.cellname);
  const churnPts = [];

  gps.forEach((d, i) => {
    if (i < WIN) return;
    const win = gps.slice(i - WIN, i + 1);
    const cells = [...new Set(win.map(w => w.cellname))];
    if (cells.length >= 3) churnPts.push({ d, cells, uniqueCount: cells.length });
  });

  const pct = ((churnPts.length / DATA.length) * 100).toFixed(1);

  const cellCount = {};
  churnPts.forEach(p => p.cells.forEach(c => { cellCount[c] = (cellCount[c] || 0) + 1; }));
  const topCells = Object.entries(cellCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!churnPts.length) {
    el.innerHTML = `<div class="info-card" style="text-align:center;padding:28px">
      <div style="color:var(--green);font-family:var(--mono);font-size:15px;font-weight:600">SERVING CELL STABIL</div>
      <div style="color:var(--text3);font-size:12px;margin-top:6px">Tidak ada area cell churn — handover terkontrol</div>
    </div>`;
    return;
  }

  const cellRows = topCells.map(([cell, cnt], i) => `<tr>
    <td style="color:var(--text3);font-size:9px">${i+1}</td>
    <td style="color:var(--text2)">${cell}</td>
    <td style="color:var(--orange);font-weight:600">${cnt}</td>
    <td style="font-size:10px;color:var(--text3)">${((cnt/churnPts.length)*100).toFixed(1)}%</td>
  </tr>`).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px">
      ${extraCard('Titik Churn', `<span style="color:var(--orange)">${churnPts.length}</span>`, pct + '% dari total')}
      ${extraCard('Window Deteksi', WIN + ' titik', 'Ukuran sliding window')}
      ${extraCard('Max Unique Cells', Math.max(...churnPts.map(p => p.uniqueCount)), 'Dalam satu window')}
      ${extraCard('Cell Terlibat', Object.keys(cellCount).length, 'Cell di area churn')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="danger-wrap">
        <div class="danger-hdr" style="display:flex;align-items:center;justify-content:space-between">
          <span style="display:inline-flex;align-items:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Cell Sering Muncul di Area Churn</span>
          <button class="tbl-pg-btn" onclick="showChurnOnMap()" style="background:rgba(249,115,22,0.12);border-color:rgba(249,115,22,0.3);color:var(--orange)">Tampilkan di Peta →</button>
        </div>
        <div class="danger-scroll">
          <table class="rawan-table">
            <thead><tr><th>#</th><th>Cell Name</th><th>Frekuensi</th><th>%</th></tr></thead>
            <tbody>${cellRows}</tbody>
          </table>
        </div>
      </div>
      <div class="info-card" style="padding:14px">
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);letter-spacing:0.08em;margin-bottom:10px">INTERPRETASI</div>
        <div style="font-size:11px;color:var(--text2);line-height:1.8">
          <div style="color:var(--orange);font-weight:600;margin-bottom:6px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Cell Churn Terdeteksi</div>
          <p style="margin-bottom:6px">Ditemukan <b style="color:var(--orange)">${churnPts.length} titik</b> (${pct}%) di mana ≥3 serving cell berbeda dalam ${WIN} data point berurutan.</p>
          <p style="margin-bottom:6px">Penyebab umum: pilot pollution (butuh konfirmasi dgn scanner/neighbor data), area border coverage normal, mobility tinggi, atau misconfig parameter A3 offset / TTT yang terlalu sensitif.</p>
          <p style="color:var(--text3);font-size:10px">Cek silang dgn nilai RSRQ di area ini — kalau RSRQ rendah (&lt;−13 dB) sambil RSRP relatif baik, kemungkinan besar pilot pollution. Kalau RSRQ normal, kemungkinan besar HO parameter.</p>
        </div>
      </div>
    </div>`;
}

window.showChurnOnMap = function() {
  CakraMap.buildAnalysisLayers(DATA, {});
  CakraMap.setAnalysisOverlay('churn', true);
  const mapEl = document.getElementById('peta');
  if (mapEl) window.scrollTo({ top: mapEl.getBoundingClientRect().top + window.scrollY - 56, behavior: 'smooth' });
  showToast('Cell churn di-overlay di peta');
};

// 3. THROUGHPUT CORRELATION PANEL
function buildThroughputCorrelation() {
  const el = document.getElementById('throughputCorrContent');
  if (!el || !DATA.length) return;

  const pts = DATA.filter(d => d.dl > 0 && d.rsrp);
  if (!pts.length) {
    el.innerHTML = `<div class="info-card" style="text-align:center;padding:28px"><div style="color:var(--text3)">Tidak ada data throughput DL</div></div>`;
    return;
  }

  const bins = [
    { label: '> −80', min: -80, max: 999, pts: [] },
    { label: '−80~−90', min: -90, max: -80, pts: [] },
    { label: '−90~−100', min: -100, max: -90, pts: [] },
    { label: '−100~−110', min: -110, max: -100, pts: [] },
    { label: '< −110', min: -999, max: -110, pts: [] },
  ];
  pts.forEach(d => {
    const bin = bins.find(b => d.rsrp > b.min && d.rsrp <= b.max);
    if (bin) bin.pts.push(d);
  });

  const dlAll = pts.map(d => d.dl / 1000);
  const avgDl = dlAll.reduce((a, b) => a + b, 0) / dlAll.length;
  const maxDl = Math.max(...dlAll);

  const n = pts.length;
  const meanRsrp = pts.reduce((a, d) => a + d.rsrp, 0) / n;
  const meanDl = avgDl;
  let num = 0, denR = 0, denD = 0;
  pts.forEach(d => {
    const dr = d.rsrp - meanRsrp, dd = (d.dl / 1000) - meanDl;
    num += dr * dd; denR += dr * dr; denD += dd * dd;
  });
  const corr = (denR && denD) ? (num / Math.sqrt(denR * denD)).toFixed(3) : '—';
  const corrStrength = Math.abs(corr) > 0.7 ? 'Kuat' : Math.abs(corr) > 0.4 ? 'Sedang' : 'Lemah';

  const binRows = bins.map(b => {
    if (!b.pts.length) return '';
    const avgBinDl = (b.pts.reduce((a, d) => a + d.dl / 1000, 0) / b.pts.length).toFixed(2);
    const barW = Math.min(100, (parseFloat(avgBinDl) / maxDl * 100)).toFixed(1);
    const color = b.max > -80 ? '#38bdf8' : b.max > -90 ? '#4ade80' : b.max > -100 ? '#facc15' : b.max > -110 ? '#fb923c' : '#f87171';
    return `<div class="dist-row">
      <div class="dist-lbl" style="color:${color}">${b.label} dBm</div>
      <div class="dist-track">
        <div class="dist-fill" style="width:${barW}%;background:${color}28;border-left:2px solid ${color}">
          <span class="dist-pct">${avgBinDl} Mbps</span>
        </div>
      </div>
      <div class="dist-cnt" style="color:var(--text3)">${b.pts.length} pts</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px">
      ${extraCard('Data Points', pts.length.toLocaleString(), 'Dengan DL throughput')}
      ${extraCard('Avg DL', avgDl.toFixed(2) + ' Mbps', 'Seluruh rute')}
      ${extraCard('Peak DL', maxDl.toFixed(2) + ' Mbps', 'Titik terbaik')}
      ${extraCard('Korelasi RSRP↔DL', corr, corrStrength + ' (' + (corr > 0 ? 'positif' : 'negatif') + ')')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="info-card" style="padding:14px">
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);letter-spacing:0.08em;margin-bottom:10px">AVG DL PER KATEGORI RSRP</div>
        ${binRows}
      </div>
      <div class="info-card" style="padding:14px">
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);letter-spacing:0.08em;margin-bottom:10px">INTERPRETASI</div>
        <div style="font-size:11px;color:var(--text2);line-height:1.8">
          <div style="margin-bottom:8px">Korelasi Pearson RSRP ↔ DL Throughput: <b style="color:var(--cyan)">${corr}</b> (${corrStrength})</div>
          ${parseFloat(corr) < 0.4 ? '<p style="color:var(--yellow)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Korelasi lemah: throughput rendah tidak selalu disebabkan RF buruk. Kemungkinan bottleneck di core/transport/congestion.</p>' :
            parseFloat(corr) > 0.7 ? '<p style="color:var(--green)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Korelasi kuat: perbaikan RSRP akan langsung meningkatkan throughput pengguna.</p>' :
            '<p style="color:var(--text2)">Korelasi sedang: RF berkontribusi tapi bukan satu-satunya faktor penentu throughput.</p>'}
          <div style="margin-top:10px">
            <button class="tbl-pg-btn" onclick="showThroughputOnMap()" style="background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.3);color:var(--green)">
              Tampilkan di Peta →
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

window.showThroughputOnMap = function() {
  CakraMap.buildAnalysisLayers(DATA, {});
  CakraMap.setAnalysisOverlay('throughput', true);
  const mapEl = document.getElementById('peta');
  if (mapEl) window.scrollTo({ top: mapEl.getBoundingClientRect().top + window.scrollY - 56, behavior: 'smooth' });
  showToast('Tier throughput di-overlay di peta');
};

// Toolbar handler — toggles RF overlay ring on/off (multi-aktif)
window.toggleRfOverlay = function(type) {
  if (typeof CakraMap === 'undefined' || !CakraMap.toggleAnalysisOverlay) return;
  CakraMap.toggleAnalysisOverlay(type);
};

function buildSiteView() {
  const el = document.getElementById('siteViewContent');
  if (!el || !DATA.length) return;

  const sites = {};
  DATA.forEach(d => {
    const key = d.node || (d.cellname ? d.cellname.replace(/_\d+$/, '').replace(/-\d+$/, '') : '—');
    if (!sites[key]) sites[key] = { node: key, cells: new Set(), pts: [], rsrp: [], dl: [] };
    sites[key].pts.push(d);
    sites[key].rsrp.push(d.rsrp);
    if (d.dl > 0) sites[key].dl.push(d.dl / 1000);
    if (d.cellname) sites[key].cells.add(d.cellname);
  });

  const siteArr = Object.values(sites)
    .map(s => {
      const avgRsrp = (s.rsrp.reduce((a, b) => a + b, 0) / s.rsrp.length).toFixed(1);
      const avgDl = s.dl.length ? (s.dl.reduce((a, b) => a + b, 0) / s.dl.length).toFixed(2) : '—';
      const bad = s.pts.filter(d => d.rsrp < -100 || d.rsrq < -19 || d.snr < -10).length;
      const badPct = ((bad / s.pts.length) * 100).toFixed(1);
      return { ...s, cells: [...s.cells], avgRsrp: parseFloat(avgRsrp), avgRsrpStr: avgRsrp, avgDl, bad, badPct, count: s.pts.length };
    })
    .sort((a, b) => b.count - a.count);

  const rows = siteArr.map((s, i) => {
    const rsrpColor = s.avgRsrp > -80 ? 'var(--cyan)' : s.avgRsrp > -90 ? 'var(--green)' : s.avgRsrp > -100 ? 'var(--yellow)' : 'var(--red)';
    const badColor = parseFloat(s.badPct) > 20 ? 'var(--red)' : parseFloat(s.badPct) > 10 ? 'var(--yellow)' : 'var(--green)';
    return `<tr>
      <td style="color:var(--text3);font-size:9px">${i+1}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--cyan)">${s.node}</td>
      <td style="color:var(--text3)">${s.cells.slice(0,3).join(', ')}${s.cells.length>3?' +'+( s.cells.length-3):''}</td>
      <td style="text-align:center">${s.cells.length}</td>
      <td style="text-align:right;font-weight:600;color:${rsrpColor}">${s.avgRsrpStr}</td>
      <td style="text-align:right;color:var(--text2)">${s.avgDl}</td>
      <td style="text-align:right;color:${badColor}">${s.bad} <span style="color:var(--text3);font-size:9px">(${s.badPct}%)</span></td>
      <td style="text-align:right;color:var(--text3)">${s.count.toLocaleString()}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px">
      ${extraCard('Total Site/eNodeB', siteArr.length, 'Terdeteksi dari data')}
      ${extraCard('Site Terbaik', siteArr.slice().sort((a,b)=>b.avgRsrp-a.avgRsrp)[0]?.node||'—', 'Avg RSRP tertinggi')}
      ${extraCard('Site Terburuk', siteArr.slice().sort((a,b)=>a.avgRsrp-b.avgRsrp)[0]?.node||'—', 'Avg RSRP terendah')}
      ${extraCard('Unique Cells', [...new Set(DATA.filter(d=>d.cellname).map(d=>d.cellname))].length, 'Total cell terdeteksi')}
    </div>
    <div class="danger-wrap">
      <div class="danger-hdr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a10.75 10.75 0 0 1 0 15.2"/><line x1="12" y1="9" x2="12" y2="22"/></svg> KPI per Site / eNodeB</div>
      <div class="danger-scroll">
        <table class="rawan-table">
          <thead><tr>
            <th>#</th><th>Site / eNodeB</th><th>Cell(s)</th><th>Sektor</th>
            <th style="text-align:right">Avg RSRP</th>
            <th style="text-align:right">Avg DL</th>
            <th style="text-align:right">Titik Rawan</th>
            <th style="text-align:right">Data Pts</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// 5. PCI MOD-3 CONFLICT ANALYSIS
//     - both observed within K=8 consecutive samples in the drive route
//       (proxy for spatial proximity / overlapping coverage area)
function buildPciConflictPanel() {
  const el = document.getElementById('pciConflictContent');
  if (!el || !DATA.length) return;

  const withPci = DATA.filter(d => d.pci !== null && d.pci !== undefined && !isNaN(d.pci));
  if (withPci.length === 0) {
    el.innerHTML = `<div class="info-card" style="padding:24px;text-align:center">
      <div style="color:var(--text2);font-family:var(--mono);font-size:13px;margin-bottom:8px">PCI tidak terdeteksi di data</div>
      <div style="color:var(--text3);font-size:11px;line-height:1.7">
        Fitur ini butuh kolom <span style="font-family:var(--mono);color:var(--cyan)">PCI</span> atau <span style="font-family:var(--mono);color:var(--cyan)">Phys Cell ID</span> di file log.<br>
        Di G-NetTrack Pro, aktifkan kolom PCI di Settings → Export Columns.<br>
        Kalau pakai TEMS/NEMO, pastikan field PCI di-include di export.
      </div>
    </div>`;
    return;
  }

  const cellPciMap = new Map();
  withPci.forEach(d => {
    if (!d.cellname) return;
    const key = d.cellname;
    if (!cellPciMap.has(key)) cellPciMap.set(key, { pci: d.pci, count: 0 });
    cellPciMap.get(key).count++;
  });

  const cells = [...cellPciMap.entries()]
    .map(([name, v]) => ({ name, pci: v.pci, count: v.count, mod3: v.pci % 3, mod30: v.pci % 30 }))
    .filter(c => c.count >= 5);

  if (cells.length < 2) {
    el.innerHTML = `<div class="info-card" style="padding:24px;text-align:center">
      <div style="color:var(--text2);font-family:var(--mono);font-size:13px">Tidak cukup cell unik untuk analisis</div>
      <div style="color:var(--text3);font-size:11px;margin-top:6px">Hanya ${cells.length} cell ditemukan dengan PCI valid</div>
    </div>`;
    return;
  }

  const mod3Dist = { 0: 0, 1: 0, 2: 0 };
  cells.forEach(c => mod3Dist[c.mod3]++);

  const PROX_WIN = 8;
  const conflicts = new Map(); // key "cellA|cellB" → { cellA, cellB, pciA, pciB, mod3, occurrences }
  const buf = [];
  withPci.forEach(d => {
    if (!d.cellname) return;
    buf.push({ cellname: d.cellname, pci: d.pci });
    if (buf.length > PROX_WIN) buf.shift();
    // Check current point against everyone in buffer
    for (let k = 0; k < buf.length - 1; k++) {
      const a = buf[k], b = buf[buf.length - 1];
      if (a.cellname === b.cellname || a.pci === b.pci) continue;
      if ((a.pci % 3) !== (b.pci % 3)) continue;
      const key = a.cellname < b.cellname
        ? `${a.cellname}|${b.cellname}`
        : `${b.cellname}|${a.cellname}`;
      if (!conflicts.has(key)) {
        const [cA, cB] = key.split('|');
        conflicts.set(key, {
          cellA: cA, cellB: cB,
          pciA: a.cellname === cA ? a.pci : b.pci,
          pciB: a.cellname === cB ? a.pci : b.pci,
          mod3: a.pci % 3,
          occurrences: 0,
        });
      }
      conflicts.get(key).occurrences++;
    }
  });

  const conflictList = [...conflicts.values()].sort((a, b) => b.occurrences - a.occurrences);

  const totalCells = cells.length;
  const distRows = [0, 1, 2].map(m => {
    const cnt = mod3Dist[m];
    const pct = ((cnt / totalCells) * 100).toFixed(1);
    const idealPct = 33.3;
    const dev = Math.abs(parseFloat(pct) - idealPct);
    const color = dev < 8 ? 'var(--green)' : dev < 15 ? 'var(--yellow)' : 'var(--orange)';
    return `<div class="dist-row">
      <div class="dist-lbl" style="color:${color}">PCI mod 3 = ${m}</div>
      <div class="dist-track">
        <div class="dist-fill" style="width:${pct}%;background:${color}28;border-left:2px solid ${color}">
          <span class="dist-pct">${pct}%</span>
        </div>
      </div>
      <div class="dist-cnt" style="color:var(--text3)">${cnt} cell</div>
    </div>`;
  }).join('');

  const conflictRows = conflictList.slice(0, 20).map((c, i) => {
    const sevColor = c.occurrences > 20 ? 'var(--red)' : c.occurrences > 8 ? 'var(--orange)' : 'var(--yellow)';
    return `<tr>
      <td style="color:var(--text3);font-size:9px">${i+1}</td>
      <td style="color:var(--text2);font-family:var(--mono);font-size:10px">${c.cellA}</td>
      <td style="text-align:center;color:var(--cyan);font-family:var(--mono);font-weight:600">${c.pciA}</td>
      <td style="color:var(--text2);font-family:var(--mono);font-size:10px">${c.cellB}</td>
      <td style="text-align:center;color:var(--cyan);font-family:var(--mono);font-weight:600">${c.pciB}</td>
      <td style="text-align:center;color:var(--orange);font-weight:600">${c.mod3}</td>
      <td style="text-align:right;color:${sevColor};font-weight:600">${c.occurrences}</td>
    </tr>`;
  }).join('');

  const conflictBlock = conflictList.length === 0
    ? `<div class="info-card" style="padding:20px;text-align:center;margin-top:12px">
        <div style="color:var(--green);font-family:var(--mono);font-size:13px;font-weight:600">TIDAK ADA POTENSI MOD-3 CONFLICT</div>
        <div style="color:var(--text3);font-size:11px;margin-top:6px">Cell yang berdekatan tidak share PCI mod 3</div>
      </div>`
    : `<div class="danger-wrap" style="margin-top:12px">
        <div class="danger-hdr">
          <span style="display:inline-flex;align-items:center;gap:4px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Potensi PCI Mod-3 Conflict
          </span>
        </div>
        <div class="danger-scroll">
          <table class="rawan-table">
            <thead><tr>
              <th>#</th>
              <th>Cell A</th><th>PCI A</th>
              <th>Cell B</th><th>PCI B</th>
              <th>Mod 3</th>
              <th style="text-align:right">Co-observed (kali)</th>
            </tr></thead>
            <tbody>${conflictRows}</tbody>
          </table>
        </div>
      </div>`;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px">
      ${extraCard('Cell dengan PCI', cells.length, 'Min 5 observasi')}
      ${extraCard('Unique PCI', [...new Set(cells.map(c=>c.pci))].length, 'Total PCI berbeda')}
      ${extraCard('Coverage Sample', withPci.length.toLocaleString(), `${((withPci.length/DATA.length)*100).toFixed(1)}% dari data`)}
      ${extraCard('Konflik Mod-3', conflictList.length, conflictList.length ? 'Pair perlu cek' : 'Bersih')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="info-card" style="padding:14px">
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);letter-spacing:0.08em;margin-bottom:10px">DISTRIBUSI PCI MOD 3</div>
        ${distRows}
        <div style="color:var(--text3);font-size:10px;margin-top:10px;line-height:1.6">
          Idealnya tiap grup mod-3 tersebar ~33%. Distribusi yang tidak merata bisa indikasi planning yang kurang seimbang.
        </div>
      </div>
      <div class="info-card" style="padding:14px">
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);letter-spacing:0.08em;margin-bottom:10px">INTERPRETASI</div>
        <div style="font-size:11px;color:var(--text2);line-height:1.8">
          <p style="margin-bottom:6px">PCI mod-3 conflict = dua cell dengan <em>PCI berbeda</em> tapi <em>PCI mod 3 sama</em> diamati berdekatan dalam rute drive test.</p>
          <p style="margin-bottom:6px">Konsekuensi: keduanya transmit Primary Synchronization Sequence (PSS) yang sama. UE bisa salah-deteksi cell saat initial sync, dan PRACH preamble bisa collision.</p>
          <p style="color:var(--text3);font-size:10px">Jangan otomatis assume "harus diganti" — heuristik ini cuma flag <em>kandidat</em>. Konfirmasi dengan tool planning resmi (Atoll/Asset/MapInfo Pro) yang punya neighbor list aktual.</p>
        </div>
      </div>
    </div>
    ${conflictBlock}`;
}

// INIT all new features after buildAll
window._buildNewFeatures = function() {
  CakraMap.buildAnalysisLayers(DATA, { gapThreshold: -100, windowSize: 10 });
  buildCoverageGapPanel();
  buildCellChurnPanel();
  buildThroughputCorrelation();
  buildSiteView();
  buildPciConflictPanel();
};
