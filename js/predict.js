// predict.js — Virtual Drive Test controller (multi-step wizard, multi-site) — Cakra v2.2
// Menghubungkan propagation.js (model RF) + buildings.js (data OSM) ke peta Leaflet,
// mendukung banyak site sekaligus (best-server / handover), lalu menyimulasikan
// "virtual drive" sepanjang rute dan memvalidasi vs data nyata.
// © 2026 — dikembangkan sebagai ekstensi Cakra Drive Test Intelligence.

'use strict';

window.CakraVDT = (() => {
  let map = null;
  let buildingsLayer = null;
  let realDataLayer = null;
  let buildingsCache = null;      // { key, radius, list }
  let lastResult = null;          // hasil prediksi grid (multi-site, best-server)
  let lastRoute = null;           // hasil simulasi rute
  let routeLayer = null;          // polyline rute
  let routeSampleLayer = null;    // marker hasil simulasi
  let handoverLayer = null;       // marker titik handover
  let drawMode = false;
  let routePts = [];
  let routeChartObj = null;
  let currentStep = 1;

  // ── MULTI-SITE STATE ──
  let sites = [];                 // [{id,name,lat,lon,hb,azimuth,mechTilt,elecTilt,...,marker,sectorLayer}]
  let activeSiteId = null;
  let siteCounter = 0;
  const SITE_COLORS = ['#38bdf8', '#a78bfa', '#fb923c', '#4ade80', '#f472b6', '#facc15'];
  const MAX_SITES = 6;
  const RX_HEIGHT = 1.5;

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
  function siteColor(site){ const i = sites.findIndex(s => s.id === site.id); return SITE_COLORS[i % SITE_COLORS.length]; }
  function siteById(id){ return sites.find(s => s.id === id) || null; }

  // ─────────────────────────────────────────────
  // FORM ↔ ACTIVE SITE
  // ─────────────────────────────────────────────
  function readSharedForm() {
    return {
      name: ($('scenarioName').value || '').trim(),
      op: ($('scenarioOp').value || '').trim(),
      radiusM: parseFloat($('radius').value),
      cellSizeM: parseFloat($('resolution').value),
      thresholdDbm: parseFloat($('threshold').value),
      noiseFloorDb: parseFloat($('noiseFloor').value),
      useBuildings: $('useBuildings').checked,
      useRealData: $('useRealData').checked,
    };
  }

  // Baca field form (Step 1 lokasi + Step 2 antenna/radio) ke object site aktif
  function syncFormToActiveSite() {
    const site = siteById(activeSiteId);
    if (!site) return;
    const lat = parseFloat($('siteLat').value), lon = parseFloat($('siteLon').value);
    if (!isNaN(lat)) site.lat = lat;
    if (!isNaN(lon)) site.lon = lon;
    site.name = ($('siteName').value || site.name || 'Site').trim();
    site.hb = parseFloat($('siteHeight').value);
    site.azimuth = parseFloat($('siteAzimuth').value);
    site.mechTilt = parseFloat($('mechTilt').value);
    site.elecTilt = parseFloat($('elecTilt').value);
    site.txPowerDbm = parseFloat($('txPower').value);
    site.feederLossDb = parseFloat($('feederLoss').value);
    site.gainMaxDbi = parseFloat($('antGain').value);
    site.beamwidthH = parseFloat($('beamwidthH').value);
    site.beamwidthV = parseFloat($('beamwidthV').value);
    site.frontToBack = parseFloat($('frontToBack').value);
    site.slaV = parseFloat($('slaV').value);
    site.freqMHz = parseFloat($('band').value);
    site.env = $('env').value;
    redrawSiteMapObjects(site);
  }

  function loadSiteToForm(site) {
    $('siteName').value = site.name;
    $('siteLat').value = site.lat.toFixed(6);
    $('siteLon').value = site.lon.toFixed(6);
    $('siteHeight').value = site.hb;
    $('siteAzimuth').value = site.azimuth;
    $('mechTilt').value = site.mechTilt;
    $('elecTilt').value = site.elecTilt;
    $('txPower').value = site.txPowerDbm;
    $('feederLoss').value = site.feederLossDb;
    $('antGain').value = site.gainMaxDbi;
    $('beamwidthH').value = site.beamwidthH;
    $('beamwidthV').value = site.beamwidthV;
    $('frontToBack').value = site.frontToBack;
    $('slaV').value = site.slaV;
    $('band').value = site.freqMHz;
    $('env').value = site.env;
  }

  function makeDefaultSite(lat, lon) {
    siteCounter++;
    const idx = sites.length;
    return {
      id: 'site_' + siteCounter,
      name: 'Site ' + siteCounter,
      lat, lon, hb: 30,
      azimuth: (idx * 120) % 360, mechTilt: 2, elecTilt: 4,
      txPowerDbm: 43, feederLossDb: 2, gainMaxDbi: 17,
      beamwidthH: 65, beamwidthV: 8, frontToBack: 25, slaV: 20,
      freqMHz: 1800, env: 'urban',
      marker: null, sectorLayer: null,
    };
  }

  // ─────────────────────────────────────────────
  // SITE MANAGEMENT (Step 1)
  // ─────────────────────────────────────────────
  function addSite(lat, lon) {
    if (sites.length >= MAX_SITES) { alert('Maksimum ' + MAX_SITES + ' site untuk simulasi multi-site/handover.'); return; }
    if (activeSiteId) syncFormToActiveSite();
    let baseLat = lat, baseLon = lon;
    if (baseLat === undefined) {
      const ref = siteById(activeSiteId) || sites[0];
      if (ref) { baseLat = ref.lat + 0.004; baseLon = ref.lon + 0.004; }
      else { baseLat = -6.2088; baseLon = 106.8456; }
    }
    const site = makeDefaultSite(baseLat, baseLon);
    sites.push(site);
    createSiteMapObjects(site);
    buildingsCache = null;
    selectSite(site.id);
    renderSiteList();
  }

  function removeSite(id) {
    if (sites.length <= 1) { alert('Minimal harus ada 1 site.'); return; }
    const site = siteById(id);
    if (!site) return;
    if (site.marker) map.removeLayer(site.marker);
    if (site.sectorLayer) map.removeLayer(site.sectorLayer);
    sites = sites.filter(s => s.id !== id);
    if (activeSiteId === id) selectSite(sites[0].id); else renderSiteList();
    buildingsCache = null;
  }

  function selectSite(id) {
    if (activeSiteId && activeSiteId !== id) syncFormToActiveSite();
    activeSiteId = id;
    const site = siteById(id);
    if (!site) return;
    loadSiteToForm(site);
    renderSiteList();
    highlightActiveMarker();
    if (map) map.panTo([site.lat, site.lon]);
    updateSectorPreview();
  }

  function renderSiteList() {
    const el = $('siteList');
    if (!el) return;
    el.innerHTML = sites.map(s => `
      <div class="site-chip ${s.id === activeSiteId ? 'active' : ''}" onclick="CakraVDT.selectSite('${s.id}')">
        <span class="site-dot" style="background:${siteColor(s)}"></span>
        <span class="site-chip-meta">
          <span class="site-chip-name">${escapeHtml(s.name)}</span>
          <span class="site-chip-sub">${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} · ${BAND_PRESETS[s.freqMHz] ? BAND_PRESETS[s.freqMHz].label : s.freqMHz + ' MHz'}</span>
        </span>
        <button class="site-chip-del" title="Hapus site" onclick="event.stopPropagation();CakraVDT.removeSite('${s.id}')">✕</button>
      </div>`).join('');
    const countEl = $('siteCount'); if (countEl) countEl.textContent = sites.length + ' / ' + MAX_SITES + ' site';
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ─────────────────────────────────────────────
  // MAP
  // ─────────────────────────────────────────────
  function initMap(defaultLat, defaultLon) {
    if (map) return;
    map = L.map('predictMap', { zoomControl: true, attributionControl: true }).setView([defaultLat, defaultLon], 15);
    // Basemap: MapLibre GL vector tiles dari OpenFreeMap (via plugin maplibre-gl-leaflet)
    // — gratis, tanpa API key, mengganti CARTO yg sekarang mewajibkan key.
    L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/dark' }).addTo(map);

    ['predictPane', 'buildingPane', 'routePane', 'sitePane'].forEach((pane, i) => {
      if (!map.getPane(pane)) { map.createPane(pane); map.getPane(pane).style.zIndex = 350 + i * 30; }
    });

    map.on('click', (e) => {
      if (drawMode) { addRoutePoint(e.latlng); return; }
      if ($('addSiteMode') && $('addSiteMode').checked) {
        addSite(e.latlng.lat, e.latlng.lng);
        return;
      }
      if (!$('clickToPlace').checked) return;
      const site = siteById(activeSiteId);
      if (!site) return;
      site.lat = e.latlng.lat; site.lon = e.latlng.lng;
      $('siteLat').value = site.lat.toFixed(6);
      $('siteLon').value = site.lon.toFixed(6);
      redrawSiteMapObjects(site);
      buildingsCache = null;
      updateSectorPreview();
    });
  }

  function createSiteMapObjects(site) {
    const color = siteColor(site);
    const icon = L.divIcon({
      className: 'site-marker-icon', html: `<div class="site-marker-dot" style="background:${color}"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    site.marker = L.marker([site.lat, site.lon], { draggable: true, icon, pane: 'sitePane' }).addTo(map);
    site.marker.bindTooltip(site.name, { permanent: false, direction: 'top' });
    site.marker.on('dragend', () => {
      const p = site.marker.getLatLng();
      site.lat = p.lat; site.lon = p.lng;
      if (site.id === activeSiteId) { $('siteLat').value = site.lat.toFixed(6); $('siteLon').value = site.lon.toFixed(6); }
      buildingsCache = null;
      redrawSiteMapObjects(site);
      renderSiteList();
    });
    site.marker.on('click', () => selectSite(site.id));
    redrawSiteMapObjects(site);
  }

  function redrawSiteMapObjects(site) {
    if (!map || !site.marker) return;
    site.marker.setLatLng([site.lat, site.lon]);
    site.marker.setTooltipContent(site.name);
    if (site.sectorLayer) map.removeLayer(site.sectorLayer);
    const color = siteColor(site);
    const R = Math.min(parseFloat($('radius') ? $('radius').value : 500) || 500, 1500) * 0.55;
    const half = site.beamwidthH / 2, steps = 24;
    const proj = CakraPropagation.makeLocalProjection(site.lat, site.lon);
    const pts = [[site.lat, site.lon]];
    for (let i = 0; i <= steps; i++) {
      const az = site.azimuth - half + (2 * half) * (i / steps);
      const rad = CakraPropagation.toRad(az);
      pts.push(proj.toLatLon(Math.sin(rad) * R, Math.cos(rad) * R));
    }
    site.sectorLayer = L.polygon(pts, {
      pane: 'predictPane', color, weight: site.id === activeSiteId ? 2 : 1,
      fillColor: color, fillOpacity: site.id === activeSiteId ? 0.12 : 0.05, dashArray: '4 3',
    }).addTo(map);
  }

  function highlightActiveMarker() {
    sites.forEach(s => {
      if (!s.marker) return;
      const el = s.marker.getElement();
      if (el) el.style.outline = s.id === activeSiteId ? '2px solid #fff' : 'none';
      redrawSiteMapObjects(s);
    });
  }

  function updateSectorPreview() {
    const site = siteById(activeSiteId);
    if (site) redrawSiteMapObjects(site);
  }

  // ─────────────────────────────────────────────
  // PROPAGASI PER-SITE (dipakai grid & rute)
  // ─────────────────────────────────────────────
  function siteRelativeGeom(site, lat, lon, proj) {
    const [sx, sy] = proj.toXY(site.lat, site.lon);
    const [px, py] = proj.toXY(lat, lon);
    const dx = px - sx, dy = py - sy;
    const distM = Math.hypot(dx, dy);
    const azimuthTo = (CakraPropagation.toDeg(Math.atan2(dx, dy)) + 360) % 360;
    const azOffset = CakraPropagation.angleDiff(azimuthTo, site.azimuth);
    const elevOffset = CakraPropagation.toDeg(Math.atan2(site.hb - RX_HEIGHT, Math.max(distM, 1)));
    return { distM, azOffset, elevOffset, sx, sy, px, py };
  }

  function predictSiteAt(site, lat, lon, proj, buildingsXY) {
    const g = siteRelativeGeom(site, lat, lon, proj);
    if (g.distM < 5) {
      return { rsrp: site.txPowerDbm - site.feederLossDb + site.gainMaxDbi, los: true, siteId: site.id, distM: g.distM, buildingId: null };
    }
    let obstruction = null;
    if (buildingsXY.length) obstruction = CakraBuildings.findDominantObstruction([g.sx, g.sy], [g.px, g.py], site.hb, RX_HEIGHT, buildingsXY);
    const r = CakraPropagation.predictAtPoint({
      distM: g.distM, azOffsetDeg: g.azOffset, elevOffsetDeg: g.elevOffset,
      freqMHz: site.freqMHz, hb: site.hb, hm: RX_HEIGHT, env: site.env, los: true,
      txPowerDbm: site.txPowerDbm, feederLossDb: site.feederLossDb, gainMaxDbi: site.gainMaxDbi,
      mechTiltDeg: site.mechTilt, elecTiltDeg: site.elecTilt,
      beamwidthH: site.beamwidthH, beamwidthV: site.beamwidthV,
      frontToBack: site.frontToBack, slaV: site.slaV,
      obstruction,
    });
    r.siteId = site.id;
    r.distM = g.distM;
    r.buildingId = obstruction ? obstruction.buildingId : null;
    return r;
  }

  function evaluateAllSites(lat, lon, proj, buildingsXY) {
    return sites.map(s => predictSiteAt(s, lat, lon, proj, buildingsXY));
  }

  function bestOf(results) {
    return results.reduce((best, r) => (!best || r.rsrp > best.rsrp) ? r : best, null);
  }

  // ─────────────────────────────────────────────
  // BANGUNAN (fetch sekali untuk union area semua site)
  // ─────────────────────────────────────────────
  function sitesKey(radiusM) {
    return sites.map(s => s.lat.toFixed(4) + ',' + s.lon.toFixed(4)).join('|') + '@' + radiusM;
  }

  async function ensureBuildings(radiusM) {
    const key = sitesKey(radiusM);
    if (buildingsCache && buildingsCache.key === key) return buildingsCache.list;
    const centLat = sites.reduce((a, s) => a + s.lat, 0) / sites.length;
    const centLon = sites.reduce((a, s) => a + s.lon, 0) / sites.length;
    let maxSpread = 0;
    sites.forEach(s => { maxSpread = Math.max(maxSpread, CakraPropagation.haversineDist(centLat, centLon, s.lat, s.lon)); });
    const fetchRadius = maxSpread + radiusM + 100;
    const list = await CakraBuildings.fetchBuildings(centLat, centLon, fetchRadius);
    buildingsCache = { key, radius: radiusM, list };
    return list;
  }

  // ─────────────────────────────────────────────
  // GRID PREDIKSI MULTI-SITE (Step 3) — best-server coverage
  // ─────────────────────────────────────────────
  function buildUnionGrid(radiusM, cellSizeM) {
    const centLat = sites.reduce((a, s) => a + s.lat, 0) / sites.length;
    const centLon = sites.reduce((a, s) => a + s.lon, 0) / sites.length;
    const proj = CakraPropagation.makeLocalProjection(centLat, centLon);
    const siteXY = sites.map(s => ({ site: s, xy: proj.toXY(s.lat, s.lon) }));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    siteXY.forEach(({ xy }) => {
      minX = Math.min(minX, xy[0] - radiusM); maxX = Math.max(maxX, xy[0] + radiusM);
      minY = Math.min(minY, xy[1] - radiusM); maxY = Math.max(maxY, xy[1] + radiusM);
    });

    const MAX_CELLS_PER_AXIS = 110;
    let cell = cellSizeM;
    const wantedX = Math.ceil((maxX - minX) / cell), wantedY = Math.ceil((maxY - minY) / cell);
    const wanted = Math.max(wantedX, wantedY);
    if (wanted > MAX_CELLS_PER_AXIS) cell = Math.max(maxX - minX, maxY - minY) / MAX_CELLS_PER_AXIS;

    const nx = Math.ceil((maxX - minX) / cell), ny = Math.ceil((maxY - minY) / cell);
    const points = [];
    for (let j = 0; j < ny; j++) {
      const y = minY + (j + 0.5) * cell;
      for (let i = 0; i < nx; i++) {
        const x = minX + (i + 0.5) * cell;
        const within = siteXY.some(({ xy }) => Math.hypot(x - xy[0], y - xy[1]) <= radiusM);
        points.push(within ? { x, y } : null);
      }
    }
    return { points, nx, ny, cell, proj, minX, minY };
  }

  async function runPrediction() {
    const f = readSharedForm();
    if (activeSiteId) syncFormToActiveSite();
    if (!sites.length) { showStatus('Tambahkan minimal 1 site terlebih dulu.', true); return; }

    setRunning(true);
    showStatus('Menyiapkan grid prediksi…');

    try {
      let buildings = [];
      if (f.useBuildings) {
        showStatus('Mengambil data bangunan dari OpenStreetMap…');
        try { buildings = await ensureBuildings(f.radiusM); }
        catch (e) {
          console.warn('Overpass gagal, lanjut tanpa data bangunan:', e);
          showStatus('Gagal ambil data bangunan (offline/timeout) — prediksi lanjut tanpa obstruksi', true);
          await sleep(1000);
        }
      }

      showStatus(`Menghitung prediksi ${sites.length} site (${buildings.length} bangunan)…`);
      await sleep(10);

      const { points, nx, ny, cell, proj, minX, minY } = buildUnionGrid(f.radiusM, f.cellSizeM);
      const buildingsXY = buildings.map(b => {
        const xy = b.footprint.map(([blat, blon]) => proj.toXY(blat, blon));
        return { id: b.id, heightM: b.heightM, xy, bb: CakraBuildings.bbox(xy) };
      });

      const results = new Array(points.length).fill(null);
      let sumRsrp = 0, countLos = 0, countValid = 0, countAbove = 0;
      const bySite = {}; sites.forEach(s => bySite[s.id] = 0);

      for (let idx = 0; idx < points.length; idx++) {
        const p = points[idx];
        if (!p) continue;
        const [lat, lon] = proj.toLatLon(p.x, p.y);
        const all = evaluateAllSites(lat, lon, proj, buildingsXY);
        const best = bestOf(all);
        results[idx] = best;
        sumRsrp += best.rsrp; countValid++;
        if (best.los) countLos++;
        if (best.rsrp >= f.thresholdDbm) countAbove++;
        if (bySite[best.siteId] !== undefined) bySite[best.siteId]++;
        if (idx % 400 === 0) await sleep(0);
      }

      lastResult = { points, nx, ny, cell, proj, minX, minY, results, form: f, buildings, buildingsXY };
      renderHeatmap(lastResult);
      renderBuildings(buildingsXY, lastResult);

      const stats = {
        avgRsrp: countValid ? (sumRsrp / countValid) : NaN,
        losPct: countValid ? (countLos / countValid * 100) : 0,
        coveragePct: countValid ? (countAbove / countValid * 100) : 0,
        buildingCount: buildings.length,
        gridPoints: countValid,
      };
      renderStats(stats);
      renderSiteShare(bySite, countValid);

      const toStep4 = $('toStep4');
      if (toStep4) toStep4.disabled = false;

      showStatus(`Selesai — ${countValid} titik, ${sites.length} site, ${buildings.length} bangunan${f.useBuildings ? '' : ' (dimatikan)'}`);
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

  let heatOverlayRef = null;
  function renderHeatmap(res) {
    const { nx, ny, cell, proj, minX, minY, results } = res;
    if (heatOverlayRef) { map.removeLayer(heatOverlayRef); heatOverlayRef = null; }
    const canvas = document.createElement('canvas');
    canvas.width = nx; canvas.height = ny;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const r = results[idx];
        const px = (((ny - 1 - j) * nx) + i) * 4;
        if (!r) { img.data[px + 3] = 0; continue; }
        const [cr, cg, cb] = RSRP_COLOR(r.rsrp);
        img.data[px] = cr; img.data[px + 1] = cg; img.data[px + 2] = cb;
        img.data[px + 3] = Math.round(255 * 0.72);
      }
    }
    ctx.putImageData(img, 0, 0);
    const sw = proj.toLatLon(minX, minY);
    const ne = proj.toLatLon(minX + nx * cell, minY + ny * cell);
    heatOverlayRef = L.imageOverlay(canvas.toDataURL(), [[sw[0], sw[1]], [ne[0], ne[1]]], {
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
      ${statCard('Avg RSRP Terbaik', isNaN(s.avgRsrp) ? '—' : s.avgRsrp.toFixed(1) + ' dBm', s.avgRsrp >= -90 ? 'good' : (s.avgRsrp >= -100 ? 'warn' : 'bad'))}
      ${statCard('Coverage (≥ threshold)', s.coveragePct.toFixed(1) + '%', s.coveragePct >= 90 ? 'good' : (s.coveragePct >= 70 ? 'warn' : 'bad'))}
      ${statCard('% Titik LOS', s.losPct.toFixed(1) + '%')}
      ${statCard('Bangunan', s.buildingCount.toLocaleString())}
      ${statCard('Titik Grid', s.gridPoints.toLocaleString())}
    `;
  }

  function renderSiteShare(bySite, total) {
    const el = $('siteSharePanel'); if (!el) return;
    if (sites.length < 2 || !total) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = sites.map(s => {
      const pct = total ? (bySite[s.id] / total * 100) : 0;
      return `<div class="share-row">
        <span class="site-dot" style="background:${siteColor(s)}"></span>
        <span class="share-name">${escapeHtml(s.name)}</span>
        <span class="share-bar-wrap"><span class="share-bar" style="width:${pct}%;background:${siteColor(s)}"></span></span>
        <span class="share-pct">${pct.toFixed(0)}%</span>
      </div>`;
    }).join('');
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
    if (handoverLayer) { map.removeLayer(handoverLayer); handoverLayer = null; }
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
    for (let i = 1; i < routePts.length; i++) L += CakraPropagation.haversineDist(routePts[i-1][0], routePts[i-1][1], routePts[i][0], routePts[i][1]);
    return L;
  }

  function updateRouteInfo() {
    const el = $('routeInfo'); if (!el) return;
    if (!routePts.length) { el.textContent = 'Rute: belum digambar'; return; }
    const L = routeLengthM();
    el.textContent = `Rute: ${routePts.length} titik · ${L.toFixed(0)} m` + (L > 1000 ? ` (${(L/1000).toFixed(2)} km)` : '');
  }

  // Estimasi RSRQ & SINR nyata: interferensi = jumlah daya linear site lain + noise floor
  function deriveRsrqSinr(servingRsrp, otherRsrpList, los, noiseFloorDb) {
    let interfLinear = Math.pow(10, noiseFloorDb / 10);
    otherRsrpList.forEach(r => { interfLinear += Math.pow(10, r / 10); });
    if (!los) interfLinear *= 2.5; // NLOS: dispersi multipath menaikkan interferensi efektif
    const interfDb = 10 * Math.log10(interfLinear);
    const rssi = 10 * Math.log10(Math.pow(10, servingRsrp / 10) + interfLinear);
    let rsrq = servingRsrp - rssi;
    let sinr = servingRsrp - interfDb;
    rsrq = Math.max(-22, Math.min(-3, rsrq));
    sinr = Math.max(-20, Math.min(40, sinr));
    return { rsrq: +rsrq.toFixed(1), sinr: +sinr.toFixed(1) };
  }

  // Baca parameter mobility/handover 3GPP dari form Step 4 (dgn fallback default
  // yang lazim dipakai operator: Hys 2dB, A3-Offset 1dB, TTT 320ms, FilterK 4).
  function readHandoverParams() {
    const num = (id, def) => { const el = $(id); const v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? def : v; };
    return {
      hysteresisDb: num('hoHysteresis', 2),
      a3OffsetDb: num('hoA3Offset', 1),
      filterK: num('hoFilterK', 4),
      ttTms: num('hoTTT', 320),
      pingPongWindowMs: num('hoPingPongWindow', 5000),
    };
  }

  // ─────────────────────────────────────────────
  // VIRTUAL DRIVE SIMULATION — multi-site best-server + handover (Step 4)
  // ─────────────────────────────────────────────
  async function simulateRoute() {
    if (routePts.length < 2) { alert('Gambar rute dulu di peta.'); return; }
    if (activeSiteId) syncFormToActiveSite();
    if (!sites.length) { alert('Tambahkan minimal 1 site.'); return; }
    const f = readSharedForm();
    const simStatus = $('simStatus');
    if (simStatus) simStatus.textContent = 'Menyiapkan simulasi…';

    let buildings = [];
    if (f.useBuildings) {
      try { buildings = await ensureBuildings(f.radiusM); }
      catch (e) { if (simStatus) simStatus.textContent = 'Gagal ambil data bangunan — lanjut tanpa obstruksi'; }
    }
    const centLat = sites.reduce((a, s) => a + s.lat, 0) / sites.length;
    const centLon = sites.reduce((a, s) => a + s.lon, 0) / sites.length;
    const proj = CakraPropagation.makeLocalProjection(centLat, centLon);
    const buildingsXY = buildings.map(b => {
      const xy = b.footprint.map(([blat, blon]) => proj.toXY(blat, blon));
      return { id: b.id, heightM: b.heightM, xy, bb: CakraBuildings.bbox(xy) };
    });

    const stepM = parseFloat($('sampStep').value) || 10;
    const speedKmh = parseFloat($('vehSpeed').value) || 30;
    const speedMs = speedKmh / 3.6;
    const totalL = routeLengthM();
    const durationS = totalL / speedMs;

    // Kumpulkan dulu RSRP mentah SEMUA site per titik rute (belum menentukan
    // serving cell) — keputusan serving/handover baru dibuat setelah ini oleh
    // CakraHandover.simulateHandoverSequence (L3 filter + Event A3 + TTT),
    // BUKAN dengan langsung mengambil RSRP tertinggi per-sampel.
    const rawPts = []; // {dist,t,lat,lon,all:[{siteId,rsrp,los}]}
    let cum = 0;
    for (let s = 0; s < routePts.length - 1; s++) {
      const [la1, lo1] = routePts[s], [la2, lo2] = routePts[s + 1];
      const segLen = CakraPropagation.haversineDist(la1, lo1, la2, lo2);
      const nSeg = Math.max(1, Math.floor(segLen / stepM));
      for (let k = 0; k < nSeg; k++) {
        const tt = k / nSeg;
        const lat = la1 + (la2 - la1) * tt, lon = lo1 + (lo2 - lo1) * tt;
        const all = evaluateAllSites(lat, lon, proj, buildingsXY);
        const dist = cum + segLen * tt;
        rawPts.push({ dist, t: dist / speedMs, lat, lon, all });
      }
      cum += segLen;
    }
    {
      const [la, lo] = routePts[routePts.length - 1];
      const all = evaluateAllSites(la, lo, proj, buildingsXY);
      rawPts.push({ dist: totalL, t: durationS, lat: la, lon: lo, all });
    }

    // ── Engine mobility 3GPP: L3 filtering + Event A3 + Time-to-Trigger ──
    const hoParams = readHandoverParams();
    const sampleSites = rawPts.map(p => p.all.map(r => ({ siteId: r.siteId, rsrp: r.rsrp })));
    const sampleTimesMs = rawPts.map(p => p.t * 1000);
    const { servingPerSample, handovers: hoEvents } = CakraHandover.simulateHandoverSequence(
      sampleSites, sampleTimesMs, hoParams
    );

    // Bentuk ulang `samples` memakai serving cell hasil keputusan handover (RSRP
    // yang ditampilkan tetap RSRP instan/mentah site serving — sama seperti yang
    // dilihat UE/drive test tool — filter L3 hanya dipakai internal utk keputusan HO).
    const samples = rawPts.map((p, i) => {
      const servingId = servingPerSample[i];
      const servingResult = p.all.find(r => r.siteId === servingId) || bestOf(p.all);
      const others = p.all.filter(r => r.siteId !== servingResult.siteId).map(r => r.rsrp);
      const { rsrq, sinr } = deriveRsrqSinr(servingResult.rsrp, others, servingResult.los, f.noiseFloorDb);
      return {
        dist: p.dist, t: p.t, lat: p.lat, lon: p.lon,
        rsrp: servingResult.rsrp, rsrq, sinr, los: servingResult.los, siteId: servingResult.siteId,
      };
    });

    // Lengkapi event handover dgn posisi (lat/lon/dist) dari sampel terkait, dan
    // nilai RSRP mentah (bukan filtered) di titik itu untuk ditampilkan di UI.
    const handovers = hoEvents.map(ev => {
      const p = rawPts[ev.idx];
      const fromRaw = p.all.find(r => r.siteId === ev.fromId);
      const toRaw = p.all.find(r => r.siteId === ev.toId);
      return {
        dist: p.dist, lat: p.lat, lon: p.lon,
        fromId: ev.fromId, toId: ev.toId,
        fromRsrp: fromRaw ? fromRaw.rsrp : ev.fromRsrpFiltered,
        toRsrp: toRaw ? toRaw.rsrp : ev.toRsrpFiltered,
        pingPong: ev.pingPong,
      };
    });

    lastRoute = { samples, totalL, durationS, speedKmh, form: f, threshold: f.thresholdDbm, handovers, hoParams };

    renderRouteMarkers(samples);
    renderHandoverMarkers(handovers);
    renderRouteChart(samples, f.thresholdDbm);
    renderRouteStats(samples, totalL, durationS, f.thresholdDbm, handovers);

    const to5 = $('toStep5'); if (to5) to5.disabled = false;
    if (simStatus) simStatus.textContent = `Selesai — ${samples.length} sampel · ${totalL.toFixed(0)} m · ${(durationS/60).toFixed(1)} menit · ${handovers.length} handover`;
    const wrap = $('routeStatsWrap'); if (wrap) wrap.style.display = 'block';
    const cc = $('chartCard'); if (cc) cc.style.display = 'block';
  }

  function renderRouteMarkers(samples) {
    if (routeSampleLayer) map.removeLayer(routeSampleLayer);
    routeSampleLayer = L.layerGroup();
    const stride = Math.max(1, Math.floor(samples.length / 250));
    samples.forEach((s, i) => {
      if (i % stride !== 0 && i !== samples.length - 1) return;
      const weak = s.rsrp < lastRoute.threshold;
      const site = siteById(s.siteId);
      const borderColor = site ? siteColor(site) : '#fff';
      L.circleMarker([s.lat, s.lon], {
        pane: 'routePane', radius: weak ? 4 : 3, color: borderColor, weight: 2,
        fillColor: rgb(RSRP_COLOR(s.rsrp)), fillOpacity: 0.95,
      }).bindTooltip(`${s.dist.toFixed(0)} m · RSRP ${s.rsrp.toFixed(1)} dBm · ${site ? site.name : '?'}`, { sticky: true }).addTo(routeSampleLayer);
    });
    routeSampleLayer.addTo(map);
    if (routePts.length) map.fitBounds(L.polyline(routePts).getBounds().pad(0.2));
  }

  function renderHandoverMarkers(handovers) {
    if (handoverLayer) map.removeLayer(handoverLayer);
    handoverLayer = L.layerGroup();
    handovers.forEach(h => {
      const fromSite = siteById(h.fromId), toSite = siteById(h.toId);
      L.marker([h.lat, h.lon], {
        pane: 'routePane',
        icon: L.divIcon({
          className: 'ho-marker-icon',
          html: `<div class="ho-marker ${h.pingPong ? 'pingpong' : ''}">⇄</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10],
        }),
      }).bindTooltip(
        `Handover ${h.dist.toFixed(0)} m: ${fromSite ? fromSite.name : '?'} → ${toSite ? toSite.name : '?'}` + (h.pingPong ? ' ⚠ ping-pong' : ''),
        { sticky: true }
      ).addTo(handoverLayer);
    });
    handoverLayer.addTo(map);
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

  function renderRouteStats(samples, totalL, durationS, threshold, handovers) {
    const el = $('routeStatsPanel'); if (!el) return;
    const valid = samples.length;
    let sum = 0, weakSegs = [], segStart = null, segMin = 999;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]; sum += s.rsrp;
      const weak = s.rsrp < threshold;
      if (weak) { if (segStart === null) { segStart = s.dist; segMin = s.rsrp; } else segMin = Math.min(segMin, s.rsrp); }
      else { if (segStart !== null) { weakSegs.push({ start: segStart, end: samples[i-1].dist, min: segMin }); segStart = null; } }
    }
    if (segStart !== null) weakSegs.push({ start: segStart, end: totalL, min: segMin });
    const avg = valid ? sum / valid : NaN;
    const cov = valid ? (samples.filter(s => s.rsrp >= threshold).length / valid * 100) : 0;
    const pingPongCount = handovers.filter(h => h.pingPong).length;
    el.innerHTML = `
      ${statCard('Jarak Rute', totalL > 1000 ? (totalL/1000).toFixed(2)+' km' : totalL.toFixed(0)+' m')}
      ${statCard('Durasi', (durationS/60).toFixed(1)+' mnt')}
      ${statCard('Avg RSRP', isNaN(avg) ? '—' : avg.toFixed(1)+' dBm', avg >= -90 ? 'good' : (avg >= -100 ? 'warn' : 'bad'))}
      ${statCard('Coverage Rute', cov.toFixed(1)+'%', cov >= 90 ? 'good' : (cov >= 70 ? 'warn' : 'bad'))}
      ${statCard('Handover', handovers.length.toString(), handovers.length ? 'warn' : 'good')}
      ${statCard('Ping-pong', pingPongCount.toString(), pingPongCount ? 'bad' : 'good')}
      ${statCard('Titik Rawan', weakSegs.length.toString(), weakSegs.length ? 'bad' : 'good')}
      ${statCard('Sampel', valid.toLocaleString())}
    `;
    const wl = $('routeWeakList');
    if (wl) {
      const parts = [];
      handovers.forEach(h => {
        const fromSite = siteById(h.fromId), toSite = siteById(h.toId);
        parts.push(`<div class="route-item">
          <span class="badge" style="background:${h.pingPong ? 'var(--red-dim)' : 'var(--cyan-dim)'};color:${h.pingPong ? 'var(--red)' : 'var(--cyan)'}">${h.pingPong ? 'PING-PONG' : 'HANDOVER'}</span>
          <span class="rd">${h.dist.toFixed(0)} m · ${fromSite ? fromSite.name : '?'} → ${toSite ? toSite.name : '?'}</span>
          <span class="rv">${h.fromRsrp.toFixed(0)}→${h.toRsrp.toFixed(0)} dBm</span>
        </div>`);
      });
      weakSegs.forEach(w => {
        const len = (w.end - w.start);
        parts.push(`<div class="route-item">
          <span class="badge" style="background:var(--red-dim);color:var(--red)">RAWAN</span>
          <span class="rd">${w.start.toFixed(0)}–${w.end.toFixed(0)} m · ${len.toFixed(0)} m</span>
          <span class="rv">min ${w.min.toFixed(0)} dBm</span>
        </div>`);
      });
      wl.innerHTML = parts.length ? parts.join('') : `<div style="font-size:11px;color:var(--text2)">Tidak ada titik rawan atau handover — rute seluruhnya stabil di satu site.</div>`;
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
    const pingPongCount = lastRoute.handovers.filter(h => h.pingPong).length;
    const siteLines = sites.map((s, i) =>
      `  ${i+1}. ${s.name} — ${s.lat.toFixed(6)}, ${s.lon.toFixed(6)} — Az ${s.azimuth}° · ${s.gainMaxDbi}dBi · ${BAND_PRESETS[s.freqMHz] ? BAND_PRESETS[s.freqMHz].label : s.freqMHz+' MHz'}`
    ).join('\n');
    wrap.innerHTML = `<div class="report-box">SKENARIO VIRTUAL DRIVE TEST
Nama       : ${f.name || '(tanpa nama)'}
Operator   : ${f.op || '-'}
Jumlah Site: ${sites.length}
${siteLines}

RUTE
Jarak      : ${(lastRoute.totalL/1000).toFixed(2)} km
Kecepatan  : ${lastRoute.speedKmh} km/jam
Durasi     : ${(lastRoute.durationS/60).toFixed(1)} menit

HASIL PREDIKSI
Avg RSRP   : ${avg.toFixed(1)} dBm
Avg SINR   : ${avgSinr.toFixed(1)} dB
Coverage   : ${cov.toFixed(1)} % (≥ ${lastRoute.threshold} dBm)
Handover   : ${lastRoute.handovers.length} kali (${pingPongCount} ping-pong)
Titik rawan: ${samples.filter(s=>s.rsrp<lastRoute.threshold).length} sampel

PARAMETER MOBILITY (3GPP TS 36.331)
Hysteresis      : ${lastRoute.hoParams.hysteresisDb} dB
A3-Offset       : ${lastRoute.hoParams.a3OffsetDb} dB
Time-to-Trigger : ${lastRoute.hoParams.ttTms} ms
Filter Coeff. k : ${lastRoute.hoParams.filterK}</div>`;

    const real = getRealDataPoints();
    const vp = $('validationPanel');
    if (!real.length) {
      vp.className = 'info-note';
      vp.innerHTML = 'Belum ada data drive test asli di sesi ini. Upload file log di <a href="/" data-route style="color:var(--cyan)">halaman utama</a> untuk membandingkan.';
      return;
    }
    const errs = [];
    samples.forEach(s => {
      let best = null, bestD = 30;
      for (const d of real) {
        const dd = CakraPropagation.haversineDist(s.lat, s.lon, d.lat, d.lon);
        if (dd < bestD) { bestD = dd; best = d; }
      }
      if (best) errs.push(s.rsrp - best.rsrp);
    });
    if (!errs.length) {
      vp.className = 'info-note';
      vp.innerHTML = `Tidak ada titik data asli dalam radius pencarian sepanjang rute ini. Coba gambar rute yang menimpa area drive test asli.`;
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
    const rows = [['idx','distance_m','time_s','lat','lon','rsrp_dbm','rsrq_db','sinr_db','speed_kmh','serving_site','status']];
    lastRoute.samples.forEach((s, i) => {
      const site = siteById(s.siteId);
      rows.push([i, s.dist.toFixed(1), s.t.toFixed(1), s.lat.toFixed(6), s.lon.toFixed(6),
        s.rsrp.toFixed(1), s.rsrq, s.sinr, lastRoute.speedKmh, site ? site.name : s.siteId,
        s.rsrp < lastRoute.threshold ? 'BELOW_THRESHOLD' : 'OK']);
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
    const rows = lastRoute.samples.map((s, i) => {
      const site = siteById(s.siteId);
      const tech = site && site.freqMHz >= 2300 ? 'NR' : 'LTE';
      return {
        _tool: 'VIRTUAL', _virtual: true, _sessionTech: tech,
        ts: 'VDT_' + String(i).padStart(5, '0'), tsDisp: '', timePart: '',
        lat: s.lat, lon: s.lon,
        rsrp: s.rsrp, rsrq: s.rsrq, snr: s.sinr,
        speed: lastRoute.speedKmh, operator: f.op || '', cellname: site ? site.name : ('Virtual Site'),
        cgi: '', node: '', cellid: '', lac: '', tech, arfcn: '', pci: null,
        dl: 0, ul: 0, band: site ? site.freqMHz + ' MHz' : '', bw: '', device: 'Cakra VDT', state: '', cqi: '', ping_avg: null,
        nr_rsrp: null, nr_rsrq: null, nr_sinr: null, nr_rssi: null, nr_band: null, nr_arfcn: null,
        nr_pci: null, nr_dl: null, nr_ul: null, _hasNrCols: false,
      };
    });
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
    const site = siteById(activeSiteId);
    if (!site) return;
    site.lat = lat; site.lon = lon;
    $('siteLat').value = lat.toFixed(6);
    $('siteLon').value = lon.toFixed(6);
    map.panTo([lat, lon]);
    redrawSiteMapObjects(site);
    buildingsCache = null;
  }

  // ─────────────────────────────────────────────
  // STEPPER
  // ─────────────────────────────────────────────
  function goto(step) {
    if (currentStep === 1 || currentStep === 2) syncFormToActiveSite();
    currentStep = step;
    for (let i = 1; i <= 5; i++) {
      const sec = $('step' + i);
      if (sec) sec.classList.toggle('active', i === step);
      const btn = document.querySelector('.step-btn[data-step="' + i + '"]');
      if (btn) { btn.classList.toggle('active', i === step); btn.classList.toggle('done', i < step); }
    }
    if (step === 5) buildReport();
    if (step === 4 && !drawMode) $('mapHint').classList.remove('show');
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

    initMap(defLat, defLon);

    const site = makeDefaultSite(defLat, defLon);
    sites.push(site);
    createSiteMapObjects(site);
    activeSiteId = site.id;
    loadSiteToForm(site);
    renderSiteList();

    const pc = $('presetCity');
    if (pc) pc.addEventListener('change', () => {
      const m = pc.value.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (m) {
        const s = siteById(activeSiteId);
        if (s) { s.lat = +m[1]; s.lon = +m[2]; $('siteLat').value = m[1]; $('siteLon').value = m[2]; map.panTo([+m[1], +m[2]]); redrawSiteMapObjects(s); buildingsCache = null; }
      }
    });

    ['siteAzimuth', 'mechTilt', 'elecTilt', 'beamwidthH'].forEach(id => {
      const el = $(id); if (el) el.addEventListener('input', () => { syncFormToActiveSite(); });
    });
    $('radius') && $('radius').addEventListener('input', updateSectorPreview);
    $('siteName') && $('siteName').addEventListener('change', () => { syncFormToActiveSite(); renderSiteList(); });
    $('siteLat') && $('siteLat').addEventListener('change', () => {
      const s = siteById(activeSiteId); if (!s) return;
      s.lat = parseFloat($('siteLat').value); s.lon = parseFloat($('siteLon').value);
      map.panTo([s.lat, s.lon]); redrawSiteMapObjects(s); buildingsCache = null;
    });
    $('siteLon') && $('siteLon').addEventListener('change', () => {
      const s = siteById(activeSiteId); if (!s) return;
      s.lat = parseFloat($('siteLat').value); s.lon = parseFloat($('siteLon').value);
      map.panTo([s.lat, s.lon]); redrawSiteMapObjects(s); buildingsCache = null;
    });

    $('runPredictBtn') && $('runPredictBtn').addEventListener('click', runPrediction);

    goto(1);
  }

  function statCard(label, value, cls) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls || ''}">${value}</div></div>`;
  }

  // Data mentah utk modul visualisasi 3D (map3d.js) — dipanggil saat tombol
  // "Peta 3D" ditekan. Dikirim sebagai referensi objek (bukan clone/JSON),
  // termasuk `proj` (fungsi toLatLon) dari lastResult supaya grid meter→lat/lon
  // tidak perlu dihitung ulang.
  function getSceneData() {
    return { sites, lastResult, lastRoute, routePts: routePts.slice() };
  }

  return {
    init, goto, useRealCentroid, runPrediction, toggleDraw, finishDraw, clearRoute, simulateRoute,
    exportCSV, exportPNG, openInDashboard, addSite, removeSite, selectSite, getSceneData,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('predictMap')) CakraVDT.init();
});
