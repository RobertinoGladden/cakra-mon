// buildings.js — Data bangunan real (OpenStreetMap) untuk deteksi obstruksi LOS/NLOS
// Cakra v2.1 — Virtual Drive Test module
// © 2026 — dikembangkan sebagai ekstensi Cakra Drive Test Intelligence.

'use strict';

window.CakraBuildings = (() => {

  // Beberapa mirror publik Overpass — dicoba berurutan jika salah satu timeout/down
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  const DEFAULT_HEIGHT_M = 12;      // fallback ~4 lantai jika tag height/levels tidak ada
  const LEVEL_HEIGHT_M   = 3.2;     // tinggi rata-rata per lantai (m)

  function estimateHeight(tags) {
    if (!tags) return DEFAULT_HEIGHT_M;
    if (tags.height) {
      const h = parseFloat(String(tags.height).replace(/[^0-9.]/g, ''));
      if (!isNaN(h) && h > 0) return h;
    }
    if (tags['building:levels']) {
      const lv = parseFloat(tags['building:levels']);
      if (!isNaN(lv) && lv > 0) return lv * LEVEL_HEIGHT_M;
    }
    return DEFAULT_HEIGHT_M;
  }

  // Ambil bangunan dalam radius (meter) di sekitar (lat, lon) via Overpass API.
  // Mengembalikan Promise<Array<{id, heightM, footprint:[[lat,lon],...], tags}>>
  async function fetchBuildings(lat, lon, radiusM, opts = {}) {
    const cap = Math.min(radiusM, 1500); // batasi query area demi performa & fair-use API
    const query = `[out:json][timeout:20];way["building"](around:${cap},${lat},${lon});out geom;`;
    const timeoutMs = opts.timeoutMs || 15000;

    let lastErr = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: query,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        const elements = json.elements || [];
        return elements
          .filter(el => el.geometry && el.geometry.length >= 3)
          .map(el => ({
            id: el.id,
            heightM: estimateHeight(el.tags),
            footprint: el.geometry.map(g => [g.lat, g.lon]),
            tags: el.tags || {},
          }));
      } catch (e) {
        lastErr = e;
        continue; // coba endpoint berikutnya
      }
    }
    throw lastErr || new Error('Semua endpoint Overpass gagal dihubungi');
  }

  // ─────────────────────────────────────────────
  // Geometri 2D — dipakai untuk cek obstruksi LOS
  // ─────────────────────────────────────────────

  // Orientasi 3 titik: >0 counter-clockwise, <0 clockwise, 0 collinear
  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  function onSegment(ax, ay, bx, by, px, py) {
    return Math.min(ax, bx) - 1e-9 <= px && px <= Math.max(ax, bx) + 1e-9 &&
      Math.min(ay, by) - 1e-9 <= py && py <= Math.max(ay, by) + 1e-9;
  }

  // Intersection dua segmen [p1,p2] dan [p3,p4], mengembalikan titik {x,y,t}
  // t = fraksi jarak sepanjang p1→p2 (0..1), atau null jika tidak berpotongan
  function segmentIntersection(p1, p2, p3, p4) {
    const [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3, [x4, y4] = p4;
    const d1 = orient(x3, y3, x4, y4, x1, y1);
    const d2 = orient(x3, y3, x4, y4, x2, y2);
    const d3 = orient(x1, y1, x2, y2, x3, y3);
    const d4 = orient(x1, y1, x2, y2, x4, y4);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(denom) < 1e-12) return null;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      const x = x1 + t * (x2 - x1);
      const y = y1 + t * (y2 - y1);
      return { x, y, t };
    }
    return null;
  }

  // Bounding box cepat untuk pre-filter sebelum uji intersection penuh
  function bbox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  function bboxSegmentOverlap(bb, p1, p2) {
    const segMinX = Math.min(p1[0], p2[0]), segMaxX = Math.max(p1[0], p2[0]);
    const segMinY = Math.min(p1[1], p2[1]), segMaxY = Math.max(p1[1], p2[1]);
    return !(segMaxX < bb.minX || segMinX > bb.maxX || segMaxY < bb.minY || segMinY > bb.maxY);
  }

  // Cari obstruksi paling dominan sepanjang garis LOS (site→target, dalam koordinat
  // lokal meter XY). Untuk tiap perpotongan dengan footprint bangunan, hitung tinggi
  // garis LOS pada titik itu (interpolasi linear antara tinggi antena & tinggi
  // penerima) lalu bandingkan dengan tinggi bangunan — jika bangunan lebih tinggi,
  // itu obstruksi. Mengembalikan obstruksi dengan "excess height" terbesar (dominant
  // edge, aproksimasi dari metode Deygout untuk kasus multi-obstruksi).
  function findDominantObstruction(siteXY, targetXY, hSite, hTarget, buildingsWithBBox) {
    const totalDist = Math.hypot(targetXY[0] - siteXY[0], targetXY[1] - siteXY[1]);
    if (totalDist < 1) return null;

    let best = null;

    for (const b of buildingsWithBBox) {
      if (!bboxSegmentOverlap(b.bb, siteXY, targetXY)) continue;

      const pts = b.xy;
      for (let i = 0; i < pts.length - 1; i++) {
        const ix = segmentIntersection(siteXY, targetXY, pts[i], pts[i + 1]);
        if (!ix) continue;

        const dAlong = ix.t * totalDist;               // jarak dari site ke titik potong
        const losHeightHere = hSite + (hTarget - hSite) * ix.t;
        const excess = b.heightM - losHeightHere;       // >0 berarti menghalangi

        if (excess > 0 && (!best || excess > best.excess)) {
          best = {
            excess,
            h: excess,
            d1: dAlong,
            d2: totalDist - dAlong,
            buildingId: b.id,
          };
        }
      }
    }
    return best;
  }

  return {
    fetchBuildings, estimateHeight,
    segmentIntersection, bbox, bboxSegmentOverlap, findDominantObstruction,
  };
})();
