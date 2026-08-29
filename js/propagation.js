// propagation.js — RF propagation engine untuk Virtual Drive Test — Cakra v2.1
// Implementasi: Okumura-Hata, COST231-Hata, 3GPP TR 38.901 (UMa), antenna pattern
// combining (3GPP 38.901 §7.3), tilt projection, dan single knife-edge diffraction
// (ITU-R P.526 approximation). Semua fungsi murni (pure function), tidak menyentuh DOM.
// © 2026 — dikembangkan sebagai ekstensi Cakra Drive Test Intelligence.

'use strict';

window.CakraPropagation = (() => {

  const C_LIGHT = 299792458; // m/s
  const R_EARTH = 6371000;   // m, untuk proyeksi lokal

  // ─────────────────────────────────────────────
  // 1. GEOMETRI DASAR
  // ─────────────────────────────────────────────

  function toRad(deg) { return deg * Math.PI / 180; }
  function toDeg(rad) { return rad * 180 / Math.PI; }

  // Jarak great-circle (haversine) — akurat untuk semua skala
  function haversineDist(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(a));
  }

  // Bearing dari titik 1 ke titik 2, dalam derajat 0-360 (0 = utara)
  function bearingDeg(lat1, lon1, lat2, lon2) {
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  // Selisih sudut terpendek antara dua azimuth (hasil -180..180)
  function angleDiff(a, b) {
    let d = (a - b) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  // Proyeksi equirectangular lokal (meter) di sekitar titik origin — cukup akurat
  // untuk radius prediksi <5km, dipakai untuk membangun grid & geometri bangunan.
  function makeLocalProjection(lat0, lon0) {
    const cosLat0 = Math.cos(toRad(lat0));
    return {
      toXY(lat, lon) {
        const x = toRad(lon - lon0) * R_EARTH * cosLat0;
        const y = toRad(lat - lat0) * R_EARTH;
        return [x, y]; // meter, x=timur, y=utara
      },
      toLatLon(x, y) {
        const lat = lat0 + toDeg(y / R_EARTH);
        const lon = lon0 + toDeg(x / (R_EARTH * cosLat0));
        return [lat, lon];
      }
    };
  }

  // ─────────────────────────────────────────────
  // 2. MODEL PATH LOSS
  // ─────────────────────────────────────────────

  // Okumura-Hata — valid 150-1500 MHz, d 1-20km, hb 30-200m, hm 1-10m
  function pathLossHata({ freqMHz, dKm, hb, hm, env }) {
    const f = freqMHz, d = Math.max(dKm, 0.02);
    let aHm;
    if (env === 'urban_large') {
      aHm = f >= 300
        ? 3.2 * Math.pow(Math.log10(11.75 * hm), 2) - 4.97
        : 8.29 * Math.pow(Math.log10(1.54 * hm), 2) - 1.1;
    } else {
      aHm = (1.1 * Math.log10(f) - 0.7) * hm - (1.56 * Math.log10(f) - 0.8);
    }
    let L = 69.55 + 26.16 * Math.log10(f) - 13.82 * Math.log10(hb) - aHm +
      (44.9 - 6.55 * Math.log10(hb)) * Math.log10(d);
    if (env === 'suburban') {
      L -= 2 * Math.pow(Math.log10(f / 28), 2) + 5.4;
    } else if (env === 'rural') {
      L -= 4.78 * Math.pow(Math.log10(f), 2) - 18.33 * Math.log10(f) + 40.94;
    }
    return L;
  }

  // COST231-Hata — ekstensi Hata untuk 1500-2000 MHz (dipakai luas untuk 1800/2100)
  function pathLossCost231({ freqMHz, dKm, hb, hm, env }) {
    const f = freqMHz, d = Math.max(dKm, 0.02);
    const aHm = (1.1 * Math.log10(f) - 0.7) * hm - (1.56 * Math.log10(f) - 0.8);
    const C = env === 'urban_large' ? 3 : 0; // metropolitan center vs medium city/suburban
    let L = 46.3 + 33.9 * Math.log10(f) - 13.82 * Math.log10(hb) - aHm +
      (44.9 - 6.55 * Math.log10(hb)) * Math.log10(d) + C;
    if (env === 'suburban') L -= 2 * Math.pow(Math.log10(f / 28), 2) + 5.4;
    if (env === 'rural') L -= 4.78 * Math.pow(Math.log10(f), 2) - 18.33 * Math.log10(f) + 40.94;
    return L;
  }

  // 3GPP TR 38.901 §7.4.1 — Urban Macro (UMa), bentuk closed-form yang disederhanakan
  // untuk band menengah-tinggi (>2 GHz, termasuk NR n78/n40/n41). LOS & NLOS breakpoint.
  function pathLoss38901UMa({ freqGHz, d3D, hb, hm, los }) {
    const fc = freqGHz;
    const dBP = 4 * (hb - 1) * (hm - 1) * fc * 1e9 / C_LIGHT; // breakpoint distance
    const d = Math.max(d3D, 10);

    function plLOS(dd) {
      if (dd <= dBP) {
        return 28.0 + 22 * Math.log10(dd) + 20 * Math.log10(fc);
      }
      return 28.0 + 40 * Math.log10(dd) + 20 * Math.log10(fc)
        - 9 * Math.log10(dBP ** 2 + (hb - hm) ** 2);
    }

    const plLos = plLOS(d);
    if (los) return plLos;

    const plNLOSprime = 13.54 + 39.08 * Math.log10(d) + 20 * Math.log10(fc) - 0.6 * (hm - 1.5);
    return Math.max(plLos, plNLOSprime);
  }

  // Pemilih model otomatis berdasarkan frekuensi — dipakai predict.js
  function pathLoss({ freqMHz, dMeters, hb, hm, env, los }) {
    const dKm = Math.max(dMeters / 1000, 0.02);
    if (freqMHz >= 2300) {
      // Band NR menengah (n40/n41/n78 dst) — pakai 3GPP 38.901 UMa
      const d3D = Math.sqrt(dMeters * dMeters + (hb - hm) * (hb - hm));
      return pathLoss38901UMa({ freqGHz: freqMHz / 1000, d3D, hb, hm, los });
    }
    if (freqMHz >= 1500) {
      return pathLossCost231({ freqMHz, dKm, hb, hm, env });
    }
    return pathLossHata({ freqMHz, dKm, hb, hm, env });
  }

  // ─────────────────────────────────────────────
  // 3. POLA ANTENA — horizontal, vertical, tilt projection
  // ─────────────────────────────────────────────

  // Pola horizontal 3GPP 38.901 — attenuation (nilai negatif berarti rugi dari puncak)
  function horizontalPatternLoss(azOffsetDeg, beamwidthH, frontToBack) {
    const phi = ((azOffsetDeg + 180) % 360 + 360) % 360 - 180; // normalisasi -180..180
    return -Math.min(12 * Math.pow(phi / beamwidthH, 2), frontToBack);
  }

  // Pola vertical 3GPP 38.901
  function verticalPatternLoss(elevOffsetDeg, beamwidthV, slaV) {
    return -Math.min(12 * Math.pow(elevOffsetDeg / beamwidthV, 2), slaV);
  }

  // Proyeksi mechanical tilt terhadap azimuth offset dari boresight.
  // Tilt mekanik bersifat "fisik" — efeknya berkurang saat menjauh dari arah hadap
  // antena secara horizontal. Tilt elektrik dianggap seragam di semua azimuth
  // (diterapkan lewat phase-shift internal array, bukan kemiringan fisik).
  //   θ_eff(φ) = θ_elektrik + arctan( tan(θ_mekanik) · cos(φ) )
  function effectiveTiltAt(azOffsetDeg, mechTiltDeg, elecTiltDeg) {
    const phi = toRad(azOffsetDeg);
    const projectedMech = toDeg(Math.atan(Math.tan(toRad(mechTiltDeg)) * Math.cos(phi)));
    return elecTiltDeg + projectedMech;
  }

  // Gabungan pola 3D sesuai 3GPP TR 38.901 §7.3 (formula 7.3-1..7.3-4):
  //   A(θ,φ) = -min[ -(A_H(φ) + A_V(θ)), A_m ]
  function combinedAntennaGain({ gainMaxDbi, azOffsetDeg, elevOffsetDeg, beamwidthH, beamwidthV, frontToBack, slaV }) {
    const Ah = horizontalPatternLoss(azOffsetDeg, beamwidthH, frontToBack);
    const Av = verticalPatternLoss(elevOffsetDeg, beamwidthV, slaV);
    const Acombined = -Math.min(-(Ah + Av), frontToBack);
    return gainMaxDbi + Acombined;
  }

  // ─────────────────────────────────────────────
  // 4. DIFRAKSI KNIFE-EDGE TUNGGAL (ITU-R P.526, aproksimasi Lee)
  // ─────────────────────────────────────────────

  // h      = tinggi obstruksi di atas garis LOS langsung (m), positif = menghalangi
  // d1, d2 = jarak dari Tx→obstruksi dan obstruksi→Rx (m)
  // freqMHz = frekuensi carrier
  // Mengembalikan rugi difraksi tambahan dalam dB (0 jika tidak terhalang).
  // Catatan tanda: J(ν) pada formula Lee adalah "diffraction gain" yang bernilai
  // negatif (redaman relatif terhadap free-space). Rugi tambahan yang ditambahkan
  // ke path loss adalah -J(ν) (positif).
  function knifeEdgeDiffractionLoss({ h, d1, d2, freqMHz }) {
    if (h <= 0 || d1 <= 0 || d2 <= 0) return 0;
    const lambda = C_LIGHT / (freqMHz * 1e6);
    const nu = h * Math.sqrt((2 / lambda) * (1 / d1 + 1 / d2));

    let J;
    if (nu <= -1) J = 0;
    else if (nu <= 0) J = 20 * Math.log10(0.5 - 0.62 * nu);
    else if (nu <= 1) J = 20 * Math.log10(0.5 * Math.exp(-0.95 * nu));
    else if (nu <= 2.4) J = 20 * Math.log10(0.4 - Math.sqrt(0.1184 - Math.pow(0.38 - 0.1 * nu, 2)));
    else J = 20 * Math.log10(0.225 / nu);

    return Math.max(0, -J);
  }

  // ─────────────────────────────────────────────
  // 5. LINK BUDGET — gabungkan semuanya jadi prediksi RSRP di satu titik
  // ─────────────────────────────────────────────

  function predictAtPoint({
    distM, azOffsetDeg, elevOffsetDeg,
    freqMHz, hb, hm, env, los,
    txPowerDbm, feederLossDb, gainMaxDbi,
    mechTiltDeg, elecTiltDeg, beamwidthH, beamwidthV, frontToBack, slaV,
    obstruction, // { h, d1, d2 } | null
  }) {
    const effTilt = effectiveTiltAt(azOffsetDeg, mechTiltDeg, elecTiltDeg);
    const elevRelativeToTilt = elevOffsetDeg - effTilt;

    const antGain = combinedAntennaGain({
      gainMaxDbi, azOffsetDeg, elevOffsetDeg: elevRelativeToTilt,
      beamwidthH, beamwidthV, frontToBack, slaV,
    });

    const eirp = txPowerDbm - feederLossDb + antGain;

    const pl = pathLoss({ freqMHz, dMeters: distM, hb, hm, env, los: los && !obstruction });

    const diffLoss = obstruction
      ? knifeEdgeDiffractionLoss({ h: obstruction.h, d1: obstruction.d1, d2: obstruction.d2, freqMHz })
      : 0;

    const rsrp = eirp - pl - diffLoss;

    return { rsrp, eirp, pathLoss: pl, diffLoss, antGain, effTilt, los: los && !obstruction };
  }

  return {
    toRad, toDeg, haversineDist, bearingDeg, angleDiff, makeLocalProjection,
    pathLossHata, pathLossCost231, pathLoss38901UMa, pathLoss,
    horizontalPatternLoss, verticalPatternLoss, effectiveTiltAt, combinedAntennaGain,
    knifeEdgeDiffractionLoss, predictAtPoint,
  };
})();
