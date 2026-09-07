export type SignalStatus = 'excellent' | 'good' | 'normal' | 'poor' | 'critical';

export interface DriveTestPoint {
  id: string;
  ts: string;
  lat: number | null;
  lon: number | null;
  speed: number;
  rsrp: number;
  rsrq: number;
  snr: number;
  dl: number;
  ul: number;
  pci: number | null;
  cellname: string;
  node: string;
  cellid: string;
  enodeb: string;
  lacTac: string;
  arfcn: string;
  band: string;
  bw: number;
  operator: string;
  tech: string;
  device: string;
  cgi?: string;
  nrRsrp: number | null;
  nrSinr: number | null;
  nrPci: number | null;
  nrBand: string;
  nrArfcn: string;
  nrDl: number | null;
  nrUl: number | null;
}

export interface DriveTestEvent {
  id: string;
  type: 'HANDOVER' | 'CELL_RESELECTION' | 'OTHER';
  timestamp: string;
  fromCell: string;
  toCell: string;
  rsrp: number;
  rsrq: number;
  snr: number;
  lat: number | null;
  lon: number | null;
  isPingPong: boolean;
}

export interface SessionInfo {
  filename: string;
  date: string;
  timeRange: string;
  durationLabel: string;
  operator: string;
  technology: string;
  totalDataPoints: number;
  gpsValidPoints: number;
  avgSpeedKmh: number;
  deviceModel: string;
}

export interface DatasetMetadata {
  source: string;
  fileCount: number;
  parser: 'GNET' | 'TEMS' | 'NEMO' | 'SIGMON' | 'CSV' | 'KML';
  parsedAt: string;
  rejectedRows: number;
}

export interface ServingCellInfo {
  enodeb: string;
  cellId: string;
  lacTac: string;
  lteArfcn: string;
  band: string;
  bandwidthMHz: number;
  dominantCell: string;
  dominantCellPoints: number;
  uniqueCells: number;
}

export interface KpiSummary {
  key: 'rsrp' | 'rsrq' | 'snr';
  label: string;
  unit: string;
  value: number;
  status: SignalStatus;
  min: number;
  max: number;
  sparkline: number[];
}

export interface CoverageGapSegment {
  id: string;
  startTs: string;
  endTs: string;
  durationSec: number;
  avgRsrp: number;
  minRsrp: number;
  points: number;
  cell: string;
  lat: number | null;
  lon: number | null;
}

export interface CellChurnPoint {
  cellName: string;
  frequency: number;
  pct: number;
}

export interface ThroughputBin {
  category: string;
  avgDlMbps: number;
  points: number;
}

export interface PciConflictPair {
  id: string;
  cellA: string;
  pciA: number;
  cellB: string;
  pciB: number;
  mod3: number;
  coObserved: number;
}

export interface VdtSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  azimuth: number;
  heightM: number;
  gainDbi: number;
  txPowerDbm: number;
  freqMHz: number;
}

/** RF thresholds are scenario inputs, rather than fixed presentation colours. */
export interface VdtThresholds {
  excellentRsrp: number;
  serviceableRsrp: number;
  weakRsrp: number;
  handoverMarginDb: number;
  handoverDwellSamples: number;
}

export interface VdtScenario {
  schemaVersion: 1;
  id: string;
  name: string;
  savedAt: string;
  sites: VdtSite[];
  radiusKm: number;
  sampleCount: number;
  thresholds: VdtThresholds;
}

export interface VdtHandoverEvent {
  id: string;
  sampleIndex: number;
  lat: number;
  lon: number;
  fromSite: string;
  toSite: string;
  fromRsrp: number;
  toRsrp: number;
  gainDb: number;
}

export interface VdtPredictionPoint {
  lat: number;
  lon: number;
  bestRsrp: number;
  servingSite: string;
  servingSiteId: string;
  runnerUpSite?: string;
  runnerUpSiteId?: string;
  runnerUpRsrp?: number;
  los: boolean;
}
