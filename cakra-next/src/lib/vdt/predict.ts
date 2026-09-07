import type { VdtHandoverEvent, VdtPredictionPoint, VdtSite, VdtThresholds } from '@/lib/types';

export const DEFAULT_VDT_THRESHOLDS: VdtThresholds = {
  excellentRsrp: -80,
  serviceableRsrp: -100,
  weakRsrp: -110,
  handoverMarginDb: 3,
  handoverDwellSamples: 2,
};

const EARTH_KM = 6371;
const deg2rad = (d: number) => (d * Math.PI) / 180;
const rad2deg = (r: number) => (r * 180) / Math.PI;

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = deg2rad(bLat - aLat);
  const dLon = deg2rad(bLon - aLon);
  const la1 = deg2rad(aLat);
  const la2 = deg2rad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number) {
  const φ1 = deg2rad(aLat);
  const φ2 = deg2rad(bLat);
  const λ = deg2rad(bLon - aLon);
  const y = Math.sin(λ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ);
  return (rad2deg(Math.atan2(y, x)) + 360) % 360;
}

function angleDelta(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function sectorGain(site: VdtSite, bearing: number) {
  const delta = angleDelta(site.azimuth, bearing);
  return Math.max(-20, -Math.min(20, 12 * (delta / 65) ** 2));
}

function freeSpacePathLoss(freqMHz: number, distanceKmValue: number) {
  const d = Math.max(distanceKmValue, 0.03);
  return 32.45 + 20 * Math.log10(freqMHz) + 20 * Math.log10(d);
}

export function predictSiteRsrp(lat: number, lon: number, site: VdtSite) {
    const d = distanceKm(lat, lon, site.lat, site.lon);
    const bearing = bearingDeg(site.lat, site.lon, lat, lon);
    const fspl = freeSpacePathLoss(site.freqMHz, d);
    const penetrationLoss = d > 3 ? 8 : d > 1 ? 4 : 0;
    const heightGain = Math.min(8, Math.max(0, site.heightM - 15) * 0.14);
    const rsrp = site.txPowerDbm + site.gainDbi + sectorGain(site, bearing) + heightGain - fspl - penetrationLoss - 8;
    const los = d < 1.8 && angleDelta(site.azimuth, bearing) <= 60;
  return { rsrp: +rsrp.toFixed(1), los };
}

export function predictBestServer(lat: number, lon: number, sites: VdtSite[]): VdtPredictionPoint {
  const ranked = sites.map((site) => ({ site, ...predictSiteRsrp(lat, lon, site) })).sort((a, b) => b.rsrp - a.rsrp);
  const best = ranked[0];
  const runnerUp = ranked[1];
  return best ? {
    lat, lon, bestRsrp: best.rsrp, servingSite: best.site.name, servingSiteId: best.site.id,
    runnerUpSite: runnerUp?.site.name, runnerUpSiteId: runnerUp?.site.id, runnerUpRsrp: runnerUp?.rsrp, los: best.los,
  } : { lat, lon, bestRsrp: -140, servingSite: 'N/A', servingSiteId: '', los: false };
}

export function generateCoverageGrid(sites: VdtSite[], centerLat: number, centerLon: number, radiusKm = 3, rows = 25, cols = 25) {
  const latStep = (radiusKm / 111) * 2 / Math.max(rows - 1, 1);
  const lonScale = Math.cos(deg2rad(centerLat)) || 1;
  const lonStep = (radiusKm / (111 * lonScale)) * 2 / Math.max(cols - 1, 1);
  const output: VdtPredictionPoint[] = [];
  for (let y = 0; y < rows; y += 1) {
    const lat = centerLat - radiusKm / 111 + y * latStep;
    for (let x = 0; x < cols; x += 1) {
      const lon = centerLon - radiusKm / (111 * lonScale) + x * lonStep;
      output.push(predictBestServer(lat, lon, sites));
    }
  }
  return { points: output, rows, cols };
}

export function generateVirtualRoute(sites: VdtSite[], originLat: number, originLon: number, steps = 80, radiusKm = 2.4) {
  return Array.from({ length: Math.max(2, steps) }, (_, index) => {
    const t = index / Math.max(steps - 1, 1);
    const latOffset = Math.sin(t * Math.PI * 1.8) * radiusKm / 111;
    const lonOffset = (t - 0.5) * (radiusKm / 55.5);
    const lat = originLat + latOffset;
    const lon = originLon + lonOffset;
    return predictBestServer(lat, lon, sites);
  });
}

/** Predict the RF serving sector along an observed GPS trajectory. */
export function predictRouteAtCoordinates(sites: VdtSite[], coordinates: Array<{ lat: number; lon: number }>) {
  return coordinates.map((point) => predictBestServer(point.lat, point.lon, sites));
}

/**
 * Simulates A3-style handover decisions. A candidate must be stronger than the
 * serving sector by the configured margin for a number of consecutive samples.
 */
export function deriveVirtualHandovers(route: VdtPredictionPoint[], sites: VdtSite[], thresholds: VdtThresholds): VdtHandoverEvent[] {
  if (!route.length) return [];
  const byId = new Map(sites.map((site) => [site.id, site]));
  const events: VdtHandoverEvent[] = [];
  let servingId = route[0].servingSiteId;
  let candidateId = '';
  let candidateSamples = 0;
  route.slice(1).forEach((sample, offset) => {
    const sampleIndex = offset + 1;
    if (!servingId || sample.servingSiteId === servingId) {
      candidateId = '';
      candidateSamples = 0;
      return;
    }
    const serving = byId.get(servingId);
    const candidate = byId.get(sample.servingSiteId);
    if (!serving || !candidate) return;
    const fromRsrp = predictSiteRsrp(sample.lat, sample.lon, serving).rsrp;
    const gainDb = +(sample.bestRsrp - fromRsrp).toFixed(1);
    if (gainDb < thresholds.handoverMarginDb) {
      candidateId = '';
      candidateSamples = 0;
      return;
    }
    candidateSamples = candidateId === candidate.id ? candidateSamples + 1 : 1;
    candidateId = candidate.id;
    if (candidateSamples >= thresholds.handoverDwellSamples) {
      events.push({ id: `vho-${sampleIndex}-${candidate.id}`, sampleIndex, lat: sample.lat, lon: sample.lon, fromSite: serving.name, toSite: candidate.name, fromRsrp, toRsrp: sample.bestRsrp, gainDb });
      servingId = candidate.id;
      candidateId = '';
      candidateSamples = 0;
    }
  });
  return events;
}
