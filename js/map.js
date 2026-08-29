// map.js — Leaflet map, signal layers & event overlays — Cakra v2.0.1
// © 2026 Robertino Gladden Narendra. Hak cipta dilindungi.

'use strict';

window.CakraMap = (() => {
  let map = null;
  let layers = {};
  let tileLayer = null;

  let _thinned = [];
  let _flags = { gap: new Set(), churn: new Set(), throughputTier: new Map() };
  let _flagOpts = { gapThreshold: -100, windowSize: 10 };

  const TILES = {
    dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  };

  const COLOR = {
    rsrp: v => v > -80 ? '#38bdf8' : v > -90 ? '#4ade80' : v > -100 ? '#facc15' : v > -110 ? '#fb923c' : '#f87171',
    rsrq: v => v > -9  ? '#38bdf8' : v > -10 ? '#60a5fa' : v > -15  ? '#4ade80' : v > -19  ? '#fb923c' : '#f87171',
    snr:  v => v > 20  ? '#38bdf8' : v > 10  ? '#4ade80' : v > 0    ? '#facc15' : v > -10  ? '#fb923c' : '#f87171',
    nr_rsrp: v => v > -80 ? '#22c55e' : v > -90 ? '#4ade80' : v > -100 ? '#facc15' : v > -110 ? '#fb923c' : '#f87171',
    nr_sinr: v => v > 20  ? '#22c55e' : v > 13  ? '#4ade80' : v > 0   ? '#facc15' : v > -5   ? '#fb923c' : '#f87171',
  };

  function opts(color) {
    return { radius: 5, fillColor: color, color: 'transparent', fillOpacity: 0.82, weight: 0 };
  }

  function getCurrentTileUrl() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'light' ? TILES.light : TILES.dark;
  }

  function updateTheme(isDark) {
    if (!map) return;
    const url = isDark ? TILES.dark : TILES.light;
    if (tileLayer) {
      tileLayer.setUrl(url);
    } else {
      tileLayer = L.tileLayer(url, { maxZoom: 19, subdomains: 'abcd' }).addTo(map);
    }
  }

  function makePopupHtml(d) {
    return `
      <div style="font-family:monospace;font-size:11px;color:var(--popup-text,#cbd5e1);line-height:1.7">
        <b style="color:#38bdf8">${d.timePart || ''}</b><br>
        RSRP <b style="color:${COLOR.rsrp(d.rsrp)}">${d.rsrp} dBm</b><br>
        RSRQ <b style="color:${COLOR.rsrq(d.rsrq)}">${d.rsrq} dB</b><br>
        SNR <b style="color:${COLOR.snr(d.snr)}">${d.snr} dB</b><br>
        ${d.nr_rsrp !== null ? `NR-RSRP <b style="color:${COLOR.nr_rsrp(d.nr_rsrp)}">${d.nr_rsrp} dBm</b><br>` : ''}
        ${d.nr_sinr !== null ? `SS-SINR <b style="color:${COLOR.nr_sinr(d.nr_sinr)}">${d.nr_sinr} dB</b><br>` : ''}
        <span style="color:var(--popup-label,#4a6682)">${d.cellname || '—'} · ${d.tech || '4G'}</span>
      </div>`;
  }

  function build(DATA) {
    if (map) { map.remove(); map = null; tileLayer = null; }

    const gps = DATA.filter(d => d.lat && d.lon);
    if (!gps.length) return;

    const center = [
      gps.reduce((s,d) => s + d.lat, 0) / gps.length,
      gps.reduce((s,d) => s + d.lon, 0) / gps.length
    ];

    map = L.map('map', { zoomControl: true, attributionControl: false }).setView(center, 14);

    tileLayer = L.tileLayer(getCurrentTileUrl(), {
      maxZoom: 19, subdomains: 'abcd'
    }).addTo(map);

    if (!map.getPane('analysisRings')) {
      map.createPane('analysisRings');
      map.getPane('analysisRings').style.zIndex = 460;
      map.getPane('analysisRings').style.pointerEvents = 'none';
    }

    const hasNrRsrp = DATA.some(d => d.nr_rsrp !== null && !isNaN(d.nr_rsrp));
    const hasNrSinr = DATA.some(d => d.nr_sinr !== null && !isNaN(d.nr_sinr));

    layers = {
      rsrp: L.layerGroup(), rsrq: L.layerGroup(), snr: L.layerGroup(),
      rawan: L.layerGroup(), nr_rsrp: L.layerGroup(), nr_sinr: L.layerGroup(),
      handover: L.layerGroup(), reselect: L.layerGroup(),
      // Ring overlay layers — non-exclusive, toggleable on top of any signal layer
      gapRing: L.layerGroup(), churnRing: L.layerGroup(), throughputRing: L.layerGroup(),
    };

    const thin = CakraParser.thin(gps, 1200);
    _thinned = thin;
    thin.forEach(d => {
      const popupHtml = makePopupHtml(d);
      L.circleMarker([d.lat, d.lon], opts(COLOR.rsrp(d.rsrp))).bindPopup(popupHtml, {maxWidth:230}).addTo(layers.rsrp);
      L.circleMarker([d.lat, d.lon], opts(COLOR.rsrq(d.rsrq))).bindPopup(popupHtml, {maxWidth:230}).addTo(layers.rsrq);
      L.circleMarker([d.lat, d.lon], opts(COLOR.snr(d.snr))).bindPopup(popupHtml, {maxWidth:230}).addTo(layers.snr);

      if (d.rsrp < -100 || d.rsrq < -19 || d.snr < -10) {
        L.circleMarker([d.lat, d.lon], { radius: 6, fillColor: '#f87171', color: '#ef4444', fillOpacity: 0.9, weight: 1 })
          .bindPopup(`<div style="font-family:monospace;font-size:11px;color:#f87171">
            <span style="display:inline-flex;align-items:center;gap:3px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> TITIK RAWAN</span><br>${d.timePart||''}<br>RSRP: ${d.rsrp} | RSRQ: ${d.rsrq} | SNR: ${d.snr}
          </div>`, {maxWidth:220}).addTo(layers.rawan);
      }
      if (hasNrRsrp && d.nr_rsrp !== null && !isNaN(d.nr_rsrp))
        L.circleMarker([d.lat, d.lon], opts(COLOR.nr_rsrp(d.nr_rsrp))).bindPopup(popupHtml, {maxWidth:230}).addTo(layers.nr_rsrp);
      if (hasNrSinr && d.nr_sinr !== null && !isNaN(d.nr_sinr))
        L.circleMarker([d.lat, d.lon], opts(COLOR.nr_sinr(d.nr_sinr))).bindPopup(popupHtml, {maxWidth:230}).addTo(layers.nr_sinr);
    });

    layers.rsrp.addTo(map);

    computeAnalysisFlags(_flagOpts);
    buildRingOverlays();

    document.querySelectorAll('.map-btn[data-layer^="nr"]').forEach(btn => {
      btn.style.display = hasNrRsrp || hasNrSinr ? 'inline-flex' : 'none';
    });
  }

  function addEvents(events) {
    if (!map) return;
    layers.handover.clearLayers();
    layers.reselect.clearLayers();

    events.forEach(ev => {
      const isHO     = ev.typeCategory === 'HANDOVER' || ev.type?.includes('HANDOVER') || ev.type === 'HANDOVER';
      const isNr     = ev.isNr;
      const layerKey = isHO ? 'handover' : 'reselect';
      const color    = isHO ? (isNr ? '#22c55e' : '#facc15') : (isNr ? '#a78bfa' : '#c084fc');
      const icon     = L.divIcon({
        html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 12px ${color}cc;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#000">${isHO ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.67"/></svg>'}</div>`,
        className: '', iconSize: [24,24], iconAnchor: [12,12]
      });

      L.marker([ev.lat, ev.lon], { icon }).bindPopup(`
        <div style="font-family:monospace;font-size:11px;color:var(--popup-text,#cbd5e1);line-height:1.8">
          <b style="color:${color};font-size:12px">${ev.type || (isHO ? 'HANDOVER' : 'RESELECTION')}${isNr ? ' (NR)' : ''}</b><br>
          <span style="color:#a78bfa;font-size:10px">${isHO ? '<span style="display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg> Handover</span>' : '<span style="display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.67"/></svg> Cell Reselection</span>'}</span><br>
          <span style="color:var(--popup-label,#cbd5e1);font-size:10px">${ev.timeDisp || ev.time}</span><br>
          From: <b>${ev.fromCell}</b><br>
          To: <b>${ev.toCell}</b><br>
          RSRP: ${ev.rsrp} | RSRQ: ${ev.rsrq}<br>
          ${ev.nr_rsrp ? `NR-RSRP: ${ev.nr_rsrp}<br>` : ''}
          eNB/gNB: ${ev.enb||'—'}
        </div>`, { maxWidth: 280 }).addTo(layers[layerKey]);
    });
  }

  function switchLayer(type) {
    if (!map) return;
    ['rsrp','rsrq','snr','rawan','nr_rsrp','nr_sinr'].forEach(k => {
      if (layers[k] && map.hasLayer(layers[k])) map.removeLayer(layers[k]);
    });
    if (layers[type]) layers[type].addTo(map);
    document.querySelectorAll('#mapLayerBtns .map-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.layer === type);
    });
  }

  function toggleEventLayer(type) {
    if (!map) return;
    const layerKey = type === 'handover' ? 'handover' : 'reselect';
    const btn = document.querySelector(`.map-evt-btn[data-evt="${type}"]`);
    const layer = layers[layerKey];
    if (!layer) return;
    if (map.hasLayer(layer)) { map.removeLayer(layer); btn?.classList.remove('active'); }
    else { layer.addTo(map); btn?.classList.add('active'); }
  }

  let annotationLayer = null;
  let annotationMode = false;
  const STORAGE_KEY = 'cakra_map_annotations';

  function initAnnotationLayer() {
    if (!annotationLayer && map) {
      annotationLayer = L.layerGroup().addTo(map);
      loadAnnotations();
    }
  }

  function toggleAnnotationMode() {
    if (!map) return;
    annotationMode = !annotationMode;
    const btn = document.getElementById('mapAnnotateBtn');
    if (btn) btn.classList.toggle('active', annotationMode);
    if (annotationMode) map.on('click', addAnnotation);
    else map.off('click', addAnnotation);
  }

  function addAnnotation(e) {
    const note = prompt('Masukkan catatan untuk marker ini:');
    if (!note) return;

    L.marker(e.latlng, {
      icon: L.divIcon({
        html: `<div style="width:20px;height:20px;background:#06b6d4;border-radius:50%;border:2px solid #22d3ee;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600">◈</div>`,
        className: '', iconSize: [20,20], iconAnchor: [10,20]
      })
    }).bindPopup(`
      <div style="font-family:var(--mono);font-size:11px;color:#06b6d4;max-width:180px;word-wrap:break-word">
        <b>◈ Anotasi Peta</b><br>
        <div style="color:var(--popup-text,#ececee);margin:8px 0">${note}</div>
        <div style="color:var(--popup-label,#50505a);font-size:10px;margin-top:6px">
          Lat: ${e.latlng.lat.toFixed(6)}<br>
          Lon: ${e.latlng.lng.toFixed(6)}<br>
          <button onclick="CakraMap.deleteAnnotation(this)" style="margin-top:6px;padding:4px 8px;background:var(--red-dim);color:#f87171;border:none;border-radius:3px;cursor:pointer;font-family:var(--mono);font-size:9px">Hapus</button>
        </div>
      </div>`, { maxWidth: 200 }).addTo(annotationLayer);

    saveAnnotations();
  }

  function saveAnnotations() {
    if (!annotationLayer) return;
    const annotations = [];
    annotationLayer.eachLayer(layer => {
      if (layer.getLatLng && layer.getPopup) {
        annotations.push({ lat: layer.getLatLng().lat, lng: layer.getLatLng().lng, note: layer.getPopup().getContent() });
      }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  }

  function loadAnnotations() {
    if (!annotationLayer) return;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;
      JSON.parse(data).forEach(ann => {
        L.marker([ann.lat, ann.lng], {
          icon: L.divIcon({
            html: `<div style="width:20px;height:20px;background:#06b6d4;border-radius:50%;border:2px solid #22d3ee;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600">◈</div>`,
            className: '', iconSize: [20,20], iconAnchor: [10,20]
          })
        }).bindPopup(ann.note, { maxWidth: 200 }).addTo(annotationLayer);
      });
    } catch(e) { console.warn('Error loading annotations:', e); }
  }

  function deleteAnnotation(btn) {
    if (confirm('Hapus marker ini?')) {
      map.closePopup();
      annotationLayer.eachLayer(layer => {
        try { annotationLayer.removeLayer(layer); } catch(e) {}
      });
      saveAnnotations();
    }
  }

  const TP_TIER_STYLE = {
    high: { r: 16, color: '#22c55e', weight: 1.4, opacity: 0.65, dashArray: '1,4' },
    mid:  { r: 13, color: '#facc15', weight: 1.6, opacity: 0.85, dashArray: '3,3' },
    low:  { r: 10, color: '#dc2626', weight: 2.0, opacity: 0.95, dashArray: null  },
  };

  function computeAnalysisFlags(opts) {
    const o = Object.assign({}, _flagOpts, opts || {});
    _flagOpts = o;

    const gap = new Set();
    const churn = new Set();
    const throughputTier = new Map();
    const n = _thinned.length;
    if (!n) { _flags = { gap, churn, throughputTier }; return _flags; }

    let runStart = -1;
    for (let i = 0; i < n; i++) {
      const r = _thinned[i].rsrp;
      if (r != null && !isNaN(r) && r <= o.gapThreshold) {
        if (runStart < 0) runStart = i;
      } else {
        if (runStart >= 0 && i - runStart >= 2) {
          for (let j = runStart; j < i; j++) gap.add(j);
        }
        runStart = -1;
      }
    }
    if (runStart >= 0 && n - runStart >= 2) {
      for (let j = runStart; j < n; j++) gap.add(j);
    }

    // Cell churn: >=3 unique cells dalam window
    const w = o.windowSize;
    for (let i = w; i < n; i++) {
      const seen = new Set();
      for (let k = i - w; k <= i; k++) {
        const c = _thinned[k].cellname;
        if (c) seen.add(c);
        if (seen.size >= 3) break;
      }
      if (seen.size >= 3) churn.add(i);
    }

    let maxDl = 0;
    for (let i = 0; i < n; i++) if (_thinned[i].dl > maxDl) maxDl = _thinned[i].dl;
    if (maxDl > 0) {
      for (let i = 0; i < n; i++) {
        const dl = _thinned[i].dl;
        if (!dl || dl <= 0) continue;
        const norm = dl / maxDl;
        const tier = norm > 0.66 ? 'high' : norm > 0.33 ? 'mid' : 'low';
        throughputTier.set(i, tier);
      }
    }

    _flags = { gap, churn, throughputTier };
    return _flags;
  }

  function buildRingOverlays() {
    if (!layers.gapRing || !layers.churnRing || !layers.throughputRing) return;
    layers.gapRing.clearLayers();
    layers.churnRing.clearLayers();
    layers.throughputRing.clearLayers();

    _thinned.forEach((d, i) => {
      // Gap ring — solid red, tightest radius (closest to signal dot)
      if (_flags.gap.has(i)) {
        L.circleMarker([d.lat, d.lon], {
          pane: 'analysisRings',
          radius: 9, fillOpacity: 0,
          color: '#f87171', weight: 2.2, opacity: 0.95,
          interactive: false,
        }).addTo(layers.gapRing);
      }
      // Cell churn ring — dashed orange, mid radius
      if (_flags.churn.has(i)) {
        L.circleMarker([d.lat, d.lon], {
          pane: 'analysisRings',
          radius: 12, fillOpacity: 0,
          color: '#f97316', weight: 2, opacity: 0.9,
          dashArray: '4,3', interactive: false,
        }).addTo(layers.churnRing);
      }
      // Throughput tier ring — color/size per tier, sesuai docs
      const tier = _flags.throughputTier.get(i);
      if (tier) {
        const s = TP_TIER_STYLE[tier];
        L.circleMarker([d.lat, d.lon], {
          pane: 'analysisRings',
          radius: s.r, fillOpacity: 0,
          color: s.color, weight: s.weight, opacity: s.opacity,
          dashArray: s.dashArray, interactive: false,
        }).addTo(layers.throughputRing);
      }
    });

    updateOverlayBadges();
  }

  const _OVERLAY_LAYER = { gap: 'gapRing', churn: 'churnRing', throughput: 'throughputRing' };

  function _getOverlayCount(type) {
    if (type === 'gap')        return _flags.gap.size;
    if (type === 'churn')      return _flags.churn.size;
    if (type === 'throughput') return _flags.throughputTier.size;
    return 0;
  }

  function _getThroughputTierCounts() {
    const c = { high: 0, mid: 0, low: 0 };
    _flags.throughputTier.forEach(t => { c[t] = (c[t] || 0) + 1; });
    return c;
  }

  function updateOverlayBadges() {
    [['gap', 'gapStatBadge', 'titik gap'], ['churn', 'churnStatBadge', 'titik churn']].forEach(([type, badgeId, label]) => {
      const el = document.getElementById(badgeId);
      if (!el) return;
      const layer = layers[_OVERLAY_LAYER[type]];
      const isOn = !!(map && layer && map.hasLayer(layer));
      const count = _getOverlayCount(type);
      el.style.display = isOn && count ? 'inline-flex' : 'none';
      el.textContent = count + ' ' + label;
    });
    // Throughput — tier breakdown badge
    const tpEl = document.getElementById('throughputStatBadge');
    if (tpEl) {
      const tpLayer = layers.throughputRing;
      const isOn = !!(map && tpLayer && map.hasLayer(tpLayer));
      const c = _getThroughputTierCounts();
      const total = c.high + c.mid + c.low;
      if (isOn && total) {
        tpEl.innerHTML =
          '<span style="color:#22c55e;font-weight:600">' + c.high + '↑</span>' +
          '<span style="opacity:0.4;margin:0 5px">·</span>' +
          '<span style="color:#facc15;font-weight:600">' + c.mid + '</span>' +
          '<span style="opacity:0.4;margin:0 5px">·</span>' +
          '<span style="color:#f87171;font-weight:600">' + c.low + '↓</span>' +
          '<span style="margin-left:6px;opacity:0.7">throughput</span>';
        tpEl.style.display = 'inline-flex';
      } else {
        tpEl.style.display = 'none';
      }
    }
  }

  function _syncOverlayBtn(type) {
    const btn = document.querySelector(`.map-overlay-btn[data-overlay="${type}"]`);
    if (!btn) return;
    const layer = layers[_OVERLAY_LAYER[type]];
    const on = !!(map && layer && map.hasLayer(layer));
    btn.classList.toggle('active', on);
    btn.setAttribute('data-active', on ? 'true' : 'false');
  }

  function setAnalysisOverlay(type, on) {
    if (!map) return false;
    const layerKey = _OVERLAY_LAYER[type];
    const layer = layers[layerKey];
    if (!layer) return false;
    const isOn = map.hasLayer(layer);
    if (on && !isOn) layer.addTo(map);
    else if (!on && isOn) map.removeLayer(layer);
    _syncOverlayBtn(type);
    updateOverlayBadges();
    return on;
  }

  function toggleAnalysisOverlay(type) {
    if (!map) return false;
    const layerKey = _OVERLAY_LAYER[type];
    const layer = layers[layerKey];
    if (!layer) return false;
    const willBeOn = !map.hasLayer(layer);
    return setAnalysisOverlay(type, willBeOn);
  }

  function clearAnalysisOverlays() {
    ['gap', 'churn', 'throughput'].forEach(t => setAnalysisOverlay(t, false));
  }

  function getAnalysisStats() {
    return {
      gap:        _flags.gap.size,
      churn:      _flags.churn.size,
      throughput: { total: _flags.throughputTier.size, ..._getThroughputTierCounts() },
      total:      _thinned.length,
    };
  }

  function buildCoverageGapLayer(DATA, threshold) {
    if (layers.coverageGap) layers.coverageGap.clearLayers();
    else layers.coverageGap = L.layerGroup();

    const gps = DATA.filter(d => d.lat && d.lon);
    const thr = threshold || -100;
    let segment = [];
    const segments = [];

    gps.forEach((d, i) => {
      if (d.rsrp <= thr) {
        segment.push([d.lat, d.lon, d]);
      } else {
        if (segment.length >= 2) segments.push(segment);
        segment = [];
      }
    });
    if (segment.length >= 2) segments.push(segment);

    let totalPts = 0;
    segments.forEach(seg => {
      totalPts += seg.length;
      const coords = seg.map(s => [s[0], s[1]]);
      const avgRsrp = (seg.reduce((a, s) => a + s[2].rsrp, 0) / seg.length).toFixed(1);
      L.polyline(coords, {
        color: '#f87171', weight: 6, opacity: 0.85,
        dashArray: null, lineCap: 'round', lineJoin: 'round'
      }).bindPopup(`
        <div style="font-family:monospace;font-size:11px;color:#f87171;line-height:1.7">
          <b style="display:inline-flex;align-items:center;gap:3px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Coverage Gap</b><br>
          Threshold: RSRP ≤ ${thr} dBm<br>
          Avg RSRP segmen: <b>${avgRsrp} dBm</b><br>
          Panjang: ${seg.length} titik<br>
          <span style="color:#94a3b8;font-size:10px">Klik titik individual untuk detail</span>
        </div>`, {maxWidth:240}).addTo(layers.coverageGap);
    });

    // Update stat overlay
    const statsEl = document.getElementById('gapStatBadge');
    if (statsEl) {
      statsEl.textContent = segments.length + ' gap · ' + totalPts + ' pts';
      statsEl.style.display = segments.length ? 'inline-flex' : 'none';
      statsEl.style.background = 'rgba(248,113,113,0.12)';
      statsEl.style.color = '#f87171';
      statsEl.style.border = '1px solid rgba(248,113,113,0.25)';
      statsEl.style.borderRadius = '4px';
    }
    return layers.coverageGap;
  }

  function buildCellChurnLayer(DATA, windowSize) {
    if (layers.cellChurn) layers.cellChurn.clearLayers();
    else layers.cellChurn = L.layerGroup();

    const gps = DATA.filter(d => d.lat && d.lon && d.cellname);
    const win = windowSize || 10;
    let churnCount = 0;

    gps.forEach((d, i) => {
      if (i < win) return;
      const window = gps.slice(i - win, i + 1);
      const uniqueCells = new Set(window.map(w => w.cellname)).size;
      if (uniqueCells >= 3) {
        churnCount++;
        const cells = [...new Set(window.map(w => w.cellname))].slice(0, 5).join(', ');
        L.circleMarker([d.lat, d.lon], {
          radius: 7, fillColor: '#f97316', color: '#fb923c',
          fillOpacity: 0.85, weight: 1.5
        }).bindPopup(`
          <div style="font-family:monospace;font-size:11px;color:#f97316;line-height:1.7">
            <b style="display:inline-flex;align-items:center;gap:3px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Cell Churn</b><br>
            ${uniqueCells} serving cell dalam ${win} titik terakhir<br>
            Sel aktif: <b style="color:#cbd5e1;font-size:10px">${cells}</b><br>
            RSRP: ${d.rsrp} dBm | RSRQ: ${d.rsrq} dB<br>
            <span style="color:#94a3b8;font-size:10px">${d.timePart||''}</span>
          </div>`, {maxWidth:260}).addTo(layers.cellChurn);
      }
    });

    return layers.cellChurn;
  }

  function buildThroughputLayer(DATA) {
    if (layers.throughput) layers.throughput.clearLayers();
    else layers.throughput = L.layerGroup();

    const gps = DATA.filter(d => d.lat && d.lon && d.dl > 0);
    if (!gps.length) return layers.throughput;

    const maxDl = Math.max(...gps.map(d => d.dl));

    gps.forEach(d => {
      const dlMbps = (d.dl / 1000).toFixed(1);
      const norm = d.dl / maxDl; // 0..1
      const radius = 4 + norm * 8;
      const color = norm > 0.66 ? '#22c55e' : norm > 0.33 ? '#facc15' : '#f87171';
      L.circleMarker([d.lat, d.lon], {
        radius, fillColor: color, color: 'transparent', fillOpacity: 0.75, weight: 0
      }).bindPopup(`
        <div style="font-family:monospace;font-size:11px;color:#cbd5e1;line-height:1.7">
          <b style="color:${color}">DL ${dlMbps} Mbps</b><br>
          UL ${(d.ul/1000).toFixed(1)} Mbps<br>
          RSRP: ${d.rsrp} dBm<br>
          RSRQ: ${d.rsrq} dB | SNR: ${d.snr} dB<br>
          <span style="color:#94a3b8;font-size:10px">${d.cellname||'—'} · ${d.timePart||''}</span>
        </div>`, {maxWidth:230}).addTo(layers.throughput);
    });
    return layers.throughput;
  }

  function buildAnalysisLayers(DATA, opts) {
    const o = opts || {};
    buildCoverageGapLayer(DATA, o.gapThreshold);
    buildCellChurnLayer(DATA, o.windowSize);
    buildThroughputLayer(DATA);

    computeAnalysisFlags({
      gapThreshold: o.gapThreshold != null ? o.gapThreshold : _flagOpts.gapThreshold,
      windowSize:   o.windowSize   != null ? o.windowSize   : _flagOpts.windowSize,
    });
    buildRingOverlays();
    ['gap','churn','throughput'].forEach(_syncOverlayBtn);
  }

  function switchAnalysisLayer(type) {
    if (!map) return;
    const analysisKeys = ['coverageGap', 'cellChurn', 'throughput'];
    analysisKeys.forEach(k => {
      if (layers[k] && map.hasLayer(layers[k])) map.removeLayer(layers[k]);
    });
    if (type && layers[type]) layers[type].addTo(map);
    document.querySelectorAll('.map-analysis-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.analysis === type);
    });
  }

  return {
    build, addEvents, switchLayer, toggleEventLayer, updateTheme,
    initAnnotationLayer, toggleAnnotationMode, deleteAnnotation,
    buildAnalysisLayers, switchAnalysisLayer,
    // Opsi A — overlay rings
    toggleAnalysisOverlay, setAnalysisOverlay, clearAnalysisOverlays,
    getAnalysisStats,
  };
})();
