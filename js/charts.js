// charts.js — Chart.js rendering (LTE & 5G NR) — Cakra v2.0.1
// © 2026 Robertino Gladden Narendra. Hak cipta dilindungi.

'use strict';

window.CakraCharts = (() => {
  const instances = {};

  function destroyAll() {
    Object.values(instances).forEach(c => { try { c.destroy(); } catch(e){} });
    Object.keys(instances).forEach(k => delete instances[k]);
  }

  function baseOpts(ymin, ymax, unit, extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(11,15,26,0.96)',
          borderColor: 'rgba(56,189,248,0.25)',
          borderWidth: 1,
          titleFont: { family: "'JetBrains Mono', monospace", size: 10 },
          bodyFont:  { family: "'JetBrains Mono', monospace", size: 10 },
          titleColor: '#38bdf8',
          bodyColor: '#94aabf',
          padding: 10,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw !== null ? ctx.raw + unit : 'N/A'}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#4a6682', font: { family: "'JetBrains Mono', monospace", size: 9 }, maxRotation: 40, autoSkip: true, maxTicksLimit: 16 },
          grid: { color: 'rgba(56,189,248,0.04)' },
          border: { color: 'rgba(56,189,248,0.1)' }
        },
        y: {
          min: ymin, max: ymax,
          ticks: { color: '#4a6682', font: { family: "'JetBrains Mono', monospace", size: 9 }, callback: v => `${v}${unit}` },
          grid: { color: 'rgba(56,189,248,0.06)' },
          border: { color: 'rgba(56,189,248,0.1)' }
        },
        ...extra
      }
    };
  }

  function thinLabels(data, maxPts = 600) {
    if (data.length <= maxPts) return data;
    const step = Math.ceil(data.length / maxPts);
    return data.filter((_, i) => i % step === 0);
  }

  function badPts(data, key, thr, below = true) {
    return data.map(d => (below ? d[key] < thr : d[key] > thr) ? d[key] : null);
  }

  function buildAll(DATA) {
    destroyAll();

    const thinned = thinLabels(DATA);
    const n = thinned.length;
    const labels = thinned.map(d => d.timePart || d.ts.substring(11));

    instances.rsrp = new Chart(document.getElementById('rsrpChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'RSRP', data: thinned.map(d=>d.rsrp), borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,0.07)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:true, order:3 },
          { label:'−80 dBm', data: Array(n).fill(-80), borderColor:'rgba(74,222,128,0.45)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
          { label:'−100 dBm', data: Array(n).fill(-100), borderColor:'rgba(251,191,36,0.45)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
          { label:'Rawan', data: badPts(thinned,'rsrp',-100), borderColor:'transparent', backgroundColor:'#f87171', pointRadius:4, pointHoverRadius:6, showLine:false, order:1 },
        ]
      },
      options: baseOpts(-140, -50, ' dBm')
    });

    instances.rsrq = new Chart(document.getElementById('rsrqChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'RSRQ', data: thinned.map(d=>d.rsrq), borderColor:'#c084fc', backgroundColor:'rgba(192,132,252,0.07)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:true, order:3 },
          { label:'−10 dB', data: Array(n).fill(-10), borderColor:'rgba(74,222,128,0.45)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
          { label:'−19 dB', data: Array(n).fill(-19), borderColor:'rgba(248,113,113,0.45)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
          { label:'Rawan', data: badPts(thinned,'rsrq',-19), borderColor:'transparent', backgroundColor:'#f87171', pointRadius:4, pointHoverRadius:6, showLine:false, order:1 },
        ]
      },
      options: baseOpts(-26, -3, ' dB')
    });

    instances.snr = new Chart(document.getElementById('snrChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'SNR', data: thinned.map(d=>d.snr),
            segment: { borderColor: ctx => ctx.p0.parsed.y < 0 ? '#fb923c' : '#4ade80' },
            backgroundColor:'rgba(74,222,128,0.05)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:true, order:3 },
          { label:'0 dB', data: Array(n).fill(0), borderColor:'rgba(255,255,255,0.15)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
          { label:'Rawan', data: badPts(thinned,'snr',-10), borderColor:'transparent', backgroundColor:'#f87171', pointRadius:4, showLine:false, order:1 },
        ]
      },
      options: baseOpts(-28, 28, ' dB')
    });

    const dlData = thinned.map(d => d.dl > 0 ? +(d.dl/1000).toFixed(2) : null);
    const ulData = thinned.map(d => d.ul > 0 ? +(d.ul/1000).toFixed(2) : null);
    const nrDlData = thinned.map(d => (d.nr_dl !== null && d.nr_dl > 0) ? +(d.nr_dl/1000).toFixed(2) : null);
    const nrUlData = thinned.map(d => (d.nr_ul !== null && d.nr_ul > 0) ? +(d.nr_ul/1000).toFixed(2) : null);
    const hasNrTp = nrDlData.some(v => v !== null);

    const tpDatasets = [
      { label:'LTE DL', data: dlData, backgroundColor:'rgba(56,189,248,0.45)', borderColor:'rgba(56,189,248,0.7)', borderWidth:0.5, barPercentage:0.8, categoryPercentage:0.9 },
      { label:'LTE UL', data: ulData, backgroundColor:'rgba(251,146,60,0.45)', borderColor:'rgba(251,146,60,0.7)', borderWidth:0.5, barPercentage:0.8, categoryPercentage:0.9 },
    ];
    if (hasNrTp) {
      tpDatasets.push({ label:'NR DL', data: nrDlData, backgroundColor:'rgba(34,197,94,0.55)', borderColor:'rgba(34,197,94,0.8)', borderWidth:0.5, barPercentage:0.8, categoryPercentage:0.9 });
      tpDatasets.push({ label:'NR UL', data: nrUlData, backgroundColor:'rgba(168,85,247,0.45)', borderColor:'rgba(168,85,247,0.7)', borderWidth:0.5, barPercentage:0.8, categoryPercentage:0.9 });
    }
    instances.tp = new Chart(document.getElementById('tpChart'), {
      type: 'bar',
      data: { labels, datasets: tpDatasets },
      options: {
        ...baseOpts(0, null, ' Mbps'),
        plugins: {
          ...baseOpts(0,null,' Mbps').plugins,
          legend: { display: hasNrTp, labels:{ color:'#4a6682', font:{ family:"'JetBrains Mono', monospace", size:9 }, boxWidth:10, padding:12 } },
          tooltip: { ...baseOpts(0,null,' Mbps').plugins.tooltip, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw ?? 'N/A'} Mbps` } }
        }
      }
    });

    const nrRsrpData = thinned.map(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp) ? d.nr_rsrp : null);
    const hasNrRsrp = nrRsrpData.some(v => v !== null);
    const nrRsrpEl = document.getElementById('nrRsrpChart');
    if (nrRsrpEl && hasNrRsrp) {
      instances.nrRsrp = new Chart(nrRsrpEl, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label:'NR-RSRP', data: nrRsrpData, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,0.07)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:true, order:3 },
            { label:'−80 dBm', data: Array(n).fill(-80), borderColor:'rgba(56,189,248,0.4)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
            { label:'−100 dBm', data: Array(n).fill(-100), borderColor:'rgba(251,191,36,0.4)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
            { label:'Rawan', data: nrRsrpData.map(v => v !== null && v < -100 ? v : null), borderColor:'transparent', backgroundColor:'#f87171', pointRadius:4, showLine:false, order:1 },
          ]
        },
        options: baseOpts(-140, -50, ' dBm')
      });
    }

    const nrSinrData = thinned.map(d => d.nr_sinr !== null && !isNaN(d.nr_sinr) ? d.nr_sinr : null);
    const hasNrSinr = nrSinrData.some(v => v !== null);
    const nrSinrEl = document.getElementById('nrSinrChart');
    if (nrSinrEl && hasNrSinr) {
      instances.nrSinr = new Chart(nrSinrEl, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label:'SS-SINR', data: nrSinrData,
              segment: { borderColor: ctx => ctx.p0.parsed.y < 0 ? '#fb923c' : '#a78bfa' },
              backgroundColor:'rgba(167,139,250,0.06)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:true, order:3 },
            { label:'0 dB', data: Array(n).fill(0), borderColor:'rgba(255,255,255,0.15)', borderWidth:1, borderDash:[6,4], pointRadius:0, order:4 },
            { label:'13 dB (Good)', data: Array(n).fill(13), borderColor:'rgba(74,222,128,0.35)', borderWidth:1, borderDash:[4,4], pointRadius:0, order:4 },
          ]
        },
        options: baseOpts(-20, 40, ' dB')
      });
    }

    instances.all = new Chart(document.getElementById('allChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'RSRP', data: thinned.map(d=>d.rsrp), borderColor:'#38bdf8', borderWidth:1.5, pointRadius:0, tension:0.3, fill:false, yAxisID:'yRsrp' },
          { label:'RSRQ', data: thinned.map(d=>d.rsrq), borderColor:'#c084fc', borderWidth:1.5, pointRadius:0, tension:0.3, fill:false, yAxisID:'yRsrq' },
          { label:'SNR',  data: thinned.map(d=>d.snr),  borderColor:'#4ade80', borderWidth:1.5, pointRadius:0, tension:0.3, fill:false, yAxisID:'ySnr',
            segment: { borderColor: ctx => ctx.p0.parsed.y < 0 ? '#fb923c' : '#4ade80' } },
          ...(hasNrRsrp ? [{ label:'NR-RSRP', data: nrRsrpData, borderColor:'#22c55e', borderWidth:1.5, borderDash:[3,3], pointRadius:0, tension:0.3, fill:false, yAxisID:'yRsrp' }] : []),
          ...(hasNrSinr ? [{ label:'SS-SINR', data: nrSinrData, borderColor:'#a78bfa', borderWidth:1.5, borderDash:[3,3], pointRadius:0, tension:0.3, fill:false, yAxisID:'ySnr' }] : []),
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600 },
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display:true, labels:{ color:'#4a6682', font:{ family:"'JetBrains Mono', monospace", size:9 }, boxWidth:10, padding:16 } },
          tooltip: baseOpts(0,0,'').plugins.tooltip
        },
        scales: {
          x: { ticks:{ color:'#4a6682', font:{ family:"'JetBrains Mono', monospace", size:9 }, maxTicksLimit:16 }, grid:{ color:'rgba(56,189,248,0.04)' }, border:{ color:'rgba(56,189,248,0.1)' } },
          yRsrp: { type:'linear', position:'left',  min:-140, max:-50, ticks:{ color:'#38bdf8', font:{ family:"'JetBrains Mono', monospace", size:9 }, callback:v=>v+' dBm' }, grid:{ color:'rgba(56,189,248,0.05)' }, title:{ display:true, text:'RSRP', color:'#38bdf8', font:{size:9} } },
          yRsrq: { type:'linear', position:'right', min:-26,  max:-3,  ticks:{ color:'#c084fc', font:{ family:"'JetBrains Mono', monospace", size:9 }, callback:v=>v+' dB' }, grid:{ drawOnChartArea:false }, title:{ display:true, text:'RSRQ', color:'#c084fc', font:{size:9} } },
          ySnr:  { type:'linear', position:'right', min:-28,  max:40,  ticks:{ color:'#4ade80', font:{ family:"'JetBrains Mono', monospace", size:9 }, callback:v=>v+' dB' }, grid:{ drawOnChartArea:false }, title:{ display:true, text:'SNR/SINR', color:'#4ade80', font:{size:9} } },
        }
      }
    });

    buildSparkline('sparkRsrp', thinLabels(DATA, 60).map(d=>d.rsrp), '#38bdf8');
    buildSparkline('sparkRsrq', thinLabels(DATA, 60).map(d=>d.rsrq), '#c084fc');
    buildSparkline('sparkSnr',  thinLabels(DATA, 60).map(d=>d.snr),  '#4ade80');
  }

  function buildSparkline(id, values, color) {
    const el = document.getElementById(id);
    if (!el) return;
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%'; canvas.style.height = '32px';
    el.appendChild(canvas);
    new Chart(canvas, {
      type: 'line',
      data: { labels: values.map((_,i)=>i), datasets: [{ data:values, borderColor:color, borderWidth:1.5, pointRadius:0, tension:0.4, fill:false }] },
      options: { responsive:true, maintainAspectRatio:false, animation:{duration:800}, plugins:{legend:{display:false},tooltip:{enabled:false}}, scales:{ x:{display:false}, y:{display:false} } }
    });
  }

  function download(canvasId, name) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = canvas.height;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#0f1624';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, 0);
    const a = document.createElement('a');
    a.download = `Cakra_${name}_${new Date().toISOString().slice(0,10)}.png`;
    a.href = tmp.toDataURL('image/png');
    a.click();
  }

  return { buildAll, destroyAll, download };
})();

function downloadChart(id, name) { CakraCharts.download(id, name); }
