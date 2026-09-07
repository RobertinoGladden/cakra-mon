export interface Dictionary {
  nav: {
    overview: string;
    graphics: string;
    mapEvents: string;
    rfAnalysis: string;
    vdt: string;
    about: string;
    uploadNew: string;
  };
  topbar: {
    dataPoints: string;
    quickActions: string;
  };
  common: {
    search: string;
    export: string;
    filter: string;
    loading: string;
    noData: string;
    prev: string;
    next: string;
    of: string;
    min: string;
    max: string;
    avg: string;
    status: {
      excellent: string;
      good: string;
      normal: string;
      poor: string;
      critical: string;
    };
  };
  overview: {
    title: string;
    subtitle: string;
    sessionInfo: string;
    servingCell: string;
    kpiSummary: string;
    quickTools: string;
    date: string;
    duration: string;
    operator: string;
    dataPoints: string;
    avgSpeed: string;
    device: string;
    enodeb: string;
    cellId: string;
    lacTac: string;
    lteArfcn: string;
    band: string;
    bandwidth: string;
    dominantCell: string;
    uniqueCells: string;
    lastSignal: string;
    vehicleSpeed: string;
    healthCheck: string;
    thresholdRef: string;
    quickActionsPanel: string;
  };
  graphics: {
    title: string;
    subtitle: string;
    chartTitle: string;
    distTitle: string;
    standardTitle: string;
  };
  mapEvents: {
    title: string;
    subtitle: string;
    mapTitle: string;
    layers: string;
    eventsTab: string;
    weakPointsTab: string;
    mapLoading: string;
  };
  rfAnalysis: {
    title: string;
    subtitle: string;
    coverageGap: string;
    cellChurn: string;
    throughput: string;
    pciConflict: string;
  };
  vdt: {
    title: string;
    subtitle: string;
    steps: {
      scenario: string;
      antenna: string;
      prediction: string;
      drive: string;
      validation: string;
    };
    summary: string;
    siteList: string;
  };
}

