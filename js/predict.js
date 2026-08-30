// predict.js — Virtual Drive Test controller (multi-step wizard) — Cakra v2.1
// Menghubungkan propagation.js (model RF) + buildings.js (data OSM) ke peta Leaflet,
// lalu menyimulasikan "virtual drive" sepanjang rute dan memvalidasi vs data nyata.
// © 2026 — dikembangkan sebagai ekstensi Cakra Drive Test Intelligence.

'use strict';

window.CakraVDT = (() => {
  let map = null;
  let siteMarker = null;
  let sectorLayer = null;
  let heatOverlay = null;
  let buildingsLayer = null;
  let realDataLayer = null;
  let buildingsCache = null;
  let lastResult = null;          // hasil prediksi grid
  let lastRoute = null;           // hasil simulasi rute
  let routeLayer = null;          // polyline rute
  let routeSampleLayer = null;    // marker hasil simulasi
  let drawMode = false;
  let routePts = [];
  let routeChartObj = null;
  let currentStep = 1;

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

  function rgb(a){ return `rgb(${a[0]},${a[1]},${a[2]})`; }

  function $(id){ return document.getElementById(id); }

  function readForm() {
    return {
      name: ($('scenarioName').value || '').trim(),
      op: ($('scenarioOp').value || '').trim(),
      lat: parseFloat($('siteLat').value),
      lon: parseFloat($('siteLon').value),
      hb: parseFloat($('siteHeight').value),
      hm: 1.5,
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
      noiseFloorDb: parseFloat($('noiseFloor').value),
      useBuildings: $('useBuildings').checked,
      useRealData: $('useRealData').checked,
    };
  }

  // ─────────────────────────────────────────────
  // STEPPER
  // ─────────────────────────────────────────────
  function goto(step) {
    currentStep = step;
    for (let i = 1; i <= 5; i++) {
      const sec = $('step' + i);
      if (sec) sec.classList.toggle('active', i === step);
      const btn = document.querySelector('.step-btn[data-step="' + i + '"]');
      if (btn) {
        btn.classList.toggle('active', i === step);
        btn.classList.toggle('done', i < step);
      }
    }
    if (step === 5) buildReport();
    if (step === 4 && !drawMode) $('mapHint').classList.remove('show');
  }

  // ─────────────────────────────────────────────
  // MAP
  // ─────────────────────────────────────────────
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
    if (!map.getPane('routePane')) {
      map.createPane('routePane');
      map.getPane('routePane').style.zIndex = 430;
    }

    siteMarker = L.marker([defaultLat, defaultLon], { draggable: true }).addTo(map);
    siteMarker.on('dragend', () => {
      const p = siteMarker.getLatLng();
      $('siteLat').value = p.lat.toFixed(6);
      $('siteLon').value = p.lng.toFixed(6);
      buildingsCache = null;
    });

    map.on('click', (e) => {
      if (drawMode) { addRoutePoint(e.latlng); return; }
      if (!$('clickToPlace').checked) return;
      siteMarker.setLatLng(e.latlng);
      $('siteLat').value = e.latlng.lat.toFixed(6);
      $('siteLon').value = e.latlng.lng.toFixed(6);
      buildingsCache = null;
      updateSectorPreview();
    });

    updateSectorPreview();
  }

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

  // ─────────────────────────────────────────────
  // PREDIKSI GRID (Step 3)
  // ─────────────────────────────────────────────
  function buildGrid(siteLat, siteLon, radiusM, cellSizeM) {
    const MAX_CELLS_PER_AXIS = 90;
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
      await sleep(10);

      const { points, n, cell, proj } = buildGrid(f.lat, f.lon, f.radiusM, f.cellSizeM);
      const buildingsXY = buildings.map(b => {
        const xy = b.footprint.map(([blat, blon]) => proj.toXY(blat, blon));
        return { id: b.id, heightM: b.heightM, xy, bb: CakraBuildings.bbox(xy) };
      });

      const results = new Array(points.length).fill(null);
      let sumRsrp = 0, countLos = 0, countValid = 0, countAbove = 0;

      for (let idx = 0; idx < points.length; idx++) {
        const p = points[idx];
        if (!p) continue;
        const distM = Math.hypot(p.x, p.y);
        if (distM < 5) { results[idx] = { rsrp: f.txPowerDbm - f.feederLossDb + f.gainMaxDbi, los: true }; continue; }
        const azimuthTo = (CakraPropagation.toDeg(Math.atan2(p.x, p.y)) + 360) % 360;
        const azOffset = CakraPropagation.angleDiff(azimuthTo, f.azimuth);
        const elevOffset = CakraPropagation.toDeg(Math.atan2(f.hb - f.hm, distM));
        let obstruction = null;
        if (buildingsXY.length) obstruction = CakraBuildings.findDominantObstruction([0, 0], [p.x, p.y], f.hb, f.hm, buildingsXY);
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
        if (r.los) countLos++;
        if (r.rsrp >= f.thresholdDbm) countAbove++;
        if (idx % 400 === 0) await sleep(0);
      }

      lastResult = { points, n, cell, proj, results, form: f, buildings, buildingsXY };
      renderHeatmap(lastResult);
      renderBuildings(buildingsXY, lastResult);
      updateSectorPreview();

      const stats = {
        avgRsrp: countValid ? (sumRsrp / countValid) : NaN,
        losPct: countValid ? (countLos / countValid * 100) : 0,
        coveragePct: countValid ? (countAbove / countValid * 100) : 0,
        buildingCount: buildings.length,
        gridPoints: countValid,
      };
      renderStats(stats);

      const toStep4 = $('toStep4');
      if (toStep4) toStep4.disabled = false;

      showStatus(`Selesai — ${countValid} titik dihitung, ${buildings.length} bangunan${f.useBuildings ? '' : ' (dimatikan)'}`);
    } catch (err) {
      console.error(err);
      showStatus('Gagal menjalankan prediksi: ' + err.message, true);
    } finally {
      setRunning(false);
    }
  }

  function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }
  function setRunning(state){ const b = $('runPredictBtn'); if (b){ b.disabled = state; b.textContent = state ? 'Menghitung…' : 'Jalankan Prediksi →'; } }
  function showStatus(msg, isWarn){
    const el = $('predictStatus'); if (!el) return;
    el.textContent = msg; el.style.color = isWarn ? 'var(--amber,#fbbf24)' : 'var(--text2,#94aabf)';
  }

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
        const px = (((n - 1 - j) * n) + i) * 4;
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
    heatOverlay = L.imageOverlay(canvas.toDataURL(), [[sw[0], sw[1]], [ne[0], ne[1]]], {
      opacity: 1, interactive: false, pane: 'predictPane',
    }).addTo(map);
  }

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
      }).bindTooltip(`${isBlocking ? '⚠ Menghalangi LOS · ' : ''}Bangunan · tinggi ~${b.heightM.toFixed(0)}m`, { sticky: true }).addTo(buildingsLayer);
    });
    buildingsLayer.addTo(map);
  }

  function renderStats(s) {
    const el = $('predictStatsPanel'); if (!el) return;
    el.style.display = 'grid';
    el.innerHTML = `
      ${statCard('Avg RSRP Prediksi', isNaN(s.avgRsrp) ? '—' : s.avgRsrp.toFixed(1) + ' dBm', s.avgRsrp >= -90 ? 'good' : (s.avgRsrp >= -100 ? 'warn' : 'bad'))}
      ${statCard('Coverage (≥ threshold)', s.coveragePct.toFixed(1) + '%', s.coveragePct >= 90 ? 'good' : (s.coveragePct >= 70 ? 'warn' : 'bad'))}
      ${statCard('% Titik LOS', s.losPct.toFixed(1) + '%')}
      ${statCard('Bangunan', s.buildingCount.toLocaleString())}
      ${statCard('Titik Grid', s.gridPoints.toLocaleString())}
    `;
  }

  // ─────────────────────────────────────────────
  // ROUTE DRAWING (Step 4)
  // ─────────────────────────────────────────────
  function toggleDraw() {
    drawMode = !drawMode;
    const b = $('drawRouteBtn'), f = $('finishRouteBtn'), hint = $('mapHint');
    if (drawMode) {
      b.textContent = '✕ Batalkan Gambar'; b.classList.add('secondary');
      f.disabled = false; hint.classList.add('show'); hint.textContent = 'Klik di peta untuk tambah titik rute';
      $('clickToPlace').checked = false;
    } else {
      b.textContent = '✎ Gambar Rute'; b.classList.remove('secondary');
      f.disabled = routePts.length < 2; hint.classList.remove('show');
    }
  }

  function addRoutePoint(latlng) {
    routePts.push([latlng.lat, latlng.lng]);
    redrawRoute();
    updateRouteInfo();
    const sim = $('simRouteBtn'); if (sim) sim.disabled = routePts.length < 2;
    const hint = $('mapHint'); if (hint) hint.textContent = `Titik ${routePts.length} ditambah — klik lagi atau "Selesai"`;
  }

  function finishDraw() {
    if (routePts.length < 2) { alert('Buat minimal 2 titik untuk membentuk rute.'); return; }
    drawMode = false;
    const b = $('drawRouteBtn'), f = $('finishRouteBtn'), hint = $('mapHint');
    b.textContent = '✎ Gambar Rute'; b.classList.remove('secondary');
    f.disabled = true; hint.classList.remove('show');
    updateRouteInfo();
  }

  function clearRoute() {
    routePts = [];
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    if (routeSampleLayer) { map.removeLayer(routeSampleLayer); routeSampleLayer = null; }
    const sim = $('simRouteBtn'); if (sim) sim.disabled = true;
    const to5 = $('toStep5'); if (to5) to5.disabled = true;
    const wrap = $('routeStatsWrap'); if (wrap) wrap.style.display = 'none';
    const cc = $('chartCard'); if (cc) cc.style.display = 'none';
    updateRouteInfo();
  }

  function redrawRoute() {
    if (routeLayer) map.removeLayer(routeLayer);
    if (routePts.length < 2) {
      if (routePts.length === 1) {
        routeLayer = L.circleMarker(routePts[0], { pane: 'routePane', radius: 4, color: '#fff', weight: 1, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
      } else routeLayer = null;
      return;
    }
    routeLayer = L.polyline(routePts, { pane: 'routePane', color: '#ffffff', weight: 3, opacity: 0.9, dashArray: '6 4' }).addTo(map);
  }

  function routeLengthM() {
    let L = 0;
    for (let i = 1; i < routePts.length; i++) {
      L += CakraPropagation.haversineDist(routePts[i-1][0], routePts[i-1][1], routePts[i][0], routePts[i][1]);
    }
    return L;
  }

  function updateRouteInfo() {
    const el = $('routeInfo'); if (!el) return;
    if (!routePts.length) { el.textContent = 'Rute: belum digambar'; return; }
    const L = routeLengthM();
    el.textContent = `Rute: ${routePts.length} titik · ${L.toFixed(0)} m` + (L > 1000 ? ` (${(L/1000).toFixed(2)} km)` : '');
  }

  // ─────────────────────────────────────────────
  // VIRTUAL DRIVE SIMULATION (Step 4)
  // ─────────────────────────────────────────────
  function sampleGrid(res, lat, lon) {
    const proj = res.proj;
    const half = (res.n * res.cell) / 2;
    const [x, y] = proj.toXY(lat, lon);
    if (Math.abs(x) > half || Math.abs(y) > half) return null;
    let i = Math.floor((x + half) / res.cell);
    let j = Math.floor((y + half) / res.cell);
    i = Math.max(0, Math.min(res.n - 1, i));
    j = Math.max(0, Math.min(res.n - 1, j));
    return res.results[j * res.n + i] || null;
  }

  // Estimasi RSRQ & SINR dari RSRP + status LOS/obstruksi
  function deriveRsrqSinr(rsrp, los, noiseFloorDb) {
    let interf = noiseFloorDb;
    if (!los) interf += 4; // NLOS: interferensi/noise lebih tinggi
    const rssi = 10 * Math.log10(Math.pow(10, rsrp / 10) + Math.pow(10, interf / 10));
    let rsrq = rsrp - rssi;
    let sinr = rsrp - interf;
    rsrq = Math.max(-22, Math.min(-3, rsrq));
    sinr = Math.max(-20, Math.min(40, sinr));
    return { rsrq: +rsrq.toFixed(1), sinr: +sinr.toFixed(1) };
  }

  async function simulateRoute() {
    if (routePts.length < 2) { alert('Gambar rute dulu di peta.'); return; }
    const f = readForm();
    const simBtn = $('simRouteBtn'), simStatus = $('simStatus');
    if (simStatus) simStatus.textContent = 'Menyiapkan simulasi…';

    // Pastikan grid prediksi tersedia
    if (!lastResult || lastResult.form.lat !== f.lat || lastResult.form.lon !== f.lon ||
        lastResult.form.radiusM !== f.radiusM || lastResult.form.cellSizeM !== f.cellSizeM ||
        lastResult.form.freqMHz !== f.freqMHz || lastResult.form.env !== f.env) {
      await runPrediction();
    }

    const stepM = parseFloat($('sampStep').value) || 10;
    const speedKmh = parseFloat($('vehSpeed').value) || 30;
    const speedMs = speedKmh / 3.6;
    const totalL = routeLengthM();
    const durationS = totalL / speedMs;

    const samples = []; // {dist, t, lat, lon, rsrp, rsrq, sinr, los}
    let cum = 0;
    for (let s = 0; s < routePts.length - 1; s++) {
      const [la1, lo1] = routePts[s];
      const [la2, lo2] = routePts[s + 1];
      const segLen = CakraPropagation.haversineDist(la1, lo1, la2, lo2);
      const nSeg = Math.max(1, Math.floor(segLen / stepM));
      for (let k = 0; k < nSeg; k++) {
        const tt = k / nSeg;
        const lat = la1 + (la2 - la1) * tt;
        const lon = lo1 + (lo2 - lo1) * tt;
        const g = sampleGrid(lastResult, lat, lon);
        if (!g) continue;
        const { rsrq, sinr } = deriveRsrqSinr(g.rsrp, g.los, f.noiseFloorDb);
        samples.push({ dist: cum + segLen * tt, t: (cum + segLen * tt) / speedMs, lat, lon, rsrp: g.rsrp, rsrq, sinr, los: g.los });
      }
      cum += segLen;
    }
    // titik akhir
    {
      const [la, lo] = routePts[routePts.length - 1];
      const g = sampleGrid(lastResult, la, lo);
      if (g) { const { rsrq, sinr } = deriveRsrqSinr(g.rsrp, g.los, f.noiseFloorDb); samples.push({ dist: totalL, t: durationS, lat: la, lon: lo, rsrp: g.rsrp, rsrq, sinr, los: g.los }); }
    }

    lastRoute = { samples, totalL, durationS, speedKmh, form: f, threshold: f.thresholdDbm };

    renderRouteMarkers(samples);
    renderRouteChart(samples, f.thresholdDbm);
    renderRouteStats(samples, totalL, durationS, f.thresholdDbm);

    const to5 = $('toStep5'); if (to5) to5.disabled = false;
    if (simStatus) simStatus.textContent = `Selesai — ${samples.length} sampel · ${totalL.toFixed(0)} m · ${(durationS/60).toFixed(1)} menit`;
    const wrap = $('routeStatsWrap'); if (wrap) wrap.style.display = 'block';
    const cc = $('chartCard'); if (cc) cc.style.display = 'block';
  }

  function renderRouteMarkers(samples) {
    if (routeSampleLayer) map.removeLayer(routeSampleLayer);
    routeSampleLayer = L.layerGroup();
    // hanya render subset agar tidak terlalu berat
    const stride = Math.max(1, Math.floor(samples.length / 250));
    samples.forEach((s, i) => {
      if (i % stride !== 0 && i !== samples.length - 1) return;
      const weak = s.rsrp < lastRoute.threshold;
      L.circleMarker([s.lat, s.lon], {
        pane: 'routePane', radius: weak ? 4 : 3, color: weak ? '#f87171' : '#fff',
        weight: 1, fillColor: rgb(RSRP_COLOR(s.rsrp)), fillOpacity: 0.9,
      }).bindTooltip(`${s.dist.toFixed(0)} m · RSRP ${s.rsrp.toFixed(1)} dBm`, { sticky: true }).addTo(routeSampleLayer);
    });
    routeSampleLayer.addTo(map);
    const all = routePts;
    if (all.length) map.fitBounds(L.polyline(all).getBounds().pad(0.2));
  }

  function renderRouteChart(samples, threshold) {
    const ctx = $('routeChart').getContext('2d');
    const distKm = samples.map(s => +(s.dist / 1000).toFixed(3));
    const rsrp = samples.map(s => +s.rsrp.toFixed(1));
    const rsrq = samples.map(s => s.rsrq);
    const sinr = samples.map(s => s.sinr);
    if (routeChartObj) routeChartObj.destroy();
    routeChartObj = new Chart(ctx, {
      type: 'line',
      data: {
        labels: distKm,
        datasets: [
          { label: 'RSRP (dBm)', data: rsrp, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.12)', yAxisID: 'y', fill: true, pointRadius: 0, borderWidth: 2, tension: 0.25,
            segment: { borderColor: c => (rsrp[c.p0DataIndex] < threshold) ? '#f87171' : '#06b6d4' } },
          { label: 'RSRQ (dB)', data: rsrq, borderColor: '#a78bfa', yAxisID: 'y2', pointRadius: 0, borderWidth: 1.5, tension: 0.25 },
          { label: 'SINR (dB)', data: sinr, borderColor: '#4ade80', yAxisID: 'y2', pointRadius: 0, borderWidth: 1.5, tension: 0.25, borderDash: [4, 3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { title: { display: true, text: 'Jarak (km)', color: '#8e8e97' }, ticks: { color: '#8e8e97', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { position: 'left', title: { display: true, text: 'RSRP', color: '#06b6d4' }, ticks: { color: '#8e8e97', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' }, suggestedMin: -125, suggestedMax: -50 },
          y2: { position: 'right', title: { display: true, text: 'RSRQ / SINR', color: '#a78bfa' }, ticks: { color: '#8e8e97', font: { size: 9 } }, grid: { drawOnChartArea: false }, suggestedMin: -25, suggestedMax: 40 },
        },
        plugins: {
          legend: { labels: { color: '#ececee', font: { size: 10, family: 'IBM Plex Mono' } } },
          tooltip: { callbacks: { title: items => 'Jarak ' + (items[0].parsed.x).toFixed(3) + ' km' } },
        },
      },
    });
  }

  function renderRouteStats(samples, totalL, durationS, threshold) {
    const el = $('routeStatsPanel'); if (!el) return;
    const valid = samples.length;
    let sum = 0, above = 0, weakSegs = [], segStart = null, segMin = 999;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]; sum += s.rsrp;
      const weak = s.rsrp < threshold;
      if (weak) {
        if (segStart === null) { segStart = s.dist; segMin = s.rsrp; }
        else segMin = Math.min(segMin, s.rsrp);
      } else {
        if (segStart !== null) { weakSegs.push({ start: segStart, end: samples[i-1].dist, min: segMin }); segStart = null; }
      }
    }
    if (segStart !== null) weakSegs.push({ start: segStart, end: totalL, min: segMin });
    const avg = valid ? sum / valid : NaN;
    const cov = valid ? (samples.filter(s => s.rsrp >= threshold).length / valid * 100) : 0;
    el.innerHTML = `
      ${statCard('Jarak Rute', totalL > 1000 ? (totalL/1000).toFixed(2)+' km' : totalL.toFixed(0)+' m')}
      ${statCard('Durasi', (durationS/60).toFixed(1)+' mnt')}
      ${statCard('Avg RSRP', isNaN(avg) ? '—' : avg.toFixed(1)+' dBm', avg >= -90 ? 'good' : (avg >= -100 ? 'warn' : 'bad'))}
      ${statCard('Coverage Rute', cov.toFixed(1)+'%', cov >= 90 ? 'good' : (cov >= 70 ? 'warn' : 'bad'))}
      ${statCard('Titik Rawan', weakSegs.length.toString(), weakSegs.length ? 'bad' : 'good')}
      ${statCard('Sampel', valid.toLocaleString())}
    `;
    // weak list
    const wl = $('routeWeakList');
    if (wl) {
      if (!weakSegs.length) { wl.innerHTML = `<div style="font-size:11px;color:var(--text2)">Tidak ada titik rawan — rute seluruhnya di atas threshold.</div>`; }
      else {
        wl.innerHTML = weakSegs.map(w => {
          const len = (w.end - w.start);
          return `<div class="route-item">
            <span class="badge" style="background:var(--red-dim);color:var(--red)">RAWAN</span>
            <span class="rd">${w.start.toFixed(0)}–${w.end.toFixed(0)} m · ${len.toFixed(0)} m</span>
            <span class="rv">min ${w.min.toFixed(0)} dBm</span>
          </div>`;
        }).join('');
      }
    }
  }

  // ─────────────────────────────────────────────
  // REAL DATA helpers
  // ─────────────────────────────────────────────
  function getRealDataPoints() {
    try {
      const raw = sessionStorage.getItem('cakra_data');
      if (!raw) return [];
      const data = JSON.parse(raw);
      return data.filter(d => d.lat && d.lon && typeof d.rsrp === 'number');
    } catch (e) { return []; }
  }

  // ─────────────────────────────────────────────
  // STEP 5 — REPORT & VALIDATION
  // ─────────────────────────────────────────────
  function buildReport() {
    const wrap = $('reportWrap'); if (!wrap) return;
    if (!lastRoute) {
      wrap.innerHTML = `<div class="info-note">Jalankan prediksi (Step 3) & simulasi rute (Step 4) terlebih dulu untuk menghasilkan laporan.</div>`;
      return;
    }
    const f = lastRoute.form;
    const samples = lastRoute.samples;
    const avg = samples.reduce((a, s) => a + s.rsrp, 0) / samples.length;
    const cov = samples.filter(s => s.rsrp >= lastRoute.threshold).length / samples.length * 100;
    const avgSinr = samples.reduce((a, s) => a + s.sinr, 0) / samples.length;
    const bandLabel = BAND_PRESETS[f.freqMHz] ? BAND_PRESETS[f.freqMHz].label : f.freqMHz + ' MHz';
    wrap.innerHTML = `<div class="report-box">SKENARIO VIRTUAL DRIVE TEST
Nama       : ${f.name || '(tanpa nama)'}
Operator   : ${f.op || '-'}
Site       : ${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}
Band       : ${bandLabel}
Antena     : ${f.gainMaxDbi} dBi · Az ${f.azimuth}° · HB ${f.hb} m
Lingkungan : ${f.env}

RUTE
Jarak      : ${(lastRoute.totalL/1000).toFixed(2)} km
Kecepatan  : ${lastRoute.speedKmh} km/jam
Durasi     : ${(lastRoute.durationS/60).toFixed(1)} menit

HASIL PREDIKSI
Avg RSRP   : ${avg.toFixed(1)} dBm
Avg SINR   : ${avgSinr.toFixed(1)} dB
Coverage   : ${cov.toFixed(1)} % (≥ ${lastRoute.threshold} dBm)
Titik rawan: ${samples.filter(s=>s.rsrp<lastRoute.threshold).length} sampel</div>`;

    // Validasi vs data nyata
    const real = getRealDataPoints();
    const vp = $('validationPanel');
    if (!real.length) {
      vp.className = 'info-note';
      vp.innerHTML = 'Belum ada data drive test asli di sesi ini. Upload file log di <a href="/" data-route style="color:var(--cyan)">halaman utama</a> untuk membandingkan.';
      return;
    }
    const errs = [];
    samples.forEach(s => {
      let best = null, bestD = 30; // radius pencarian 30 m
      for (const d of real) {
        const dd = CakraPropagation.haversineDist(s.lat, s.lon, d.lat, d.lon);
        if (dd < bestD) { bestD = dd; best = d; }
      }
      if (best) errs.push(s.rsrp - best.rsrp);
    });
    if (!errs.length) {
      vp.className = 'info-note';
      vp.innerHTML = `Tidak ada titik data asli dalam ${lastRoute.totalL.toFixed(0)} m rute ini. Coba gambar rute yang menimpa area drive test asli.`;
      return;
    }
    const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length;
    const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length);
    const bias = errs.reduce((a, b) => a + b, 0) / errs.length;
    vp.className = 'card';
    vp.style.padding = '14px';
    vp.innerHTML = `<div class="stats-grid">
      ${statCard('Titik Cocok', errs.length.toLocaleString())}
      ${statCard('MAE', mae.toFixed(2)+' dB', mae < 6 ? 'good' : (mae < 10 ? 'warn' : 'bad'))}
      ${statCard('RMSE', rmse.toFixed(2)+' dB', rmse < 6 ? 'good' : (rmse < 10 ? 'warn' : 'bad'))}
      ${statCard('Bias (pred−meas)', (bias>=0?'+':'')+bias.toFixed(2)+' dB', Math.abs(bias)<5?'good':'warn')}
    </div>
    <div style="font-size:10.5px;color:var(--text2);margin-top:10px">Bias negatif = prediksi underestimasi (terlalu optimis). Semakin kecil MAE/RMSE, semakin akurat model terhadap kondisi lapangan.</div>`;
    lastRoute.validation = { mae, rmse, bias, matched: errs.length };
  }

  // ─────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────
  function exportCSV() {
    if (!lastRoute) { alert('Jalankan simulasi rute dulu.'); return; }
    const f = lastRoute.form;
    const rows = [['idx','distance_m','time_s','lat','lon','rsrp_dbm','rsrq_db','sinr_db','speed_kmh','status']];
    lastRoute.samples.forEach((s, i) => {
      rows.push([i, s.dist.toFixed(1), s.t.toFixed(1), s.lat.toFixed(6), s.lon.toFixed(6),
        s.rsrp.toFixed(1), s.rsrq, s.sinr, lastRoute.speedKmh, s.rsrp < lastRoute.threshold ? 'BELOW_THRESHOLD' : 'OK']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (f.name || 'cakra_virtual_drive').replace(/\s+/g, '_') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    const es = $('exportStatus'); if (es) es.textContent = 'CSV virtual drive test diunduh.';
  }

  function exportPNG() {
    if (!routeChartObj) { alert('Jalankan simulasi rute dulu.'); return; }
    const url = routeChartObj.toBase64Image();
    const a = document.createElement('a');
    a.href = url; a.download = 'cakra_virtual_drive_chart.png'; a.click();
    const es = $('exportStatus'); if (es) es.textContent = 'Gambar chart diunduh.';
  }

  function openInDashboard() {
    if (!lastRoute) { alert('Jalankan simulasi rute dulu.'); return; }
    const f = lastRoute.form;
    const tech = f.freqMHz >= 2300 ? 'NR' : 'LTE';
    const bandStr = f.freqMHz + ' MHz';
    const rows = lastRoute.samples.map((s, i) => ({
      _tool: 'VIRTUAL', _virtual: true, _sessionTech: tech,
      ts: 'VDT_' + String(i).padStart(5, '0'), tsDisp: '', timePart: '',
      lat: s.lat, lon: s.lon,
      rsrp: s.rsrp, rsrq: s.rsrq, snr: s.sinr,
      speed: lastRoute.speedKmh, operator: f.op || '', cellname: f.name || 'Virtual Site',
      cgi: '', node: '', cellid: '', lac: '', tech, arfcn: '', pci: null,
      dl: 0, ul: 0, band: bandStr, bw: '', device: 'Cakra VDT', state: '', cqi: '', ping_avg: null,
      nr_rsrp: null, nr_rsrq: null, nr_sinr: null, nr_rssi: null, nr_band: null, nr_arfcn: null,
      nr_pci: null, nr_dl: null, nr_ul: null, _hasNrCols: false,
    }));
    try {
      sessionStorage.setItem('cakra_data', JSON.stringify(rows));
      sessionStorage.setItem('cakra_filename', (f.name || 'virtual_drive').replace(/\s+/g, '_'));
      sessionStorage.setItem('cakra_tool', 'Cakra Virtual Drive Test');
      sessionStorage.setItem('cakra_virtual', '1');
    } catch (e) {
      alert('Data terlalu besar untuk sessionStorage. Coba kurangi panjang rute atau resolusi sampling.');
      return;
    }
    if (window.CakraNav) CakraNav.go('/dashboard'); else window.location.href = '/dashboard';
  }

  // ─────────────────────────────────────────────
  // CENTROID
  // ─────────────────────────────────────────────
  function useRealCentroid() {
    const real = getRealDataPoints();
    if (!real.length) return;
    const lat = real.reduce((s, d) => s + d.lat, 0) / real.length;
    const lon = real.reduce((s, d) => s + d.lon, 0) / real.length;
    $('siteLat').value = lat.toFixed(6);
    $('siteLon').value = lon.toFixed(6);
    if (siteMarker) { siteMarker.setLatLng([lat, lon]); map.panTo([lat, lon]); }
    buildingsCache = null;
    updateSectorPreview();
  }

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────
  function init() {
    let defLat = -6.2088, defLon = 106.8456;
    const real = getRealDataPoints();
    if (real.length) {
      defLat = real.reduce((s, d) => s + d.lat, 0) / real.length;
      defLon = real.reduce((s, d) => s + d.lon, 0) / real.length;
      const wb = $('useRealDataWrap'); if (wb) wb.style.display = 'flex';
      const cb = $('useCentroidBtn'); if (cb) cb.style.display = 'block';
    }

    $('siteLat').value = defLat.toFixed(6);
    $('siteLon').value = defLon.toFixed(6);

    // preset datalist
    const pc = $('presetCity');
    if (pc) pc.addEventListener('change', () => {
      const m = pc.value.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (m) { $('siteLat').value = m[1]; $('siteLon').value = m[2]; if (siteMarker) { siteMarker.setLatLng([+m[1], +m[2]]); map.panTo([+m[1], +m[2]]); } buildingsCache = null; updateSectorPreview(); }
    });

    initMap(defLat, defLon);

    ['siteAzimuth', 'mechTilt', 'elecTilt', 'beamwidthH', 'radius'].forEach(id => {
      const el = $(id); if (el) el.addEventListener('input', updateSectorPreview);
    });
    $('siteLat') && $('siteLat').addEventListener('change', () => {
      siteMarker.setLatLng([parseFloat($('siteLat').value), parseFloat($('siteLon').value)]);
      map.panTo(siteMarker.getLatLng()); buildingsCache = null; updateSectorPreview();
    });
    $('siteLon') && $('siteLon').addEventListener('change', () => {
      siteMarker.setLatLng([parseFloat($('siteLat').value), parseFloat($('siteLon').value)]);
      map.panTo(siteMarker.getLatLng()); buildingsCache = null; updateSectorPreview();
    });

    goto(1);
  }

  function statCard(label, value, cls) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls || ''}">${value}</div></div>`;
  }

  return { init, goto, useRealCentroid, runPrediction, toggleDraw, finishDraw, clearRoute, simulateRoute, exportCSV, exportPNG, openInDashboard };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('predictMap')) CakraVDT.init();
});
