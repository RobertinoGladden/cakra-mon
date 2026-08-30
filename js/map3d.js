// map3d.js — Visualisasi 3D peta real-life (MapLibre GL JS + OpenFreeMap) — Cakra v2.2
// Tidak butuh API key sama sekali (berbeda dari Mapbox/MapTiler/Cesium ion), dan
// mendukung 3D building extrusion NATIVE dari vector tile OpenStreetMap-nya sendiri
// (properti render_height/render_min_height sudah ada per-bangunan di style
// `liberty`/`bright` OpenFreeMap) — jadi tinggi bangunan asli lapangan langsung
// tervisualisasi tanpa perlu query builder manual.
//
// Modul ini terpisah dari buildings.js (Overpass API) yang dipakai predict.js
// untuk PERHITUNGAN obstruksi LOS/NLOS — keduanya sumbernya sama-sama data OSM,
// tapi Overpass tetap dipakai utk fisika (query around: radius kecil, presisi
// footprint per-bangunan utk knife-edge diffraction), sedangkan OpenFreeMap di
// modul ini khusus utk VISUALISASI kontekstual "beneran di lapangan seperti apa"
// (skyline kota, ketinggian relatif antena vs gedung sekitar, dsb).
//
// © 2026 — dikembangkan sebagai ekstensi Cakra Drive Test Intelligence.

'use strict';