export const dictionary: Record<'en' | 'id', Dictionary> = {
  en: {
    nav: {
      overview: 'Overview',
      graphics: 'Graphics & Distribution',
      mapEvents: 'Map & Events',
      rfAnalysis: 'Advanced RF Analysis',
      vdt: 'Virtual Drive Test',
      about: 'About Cakra',
      uploadNew: 'Upload New File',
    },
    topbar: {
      dataPoints: 'data points',
      quickActions: 'Quick actions',
    },
    common: {
      search: 'Search',
      export: 'Export',
      filter: 'Filter',
      loading: 'Loading…',
      noData: 'No data available',
      prev: 'Previous',
      next: 'Next',
      of: 'of',
      min: 'Min',
      max: 'Max',
      avg: 'Avg',
      status: {
        excellent: 'Excellent',
        good: 'Good',
        normal: 'Normal',
        poor: 'Poor',
        critical: 'Critical',
      },
    },
    overview: {
      title: 'Overview',
      subtitle: 'Drive test session summary',
      sessionInfo: 'Session Info',
      servingCell: 'Data Serving Cell',
      kpiSummary: 'KPI Summary',
      quickTools: 'Quick Tools',
      date: 'Date',
      duration: 'Duration',
      operator: 'Operator',
      dataPoints: 'Data Points',
      avgSpeed: 'Avg Speed',
      device: 'Device Model',
      enodeb: 'eNodeB (Node)',
      cellId: 'Cell ID',
      lacTac: 'LAC / TAC',
      lteArfcn: 'LTE ARFCN',
      band: 'Band',
      bandwidth: 'Bandwidth',
      dominantCell: 'Dominant Cell',
      uniqueCells: 'Unique Cells',
      lastSignal: 'Last Signal',
      vehicleSpeed: 'Vehicle Speed',
      healthCheck: 'Health Check',
      thresholdRef: '3GPP Threshold Reference',
      quickActionsPanel: 'Quick Actions',
    },
    graphics: {
      title: 'Graphics & Distribution',
      subtitle: 'Time-series parameters and data distribution',
      chartTitle: 'Parameter Chart',
      distTitle: 'Distribution',
      standardTitle: '3GPP Standard Reference',
    },
    mapEvents: {
      title: 'Map & Events',
      subtitle: 'Geographic visualization, handovers, and weak points',
      mapTitle: 'Signal Map',
      layers: 'Layers',
      eventsTab: 'Handover & Reselection',
      weakPointsTab: 'Weak Signal Points',
      mapLoading: 'INITIALIZING RF MAP ENGINE...',
    },
    rfAnalysis: {
      title: 'Advanced RF Analysis',
      subtitle: 'Coverage gap, cell churn, throughput correlation, PCI conflicts',
      coverageGap: 'Coverage Gap Detection',
      cellChurn: 'Cell Churn & Handover Instability',
      throughput: 'Throughput Correlation',
      pciConflict: 'PCI Mod-3 Conflict Analysis',
    },
    vdt: {
      title: 'Virtual Drive Test',
      subtitle: 'Simulate coverage before going to the field',
      steps: {
        scenario: 'Scenario & Site',
        antenna: 'Antenna & Radio',
        prediction: 'Coverage Prediction',
        drive: 'Virtual Drive',
        validation: 'Validation',
      },
      summary: 'Prediction Summary',
      siteList: 'Site List',
    },
  },
  id: {
    nav: {
      overview: 'Ringkasan',
      graphics: 'Grafik & Distribusi',
      mapEvents: 'Peta & Events',
      rfAnalysis: 'Analisis RF Lanjutan',
      vdt: 'Virtual Drive Test',
      about: 'Tentang Cakra',
      uploadNew: 'Upload File Baru',
    },
    topbar: {
      dataPoints: 'data point',
      quickActions: 'Aksi cepat',
    },
    common: {
      search: 'Cari',
      export: 'Ekspor',
      filter: 'Filter',
      loading: 'Memuat…',
      noData: 'Tidak ada data',
      prev: 'Sebelumnya',
      next: 'Berikutnya',
      of: 'dari',
      min: 'Min',
      max: 'Maks',
      avg: 'Rata-rata',
      status: {
        excellent: 'Sangat Baik',
        good: 'Baik',
        normal: 'Normal',
        poor: 'Buruk',
        critical: 'Kritis',
      },
    },
    overview: {
      title: 'Ringkasan',
      subtitle: 'Ringkasan sesi drive test',
      sessionInfo: 'Informasi Sesi',
      servingCell: 'Data Serving Cell',
      kpiSummary: 'Ringkasan KPI',
      quickTools: 'Quick Tools',
      date: 'Tanggal',
      duration: 'Durasi',
      operator: 'Operator',
      dataPoints: 'Data Point',
      avgSpeed: 'Kec. Rata-rata',
      device: 'Model Perangkat',
      enodeb: 'eNodeB (Node)',
      cellId: 'Cell ID',
      lacTac: 'LAC / TAC',
      lteArfcn: 'LTE ARFCN',
      band: 'Band',
      bandwidth: 'Bandwidth',
      dominantCell: 'Dominant Cell',
      uniqueCells: 'Unique Cells',
      lastSignal: 'Sinyal Terakhir',
      vehicleSpeed: 'Kecepatan Kendaraan',
      healthCheck: 'Health Check',
      thresholdRef: 'Referensi Threshold 3GPP',
      quickActionsPanel: 'Quick Actions',
    },
    graphics: {
      title: 'Grafik & Distribusi',
      subtitle: 'Parameter time-series dan sebaran data',
      chartTitle: 'Grafik Parameter',
      distTitle: 'Distribusi',
      standardTitle: 'Referensi Standar 3GPP',
    },
    mapEvents: {
      title: 'Peta & Events',
      subtitle: 'Visualisasi geografis, handover, dan titik rawan',
      mapTitle: 'Peta Sinyal',
      layers: 'Layer',
      eventsTab: 'Handover & Reselection',
      weakPointsTab: 'Titik Sinyal Rawan',
      mapLoading: 'MENYIAPKAN RF MAP ENGINE...',
    },
    rfAnalysis: {
      title: 'Analisis RF Lanjutan',
      subtitle: 'Coverage gap, cell churn, korelasi throughput, konflik PCI',
      coverageGap: 'Coverage Gap Detection',
      cellChurn: 'Cell Churn & Instabilitas Handover',
      throughput: 'Korelasi Throughput',
      pciConflict: 'Analisis Konflik PCI Mod-3',
    },
    vdt: {
      title: 'Virtual Drive Test',
      subtitle: 'Simulasikan coverage sebelum turun ke lapangan',
      steps: {
        scenario: 'Skenario & Site',
        antenna: 'Antenna & Radio',
        prediction: 'Prediksi Coverage',
        drive: 'Virtual Drive',
        validation: 'Validasi',
      },
      summary: 'Ringkasan Prediksi',
      siteList: 'Daftar Site',
    },
  },
};

export type Locale = 'en' | 'id';
