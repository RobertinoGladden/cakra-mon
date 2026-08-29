// predict.js — Virtual Drive Test controller — Cakra v2.1
// Menghubungkan propagation.js (model RF) + buildings.js (data OSM) ke peta Leaflet.
// © 2026 — dikembangkan sebagai ekstensi Cakra Drive Test Intelligence.

'use strict';

window.CakraPredict = (() => {
  let map = null;
  let siteMarker = null;
  let sectorLayer = null;
  let heatOverlay = null;
  let buildingsLayer = null;
  let realDataLayer = null;
  let buildingsCache = null; // { lat, lon, radius, list }
  let lastResult = null;

  const BAND_PRESETS = {
    900:  { label: '900 MHz (GSM/LTE)',      freqMHz: 900 },
    1800: { label: '1800 MHz (DCS/LTE)',     freqMHz: 1800 },
    2100: { label: '2100 MHz (UMTS/LTE)',    freqMHz: 2100 },
    2300: { label: '2300 MHz (TDD LTE)',     freqMHz: 2300 },
    2600: { label: '2600 MHz (LTE)',         freqMHz: 2600 },
    3500: { label: '3500 MHz (5G NR n78)',   freqMHz: 3500 },
  };

  const RSRP_COLOR = v =>
    v > -80 ? [56, 189, 248] : v > -90 ? [74, 222, 128] :
    v > -100 ? [250, 204, 21] : v > -110 ? [251, 146, 60] : [248, 113, 113];

  function $(id) { return document.getElementById(id); }

  function readForm() {
    return {
      lat: parseFloat($('siteLat').value),
      lon: parseFloat($('siteLon').value),
      hb: parseFloat($('siteHeight').value),
      hm: 1.5, // tinggi penerima standar (pejalan kaki/kendaraan)
      azimuth: parseFloat($('siteAzimuth').value),
      mechTilt: parseFloat($('mechTilt').value),
      elecTilt: parseFloat($('elecTilt').value),
      txPowerDbm: parseFloat($('txPower').value),
      feederLossDb: parseFloat($('feederLoss').value),
      gainMaxDbi: parseFloat($('antGain').value),
      beamwidthH: parseFloat($('beamwidthH').value),
      beamwidthV: parseFloat($('beamwidthV').value),
      frontToBack: parseFloat($('frontToBack').value),
      slaV: parseFloat($('slaV').value),
      freqMHz: parseFloat($('band').value),
      env: $('env').value,
      radiusM: parseFloat($('radius').value),
      cellSizeM: parseFloat($('resolution').value),
      thresholdDbm: parseFloat($('threshold').value),
      useBuildings: $('useBuildings').checked,
      useRealData: $('useRealData').checked,
    };
  }

  function initMap(defaultLat, defaultLon) {
    if (map) return;
    map = L.map('predictMap', { zoomControl: true, attributionControl: true }).setView([defaultLat, defaultLon], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(map);

    if (!map.getPane('predictPane')) {
      map.createPane('predictPane');
      map.getPane('predictPane').style.zIndex = 350;
    }
    if (!map.getPane('buildingPane')) {
      map.createPane('buildingPane');
      map.getPane('buildingPane').style.zIndex = 420;
    }

    siteMarker = L.marker([defaultLat, defaultLon], { draggable: true }).addTo(map);
    siteMarker.on('dragend', () => {
      const p = siteMarker.getLatLng();
      $('siteLat').value = p.lat.toFixed(6);
      $('siteLon').value = p.lng.toFixed(6);
      buildingsCache = null; // invalidasi cache — lokasi berubah
      updateSectorPreview();
    });

    map.on('click', (e) => {
      if (!$('clickToPlace').checked) return;
      siteMarker.setLatLng(e.latlng);
      $('siteLat').value = e.latlng.lat.toFixed(6);
      $('siteLon').value = e.latlng.lng.toFixed(6);
      buildingsCache = null;
      updateSectorPreview();
    });

    updateSectorPreview();
  }

  // Gambar wedge sektor (arah hadap antena ± setengah beamwidth horizontal) di peta
  function updateSectorPreview() {
    if (!map) return;
    const f = readForm();
    if (sectorLayer) map.removeLayer(sectorLayer);

    const pos = siteMarker.getLatLng();
    const R = Math.min(f.radiusM, 1500) * 0.55;
    const half = f.beamwidthH / 2;
    const steps = 24;
    const pts = [[pos.lat, pos.lng]];
    for (let i = 0; i <= steps; i++) {
      const az = f.azimuth - half + (2 * half) * (i / steps);
      const rad = CakraPropagation.toRad(az);
      const dx = Math.sin(rad) * R, dy = Math.cos(rad) * R;
      const proj = CakraPropagation.makeLocalProjection(pos.lat, pos.lng);
      pts.push(proj.toLatLon(dx, dy));
    }
    sectorLayer = L.polygon(pts, {
      pane: 'predictPane', color: '#38bdf8', weight: 1.5,
      fillColor: '#38bdf8', fillOpacity: 0.08, dashArray: '4 3',
    }).addTo(map);
  }

  // Bangun grid titik prediksi (persegi) dalam radius di sekitar site, dalam
  // koordinat lokal meter lalu dikonversi ke lat/lon.
  function buildGrid(siteLat, siteLon, radiusM, cellSizeM) {
    const MAX_CELLS_PER_AXIS = 90; // batas performa browser
    let cell = cellSizeM;
    const wanted = Math.ceil((2 * radiusM) / cell);
    if (wanted > MAX_CELLS_PER_AXIS) cell = (2 * radiusM) / MAX_CELLS_PER_AXIS;

    const n = Math.ceil((2 * radiusM) / cell);
    const proj = CakraPropagation.makeLocalProjection(siteLat, siteLon);
    const points = [];
    for (let j = 0; j < n; j++) {
      const y = -radiusM + (j + 0.5) * cell;
      for (let i = 0; i < n; i++) {
        const x = -radiusM + (i + 0.5) * cell;
        if (Math.hypot(x, y) > radiusM) { points.push(null); continue; }
        points.push({ x, y, i, j });
      }
    }
    return { points, n, cell, proj };
  }

  async function runPrediction() {
    const f = readForm();
    if (isNaN(f.lat) || isNaN(f.lon)) { showStatus('Koordinat site tidak valid', true); return; }

    setRunning(true);
    showStatus('Menyiapkan grid prediksi…');

    try {
      let buildings = [];
      if (f.useBuildings) {
        showStatus('Mengambil data bangunan dari OpenStreetMap…');
        try {
          if (buildingsCache && buildingsCache.lat === f.lat && buildingsCache.lon === f.lon &&
              buildingsCache.radius >= f.radiusM) {
            buildings = buildingsCache.list;
          } else {
            buildings = await CakraBuildings.fetchBuildings(f.lat, f.lon, f.radiusM + 100);
            buildingsCache = { lat: f.lat, lon: f.lon, radius: f.radiusM + 100, list: buildings };
          }
        } catch (e) {
          console.warn('Overpass gagal, lanjut tanpa data bangunan:', e);
          showStatus('Gagal ambil data bangunan (offline/timeout) — prediksi lanjut tanpa obstruksi', true);
          await sleep(1200);
        }
      }

      showStatus(`Menghitung prediksi (${buildings.length} bangunan dimuat)…`);
      await sleep(10); // biar status sempat render

      const { points, n, cell, proj } = buildGrid(f.lat, f.lon, f.radiusM, f.cellSizeM);

      // Pra-hitung bbox tiap bangunan dalam koordinat lokal XY untuk pre-filter cepat
      const buildingsXY = buildings.map(b => {
        const xy = b.footprint.map(([blat, blon]) => proj.toXY(blat, blon));
        return { id: b.id, heightM: b.heightM, xy, bb: CakraBuildings.bbox(xy) };
      });

      const results = new Array(points.length).fill(null);
      let sumLos = 0, countLos = 0, sumRsrp = 0, countValid = 0, countAbove = 0;

      for (let idx = 0; idx < points.length; idx++) {
        const p = points[idx];
        if (!p) continue;

        const distM = Math.hypot(p.x, p.y);
        if (distM < 5) { results[idx] = { rsrp: f.txPowerDbm - f.feederLossDb + f.gainMaxDbi, los: true }; continue; }

        const azimuthTo = (CakraPropagation.toDeg(Math.atan2(p.x, p.y)) + 360) % 360;
        const azOffset = CakraPropagation.angleDiff(azimuthTo, f.azimuth);
        const elevOffset = CakraPropagation.toDeg(Math.atan2(f.hb - f.hm, distM));

        let obstruction = null;
        if (buildingsXY.length) {
          obstruction = CakraBuildings.findDominantObstruction([0, 0], [p.x, p.y], f.hb, f.hm, buildingsXY);
        }

        const r = CakraPropagation.predictAtPoint({
          distM, azOffsetDeg: azOffset, elevOffsetDeg: elevOffset,
          freqMHz: f.freqMHz, hb: f.hb, hm: f.hm, env: f.env, los: true,
          txPowerDbm: f.txPowerDbm, feederLossDb: f.feederLossDb, gainMaxDbi: f.gainMaxDbi,
          mechTiltDeg: f.mechTilt, elecTiltDeg: f.elecTilt,
          beamwidthH: f.beamwidthH, beamwidthV: f.beamwidthV,
          frontToBack: f.frontToBack, slaV: f.slaV,
          obstruction,
        });

        r.buildingId = obstruction ? obstruction.buildingId : null;
        results[idx] = r;
        sumRsrp += r.rsrp; countValid++;
        if (r.los) { sumLos++; countLos++; }
        if (r.rsrp >= f.thresholdDbm) countAbove++;

        if (idx % 400 === 0) await sleep(0); // yield ke UI thread
      }

      lastResult = { points, n, cell, proj, results, form: f, buildings, buildingsXY };

      renderHeatmap(lastResult);
      renderBuildings(buildingsXY, lastResult);
      updateSectorPreview();

      const stats = {
        avgRsrp: countValid ? (sumRsrp / countValid) : NaN,
        losPct: countValid ? (sumLos / countValid * 100) : 0,
        coveragePct: countValid ? (countAbove / countValid * 100) : 0,
        buildingCount: buildings.length,
        gridPoints: countValid,
      };
      renderStats(stats);

      let compareStats = null;
      if (f.useRealData) {
        compareStats = compareWithRealData(lastResult);
        renderCompareStats(compareStats);
      } else {
        const el = $('compareStatsWrap'); if (el) el.style.display = 'none';
      }

      showStatus(`Selesai — ${countValid} titik dihitung, ${buildings.length} bangunan${f.useBuildings ? '' : ' (dimatikan)'}`);
    } catch (err) {
      console.error(err);
      showStatus('Gagal menjalankan prediksi: ' + err.message, true);
    } finally {
      setRunning(false);
    }
  }

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  function setRunning(state) {
    const btn = $('runPredictBtn');
    if (!btn) return;
    btn.disabled = state;
    btn.textContent = state ? 'Menghitung…' : 'Jalankan Prediksi →';
  }

  function showStatus(msg, isWarn) {
    const el = $('predictStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isWarn ? 'var(--amber, #fbbf24)' : 'var(--text2, #94aabf)';
  }

  // ─────────────────────────────────────────────
  // Render: heatmap prediksi via canvas → L.imageOverlay
  // ─────────────────────────────────────────────
  function renderHeatmap(res) {
    const { n, cell, proj, results, form } = res;
    if (heatOverlay) { map.removeLayer(heatOverlay); heatOverlay = null; }

    const canvas = document.createElement('canvas');
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(n, n);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const r = results[idx];
        const px = (( (n - 1 - j) * n) + i) * 4; // flip Y: canvas row 0 = utara (y max)
        if (!r) { img.data[px + 3] = 0; continue; }
        const [cr, cg, cb] = RSRP_COLOR(r.rsrp);
        img.data[px] = cr; img.data[px + 1] = cg; img.data[px + 2] = cb;
        img.data[px + 3] = Math.round(255 * 0.72);
      }
    }
    ctx.putImageData(img, 0, 0);

    const half = (n * cell) / 2;
    const sw = proj.toLatLon(-half, -half);
    const ne = proj.toLatLon(half, half);
    const bounds = [[sw[0], sw[1]], [ne[0], ne[1]]];

    heatOverlay = L.imageOverlay(canvas.toDataURL(), bounds, {
      opacity: 1, interactive: false, pane: 'predictPane',
    }).addTo(map);
    const imgEl = heatOverlay.getElement();
    if (imgEl) imgEl.style.imageRendering = 'auto'; // interpolasi halus ala heatmap
  }

  // ─────────────────────────────────────────────
  // Render: bangunan (highlight yang jadi obstruksi dominan minimal 1x)
  // ─────────────────────────────────────────────
  function renderBuildings(buildingsXY, res) {
    if (buildingsLayer) { map.removeLayer(buildingsLayer); buildingsLayer = null; }
    if (!buildingsXY.length) return;

    const blockingIds = new Set();
    res.results.forEach(r => { if (r && r.buildingId != null) blockingIds.add(r.buildingId); });

    buildingsLayer = L.layerGroup();
    buildingsXY.forEach(b => {
      const isBlocking = blockingIds.has(b.id);
      const latlngs = b.xy.map(([x, y]) => res.proj.toLatLon(x, y));
      L.polygon(latlngs, {
        pane: 'buildingPane',
        color: isBlocking ? '#f87171' : '#94aabf',
        weight: isBlocking ? 1.5 : 1,
        opacity: isBlocking ? 0.8 : 0.45,
        fillColor: isBlocking ? '#f87171' : '#334155',
        fillOpacity: isBlocking ? 0.35 : 0.5,
      }).bindTooltip(
        `${isBlocking ? '⚠ Menghalangi LOS · ' : ''}Bangunan · tinggi ~${b.heightM.toFixed(0)}m`,
        { sticky: true }
      ).addTo(buildingsLayer);
    });
    buildingsLayer.addTo(map);
  }

  // ─────────────────────────────────────────────
  // Bandingkan prediksi dengan data drive test asli (jika ada di sessionStorage)
  // ─────────────────────────────────────────────
  function getRealDataPoints() {
    try {
      const raw = sessionStorage.getItem('cakra_data');
      if (!raw) return [];
      const data = JSON.parse(raw);
      return data.filter(d => d.lat && d.lon && typeof d.rsrp === 'number');
    } catch (e) { return []; }
  }

  function compareWithRealData(res) {
    const real = getRealDataPoints();
    const f = res.form;
    if (!real.length) return null;

    const proj = res.proj;
    const half = (res.n * res.cell) / 2;
    let errs = [];
    let matched = [];

    real.forEach(d => {
      const [x, y] = proj.toXY(d.lat, d.lon);
      if (Math.abs(x) > half || Math.abs(y) > half) return;
      const i = Math.floor((x + half) / res.cell);
      const j = Math.floor((y + half) / res.cell);
      if (i < 0 || i >= res.n || j < 0 || j >= res.n) return;
      const idx = j * res.n + i;
      const pred = res.results[idx];
      if (!pred) return;
      const err = d.rsrp - pred.rsrp;
      errs.push(err);
      matched.push({ lat: d.lat, lon: d.lon, measured: d.rsrp, predicted: pred.rsrp, err });
    });

    if (realDataLayer) { map.removeLayer(realDataLayer); realDataLayer = null; }
    if (matched.length) {
      realDataLayer = L.layerGroup();
      matched.forEach(m => {
        const c = Math.abs(m.err) > 10 ? '#f87171' : Math.abs(m.err) > 5 ? '#facc15' : '#4ade80';
        L.circleMarker([m.lat, m.lon], {
          pane: 'predictPane', radius: 4, color: '#fff', weight: 1,
          fillColor: c, fillOpacity: 0.9,
        }).bindPopup(
          `<div style="font-family:monospace;font-size:11px;line-height:1.7">
            Measured: <b>${m.measured} dBm</b><br>
            Predicted: <b>${m.predicted.toFixed(1)} dBm</b><br>
            Error: <b style="color:${c}">${m.err.toFixed(1)} dB</b>
          </div>`
        ).addTo(realDataLayer);
      });
      realDataLayer.addTo(map);
    }

    if (!errs.length) return { matched: 0 };
    const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length;
    const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length);
    const bias = errs.reduce((a, b) => a + b, 0) / errs.length;
    return { matched: errs.length, mae, rmse, bias };
  }

  // ─────────────────────────────────────────────
  // Stat panel rendering
  // ─────────────────────────────────────────────
  function renderStats(s) {
    const el = $('predictStatsPanel');
    if (!el) return;
    el.style.display = 'grid';
    el.innerHTML = `
      ${statCard('Avg RSRP Prediksi', isNaN(s.avgRsrp) ? '—' : s.avgRsrp.toFixed(1) + ' dBm')}
      ${statCard('Coverage (≥ threshold)', s.coveragePct.toFixed(1) + '%')}
      ${statCard('% Titik LOS', s.losPct.toFixed(1) + '%')}
      ${statCard('Bangunan Dimuat', s.buildingCount.toLocaleString())}
      ${statCard('Titik Grid', s.gridPoints.toLocaleString())}
    `;
  }

  function renderCompareStats(c) {
    const wrap = $('compareStatsWrap');
    const el = $('compareStatsPanel');
    if (!el || !wrap) return;
    wrap.style.display = 'block';
    if (!c || !c.matched) {
      el.style.display = 'block';
      el.innerHTML = `<div style="font-size:11px;color:var(--text2)">Tidak ada titik data drive test asli yang jatuh dalam radius prediksi ini.</div>`;
      return;
    }
    el.style.display = 'grid';
    el.innerHTML = `
      ${statCard('Titik Cocok', c.matched.toLocaleString())}
      ${statCard('MAE', c.mae.toFixed(2) + ' dB')}
      ${statCard('RMSE', c.rmse.toFixed(2) + ' dB')}
      ${statCard('Bias (measured−pred)', (c.bias >= 0 ? '+' : '') + c.bias.toFixed(2) + ' dB')}
    `;
  }

  function statCard(label, value) {
    return `<div class="predict-stat-card">
      <div class="predict-stat-label">${label}</div>
      <div class="predict-stat-value">${value}</div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  function init() {
    let defLat = -6.2088, defLon = 106.8456; // fallback: Jakarta

    const real = getRealDataPoints();
    if (real.length) {
      defLat = real.reduce((s, d) => s + d.lat, 0) / real.length;
      defLon = real.reduce((s, d) => s + d.lon, 0) / real.length;
      $('useRealDataWrap') && ($('useRealDataWrap').style.display = 'flex');
    } else {
      $('useRealDataWrap') && ($('useRealDataWrap').style.display = 'none');
    }

    $('siteLat').value = defLat.toFixed(6);
    $('siteLon').value = defLon.toFixed(6);

    initMap(defLat, defLon);

    ['siteAzimuth', 'mechTilt', 'elecTilt', 'beamwidthH', 'radius'].forEach(id => {
      $(id) && $(id).addEventListener('input', updateSectorPreview);
    });
    $('siteLat') && $('siteLat').addEventListener('change', () => {
      siteMarker.setLatLng([parseFloat($('siteLat').value), parseFloat($('siteLon').value)]);
      map.panTo(siteMarker.getLatLng());
      buildingsCache = null;
      updateSectorPreview();
    });
    $('siteLon') && $('siteLon').addEventListener('change', () => {
      siteMarker.setLatLng([parseFloat($('siteLat').value), parseFloat($('siteLon').value)]);
      map.panTo(siteMarker.getLatLng());
      buildingsCache = null;
      updateSectorPreview();
    });

    $('runPredictBtn') && $('runPredictBtn').addEventListener('click', runPrediction);
  }

  return { init, runPrediction, BAND_PRESETS };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('predictMap')) CakraPredict.init();
});
