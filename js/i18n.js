// i18n.js — Bilingual (ID/EN) toggle untuk chrome statis Cakra Dashboard.
// Cakupan saat ini: label sidebar, judul & subjudul tiap page, judul & subjudul
// tiap bento-card, dan teks statis widget chatbot "Caca". Konten yang di-generate
// dinamis oleh dashboard.js (isi tabel, badge, dsb) BELUM tercakup — itu langkah
// lanjutan yang bisa dikembangkan dengan pola yang sama (tambah data-i18n, atau
// panggil CakraI18n.t('key') dari dalam template string JS).
//
// Pola pemakaian:
//   - Elemen teks statis  : <div data-i18n="page.overview.title">Overview</div>
//   - Placeholder input   : <textarea data-i18n-placeholder="ai.input.placeholder">
// Saat CakraI18n.setLanguage(lang) dipanggil, semua elemen dg atribut tsb di-update
// otomatis. Preferensi bahasa disimpan di localStorage (persist antar sesi).

'use strict';

window.CakraI18n = (() => {
  const DICT = {
    id: {
      'nav.overview': 'Overview',
      'nav.grafik': 'Grafik & Distribusi',
      'nav.peta': 'Peta & Events',
      'nav.analisis': 'Analisis RF Lanjutan',

      'page.overview.title': 'Overview',
      'page.overview.sub': 'Ringkasan sesi drive test',
      'page.grafik.title': 'Grafik & Distribusi',
      'page.grafik.sub': 'Time series parameter & sebaran data',
      'page.peta.title': 'Peta & Events',
      'page.peta.sub': 'Visualisasi geografis, handover, dan titik rawan',
      'page.analisis.title': 'Analisis RF Lanjutan',
      'page.analisis.sub': 'Coverage gap, cell churn, korelasi throughput, site view, PCI conflict',

      'card.info.title': 'Informasi Drive Test',
      'card.info.sub': 'Data umum sesi pengukuran',
      'card.cell.title': 'Data Serving Cell',
      'card.cell.sub': 'Parameter jaringan aktif',
      'card.kpi.title': 'Ringkasan KPI',
      'card.kpi.sub': 'Key Performance Indicators rata-rata',
      'card.fieldtools.title': 'Quick Tools',
      'card.fieldtools.sub': 'Kualitas sinyal, kecepatan, checklist & aksi cepat',
      'card.grafik.title': 'Grafik Parameter',
      'card.grafik.sub': 'Time series RSRP, RSRQ, SNR, Throughput',
      'card.distribusi.title': 'Tabel Standar & Distribusi',
      'card.distribusi.sub': 'Kategori parameter dan persentase sebaran data',
      'card.peta.title': 'Peta Sinyal',
      'card.peta.sub': 'Visualisasi geografis parameter jaringan',
      'card.events.title': 'Events — Handover & Cell Reselection',
      'card.events.sub': 'Data perpindahan sel dari file KML',
      'card.rawan.title': 'Titik Rawan Sinyal',
      'card.rawan.sub': 'Titik dengan parameter di luar threshold normal',
      'card.covgap.title': 'Coverage Gap Detection',
      'card.covgap.sub': 'Segmen rute dengan RSRP di bawah threshold — area blank spot',
      'card.cellchurn.title': 'Cell Churn / Handover Instability',
      'card.cellchurn.sub': 'Area dengan ≥3 serving cell berbeda dalam window pendek — bisa indikasi pilot pollution, mobility, atau misconfig HO',
      'card.throughputcorr.title': 'Throughput Correlation',
      'card.throughputcorr.sub': 'Korelasi DL throughput vs RSRP — identifikasi bottleneck RF vs non-RF',
      'card.siteview.title': 'Site-based View',
      'card.siteview.sub': 'KPI dikelompokkan per site / eNodeB — identifikasi site bermasalah',
      'card.pciconflict.title': 'PCI Mod-3 Conflict Analysis',
      'card.pciconflict.sub': 'Deteksi cell yang berbagi PCI mod 3 — potensi PSS collision saat initial cell sync',

      'ai.status': 'Siap menganalisis data drive test',
      'ai.quickbar': 'Analisis Cepat',
      'ai.chip.full': 'Laporan Lengkap',
      'ai.chip.kpi': 'Evaluasi KPI',
      'ai.chip.coverage': 'Coverage',
      'ai.chip.handover': 'Handover',
      'ai.chip.throughput': 'Throughput',
      'ai.chip.recommend': 'Rekomendasi',
      'ai.welcome.title': 'Halo! Aku Caca, AI Analyst kamu',
      'ai.welcome.sub': 'Pilih analisis cepat di atas atau ketik pertanyaan tentang data RSRP, RSRQ, SNR, throughput, handover, dan parameter LTE/5G lainnya.',
      'ai.input.placeholder': 'Tanya tentang data drive test... (Enter kirim, Shift+Enter baris baru)',
    },
    en: {
      'nav.overview': 'Overview',
      'nav.grafik': 'Charts & Distribution',
      'nav.peta': 'Map & Events',
      'nav.analisis': 'Advanced RF Analysis',

      'page.overview.title': 'Overview',
      'page.overview.sub': 'Drive test session summary',
      'page.grafik.title': 'Charts & Distribution',
      'page.grafik.sub': 'Parameter time series & data distribution',
      'page.peta.title': 'Map & Events',
      'page.peta.sub': 'Geographic visualization, handovers, and weak-signal points',
      'page.analisis.title': 'Advanced RF Analysis',
      'page.analisis.sub': 'Coverage gap, cell churn, throughput correlation, site view, PCI conflict',

      'card.info.title': 'Drive Test Info',
      'card.info.sub': 'General measurement session data',
      'card.cell.title': 'Serving Cell Data',
      'card.cell.sub': 'Active network parameters',
      'card.kpi.title': 'KPI Summary',
      'card.kpi.sub': 'Average Key Performance Indicators',
      'card.fieldtools.title': 'Quick Tools',
      'card.fieldtools.sub': 'Signal quality, speed, checklist & quick actions',
      'card.grafik.title': 'Parameter Chart',
      'card.grafik.sub': 'RSRP, RSRQ, SNR, Throughput time series',
      'card.distribusi.title': 'Standards & Distribution Table',
      'card.distribusi.sub': 'Parameter categories and data distribution percentage',
      'card.peta.title': 'Signal Map',
      'card.peta.sub': 'Geographic visualization of network parameters',
      'card.events.title': 'Events — Handover & Cell Reselection',
      'card.events.sub': 'Cell change data from KML file',
      'card.rawan.title': 'Weak Signal Points',
      'card.rawan.sub': 'Points with parameters outside normal threshold',
      'card.covgap.title': 'Coverage Gap Detection',
      'card.covgap.sub': 'Route segments with RSRP below threshold — blank spot areas',
      'card.cellchurn.title': 'Cell Churn / Handover Instability',
      'card.cellchurn.sub': 'Areas with ≥3 different serving cells in a short window — may indicate pilot pollution, mobility, or HO misconfiguration',
      'card.throughputcorr.title': 'Throughput Correlation',
      'card.throughputcorr.sub': 'DL throughput vs RSRP correlation — identify RF vs non-RF bottlenecks',
      'card.siteview.title': 'Site-based View',
      'card.siteview.sub': 'KPIs grouped per site / eNodeB — identify problem sites',
      'card.pciconflict.title': 'PCI Mod-3 Conflict Analysis',
      'card.pciconflict.sub': 'Detect cells sharing PCI mod 3 — potential PSS collision during initial cell sync',

      'ai.status': 'Ready to analyze your drive test data',
      'ai.quickbar': 'Quick Analysis',
      'ai.chip.full': 'Full Report',
      'ai.chip.kpi': 'KPI Evaluation',
      'ai.chip.coverage': 'Coverage',
      'ai.chip.handover': 'Handover',
      'ai.chip.throughput': 'Throughput',
      'ai.chip.recommend': 'Recommendations',
      'ai.welcome.title': "Hi! I'm Caca, your AI Analyst",
      'ai.welcome.sub': 'Pick a quick analysis above or type a question about your RSRP, RSRQ, SNR, throughput, handover, and other LTE/5G parameters.',
      'ai.input.placeholder': 'Ask about the drive test data... (Enter to send, Shift+Enter for new line)',
    },
  };

  let currentLang = localStorage.getItem('cakra_lang') || 'id';

  function t(key) {
    return (DICT[currentLang] && DICT[currentLang][key]) || (DICT.id[key]) || key;
  }

  function apply() {
    document.documentElement.setAttribute('lang', currentLang);
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
    const btnId = document.getElementById('langBtnId');
    const btnEn = document.getElementById('langBtnEn');
    if (btnId) btnId.classList.toggle('active', currentLang === 'id');
    if (btnEn) btnEn.classList.toggle('active', currentLang === 'en');
  }

  function setLanguage(lang) {
    if (!DICT[lang]) return;
    currentLang = lang;
    localStorage.setItem('cakra_lang', lang);
    apply();
  }

  document.addEventListener('DOMContentLoaded', apply);

  return { setLanguage, t, get currentLang() { return currentLang; } };
})();