window.CakraMap3D = (() => {
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  let map = null;
  let modalEl = null;
  let cssInjected = false;
  let libLoadPromise = null;
  let lastCenter = null;
  let lastPitchBearing = { pitch: 60, bearing: -20 };

  const RSRP_STOPS = [
    -140, '#f87171', -110, '#f87171', -110, '#fb923c', -100, '#fb923c',
    -100, '#facc15', -90, '#facc15', -90, '#4ade80', -80, '#4ade80', -80, '#38bdf8', -40, '#38bdf8',
  ];
  // Ekspresi interpolate step utk circle-color/fill-color berbasis RSRP (dBm)
  function rsrpColorExpr(prop) {
    return [
      'step', ['get', prop],
      '#f87171',
      -110, '#fb923c',
      -100, '#facc15',
      -90, '#4ade80',
      -80, '#38bdf8',
    ];
  }

  function injectCss() {
    if (cssInjected) return;
    cssInjected = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `
      #cakra3dModal{position:fixed;inset:0;z-index:5000;display:none;font-family:'IBM Plex Mono',monospace}
      #cakra3dModal.open{display:block}
      #cakra3dModal .c3d-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.72)}
      #cakra3dModal .c3d-panel{position:absolute;inset:16px;background:#0a0a0b;border:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;overflow:hidden}
      #cakra3dModal .c3d-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.1);flex-wrap:wrap}
      #cakra3dModal .c3d-title{font-size:11px;letter-spacing:.02em;color:#8e8e97}
      #cakra3dModal .c3d-actions{display:flex;gap:8px;flex-wrap:wrap}
      #cakra3dModal .c3d-btn{background:#18181b;border:1px solid rgba(255,255,255,0.15);color:#ececee;font-family:inherit;font-size:11px;padding:6px 10px;cursor:pointer;white-space:nowrap}
      #cakra3dModal .c3d-btn:hover{border-color:#06b6d4;color:#06b6d4}
      #cakra3dModal .c3d-mapcanvas{flex:1;position:relative;background:#111}
      #cakra3dModal .c3d-legend{position:absolute;bottom:20px;left:14px;background:rgba(10,10,11,0.85);border:1px solid rgba(255,255,255,0.12);padding:8px 10px;font-size:10px;color:#cbd5e1;line-height:1.7;pointer-events:none;max-width:230px}
      #cakra3dModal .c3d-swatch{display:inline-block;width:9px;height:9px;margin-right:6px;vertical-align:middle}
      #cakra3dModal .c3d-note{position:absolute;top:10px;left:14px;right:14px;font-size:9.5px;color:#8e8e97;pointer-events:none;max-width:520px}
      #cakra3dModal .c3d-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8e8e97;font-size:11px}
    `;
    document.head.appendChild(style);
  }

  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (libLoadPromise) return libLoadPromise;
    libLoadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Gagal memuat MapLibre GL JS (periksa koneksi internet)'));
      document.head.appendChild(s);
    });
    return libLoadPromise;
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    injectCss();
    modalEl = document.createElement('div');
    modalEl.id = 'cakra3dModal';
    modalEl.innerHTML = `
      <div class="c3d-backdrop"></div>
      <div class="c3d-panel">
        <div class="c3d-topbar">
          <span class="c3d-title">🧊 PETA 3D — bangunan &amp; ketinggian real (OpenFreeMap · tanpa API key)</span>
          <div class="c3d-actions">
            <button class="c3d-btn" data-act="reset">↺ Reset View</button>
            <button class="c3d-btn" data-act="top">⬒ Top-down</button>
            <button class="c3d-btn" data-act="close">✕ Tutup</button>
          </div>
        </div>
        <div class="c3d-mapcanvas">
          <div id="c3dMap" style="position:absolute;inset:0"></div>
          <div class="c3d-loading" id="c3dLoading">Memuat peta 3D…</div>
          <div class="c3d-note">Data peta &amp; bangunan: © OpenStreetMap contributors, tile: OpenFreeMap. Tinggi bangunan dari data OSM asli (bukan model prediksi) — dipakai sbg konteks visual, bukan input perhitungan (perhitungan obstruksi tetap pakai data Overpass di step Coverage).</div>
          <div class="c3d-legend" id="c3dLegend"></div>
        </div>
      </div>`;
    document.body.appendChild(modalEl);
    modalEl.querySelector('[data-act="close"]').addEventListener('click', close);
    modalEl.querySelector('[data-act="reset"]').addEventListener('click', resetView);
    modalEl.querySelector('[data-act="top"]').addEventListener('click', () => {
      if (map) map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    });
    modalEl.querySelector('.c3d-backdrop').addEventListener('click', close);
    return modalEl;
  }

  function close() {
    if (modalEl) modalEl.classList.remove('open');
  }

  function resetView() {
    if (!map || !lastCenter) return;
    map.easeTo({ center: lastCenter, zoom: 16.2, pitch: lastPitchBearing.pitch, bearing: lastPitchBearing.bearing, duration: 700 });
  }

  // ── Geometri bantu (equirectangular lokal, akurat utk skala <5km — sama
  // dgn pendekatan CakraPropagation.makeLocalProjection, dipakai independen di
  // sini karena hasilnya berupa lon/lat [x,y] utk GeoJSON, bukan XY meter) ──
  const R_EARTH = 6371000;
  function destPoint(lat, lon, dNorthM, dEastM) {
    const dLat = (dNorthM / R_EARTH) * (180 / Math.PI);
    const dLon = (dEastM / (R_EARTH * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);
    return [lon + dLon, lat + dLat]; // [lng, lat] GeoJSON order
  }

  function squareRing(lat, lon, halfSizeM) {
    return [
      destPoint(lat, lon, -halfSizeM, -halfSizeM),
      destPoint(lat, lon, -halfSizeM,  halfSizeM),
      destPoint(lat, lon,  halfSizeM,  halfSizeM),
      destPoint(lat, lon,  halfSizeM, -halfSizeM),
      destPoint(lat, lon, -halfSizeM, -halfSizeM),
    ];
  }

  // Wedge sektor (fan) mengikuti azimuth ± beamwidthH/2 — representasi arah hadap
  // antena, diekstrusi tipis (~4m) agar terlihat sbg "jejak" di atas permukaan 3D.
  function sectorRing(lat, lon, azimuthDeg, beamwidthDeg, radiusM, segs) {
    const pts = [destPoint(lat, lon, 0, 0)];
    const half = beamwidthDeg / 2;
    for (let i = 0; i <= segs; i++) {
      const az = azimuthDeg - half + (beamwidthDeg * i / segs);
      const rad = az * Math.PI / 180;
      const dNorth = radiusM * Math.cos(rad);
      const dEast = radiusM * Math.sin(rad);
      pts.push(destPoint(lat, lon, dNorth, dEast));
    }
    pts.push(destPoint(lat, lon, 0, 0));
    return pts;
  }

  function buildLegend() {
    const rows = [
      ['#38bdf8', '&gt; -80 dBm (sangat baik)'],
      ['#4ade80', '-80 s/d -90 dBm'],
      ['#facc15', '-90 s/d -100 dBm'],
      ['#fb923c', '-100 s/d -110 dBm'],
      ['#f87171', '&lt; -110 dBm (buruk)'],
    ];
    return `<b>PREDIKSI RSRP</b><br>` + rows.map(([c, l]) => `<span class="c3d-swatch" style="background:${c}"></span>${l}`).join('<br>') +
      `<br><br><span class="c3d-swatch" style="background:#a78bfa"></span>Site (tinggi = antena AGL sebenarnya)<br>` +
      `<span class="c3d-swatch" style="background:#f472b6"></span>Titik handover / ping-pong`;
  }

  // ── Bangun & pasang seluruh layer dari data scene (sites, lastResult, lastRoute) ──
  function populate(scene) {
    const { sites, lastResult, lastRoute, routePts } = scene;
    if (!sites || !sites.length) return;

    const centLat = sites.reduce((a, s) => a + s.lat, 0) / sites.length;
    const centLon = sites.reduce((a, s) => a + s.lon, 0) / sites.length;
    lastCenter = [centLon, centLat];

    // 1) Grid coverage (Step 3) — square georeferenced persis ukuran cell,
    //    diwarnai berdasar RSRP prediksi. Ini yang membuat overlay "menempel"
    //    akurat ke peta 3D, bukan sekadar titik bulat perkiraan.
    if (lastResult && lastResult.results && lastResult.results.length) {
      const { results, proj, cell } = lastResult;
      const half = cell / 2;
      const features = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i]; if (!r) continue;
        const p = lastResult.points[i]; if (!p) continue;
        const [lat, lon] = proj.toLatLon(p.x, p.y);
        features.push({
          type: 'Feature',
          properties: { rsrp: r.rsrp },
          geometry: { type: 'Polygon', coordinates: [squareRing(lat, lon, half)] },
        });
      }
      addOrUpdateSource('cakra-coverage', { type: 'FeatureCollection', features });
      if (!map.getLayer('cakra-coverage-fill')) {
        map.addLayer({
          id: 'cakra-coverage-fill', type: 'fill', source: 'cakra-coverage',
          paint: { 'fill-color': rsrpColorExpr('rsrp'), 'fill-opacity': 0.45 },
        });
      }
    }

    // 2) Bangunan yang benar-benar dipakai model sbg data obstruksi (Overpass),
    //    diekstrusi setinggi nilai heightM yang dipakai dalam perhitungan —
    //    ditumpuk transparan di atas bangunan asli OpenFreeMap sbg pembanding.
    if (lastResult && lastResult.buildings && lastResult.buildings.length) {
      const features = lastResult.buildings.map(b => ({
        type: 'Feature',
        properties: { heightM: b.heightM },
        geometry: { type: 'Polygon', coordinates: [b.footprint.map(([blat, blon]) => [blon, blat])] },
      }));
      addOrUpdateSource('cakra-model-buildings', { type: 'FeatureCollection', features });
      if (!map.getLayer('cakra-model-buildings-fill')) {
        map.addLayer({
          id: 'cakra-model-buildings-fill', type: 'fill-extrusion', source: 'cakra-model-buildings',
          paint: {
            'fill-extrusion-color': '#f59e0b',
            'fill-extrusion-height': ['get', 'heightM'],
            'fill-extrusion-opacity': 0.35,
          },
        });
      }
    }

    // 3) Site — "tiang" diekstrusi setinggi antena AGL sebenarnya + wedge sektor
    const SITE_COLORS = ['#38bdf8', '#a78bfa', '#fb923c', '#4ade80', '#f472b6', '#facc15'];
    const poleFeatures = [];
    const sectorFeatures = [];
    sites.forEach((s, i) => {
      const color = SITE_COLORS[i % SITE_COLORS.length];
      poleFeatures.push({
        type: 'Feature',
        properties: { name: s.name, color, hb: s.hb },
        geometry: { type: 'Polygon', coordinates: [squareRing(s.lat, s.lon, 2.5)] },
      });
      sectorFeatures.push({
        type: 'Feature',
        properties: { color },
        geometry: { type: 'Polygon', coordinates: [sectorRing(s.lat, s.lon, s.azimuth, s.beamwidthH || 65, Math.min(120, Math.max(40, (s.hb || 30) * 2)), 16)] },
      });
    });
    addOrUpdateSource('cakra-site-poles', { type: 'FeatureCollection', features: poleFeatures });
    if (!map.getLayer('cakra-site-poles-fill')) {
      map.addLayer({
        id: 'cakra-site-poles-fill', type: 'fill-extrusion', source: 'cakra-site-poles',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'hb'],
          'fill-extrusion-opacity': 0.95,
        },
      });
    }
    addOrUpdateSource('cakra-site-sectors', { type: 'FeatureCollection', features: sectorFeatures });
    if (!map.getLayer('cakra-site-sectors-fill')) {
      map.addLayer({
        id: 'cakra-site-sectors-fill', type: 'fill-extrusion', source: 'cakra-site-sectors',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': 4,
          'fill-extrusion-opacity': 0.22,
        },
      });
    }

    // 4) Rute virtual drive + titik handover (Step 4), jika sudah disimulasikan
    if (routePts && routePts.length >= 2) {
      addOrUpdateSource('cakra-route-line', {
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: routePts.map(([lat, lon]) => [lon, lat]) },
      });
      if (!map.getLayer('cakra-route-line-layer')) {
        map.addLayer({
          id: 'cakra-route-line-layer', type: 'line', source: 'cakra-route-line',
          paint: { 'line-color': '#ececee', 'line-width': 2.5, 'line-opacity': 0.85 },
        });
      }
    }
    if (lastRoute && lastRoute.samples && lastRoute.samples.length) {
      const features = lastRoute.samples.map(s => ({
        type: 'Feature',
        properties: { rsrp: s.rsrp },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      }));
      addOrUpdateSource('cakra-route-samples', { type: 'FeatureCollection', features });
      if (!map.getLayer('cakra-route-samples-pt')) {
        map.addLayer({
          id: 'cakra-route-samples-pt', type: 'circle', source: 'cakra-route-samples',
          paint: {
            'circle-radius': 3, 'circle-color': rsrpColorExpr('rsrp'),
            'circle-stroke-width': 1, 'circle-stroke-color': '#0a0a0b',
          },
        });
      }
    }
    if (lastRoute && lastRoute.handovers && lastRoute.handovers.length) {
      const features = lastRoute.handovers.map(h => ({
        type: 'Feature',
        properties: { pingPong: !!h.pingPong },
        geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
      }));
      addOrUpdateSource('cakra-handovers', { type: 'FeatureCollection', features });
      if (!map.getLayer('cakra-handovers-pt')) {
        map.addLayer({
          id: 'cakra-handovers-pt', type: 'circle', source: 'cakra-handovers',
          paint: {
            'circle-radius': 6,
            'circle-color': ['case', ['get', 'pingPong'], '#ef4444', '#f472b6'],
            'circle-stroke-width': 2, 'circle-stroke-color': '#0a0a0b',
          },
        });
      }
    }

    modalEl.querySelector('#c3dLegend').innerHTML = buildLegend();
  }

  function addOrUpdateSource(id, data) {
    if (map.getSource(id)) { map.getSource(id).setData(data); return; }
    map.addSource(id, { type: 'geojson', data });
  }

  async function open(scene) {
    ensureModal();
    modalEl.classList.add('open');
    const loadingEl = modalEl.querySelector('#c3dLoading');
    loadingEl.style.display = 'flex';
    loadingEl.textContent = 'Memuat MapLibre GL JS…';

    try {
      await loadMapLibre();
    } catch (e) {
      loadingEl.textContent = 'Gagal memuat peta 3D — periksa koneksi internet ke unpkg.com/tiles.openfreemap.org.';
      return;
    }

    if (!scene || !scene.sites || !scene.sites.length) {
      loadingEl.textContent = 'Tambahkan minimal 1 site (Step 1) sebelum membuka peta 3D.';
      return;
    }

    const centLat = scene.sites.reduce((a, s) => a + s.lat, 0) / scene.sites.length;
    const centLon = scene.sites.reduce((a, s) => a + s.lon, 0) / scene.sites.length;

    if (!map) {
      loadingEl.textContent = 'Memuat tile OpenFreeMap…';
      map = new maplibregl.Map({
        container: 'c3dMap',
        style: STYLE_URL,
        center: [centLon, centLat],
        zoom: 16.2,
        pitch: lastPitchBearing.pitch,
        bearing: lastPitchBearing.bearing,
        antialias: true,
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }));

      map.on('load', () => {
        loadingEl.style.display = 'none';
        populate(scene);
        resetView();
      });
      map.on('error', (e) => {
        console.warn('MapLibre error:', e && e.error);
      });
    } else {
      if (map.isStyleLoaded()) {
        loadingEl.style.display = 'none';
        map.setCenter([centLon, centLat]);
        populate(scene);
        resetView();
      } else {
        map.once('load', () => { loadingEl.style.display = 'none'; populate(scene); resetView(); });
      }
    }

    // Perbaiki ukuran canvas krn modal baru saja ditampilkan (display:none → block)
    setTimeout(() => { if (map) map.resize(); }, 60);
  }

  return { open, close };
})();
