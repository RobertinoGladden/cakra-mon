// handover.js — Engine mobility 3GPP (L3 filtering, Event A3, Time-to-Trigger, ping-pong)
// Cakra v2.2 — Virtual Drive Test module
//
// Referensi teknis:
//   - 3GPP TS 36.331 §5.5.3.2  — L3 quality filtering: F_n = (1-a)·F_{n-1} + a·M_n,
//     a = 1 / 2^(k/4), k = filterCoefficient (mengurangi fluktuasi fast-fading
//     sebelum dipakai untuk keputusan mobility, BUKAN RSRP mentah per-sampel).
//   - 3GPP TS 36.331 §5.5.4.4  — Event A3 "Neighbour becomes offset better than
//     serving": kondisi masuk  Mn − Hys > Mp + Ofn + Ocn + Off
//     (di sini Ofn/Ocn — frequency/cell-specific offset — disederhanakan jadi 0,
//     karena model ini single-frequency per band; Off = A3-Offset yang di-tune RF eng).
//   - Time-to-Trigger (TS 36.331, IE TimeToTrigger): kondisi A3 harus bertahan
//     terus-menerus selama TTT ms sebelum UE mengirim measurement report yang
//     memicu eksekusi handover — bukan langsung pindah begitu kondisi terpenuhi.
//   - Ping-pong: didefinisikan secara operasional (bukan istilah baku 3GPP) sebagai
//     handover balik ke sel asal dalam jendela waktu pendek setelah HO sebelumnya —
//     indikator klasik untuk tuning Hysteresis/TTT/A3-Offset kurang tepat di lapangan.
//
// Modul ini murni (pure function), tidak menyentuh DOM. Dipakai oleh predict.js
// untuk mengganti logika naif "site RSRP tertinggi langsung menang" pada simulasi
// virtual drive (Step 4), agar hasil sebanding dengan cara kerja jaringan nyata dan
// dengan parameter OSS yang sama persis dituning RF engineer di lapangan.

'use strict';

