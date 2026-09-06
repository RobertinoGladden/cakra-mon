// predict.js — Virtual Drive Test controller (multi-step wizard, multi-site) — Cakra v2.2
// Menghubungkan propagation.js (model RF) + buildings.js (data OSM) ke peta Leaflet,
// mendukung banyak site sekaligus (best-server / handover), lalu menyimulasikan
// "virtual drive" sepanjang rute dan memvalidasi vs data nyata.
// © 2026 — dikembangkan sebagai ekstensi Cakra Drive Test Intelligence.

'use strict';

window.CakraVDT = (() => {
  const T = (key, params) => (window.CakraI18n ? window.CakraI18n.t(key, params) : key);
  let map = null;
  let buildingsCache = null;      // { key, radius, list }
  let lastResult = null;          // hasil prediksi grid (multi-site, best-server)
  let lastRoute = null;           // hasil simulasi rute
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
    if (sites.length >= MAX_SITES) { alert(T('predict.maxSites', { n: MAX_SITES })); return; }
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
    if (sites.length <= 1) { alert(T('predict.minOneSite')); return; }
    const site = siteById(id);
    if (!site) return;
    if (site.marker) site.marker.remove();
    if (site.tooltip) site.tooltip.remove();
    sites = sites.filter(s => s.id !== id);
    if (activeSiteId === id) selectSite(sites[0].id); else renderSiteList();
    buildingsCache = null;
    renderAllSectors();
  }

  function selectSite(id) {
    if (activeSiteId && activeSiteId !== id) syncFormToActiveSite();
    activeSiteId = id;
    const site = siteById(id);
    if (!site) return;
    loadSiteToForm(site);
    renderSiteList();
    highlightActiveMarker();
    if (map) map.panTo([site.lon, site.lat]);
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
        <button class="site-chip-del" title="${T('predict.deleteSite')}" onclick="event.stopPropagation();CakraVDT.removeSite('${s.id}')">✕</button>
      </div>`).join('');
    const countEl = $('siteCount'); if (countEl) countEl.textContent = sites.length + ' / ' + MAX_SITES + ' ' + T('predict.site');
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ─────────────────────────────────────────────
  // MAP (native MapLibre GL JS — full 3D, no Leaflet)
  // ─────────────────────────────────────────────
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // vector style w/ building height data
  const DEFAULT_PITCH = 55, DEFAULT_BEARING = -17;
  let hoverPopup = null; // shared hover popup for layer-based features

  function initMap(defaultLat, defaultLon) {
    if (map) return;
    map = new maplibregl.Map({
      container: 'predictMap',
      style: MAP_STYLE,
      center: [defaultLon, defaultLat],
      zoom: 15.5,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      antialias: true,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'cakra-map-popup', offset: 10 });

    map.on('load', () => {
      setup3DBuildingContext();
      setupEmptySources();
      wireHoverTooltips();
    });

    map.on('click', (e) => {
      const lat = e.lngLat.lat, lon = e.lngLat.lng;
      if (drawMode) { addRoutePoint({ lat, lng: lon }); return; }
      if ($('addSiteMode') && $('addSiteMode').checked) {
        addSite(lat, lon);
        return;
      }
      if (!$('clickToPlace').checked) return;
      const site = siteById(activeSiteId);
      if (!site) return;
      site.lat = lat; site.lon = lon;
      $('siteLat').value = site.lat.toFixed(6);
      $('siteLon').value = site.lon.toFixed(6);
      redrawSiteMapObjects(site);
      buildingsCache = null;
      updateSectorPreview();
    });
  }

  // Toggle between a tilted 3D perspective and a top-down (pitch=0) view,
  // e.g. for precise site/route placement vs a real-world 3D preview.
  function setMapView(mode) {
    if (!map) return;
    const btnTilt = $('viewTiltBtn'), btnTop = $('viewTopBtn');
    if (mode === 'top') {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
      if (btnTop) btnTop.classList.add('active');
      if (btnTilt) btnTilt.classList.remove('active');
    } else {
      map.easeTo({ pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING, duration: 500 });
      if (btnTilt) btnTilt.classList.add('active');
      if (btnTop) btnTop.classList.remove('active');
    }
  }

  // Native 3D building extrusion from the vector style's own OSM building
  // layer — gives the whole scene real-world context (skyline, relative
  // antenna height vs surrounding buildings) even before a prediction runs.
  function setup3DBuildingContext() {
    if (map.getLayer('cakra-context-buildings-3d')) return;
    const layers = map.getStyle().layers;
    let labelLayerId;
    for (const l of layers) {
      if (l.type === 'symbol' && l.layout && l.layout['text-field']) { labelLayerId = l.id; break; }
    }
    try {
      map.addLayer({
        id: 'cakra-context-buildings-3d',
        source: 'openmaptiles', 'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': '#2a2f38',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.55,
        },
      }, labelLayerId);
    } catch (e) { console.warn('3D building context layer unavailable in this style:', e); }
  }

  function addOrUpdateSource(id, data) {
    if (map.getSource(id)) { map.getSource(id).setData(data); return; }
    map.addSource(id, { type: 'geojson', data });
  }
  const emptyFC = () => ({ type: 'FeatureCollection', features: [] });

  // Pre-create every GeoJSON source/layer once (empty) so later updates are
  // just setData() calls — avoids add/remove churn and layer-order bugs.
  function setupEmptySources() {
    addOrUpdateSource('cakra-sectors', emptyFC());
    if (!map.getLayer('cakra-sectors-fill')) {
      map.addLayer({
        id: 'cakra-sectors-fill', type: 'fill-extrusion', source: 'cakra-sectors',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': 4,
          'fill-extrusion-opacity': ['case', ['get', 'active'], 0.16, 0.06],
        },
      });
      map.addLayer({
        id: 'cakra-sectors-outline', type: 'line', source: 'cakra-sectors',
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'active'], 2, 1], 'line-dasharray': [4, 3] },
      });
    }

    addOrUpdateSource('cakra-obstruction-buildings', emptyFC());
    if (!map.getLayer('cakra-obstruction-fill')) {
      map.addLayer({
        id: 'cakra-obstruction-fill', type: 'fill-extrusion', source: 'cakra-obstruction-buildings',
        paint: {
          'fill-extrusion-color': ['case', ['get', 'blocking'], '#f87171', '#334155'],
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-opacity': ['case', ['get', 'blocking'], 0.55, 0.35],
        },
      });
    }

    addOrUpdateSource('cakra-route-line', { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
    if (!map.getLayer('cakra-route-line-layer')) {
      map.addLayer({
        id: 'cakra-route-line-layer', type: 'line', source: 'cakra-route-line',
        paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [2, 1.3] },
      });
    }

    addOrUpdateSource('cakra-route-draft-points', emptyFC());
    if (!map.getLayer('cakra-route-draft-points-layer')) {
      map.addLayer({
        id: 'cakra-route-draft-points-layer', type: 'circle', source: 'cakra-route-draft-points',
        paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#0a0a0b', 'circle-stroke-width': 1 },
      });
    }

    addOrUpdateSource('cakra-route-samples', emptyFC());
    if (!map.getLayer('cakra-route-samples-layer')) {
      map.addLayer({
        id: 'cakra-route-samples-layer', type: 'circle', source: 'cakra-route-samples',
        paint: {
          'circle-radius': ['case', ['get', 'weak'], 5, 4],
          'circle-color': ['get', 'fillColor'],
          'circle-opacity': 0.95,
          'circle-stroke-color': ['get', 'borderColor'],
          'circle-stroke-width': 2,
        },
      });
    }
  }

  // Hover tooltips for GeoJSON-layer-based features (buildings, route samples).
  // Marker-based features (sites, handovers) get their own tooltip wiring
  // where they are created, since they are real DOM elements.
  function wireHoverTooltips() {
    const tipLayers = [
      { id: 'cakra-obstruction-fill', html: p => `${p.blocking ? '⚠ ' + T('predict.blocksLos') + ' · ' : ''}${T('predict.building')} · ~${Math.round(p.heightM)}m` },
      { id: 'cakra-route-samples-layer', html: p => `${Math.round(p.dist)} m · RSRP ${Number(p.rsrp).toFixed(1)} dBm · ${p.siteName || '?'}` },
    ];
    tipLayers.forEach(({ id, html }) => {
      map.on('mousemove', id, (e) => {
        if (!e.features.length) return;
        map.getCanvas().style.cursor = 'pointer';
        hoverPopup.setLngLat(e.lngLat).setHTML(html(e.features[0].properties)).addTo(map);
      });
      map.on('mouseleave', id, () => {
        map.getCanvas().style.cursor = '';
        hoverPopup.remove();
      });
    });
  }

  function createSiteMapObjects(site) {
    const el = document.createElement('div');
    el.className = 'site-marker-icon';
    el.innerHTML = `<div class="site-marker-dot" style="background:${siteColor(site)}"></div>`;
    site.markerEl = el;
    site.marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat([site.lon, site.lat])
      .addTo(map);

    site.tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 }).setText(site.name);
    el.addEventListener('mouseenter', () => site.tooltip.setLngLat(site.marker.getLngLat()).addTo(map));
    el.addEventListener('mouseleave', () => site.tooltip.remove());

    site.marker.on('dragend', () => {
      const p = site.marker.getLngLat();
      site.lat = p.lat; site.lon = p.lng;
      if (site.id === activeSiteId) { $('siteLat').value = site.lat.toFixed(6); $('siteLon').value = site.lon.toFixed(6); }
      buildingsCache = null;
      redrawSiteMapObjects(site);
      renderSiteList();
    });
    el.addEventListener('click', (e) => { e.stopPropagation(); selectSite(site.id); });
    redrawSiteMapObjects(site);
  }

  function redrawSiteMapObjects(site) {
    if (!map || !site.marker) return;
    site.marker.setLngLat([site.lon, site.lat]);
    if (site.tooltip) site.tooltip.setText(site.name);
    renderAllSectors();
  }

  // All site sector cones are kept in a single GeoJSON source (one feature
  // per site) so a drag/edit only needs one setData() call, not N layers.
  function renderAllSectors() {
    if (!map || !map.getSource('cakra-sectors')) return;
    const R_cap = Math.min(parseFloat($('radius') ? $('radius').value : 500) || 500, 1500) * 0.55;
    const features = sites.map(site => {
      const color = siteColor(site);
      const half = site.beamwidthH / 2, steps = 24;
      const proj = CakraPropagation.makeLocalProjection(site.lat, site.lon);
      const ring = [[site.lon, site.lat]];
      for (let i = 0; i <= steps; i++) {
        const az = site.azimuth - half + (2 * half) * (i / steps);
        const rad = CakraPropagation.toRad(az);
        const [la, lo] = proj.toLatLon(Math.sin(rad) * R_cap, Math.cos(rad) * R_cap);
        ring.push([lo, la]);
      }
      ring.push([site.lon, site.lat]);
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { color, active: site.id === activeSiteId },
      };
    });
    addOrUpdateSource('cakra-sectors', { type: 'FeatureCollection', features });
  }

  function highlightActiveMarker() {
    sites.forEach(s => {
      if (!s.markerEl) return;
      s.markerEl.style.outline = s.id === activeSiteId ? '2px solid #fff' : 'none';
      s.markerEl.style.borderRadius = '50%';
    });
    renderAllSectors();
  }

  function updateSectorPreview() {
    renderAllSectors();
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
    if (!sites.length) { showStatus(T('predict.addAtLeastOneSite'), true); return; }

    setRunning(true);
    showStatus(T('predict.preparingGrid'));

    try {
      let buildings = [];
      if (f.useBuildings) {
        showStatus(T('predict.fetchingBuildings'));
        try { buildings = await ensureBuildings(f.radiusM); }
        catch (e) {
          console.warn('Overpass gagal, lanjut tanpa data bangunan:', e);
          showStatus(T('predict.buildingsFetchFailed'), true);
          await sleep(1000);
        }
      }

      showStatus(T('predict.calculatingPrediction', { n: sites.length, b: buildings.length }));
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

      showStatus(T('predict.done', { n: countValid, sites: sites.length, b: buildings.length, off: f.useBuildings ? '' : T('predict.buildingsOff') }));
    } catch (err) {
      console.error(err);
      showStatus(T('predict.predictionFailed', { msg: err.message }), true);
    } finally {
      setRunning(false);
    }
  }

  function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }
  function setRunning(state){ const b = $('runPredictBtn'); if (b){ b.disabled = state; b.textContent = state ? T('predict.calculating') : T('predict.s3.run'); } }
  function showStatus(msg, isWarn){
    const el = $('predictStatus'); if (!el) return;
    el.textContent = msg; el.style.color = isWarn ? 'var(--amber,#fbbf24)' : 'var(--text2,#94aabf)';
  }

  let heatSourceId = 'cakra-prediction-heatmap';
  function renderHeatmap(res) {
    const { nx, ny, cell, proj, minX, minY, results } = res;
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
    // MapLibre ImageSource corners: top-left, top-right, bottom-right, bottom-left (lng,lat)
    const [swLat, swLon] = proj.toLatLon(minX, minY);
    const [neLat, neLon] = proj.toLatLon(minX + nx * cell, minY + ny * cell);
    const coords = [[swLon, neLat], [neLon, neLat], [neLon, swLat], [swLon, swLat]];
    const dataUrl = canvas.toDataURL();
    if (map.getSource(heatSourceId)) {
      map.getSource(heatSourceId).updateImage({ url: dataUrl, coordinates: coords });
    } else {
      map.addSource(heatSourceId, { type: 'image', url: dataUrl, coordinates: coords });
      map.addLayer({ id: 'cakra-prediction-heatmap-layer', type: 'raster', source: heatSourceId, paint: { 'raster-opacity': 1 } },
        map.getLayer('cakra-obstruction-fill') ? 'cakra-obstruction-fill' : undefined);
    }
  }

  function renderBuildings(buildingsXY, res) {
    if (!buildingsXY.length) { addOrUpdateSource('cakra-obstruction-buildings', emptyFC()); return; }
    const blockingIds = new Set();
    res.results.forEach(r => { if (r && r.buildingId != null) blockingIds.add(r.buildingId); });
    const features = buildingsXY.map(b => {
      const ring = b.xy.map(([x, y]) => { const [la, lo] = res.proj.toLatLon(x, y); return [lo, la]; });
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { blocking: blockingIds.has(b.id), heightM: b.heightM },
      };
    });
    addOrUpdateSource('cakra-obstruction-buildings', { type: 'FeatureCollection', features });
  }

  function renderStats(s) {
    const el = $('predictStatsPanel'); if (!el) return;
    el.style.display = 'grid';
    el.innerHTML = `
      ${statCard(T('predict.avgBestRsrp'), isNaN(s.avgRsrp) ? '—' : s.avgRsrp.toFixed(1) + ' dBm', s.avgRsrp >= -90 ? 'good' : (s.avgRsrp >= -100 ? 'warn' : 'bad'))}
      ${statCard(T('predict.coverageAboveThreshold'), s.coveragePct.toFixed(1) + '%', s.coveragePct >= 90 ? 'good' : (s.coveragePct >= 70 ? 'warn' : 'bad'))}
      ${statCard(T('predict.pctLosPoints'), s.losPct.toFixed(1) + '%')}
      ${statCard(T('predict.buildings'), s.buildingCount.toLocaleString())}
      ${statCard(T('predict.gridPoints'), s.gridPoints.toLocaleString())}
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
      b.textContent = T('predict.cancelDraw'); b.classList.add('secondary');
      f.disabled = false; hint.classList.add('show'); hint.textContent = T('predict.map.clickToAddPoint');
      $('clickToPlace').checked = false;
    } else {
      b.textContent = T('predict.s4.drawRoute'); b.classList.remove('secondary');
      f.disabled = routePts.length < 2; hint.classList.remove('show');
    }
  }

  function addRoutePoint(latlng) {
    routePts.push([latlng.lat, latlng.lng]);
    redrawRoute();
    updateRouteInfo();
    const sim = $('simRouteBtn'); if (sim) sim.disabled = routePts.length < 2;
    const hint = $('mapHint'); if (hint) hint.textContent = T('predict.pointAdded', { n: routePts.length });
  }

  function finishDraw() {
    if (routePts.length < 2) { alert(T('predict.needTwoPoints')); return; }
    drawMode = false;
    const b = $('drawRouteBtn'), f = $('finishRouteBtn'), hint = $('mapHint');
    b.textContent = T('predict.s4.drawRoute'); b.classList.remove('secondary');
    f.disabled = true; hint.classList.remove('show');
    updateRouteInfo();
  }

  function clearRoute() {
    routePts = [];
    addOrUpdateSource('cakra-route-line', { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
    addOrUpdateSource('cakra-route-draft-points', emptyFC());
    addOrUpdateSource('cakra-route-samples', emptyFC());
    clearHandoverMarkers();
    const sim = $('simRouteBtn'); if (sim) sim.disabled = true;
    const to5 = $('toStep5'); if (to5) to5.disabled = true;
    const wrap = $('routeStatsWrap'); if (wrap) wrap.style.display = 'none';
    const cc = $('chartCard'); if (cc) cc.style.display = 'none';
    updateRouteInfo();
  }

  function redrawRoute() {
    if (!map || !map.getSource('cakra-route-line')) return;
    const coords = routePts.map(([lat, lon]) => [lon, lat]);
    addOrUpdateSource('cakra-route-line', { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
    addOrUpdateSource('cakra-route-draft-points', {
      type: 'FeatureCollection',
      features: routePts.map(([lat, lon]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} })),
    });
  }

  function routeLengthM() {
    let L = 0;
    for (let i = 1; i < routePts.length; i++) L += CakraPropagation.haversineDist(routePts[i-1][0], routePts[i-1][1], routePts[i][0], routePts[i][1]);
    return L;
  }

  function updateRouteInfo() {
    const el = $('routeInfo'); if (!el) return;
    if (!routePts.length) { el.textContent = T('predict.s4.routeNotDrawn'); return; }
    const L = routeLengthM();
    el.textContent = T('predict.routeInfo', { n: routePts.length, m: L.toFixed(0) }) + (L > 1000 ? ` (${(L/1000).toFixed(2)} km)` : '');
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
    if (routePts.length < 2) { alert(T('predict.drawRouteFirst')); return; }
    if (activeSiteId) syncFormToActiveSite();
    if (!sites.length) { alert(T('predict.addAtLeastOneSiteShort')); return; }
    const f = readSharedForm();
    const simStatus = $('simStatus');
    if (simStatus) simStatus.textContent = T('predict.preparingSim');

    let buildings = [];
    if (f.useBuildings) {
      try { buildings = await ensureBuildings(f.radiusM); }
      catch (e) { if (simStatus) simStatus.textContent = T('predict.buildingsFetchFailedShort'); }
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
    if (simStatus) simStatus.textContent = T('predict.simDone', { n: samples.length, m: totalL.toFixed(0), min: (durationS/60).toFixed(1), ho: handovers.length });
    const wrap = $('routeStatsWrap'); if (wrap) wrap.style.display = 'block';
    const cc = $('chartCard'); if (cc) cc.style.display = 'block';
  }

  function renderRouteMarkers(samples) {
    const stride = Math.max(1, Math.floor(samples.length / 250));
    const features = [];
    samples.forEach((s, i) => {
      if (i % stride !== 0 && i !== samples.length - 1) return;
      const weak = s.rsrp < lastRoute.threshold;
      const site = siteById(s.siteId);
      const borderColor = site ? siteColor(site) : '#fff';
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          weak, dist: s.dist, rsrp: s.rsrp, siteName: site ? site.name : '?',
          fillColor: rgb(RSRP_COLOR(s.rsrp)), borderColor,
        },
      });
    });
    addOrUpdateSource('cakra-route-samples', { type: 'FeatureCollection', features });
    if (routePts.length) {
      const lons = routePts.map(p => p[1]), lats = routePts.map(p => p[0]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, duration: 600 });
    }
  }

  // Handover markers use real DOM elements (like sites) so we get a crisp
  // "⇄" glyph + hover tooltip without needing a symbol/glyph sprite.
  let handoverMarkers = [];
  function clearHandoverMarkers() {
    handoverMarkers.forEach(m => { m.marker.remove(); m.popup.remove(); });
    handoverMarkers = [];
  }
  function renderHandoverMarkers(handovers) {
    clearHandoverMarkers();
    handovers.forEach(h => {
      const fromSite = siteById(h.fromId), toSite = siteById(h.toId);
      const el = document.createElement('div');
      el.className = 'ho-marker-icon';
      el.innerHTML = `<div class="ho-marker ${h.pingPong ? 'pingpong' : ''}">⇄</div>`;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([h.lon, h.lat]).addTo(map);
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 }).setText(
        T('predict.handoverTooltip', { m: h.dist.toFixed(0), from: fromSite ? fromSite.name : '?', to: toSite ? toSite.name : '?' }) + (h.pingPong ? ' ⚠ ping-pong' : '')
      );
      el.addEventListener('mouseenter', () => popup.setLngLat([h.lon, h.lat]).addTo(map));
      el.addEventListener('mouseleave', () => popup.remove());
      handoverMarkers.push({ marker, popup });
    });
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
          x: { title: { display: true, text: T('predict.chart.distance'), color: '#8e8e97' }, ticks: { color: '#8e8e97', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { position: 'left', title: { display: true, text: 'RSRP', color: '#06b6d4' }, ticks: { color: '#8e8e97', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' }, suggestedMin: -125, suggestedMax: -50 },
          y2: { position: 'right', title: { display: true, text: 'RSRQ / SINR', color: '#a78bfa' }, ticks: { color: '#8e8e97', font: { size: 9 } }, grid: { drawOnChartArea: false }, suggestedMin: -25, suggestedMax: 40 },
        },
        plugins: {
          legend: { labels: { color: '#ececee', font: { size: 10, family: 'IBM Plex Mono' } } },
          tooltip: { callbacks: { title: items => T('predict.chart.distanceTooltip', { km: (items[0].parsed.x).toFixed(3) }) } },
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
      ${statCard(T('predict.routeDistance'), totalL > 1000 ? (totalL/1000).toFixed(2)+' km' : totalL.toFixed(0)+' m')}
      ${statCard(T('predict.duration'), (durationS/60).toFixed(1)+' '+T('predict.minAbbrev'))}
      ${statCard(T('predict.avgRsrp'), isNaN(avg) ? '—' : avg.toFixed(1)+' dBm', avg >= -90 ? 'good' : (avg >= -100 ? 'warn' : 'bad'))}
      ${statCard(T('predict.routeCoverage'), cov.toFixed(1)+'%', cov >= 90 ? 'good' : (cov >= 70 ? 'warn' : 'bad'))}
      ${statCard(T('predict.handover'), handovers.length.toString(), handovers.length ? 'warn' : 'good')}
      ${statCard(T('predict.pingPong'), pingPongCount.toString(), pingPongCount ? 'bad' : 'good')}
      ${statCard(T('predict.weakPoints'), weakSegs.length.toString(), weakSegs.length ? 'bad' : 'good')}
      ${statCard(T('predict.samples'), valid.toLocaleString())}
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
          <span class="badge" style="background:var(--red-dim);color:var(--red)">${T('predict.weakBadge')}</span>
          <span class="rd">${w.start.toFixed(0)}–${w.end.toFixed(0)} m · ${len.toFixed(0)} m</span>
          <span class="rv">min ${w.min.toFixed(0)} dBm</span>
        </div>`);
      });
      wl.innerHTML = parts.length ? parts.join('') : `<div style="font-size:11px;color:var(--text2)">${T('predict.noWeakOrHandover')}</div>`;
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
      wrap.innerHTML = `<div class="info-note">${T('predict.runFirst')}</div>`;
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
    wrap.innerHTML = `<div class="report-box">${T('predict.report.scenarioTitle')}
${T('predict.report.name')}       : ${f.name || T('predict.report.noName')}
${T('predict.report.operator')}   : ${f.op || '-'}
${T('predict.report.siteCount')}: ${sites.length}
${siteLines}

${T('predict.report.route')}
${T('predict.report.distance')}      : ${(lastRoute.totalL/1000).toFixed(2)} km
${T('predict.report.speed')}  : ${lastRoute.speedKmh} km/jam
${T('predict.report.duration')}     : ${(lastRoute.durationS/60).toFixed(1)} ${T('predict.minAbbrev')}

${T('predict.report.predictionResult')}
${T('predict.report.avgRsrp')}   : ${avg.toFixed(1)} dBm
${T('predict.report.avgSinr')}   : ${avgSinr.toFixed(1)} dB
${T('predict.report.coverage')}   : ${cov.toFixed(1)} % (≥ ${lastRoute.threshold} dBm)
${T('predict.report.handover')}   : ${lastRoute.handovers.length} ${T('predict.report.times')} (${pingPongCount} ping-pong)
${T('predict.report.weakPoints')}: ${samples.filter(s=>s.rsrp<lastRoute.threshold).length} ${T('predict.report.samples')}

${T('predict.report.mobilityParams')}
${T('predict.report.hysteresis')}      : ${lastRoute.hoParams.hysteresisDb} dB
A3-Offset       : ${lastRoute.hoParams.a3OffsetDb} dB
Time-to-Trigger : ${lastRoute.hoParams.ttTms} ms
Filter Coeff. k : ${lastRoute.hoParams.filterK}</div>`;

    const real = getRealDataPoints();
    const vp = $('validationPanel');
    if (!real.length) {
      vp.className = 'info-note';
      vp.innerHTML = T('predict.s5.noRealData') + ' <a href="/" data-route style="color:var(--cyan)">' + T('predict.s5.mainPage') + '</a> ' + T('predict.s5.toCompare');
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
      vp.innerHTML = `${T('predict.noRealDataInRadius')}`;
      return;
    }
    const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length;
    const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length);
    const bias = errs.reduce((a, b) => a + b, 0) / errs.length;
    vp.className = 'card';
    vp.style.padding = '14px';
    vp.innerHTML = `<div class="stats-grid">
      ${statCard(T('predict.matchedPoints'), errs.length.toLocaleString())}
      ${statCard('MAE', mae.toFixed(2)+' dB', mae < 6 ? 'good' : (mae < 10 ? 'warn' : 'bad'))}
      ${statCard('RMSE', rmse.toFixed(2)+' dB', rmse < 6 ? 'good' : (rmse < 10 ? 'warn' : 'bad'))}
      ${statCard(T('predict.biasLabel'), (bias>=0?'+':'')+bias.toFixed(2)+' dB', Math.abs(bias)<5?'good':'warn')}
    </div>
    <div style="font-size:10.5px;color:var(--text2);margin-top:10px">${T('predict.biasExplain')}</div>`;
    lastRoute.validation = { mae, rmse, bias, matched: errs.length };
  }

  // ─────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────
  function exportCSV() {
    if (!lastRoute) { alert(T('predict.runSimFirst')); return; }
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
    const es = $('exportStatus'); if (es) es.textContent = T('predict.csvDownloaded');
  }

  function exportPNG() {
    if (!routeChartObj) { alert(T('predict.runSimFirst')); return; }
    const url = routeChartObj.toBase64Image();
    const a = document.createElement('a');
    a.href = url; a.download = 'cakra_virtual_drive_chart.png'; a.click();
    const es = $('exportStatus'); if (es) es.textContent = T('predict.chartDownloaded');
  }

  function openInDashboard() {
    if (!lastRoute) { alert(T('predict.runSimFirst')); return; }
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
      alert(T('predict.dataTooBig'));
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
    map.panTo([lon, lat]);
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
        if (s) { s.lat = +m[1]; s.lon = +m[2]; $('siteLat').value = m[1]; $('siteLon').value = m[2]; map.panTo([+m[2], +m[1]]); redrawSiteMapObjects(s); buildingsCache = null; }
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
      map.panTo([s.lon, s.lat]); redrawSiteMapObjects(s); buildingsCache = null;
    });
    $('siteLon') && $('siteLon').addEventListener('change', () => {
      const s = siteById(activeSiteId); if (!s) return;
      s.lat = parseFloat($('siteLat').value); s.lon = parseFloat($('siteLon').value);
      map.panTo([s.lon, s.lat]); redrawSiteMapObjects(s); buildingsCache = null;
    });

    $('runPredictBtn') && $('runPredictBtn').addEventListener('click', runPrediction);

    goto(1);
  }

  function statCard(label, value, cls) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls || ''}">${value}</div></div>`;
  }

  // Data mentah snapshot skenario saat ini (sites, hasil prediksi, rute).
  // Sudah tidak dipakai oleh modul viewer 3D terpisah (map3d.js) karena peta
  // utama sekarang sudah native 3D — disimpan sebagai API publik yang mungkin
  // berguna utk fitur lain (mis. export/debug) di masa depan.
  function getSceneData() {
    return { sites, lastResult, lastRoute, routePts: routePts.slice() };
  }

  function refreshDynamicUI() {
    renderSiteList();
    if (lastResult) {
      const stats = {
        avgRsrp: lastResult.results.filter(Boolean).reduce((a,r)=>a+r.rsrp,0) / (lastResult.results.filter(Boolean).length||1),
        losPct: (lastResult.results.filter(r=>r&&r.los).length / (lastResult.results.filter(Boolean).length||1)) * 100,
        coveragePct: (lastResult.results.filter(r=>r&&r.rsrp>=lastResult.form.thresholdDbm).length / (lastResult.results.filter(Boolean).length||1)) * 100,
        buildingCount: lastResult.buildings.length,
        gridPoints: lastResult.results.filter(Boolean).length,
      };
      renderStats(stats);
    }
    if (lastRoute) {
      renderRouteStats(lastRoute.samples, lastRoute.totalL, lastRoute.durationS, lastRoute.threshold, lastRoute.handovers);
      renderRouteChart(lastRoute.samples, lastRoute.threshold);
    }
    if (currentStep === 5) buildReport();
    updateRouteInfo();
  }

  return {
    init, goto, useRealCentroid, runPrediction, toggleDraw, finishDraw, clearRoute, simulateRoute,
    exportCSV, exportPNG, openInDashboard, addSite, removeSite, selectSite, getSceneData, refreshDynamicUI,
    setMapView,
  };
})();

// Re-render dynamic panels when language is switched, so already-generated
// content (site list, stats, report, chart labels) updates without re-running
// the simulation.
window.CakraRebuildDynamic = function() {
  if (window.CakraVDT && typeof CakraVDT.refreshDynamicUI === 'function') CakraVDT.refreshDynamicUI();
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('predictMap')) CakraVDT.init();
});
