// export.js — export utilities (PNG, CSV, PDF) — Cakra v2.0.1
// © 2026 Robertino Gladden Narendra. Hak cipta dilindungi.
'use strict';

window.CakraExport = (() => {

  function exportPDF() {
    const D = window.DATA || [];
    const E = window.EVENTS || [];
    if (!D.length) { alert('Tidak ada data untuk diekspor.'); return; }

    showToast('Membuat laporan PDF...');

    const meta   = buildMeta(D, E);
    const kpi    = buildKPIData(D);
    const rawan  = D.filter(d => d.rsrp < -100 || d.rsrq < -19 || d.snr < -10);
    const hasNr  = D.some(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp));
    const nrStats = hasNr ? buildNrStats(D) : null;
    const rawFilename = sessionStorage.getItem('cakra_filename') || 'Drive Test';
    const filename = rawFilename.length > 80 ? rawFilename.substring(0, 80) + '...' : rawFilename;
    const tool   = sessionStorage.getItem('cakra_tool') || 'G-NetTrack Pro';
    const now    = new Date().toLocaleString('id-ID');

    const distRows = (items, total) => items.map(it => {
      const pct = ((it.count / total) * 100).toFixed(1);
      return `<tr>
        <td>${it.label}</td>
        <td><div style="background:#e5e7eb;border-radius:3px;height:8px;width:100%;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${it.color};border-radius:3px"></div></div></td>
        <td style="text-align:right;font-weight:600">${pct}%</td>
        <td style="text-align:right;color:#6b7280">${it.count.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const distRsrp = [
      {label:'> −80 dBm (Sangat Baik)',  color:'#3b82f6', count:D.filter(d=>d.rsrp>-80).length},
      {label:'−80 ~ −90 dBm (Bagus)',    color:'#22c55e', count:D.filter(d=>d.rsrp<=-80&&d.rsrp>-90).length},
      {label:'−90 ~ −100 dBm (Normal)',  color:'#eab308', count:D.filter(d=>d.rsrp<=-90&&d.rsrp>-100).length},
      {label:'−100 ~ −110 dBm (Buruk)',  color:'#f97316', count:D.filter(d=>d.rsrp<=-100&&d.rsrp>-110).length},
      {label:'< −110 dBm (Sgt Buruk)',   color:'#ef4444', count:D.filter(d=>d.rsrp<=-110).length},
    ];
    const distRsrq = [
      {label:'> −9 dB (Excellent)',    color:'#3b82f6', count:D.filter(d=>d.rsrq>-9).length},
      {label:'−9 ~ −10 dB (Best)',     color:'#22c55e', count:D.filter(d=>d.rsrq<=-9&&d.rsrq>-10).length},
      {label:'−10 ~ −15 dB (Good)',    color:'#22c55e', count:D.filter(d=>d.rsrq<=-10&&d.rsrq>-15).length},
      {label:'−15 ~ −19 dB (Poor)',    color:'#f97316', count:D.filter(d=>d.rsrq<=-15&&d.rsrq>-19).length},
      {label:'< −19 dB (Bad)',         color:'#ef4444', count:D.filter(d=>d.rsrq<=-19).length},
    ];
    const distSnr = [
      {label:'> 20 dB (Sangat Baik)',  color:'#3b82f6', count:D.filter(d=>d.snr>20).length},
      {label:'10 ~ 20 dB (Baik)',      color:'#22c55e', count:D.filter(d=>d.snr<=20&&d.snr>10).length},
      {label:'0 ~ 10 dB (Cukup)',      color:'#eab308', count:D.filter(d=>d.snr<=10&&d.snr>0).length},
      {label:'−10 ~ 0 dB (Buruk)',     color:'#f97316', count:D.filter(d=>d.snr<=0&&d.snr>-10).length},
      {label:'< −10 dB (Sgt Buruk)',   color:'#ef4444', count:D.filter(d=>d.snr<=-10).length},
    ];

    const hoCount = E.filter(e=>(e.typeCategory||e.type)==='HANDOVER').length;
    const rsCount = E.filter(e=>(e.typeCategory||e.type)==='RESELECTION').length;
    const nrEvt   = E.filter(e=>e.isNr).length; const allHO = hoCount; const allRS = rsCount;

    const rawanSample = rawan;
    const rawanRows = rawanSample.map((d,i) => {
      const issues = [];
      if (d.rsrp<-100) issues.push('RSRP');
      if (d.rsrq<-19)  issues.push('RSRQ');
      if (d.snr<-10)   issues.push('SNR');
      return `<tr>
        <td>${i+1}</td>
        <td>${d.timePart||''}</td>
        <td style="color:#ef4444;font-weight:600">${d.rsrp}</td>
        <td style="color:${d.rsrq<-19?'#ef4444':'#374151'}">${d.rsrq}</td>
        <td style="color:${d.snr<-10?'#ef4444':'#374151'}">${d.snr}</td>
        <td>${d.cellname||'—'}</td>
        <td>${issues.join(', ')}</td>
      </tr>`;
    }).join('');

    const nrSection = hasNr && nrStats ? `
      <div class="section">
        <div class="section-title">5G NR Parameter</div>
        <table class="kpi-table">
          <thead><tr><th>Parameter</th><th>Rata-rata</th><th>Min</th><th>Max</th><th>Sampel</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>NR-RSRP</strong></td>
              <td class="mono">${nrStats.rsrp.avg} dBm</td>
              <td class="mono">${nrStats.rsrp.min} dBm</td>
              <td class="mono">${nrStats.rsrp.max} dBm</td>
              <td>${nrStats.count.toLocaleString()} pts</td>
              <td><span class="badge ${nrStats.rsrp.avg>-80?'badge-good':nrStats.rsrp.avg>-100?'badge-warn':'badge-bad'}">${nrStats.rsrp.avg>-80?'EXCELLENT':nrStats.rsrp.avg>-100?'GOOD':'POOR'}</span></td>
            </tr>
            ${nrStats.sinr && nrStats.sinr.count > 0 ? `<tr>
              <td><strong>SS-SINR</strong></td>
              <td class="mono">${nrStats.sinr.avg} dB</td>
              <td class="mono">${nrStats.sinr.min} dB</td>
              <td class="mono">${nrStats.sinr.max} dB</td>
              <td>${nrStats.sinr.count.toLocaleString()} pts</td>
              <td><span class="badge ${nrStats.sinr.avg>13?'badge-good':nrStats.sinr.avg>0?'badge-warn':'badge-bad'}">${nrStats.sinr.avg>13?'GOOD':nrStats.sinr.avg>0?'FAIR':'POOR'}</span></td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Cakra — Laporan Drive Test · ${filename}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Arial', 'Helvetica Neue', sans-serif; font-size: 12px; color: #1f2937; background: #fff; line-height: 1.5; }
  @page { size: A4; margin: 18mm 16mm; }
  @media print { .no-print { display: none !important; } }

  /* HEADER */
  .report-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 16px; border-bottom: 2px solid #0891b2; margin-bottom: 20px; }
  .report-logo { font-family: monospace; font-size: 22px; font-weight: 700; color: #0891b2; letter-spacing: 0.05em; }
  .report-tagline { font-size: 9px; color: #6b7280; letter-spacing: 0.1em; margin-top: 2px; }
  .report-meta { text-align: right; font-size: 9.5px; color: #6b7280; line-height: 1.7; }
  .report-meta strong { color: #1f2937; }

  /* SECTIONS */
  .section { margin-bottom: 22px; page-break-inside: avoid; }
  .section-title { font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #0891b2; border-left: 3px solid #0891b2; padding-left: 8px; margin-bottom: 12px; }

  /* INFO GRID */
  .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .info-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
  .info-label { font-size: 8.5px; color: #9ca3af; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 3px; }
  .info-value { font-family: monospace; font-size: 13px; font-weight: 700; color: #1f2937; }
  .info-sub { font-size: 9px; color: #9ca3af; margin-top: 2px; }

  /* KPI TABLE */
  .kpi-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .kpi-table th { background: #f3f4f6; color: #374151; font-weight: 600; padding: 7px 10px; text-align: left; border: 1px solid #e5e7eb; font-size: 9.5px; letter-spacing: 0.04em; }
  .kpi-table td { padding: 7px 10px; border: 1px solid #e5e7eb; vertical-align: middle; font-size: 11px; }
  .kpi-table tr:nth-child(even) td { background: #f9fafb; }
  .mono { font-family: monospace; }

  /* BADGE */
  .badge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.06em; }
  .badge-good { background: #dcfce7; color: #166534; }
  .badge-warn { background: #fef9c3; color: #854d0e; }
  .badge-bad  { background: #fee2e2; color: #991b1b; }
  .badge-info { background: #dbeafe; color: #1e40af; }

  /* DISTRIBUTION */
  .dist-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .dist-table td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  .dist-table td:first-child { width: 200px; color: #374151; }
  .dist-table td:nth-child(2) { width: 180px; }
  .dist-table td:nth-child(3) { width: 50px; }
  .dist-table td:last-child { width: 70px; }

  /* RAWAN TABLE */
  .rawan-table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .rawan-table th { background: #fef2f2; color: #991b1b; font-weight: 600; padding: 7px 10px; border: 1px solid #fecaca; text-align: left; font-size: 11px; }
  .rawan-table td { padding: 6px 10px; border: 1px solid #e5e7eb; font-size: 11px; }
  .rawan-table tr:nth-child(even) td { background: #fafafa; }

  /* SUMMARY BOX */
  .summary-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 14px 16px; }
  .summary-box p { font-size: 10.5px; color: #0c4a6e; line-height: 1.7; margin-bottom: 6px; }
  .summary-box p:last-child { margin-bottom: 0; }

  /* EVENTS */
  .event-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8px; font-weight: 700; }
  .tag-ho { background: #fef9c3; color: #854d0e; }
  .tag-rs { background: #f3e8ff; color: #6b21a8; }
  .tag-nr { background: #dcfce7; color: #166534; }

  /* PRINT BTN */
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #0891b2; color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: monospace; letter-spacing: 0.06em; box-shadow: 0 4px 12px rgba(8,145,178,0.3); z-index: 999; }
  .print-btn:hover { background: #0e7490; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8.5px; color: #9ca3af; font-family: monospace; }
</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">🖨 Print / Save PDF</button>

<!-- HEADER -->
<div class="report-header">
  <div>
    <div class="report-logo">◈ CAKRA</div>
    <div class="report-tagline">SINYAL TERBACA. JARINGAN TERPETAKAN.</div>
    <div style="font-size:9px;color:#9ca3af;margin-top:6px">Laporan Drive Test Internal · Confidential</div>
  </div>
  <div class="report-meta">
    <strong>File:</strong> ${filename}<br>
    <strong>Tool:</strong> ${tool}<br>
    <strong>Teknologi:</strong> ${meta.tech}<br>
    <strong>Operator:</strong> ${meta.operator}<br>
    <strong>Digenerate:</strong> ${now}
  </div>
</div>

<!-- 01 INFORMASI SESI -->
<div class="section">
  <div class="section-title">01 · Informasi Sesi Drive Test</div>
  <div class="info-grid">
    <div class="info-card">
      <div class="info-label">Tanggal</div>
      <div class="info-value" style="font-size:11px">${meta.date}</div>
      <div class="info-sub">${meta.timeStart} — ${meta.timeEnd}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Durasi</div>
      <div class="info-value">${meta.duration}</div>
      <div class="info-sub">Total waktu sesi</div>
    </div>
    <div class="info-card">
      <div class="info-label">Data Point</div>
      <div class="info-value">${D.length.toLocaleString()}</div>
      <div class="info-sub">GPS valid: ${meta.gpsCount.toLocaleString()}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Kec. Rata-rata</div>
      <div class="info-value">${meta.avgSpeed} km/h</div>
      <div class="info-sub">Maks: ${meta.maxSpeed} km/h</div>
    </div>
    <div class="info-card">
      <div class="info-label">Operator</div>
      <div class="info-value" style="font-size:11px">${meta.operator}</div>
      <div class="info-sub">Teknologi: ${meta.tech}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Band LTE</div>
      <div class="info-value">${meta.band ? 'Band ' + meta.band : '—'}</div>
      <div class="info-sub">BW: ${meta.bw ? meta.bw + ' MHz' : '—'}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Serving Cell</div>
      <div class="info-value" style="font-size:10px">${meta.cellname}</div>
      <div class="info-sub">Unique cells: ${meta.uniqueCells}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Titik Rawan</div>
      <div class="info-value" style="color:${rawan.length>0?'#ef4444':'#22c55e'}">${rawan.length}</div>
      <div class="info-sub">${((rawan.length/D.length)*100).toFixed(1)}% dari total data</div>
    </div>
  </div>
</div>

<!-- 02 KPI SUMMARY -->
<div class="section">
  <div class="section-title">02 · Ringkasan KPI</div>
  <table class="kpi-table">
    <thead>
      <tr><th>Parameter</th><th>Rata-rata</th><th>Min</th><th>Max</th><th>Standar</th><th>Status</th><th>Throughput</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>RSRP</strong></td>
        <td class="mono">${kpi.rsrp.avg} dBm</td>
        <td class="mono">${kpi.rsrp.min} dBm</td>
        <td class="mono">${kpi.rsrp.max} dBm</td>
        <td class="mono">> −90 dBm</td>
        <td><span class="badge ${kpi.rsrp.avg>-80?'badge-good':kpi.rsrp.avg>-100?'badge-warn':'badge-bad'}">${kpi.rsrp.avg>-80?'SANGAT BAIK':kpi.rsrp.avg>-90?'BAGUS':kpi.rsrp.avg>-100?'NORMAL':'BURUK'}</span></td>
        <td rowspan="3" style="vertical-align:middle;text-align:center">
          <div style="font-size:9px;color:#6b7280">DL avg</div>
          <div class="mono" style="font-size:14px;font-weight:700;color:#0891b2">${kpi.avgDl} Mbps</div>
          <div style="font-size:9px;color:#6b7280;margin-top:4px">UL avg</div>
          <div class="mono" style="font-size:14px;font-weight:700;color:#f97316">${kpi.avgUl} Mbps</div>
        </td>
      </tr>
      <tr>
        <td><strong>RSRQ</strong></td>
        <td class="mono">${kpi.rsrq.avg} dB</td>
        <td class="mono">${kpi.rsrq.min} dB</td>
        <td class="mono">${kpi.rsrq.max} dB</td>
        <td class="mono">> −10 dB</td>
        <td><span class="badge ${kpi.rsrq.avg>-9?'badge-good':kpi.rsrq.avg>-15?'badge-warn':'badge-bad'}">${kpi.rsrq.avg>-9?'EXCELLENT':kpi.rsrq.avg>-15?'GOOD':'POOR'}</span></td>
      </tr>
      <tr>
        <td><strong>SNR</strong></td>
        <td class="mono">${kpi.snr.avg} dB</td>
        <td class="mono">${kpi.snr.min} dB</td>
        <td class="mono">${kpi.snr.max} dB</td>
        <td class="mono">> 10 dB</td>
        <td><span class="badge ${kpi.snr.avg>10?'badge-good':kpi.snr.avg>0?'badge-warn':'badge-bad'}">${kpi.snr.avg>10?'BAIK':kpi.snr.avg>0?'CUKUP':'BURUK'}</span></td>
      </tr>
    </tbody>
  </table>
</div>

${nrSection}

<!-- 03 DISTRIBUSI -->
<div class="section">
  <div class="section-title">03 · Distribusi Parameter</div>
  <div class="two-col">
    <div>
      <div style="font-size:9px;font-weight:700;color:#374151;letter-spacing:0.08em;margin-bottom:6px">RSRP</div>
      <table class="dist-table">${distRows(distRsrp, D.length)}</table>
    </div>
    <div>
      <div style="font-size:9px;font-weight:700;color:#374151;letter-spacing:0.08em;margin-bottom:6px">RSRQ</div>
      <table class="dist-table">${distRows(distRsrq, D.length)}</table>
    </div>
  </div>
  <div style="margin-top:12px">
    <div style="font-size:9px;font-weight:700;color:#374151;letter-spacing:0.08em;margin-bottom:6px">SNR</div>
    <table class="dist-table">${distRows(distSnr, D.length)}</table>
  </div>
</div>

<!-- 04 HANDOVER EVENTS -->
${E.length ? `<div class="section">
  <div class="section-title">04 · Handover & Cell Reselection Events</div>
  <div class="info-grid" style="grid-template-columns:repeat(${nrEvt?4:3},1fr)">
    <div class="info-card"><div class="info-label">Total Events</div><div class="info-value">${E.length}</div></div>
    <div class="info-card"><div class="info-label">Handover</div><div class="info-value" style="color:#d97706">${hoCount}</div></div>
    <div class="info-card"><div class="info-label">Reselection</div><div class="info-value" style="color:#7c3aed">${rsCount}</div></div>
    ${nrEvt ? `<div class="info-card"><div class="info-label">NR Events</div><div class="info-value" style="color:#16a34a">${nrEvt}</div></div>` : ''}
  </div>
  ${E.length > 0 ? `<table class="kpi-table" style="margin-top:10px;font-size:9.5px">
    <thead><tr><th>#</th><th>Tipe</th><th>Waktu</th><th>From</th><th>To</th><th>RSRP</th><th>RSRQ</th></tr></thead>
    <tbody>${E.map((ev,i)=>`<tr>
      <td>${i+1}</td>
      <td><span class="event-tag ${ev.type==='HANDOVER'?'tag-ho':'tag-rs'}">${ev.type==='HANDOVER'?'HO':'RS'}</span>${ev.isNr?` <span class="event-tag tag-nr">NR</span>`:''}</td>
      <td class="mono">${ev.timeDisp||ev.time}</td>
      <td>${ev.fromCell}</td><td>${ev.toCell}</td>
      <td class="mono">${ev.rsrp}</td><td class="mono">${ev.rsrq}</td>
    </tr>`).join('')}
    
    </tbody>
  </table>` : ''}
</div>` : ''}

<!-- 05 TITIK RAWAN -->
${rawan.length ? `<div class="section">
  <div class="section-title">05 · Titik Rawan Sinyal</div>
  <div class="info-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">
    <div class="info-card"><div class="info-label">Total Rawan</div><div class="info-value" style="color:#ef4444">${rawan.length}</div><div class="info-sub">${((rawan.length/D.length)*100).toFixed(1)}% dari data</div></div>
    <div class="info-card"><div class="info-label">RSRP < −100</div><div class="info-value" style="color:#ef4444">${D.filter(d=>d.rsrp<-100).length}</div></div>
    <div class="info-card"><div class="info-label">RSRQ < −19</div><div class="info-value" style="color:#ef4444">${D.filter(d=>d.rsrq<-19).length}</div></div>
    <div class="info-card"><div class="info-label">SNR < −10</div><div class="info-value" style="color:#ef4444">${D.filter(d=>d.snr<-10).length}</div></div>
  </div>
  <table class="rawan-table">
    <thead><tr><th>#</th><th>Waktu</th><th>RSRP (dBm)</th><th>RSRQ (dB)</th><th>SNR (dB)</th><th>Cell</th><th>Issue</th></tr></thead>
    <tbody>${rawanRows}</tbody>
  </table>
  
</div>` : `<div class="section">
  <div class="section-title">05 · Titik Rawan Sinyal</div>
  <div class="summary-box"><p>✅ <strong>Tidak ada titik rawan</strong> — semua parameter RSRP, RSRQ, dan SNR berada dalam batas normal sepanjang rute drive test.</p></div>
</div>`}

<!-- 06 KESIMPULAN -->
<div class="section">
  <div class="section-title">06 · Kesimpulan</div>
  <div class="summary-box">
    <p>Sesi drive test pada <strong>${meta.date}</strong> merekam <strong>${D.length.toLocaleString()} data point</strong> selama <strong>${meta.duration}</strong> menggunakan <strong>${tool}</strong>.</p>
    <p>Rata-rata RSRP <strong>${kpi.rsrp.avg} dBm</strong> (${kpi.rsrp.avg>-80?'sangat baik':kpi.rsrp.avg>-90?'bagus':kpi.rsrp.avg>-100?'normal':'perlu perhatian'}), RSRQ <strong>${kpi.rsrq.avg} dB</strong> (${kpi.rsrq.avg>-9?'excellent':kpi.rsrq.avg>-15?'good':'poor'}), SNR <strong>${kpi.snr.avg} dB</strong> (${kpi.snr.avg>10?'baik':kpi.snr.avg>0?'cukup':'buruk'}).</p>
    ${hasNr&&nrStats?`<p>Data 5G NR tersedia: <strong>${nrStats.count.toLocaleString()} pts</strong> NR aktif, rata-rata NR-RSRP <strong>${nrStats.rsrp.avg} dBm</strong>.</p>`:''}
    <p>Ditemukan <strong style="color:${rawan.length>0?'#b91c1c':'#166534'}">${rawan.length} titik rawan</strong> (${((rawan.length/D.length)*100).toFixed(1)}% dari total data)${rawan.length>0?' yang perlu ditindaklanjuti untuk optimasi jaringan.':'.'}</p>
    ${E.length?`<p>Total <strong>${E.length} events</strong> tercatat: <strong>${hoCount} handover</strong> dan <strong>${rsCount} cell reselection</strong>.</p>`:''}
  </div>
</div>

<div class="footer">
  <span>◈ CAKRA — Drive Test Intelligence</span>
  <span>Sinyal terbaca. Jaringan terpetakan.</span>
  <span>Generated: ${now}</span>
</div>

</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 800);
  }

  // EXCEL EXPORT — Real .xlsx via SheetJS CDN
  // Multi-sheet: RawData + KPI Summary + Distribusi

  async function exportExcel() {
    const D = window.DATA || [];
    if (!D.length) { alert('Tidak ada data untuk diekspor.'); return; }

    showToast('Memuat library Excel...');

    // Lazy-load SheetJS jika belum tersedia
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Gagal memuat SheetJS'));
        document.head.appendChild(s);
      });
    }

    showToast('Membuat file Excel...');

    const XLSX = window.XLSX;
    const hasNr = D.some(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp));
    const rawFn = (sessionStorage.getItem('cakra_filename') || 'cakra_export').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = rawFn.length > 60 ? rawFn.substring(0, 60) : rawFn;

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Raw Data ──
    const rawHeaders = [
      'Timestamp','Latitude','Longitude','RSRP (dBm)','RSRQ (dB)','SNR (dB)',
      'DL (Mbps)','UL (Mbps)','Speed (km/h)','Operator','Cell Name',
      'Technology','Band','BW (MHz)','ARFCN','State'
    ];
    if (hasNr) rawHeaders.push(
      'NR-RSRP','NR-RSRQ','SS-SINR','NR-RSSI','NR Band','NR ARFCN','NR PCI','NR DL (Mbps)','NR UL (Mbps)'
    );

    const rawRows = D.map(d => {
      const row = [
        d.tsDisp || d.ts || '',
        d.lat ?? '', d.lon ?? '',
        d.rsrp, d.rsrq, d.snr,
        d.dl > 0 ? parseFloat((d.dl/1000).toFixed(3)) : '',
        d.ul > 0 ? parseFloat((d.ul/1000).toFixed(3)) : '',
        parseFloat((d.speed * 3.6).toFixed(1)),
        d.operator || '', d.cellname || '', d.tech || '',
        d.band || '', d.bw || '', d.arfcn || '', d.state || '',
      ];
      if (hasNr) row.push(
        d.nr_rsrp ?? '', d.nr_rsrq ?? '', d.nr_sinr ?? '', d.nr_rssi ?? '',
        d.nr_band ?? '', d.nr_arfcn ?? '', d.nr_pci ?? '',
        d.nr_dl ? parseFloat((d.nr_dl/1000).toFixed(3)) : '',
        d.nr_ul ? parseFloat((d.nr_ul/1000).toFixed(3)) : ''
      );
      return row;
    });

    const wsRaw = XLSX.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
    // Freeze row pertama
    wsRaw['!freeze'] = {xSplit:0, ySplit:1, topLeftCell:'A2', activePane:'bottomLeft', state:'frozen'};
    wsRaw['!freeze'] = undefined;
    wsRaw['!views'] = [{state:'frozen', ySplit:1}];
    // Set lebar kolom
    wsRaw['!cols'] = [
      {wch:20},{wch:12},{wch:12},{wch:12},{wch:12},{wch:10},
      {wch:10},{wch:10},{wch:12},{wch:16},{wch:20},
      {wch:10},{wch:8},{wch:8},{wch:10},{wch:12},
      ...( hasNr ? [{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:8},{wch:12},{wch:12}] : [] )
    ];
    XLSX.utils.book_append_sheet(wb, wsRaw, 'Raw Data');

    // ── Sheet 2: KPI Summary ──
    const kpi = buildKPIData(D);
    const E = window.EVENTS || [];
    const rawan = D.filter(d => d.rsrp<-100||d.rsrq<-19||d.snr<-10);
    const hoCount = E.filter(e=>(e.typeCategory||e.type)==='HANDOVER').length;
    const rsCount = E.filter(e=>(e.typeCategory||e.type)==='RESELECTION').length;
    const nrEvt   = E.filter(e=>e.isNr).length;

    const summaryData = [
      ['CAKRA — RINGKASAN KPI DRIVE TEST', '', '', '', ''],
      ['', '', '', '', ''],
      ['File', sessionStorage.getItem('cakra_filename') || '', '', '', ''],
      ['Tanggal', D[0]?.ts?.substring(0,10) || '', '', '', ''],
      ['Total Data Point', D.length, '', '', ''],
      ['GPS Valid', D.filter(d=>d.lat&&d.lon).length, '', '', ''],
      ['', '', '', '', ''],
      ['PARAMETER KPI', '', '', '', ''],
      ['Parameter', 'Rata-rata', 'Min', 'Max', 'Satuan'],
      ['RSRP', parseFloat(kpi.rsrp.avg), parseFloat(kpi.rsrp.min), parseFloat(kpi.rsrp.max), 'dBm'],
      ['RSRQ', parseFloat(kpi.rsrq.avg), parseFloat(kpi.rsrq.min), parseFloat(kpi.rsrq.max), 'dB'],
      ['SNR',  parseFloat(kpi.snr.avg),  parseFloat(kpi.snr.min),  parseFloat(kpi.snr.max),  'dB'],
      ['DL Throughput', parseFloat(kpi.avgDl)||'', parseFloat(kpi.minDl)||'', parseFloat(kpi.maxDl)||'', 'Mbps'],
      ['UL Throughput', parseFloat(kpi.avgUl)||'', parseFloat(kpi.minUl)||'', parseFloat(kpi.maxUl)||'', 'Mbps'],
      ['', '', '', '', ''],
      ['EVENTS', '', '', '', ''],
      ['Total Events', E.length, '', '', ''],
      ['Handover', hoCount, '', '', ''],
      ['Cell Reselection', rsCount, '', '', ''],
      ['NR Events', nrEvt, '', '', ''],
      ['', '', '', '', ''],
      ['TITIK RAWAN', '', '', '', ''],
      ['Total', rawan.length, '', '', `${((rawan.length/D.length)*100).toFixed(1)}%`],
      ['RSRP < -100 dBm', D.filter(d=>d.rsrp<-100).length, '', '', ''],
      ['RSRQ < -19 dB',   D.filter(d=>d.rsrq<-19).length,  '', '', ''],
      ['SNR < -10 dB',    D.filter(d=>d.snr<-10).length,   '', '', ''],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{wch:22},{wch:14},{wch:12},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan KPI');

    // ── Sheet 3: Distribusi ──
    const distData = [
      ['DISTRIBUSI RSRP', 'Jumlah', 'Persentase', '', 'DISTRIBUSI RSRQ', 'Jumlah', 'Persentase'],
      ['> -80 dBm (Sangat Baik)',  D.filter(d=>d.rsrp>-80).length,               `${((D.filter(d=>d.rsrp>-80).length/D.length)*100).toFixed(1)}%`,               '', '> -9 dB (Excellent)',     D.filter(d=>d.rsrq>-9).length,               `${((D.filter(d=>d.rsrq>-9).length/D.length)*100).toFixed(1)}%`],
      ['-80 ~ -90 dBm (Bagus)',   D.filter(d=>d.rsrp<=-80&&d.rsrp>-90).length,  `${((D.filter(d=>d.rsrp<=-80&&d.rsrp>-90).length/D.length)*100).toFixed(1)}%`,  '', '-9 ~ -10 dB (Best)',      D.filter(d=>d.rsrq<=-9&&d.rsrq>-10).length, `${((D.filter(d=>d.rsrq<=-9&&d.rsrq>-10).length/D.length)*100).toFixed(1)}%`],
      ['-90 ~ -100 dBm (Normal)', D.filter(d=>d.rsrp<=-90&&d.rsrp>-100).length, `${((D.filter(d=>d.rsrp<=-90&&d.rsrp>-100).length/D.length)*100).toFixed(1)}%`, '', '-10 ~ -15 dB (Good)',    D.filter(d=>d.rsrq<=-10&&d.rsrq>-15).length,`${((D.filter(d=>d.rsrq<=-10&&d.rsrq>-15).length/D.length)*100).toFixed(1)}%`],
      ['-100 ~ -110 dBm (Buruk)', D.filter(d=>d.rsrp<=-100&&d.rsrp>-110).length,`${((D.filter(d=>d.rsrp<=-100&&d.rsrp>-110).length/D.length)*100).toFixed(1)}%`,'', '-15 ~ -19 dB (Poor)',    D.filter(d=>d.rsrq<=-15&&d.rsrq>-19).length,`${((D.filter(d=>d.rsrq<=-15&&d.rsrq>-19).length/D.length)*100).toFixed(1)}%`],
      ['< -110 dBm (Sgt Buruk)',  D.filter(d=>d.rsrp<=-110).length,              `${((D.filter(d=>d.rsrp<=-110).length/D.length)*100).toFixed(1)}%`,              '', '< -19 dB (Bad)',          D.filter(d=>d.rsrq<=-19).length,             `${((D.filter(d=>d.rsrq<=-19).length/D.length)*100).toFixed(1)}%`],
      ['', '', '', '', '', '', ''],
      ['DISTRIBUSI SNR', 'Jumlah', 'Persentase', '', '', '', ''],
      ['> 20 dB (Sangat Baik)',   D.filter(d=>d.snr>20).length,              `${((D.filter(d=>d.snr>20).length/D.length)*100).toFixed(1)}%`,              '', '', '', ''],
      ['10 ~ 20 dB (Baik)',       D.filter(d=>d.snr<=20&&d.snr>10).length,  `${((D.filter(d=>d.snr<=20&&d.snr>10).length/D.length)*100).toFixed(1)}%`,  '', '', '', ''],
      ['0 ~ 10 dB (Cukup)',       D.filter(d=>d.snr<=10&&d.snr>0).length,   `${((D.filter(d=>d.snr<=10&&d.snr>0).length/D.length)*100).toFixed(1)}%`,   '', '', '', ''],
      ['-10 ~ 0 dB (Buruk)',      D.filter(d=>d.snr<=0&&d.snr>-10).length,  `${((D.filter(d=>d.snr<=0&&d.snr>-10).length/D.length)*100).toFixed(1)}%`,  '', '', '', ''],
      ['< -10 dB (Sgt Buruk)',    D.filter(d=>d.snr<=-10).length,            `${((D.filter(d=>d.snr<=-10).length/D.length)*100).toFixed(1)}%`,            '', '', '', ''],
    ];
    const wsDist = XLSX.utils.aoa_to_sheet(distData);
    wsDist['!cols'] = [{wch:26},{wch:10},{wch:12},{wch:4},{wch:22},{wch:10},{wch:12}];
    XLSX.utils.book_append_sheet(wb, wsDist, 'Distribusi');

    // Jika ada data NR, tambah sheet NR
    const nrPts = D.filter(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp));
    if (nrPts.length) {
      const nrHeaders = ['Timestamp','NR-RSRP','NR-RSRQ','SS-SINR','NR-RSSI','NR Band','NR ARFCN','NR PCI','NR DL (Mbps)','NR UL (Mbps)'];
      const nrRows = nrPts.map(d => [
        d.tsDisp || d.ts || '',
        d.nr_rsrp ?? '', d.nr_rsrq ?? '', d.nr_sinr ?? '', d.nr_rssi ?? '',
        d.nr_band ?? '', d.nr_arfcn ?? '', d.nr_pci ?? '',
        d.nr_dl ? parseFloat((d.nr_dl/1000).toFixed(3)) : '',
        d.nr_ul ? parseFloat((d.nr_ul/1000).toFixed(3)) : '',
      ]);
      const wsNr = XLSX.utils.aoa_to_sheet([nrHeaders, ...nrRows]);
      wsNr['!views'] = [{state:'frozen', ySplit:1}];
      wsNr['!cols'] = [{wch:20},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:8},{wch:12},{wch:12}];
      XLSX.utils.book_append_sheet(wb, wsNr, '5G NR Data');
    }

    // Download
    XLSX.writeFile(wb, `Cakra_Export_${filename}.xlsx`);
    showToast(`Excel tersimpan — ${wb.SheetNames.length} sheet`);
  }

  function buildMeta(D, E) {
    // Use chronologically first/last by timestamp (string sorts same as date for "YYYY.MM.DD_HH.MM.SS" format).
    // Don't rely on D[0]/D[D.length-1] — array may be out of order from multi-file concat or after thinning.
    const sortedTs = D.map(d => d.ts).filter(Boolean).sort();
    const firstTs = sortedTs[0] || (D[0] && D[0].ts) || '';
    const lastTs  = sortedTs[sortedTs.length - 1] || (D[D.length-1] && D[D.length-1].ts) || '';
    const f = D.find(d => d.ts === firstTs) || D[0];
    const l = D.find(d => d.ts === lastTs) || D[D.length-1];
    const gps = D.filter(d=>d.lat&&d.lon);
    const speeds = D.map(d=>d.speed*3.6);
    const cells = {};
    D.forEach(d => { if(d.cellname) cells[d.cellname]=(cells[d.cellname]||0)+1; });
    return {
      date: firstTs.substring(0,10).replace(/\./g,'-') || '—',
      timeStart: f.timePart || firstTs.split('_')[1]?.replace(/\./g,':') || '—',
      timeEnd:   l.timePart || lastTs.split('_')[1]?.replace(/\./g,':') || '—',
      duration:  CakraParser.calcDuration(firstTs, lastTs),
      gpsCount:  gps.length,
      avgSpeed:  (speeds.reduce((a,b)=>a+b,0)/speeds.length).toFixed(1),
      maxSpeed:  Math.max(...speeds).toFixed(1),
      operator:  f.operator || '—',
      tech:      f._sessionTech==='NSA'?'5G NSA':f._sessionTech==='NR'?'5G NR SA':'4G LTE',
      band:      f.band || '',
      bw:        f.bw || '',
      cellname:  Object.entries(cells).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—',
      uniqueCells: Object.keys(cells).length,
      device:    f.device || '—',
    };
  }

  function buildKPIData(D) {
    // Defensive: filter null/NaN before min/max so a single bad row doesn't poison stats
    const _vals = k => D.map(d => d[k]).filter(v => v !== null && v !== undefined && !isNaN(v));
    const avg = k => { const v = _vals(k); return v.length ? parseFloat((v.reduce((s,x)=>s+x,0)/v.length).toFixed(1)) : 0; };
    const mn  = k => { const v = _vals(k); return v.length ? parseFloat(Math.min(...v).toFixed(1)) : 0; };
    const mx  = k => { const v = _vals(k); return v.length ? parseFloat(Math.max(...v).toFixed(1)) : 0; };
    const dlA = D.map(d=>d.dl).filter(x=>x>0);
    const ulA = D.map(d=>d.ul).filter(x=>x>0);
    return {
      rsrp: {avg:avg('rsrp'),min:mn('rsrp'),max:mx('rsrp')},
      rsrq: {avg:avg('rsrq'),min:mn('rsrq'),max:mx('rsrq')},
      snr:  {avg:avg('snr'), min:mn('snr'), max:mx('snr')},
      avgDl: dlA.length?(dlA.reduce((a,b)=>a+b,0)/dlA.length/1000).toFixed(2):'—',
      maxDl: dlA.length?(Math.max(...dlA)/1000).toFixed(2):'—',
      minDl: dlA.length?(Math.min(...dlA)/1000).toFixed(2):'—',
      avgUl: ulA.length?(ulA.reduce((a,b)=>a+b,0)/ulA.length/1000).toFixed(2):'—',
      maxUl: ulA.length?(Math.max(...ulA)/1000).toFixed(2):'—',
      minUl: ulA.length?(Math.min(...ulA)/1000).toFixed(2):'—',
    };
  }

  function buildNrStats(D) {
    const nrPts   = D.filter(d=>d.nr_rsrp!==null&&!isNaN(d.nr_rsrp));
    const sinrPts = D.filter(d=>d.nr_sinr!==null&&!isNaN(d.nr_sinr));
    const avg = (arr,k) => parseFloat((arr.reduce((s,d)=>s+d[k],0)/arr.length).toFixed(1));
    const mn  = (arr,k) => parseFloat(Math.min(...arr.map(d=>d[k])).toFixed(1));
    const mx  = (arr,k) => parseFloat(Math.max(...arr.map(d=>d[k])).toFixed(1));
    return {
      count: nrPts.length,
      rsrp:  {avg:avg(nrPts,'nr_rsrp'), min:mn(nrPts,'nr_rsrp'), max:mx(nrPts,'nr_rsrp')},
      sinr:  sinrPts.length ? {avg:avg(sinrPts,'nr_sinr'),min:mn(sinrPts,'nr_sinr'),max:mx(sinrPts,'nr_sinr'),count:sinrPts.length} : {count:0},
    };
  }

  function showToast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  return { exportPDF, exportExcel };
})();