window.CakraHandover = (() => {

  // Nilai standar 3GPP untuk filterCoefficient (TS 36.331, IE FilterCoefficient).
  // k lebih besar → filter lebih "lembut"/lambat (meredam fast-fading lebih kuat).
  const FILTER_K_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15, 17, 19];

  // Nilai standar 3GPP untuk Time-to-Trigger (ms), IE TimeToTrigger (TS 36.331).
  const TTT_VALUES = [0, 40, 64, 80, 100, 128, 160, 256, 320, 480, 512, 640, 1024, 1280, 2560, 5120];

  // ─────────────────────────────────────────────
  // 1. L3 QUALITY FILTERING (TS 36.331 §5.5.3.2)
  // ─────────────────────────────────────────────
  // prevFiltered: F_{n-1} dalam dB (atau null/undefined utk sampel pertama)
  // rawSample:    M_n dalam dB (RSRP instan hasil model propagasi)
  // k:            filterCoefficient (lihat FILTER_K_VALUES)
  function l3Filter(prevFiltered, rawSample, k) {
    if (prevFiltered === null || prevFiltered === undefined || !isFinite(prevFiltered)) return rawSample;
    const a = 1 / Math.pow(2, k / 4);
    return (1 - a) * prevFiltered + a * rawSample;
  }

  // ─────────────────────────────────────────────
  // 2. SIMULASI URUTAN HANDOVER SEPANJANG RUTE
  // ─────────────────────────────────────────────
  // sampleSites : Array per-sampel dari Array<{siteId, rsrp}> (RSRP mentah SEMUA
  //               site yang line-of-sight/tercakup pada titik itu, hasil model
  //               propagasi — bukan hasil filter).
  // sampleTimesMs: Array cumulative time (ms) sejajar dengan sampleSites, dipakai
  //               untuk Time-to-Trigger & jendela ping-pong berbasis WAKTU (bukan
  //               jarak tetap) — sesuai definisi 3GPP yang berbasis durasi.
  // params:
  //   hysteresisDb   — Hys, IE Hysteresis (TS 36.331), umum 1-3 dB
  //   a3OffsetDb     — Off, IE a3-Offset, umum 0-6 dB
  //   filterK        — k, filterCoefficient L3 (lihat FILTER_K_VALUES), default 4
  //   ttTms          — TimeToTrigger dalam ms (lihat TTT_VALUES), default 320
  //   pingPongWindowMs — jendela deteksi ping-pong (HO balik ke sel asal), default 5000ms
  //
  // Return: { servingPerSample, filteredPerSample, handovers }
  //   servingPerSample[i]  = siteId yang jadi serving cell pada sampel ke-i
  //   filteredPerSample[i] = { siteId: F_n } snapshot nilai L3-filtered semua site
  //   handovers            = daftar event { idx, timeMs, fromId, toId,
  //                           fromRsrpFiltered, toRsrpFiltered, pingPong }
  function simulateHandoverSequence(sampleSites, sampleTimesMs, params = {}) {
    const hysteresisDb = params.hysteresisDb ?? 2;
    const a3OffsetDb   = params.a3OffsetDb   ?? 1;
    const filterK      = params.filterK      ?? 4;
    const ttTms        = params.ttTms        ?? 320;
    const pingPongWindowMs = params.pingPongWindowMs ?? 5000;

    const n = sampleSites.length;
    if (n === 0) return { servingPerSample: [], filteredPerSample: [], handovers: [] };

    // Inisialisasi filter L3 = nilai mentah sampel pertama (F_0 = M_0, tidak ada
    // riwayat sebelumnya — konsisten dgn inisialisasi filter di spesifikasi/ns-3).
    const filtered = {};
    sampleSites[0].forEach(r => { filtered[r.siteId] = r.rsrp; });

    // Serving awal = site dgn RSRP filtered tertinggi (asumsi UE sudah attach
    // sebelum simulasi dimulai — setara "cell selection" awal, bukan handover).
    let serving = sampleSites[0].reduce((b, r) => (!b || r.rsrp > b.rsrp) ? r : b, null).siteId;

    const timers = {}; // ms akumulasi kondisi A3 terpenuhi terus-menerus, per neighbor
    sampleSites[0].forEach(r => { if (r.siteId !== serving) timers[r.siteId] = 0; });

    const servingPerSample = [serving];
    const filteredPerSample = [{ ...filtered }];
    const handovers = [];

    for (let i = 1; i < n; i++) {
      const dtMs = Math.max(1, (sampleTimesMs[i] - sampleTimesMs[i - 1]));

      // Update L3 filter untuk tiap site yang terukur pada sampel ini.
      sampleSites[i].forEach(r => {
        filtered[r.siteId] = l3Filter(filtered[r.siteId], r.rsrp, filterK);
      });

      const Mp = filtered[serving]; // serving measured quality (filtered), 3GPP: Mp
      let triggeredId = null;
      let triggeredMargin = -Infinity;

      sampleSites[i].forEach(r => {
        const id = r.siteId;
        if (id === serving) return;
        const Mn = filtered[id];
        if (Mn === undefined) return;
        if (timers[id] === undefined) timers[id] = 0;

        // Event A3 entering condition (TS 36.331 §5.5.4.4), Ofn=Ocn=0 (single-freq):
        //   Mn − Hys > Mp + Off
        const enter = (Mn - hysteresisDb) > (Mp + a3OffsetDb);

        if (enter) {
          timers[id] += dtMs;
          if (timers[id] >= ttTms) {
            const margin = Mn - Mp; // kalau >1 neighbor lolos TTT bersamaan, pilih margin terbesar
            if (margin > triggeredMargin) { triggeredMargin = margin; triggeredId = id; }
          }
        } else {
          timers[id] = 0; // TTT batal jika kondisi sempat tidak terpenuhi (perilaku standar 3GPP)
        }
      });

      if (triggeredId) {
        const ev = {
          idx: i,
          timeMs: sampleTimesMs[i],
          fromId: serving,
          toId: triggeredId,
          fromRsrpFiltered: Mp,
          toRsrpFiltered: filtered[triggeredId],
        };
        const prevHo = handovers[handovers.length - 1];
        ev.pingPong = !!(prevHo && ev.toId === prevHo.fromId &&
          (ev.timeMs - prevHo.timeMs) < pingPongWindowMs);
        handovers.push(ev);

        serving = triggeredId;
        Object.keys(timers).forEach(id => { timers[id] = 0; }); // reset semua timer neighbor
      }

      servingPerSample.push(serving);
      filteredPerSample.push({ ...filtered });
    }

    return { servingPerSample, filteredPerSample, handovers };
  }

  return {
    FILTER_K_VALUES, TTT_VALUES,
    l3Filter, simulateHandoverSequence,
  };
})();
