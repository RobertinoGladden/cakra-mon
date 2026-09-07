'use client';
import { useEffect, useRef, useState } from 'react';
import type { VdtHandoverEvent, VdtPredictionPoint, VdtSite, VdtThresholds } from '@/lib/types';

declare global { interface Window { maplibregl?: any } }

const SCRIPT_ID = 'maplibre-gl-js';
const CSS_ID = 'maplibre-gl-css';
const COVERAGE_SOURCE = 'cakra-vdt-coverage';
const ROUTE_SOURCE = 'cakra-vdt-route';
const SITE_SOURCE = 'cakra-vdt-sites';
const SECTOR_SOURCE = 'cakra-vdt-sectors';
const HANDOVER_SOURCE = 'cakra-vdt-handovers';
const ACTIVE_SOURCE = 'cakra-vdt-active';

let mapLibrePromise: Promise<any> | null = null;
function loadMapLibre() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (!mapLibrePromise) {
    mapLibrePromise = new Promise((resolve, reject) => {
      const css = document.getElementById(CSS_ID) || Object.assign(document.createElement('link'), { id: CSS_ID, rel: 'stylesheet', href: '/vendor/maplibre-gl.css' });
      if (!css.parentNode) document.head.appendChild(css);
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = '/vendor/maplibre-gl.js';
      script.onload = () => resolve(window.maplibregl);
      script.onerror = () => reject(new Error('MapLibre GL failed to load'));
      document.body.appendChild(script);
    });
  }
  return mapLibrePromise;
}

type Position = [number, number];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const coverageColor = (rsrp: number, thresholds: VdtThresholds) => rsrp >= thresholds.excellentRsrp ? '#10b981' : rsrp >= thresholds.serviceableRsrp ? '#eab308' : rsrp >= thresholds.weakRsrp ? '#f97316' : '#ef4444';
const rsrpHeight = (rsrp: number) => Math.round(clamp((rsrp + 125) * 3.2, 6, 190));

function cellPolygon(point: VdtPredictionPoint, latHalf: number, lonHalf: number) {
  return [[point.lon - lonHalf, point.lat - latHalf], [point.lon + lonHalf, point.lat - latHalf], [point.lon + lonHalf, point.lat + latHalf], [point.lon - lonHalf, point.lat + latHalf], [point.lon - lonHalf, point.lat - latHalf]];
}

function bearingDestination(lat: number, lon: number, bearing: number, km: number): Position {
  const rad = bearing * Math.PI / 180;
  return [lon + Math.sin(rad) * km / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.1)), lat + Math.cos(rad) * km / 111];
}

function scenarioGeoJson(points: VdtPredictionPoint[], rows: number, cols: number, sites: VdtSite[], route: VdtPredictionPoint[], handovers: VdtHandoverEvent[], thresholds: VdtThresholds, activeIndex: number) {
  const latHalf = rows > 1 ? Math.abs((points[cols]?.lat ?? points[0]?.lat ?? 0) - (points[0]?.lat ?? 0)) / 2 : 0.0005;
  const lonHalf = cols > 1 ? Math.abs((points[1]?.lon ?? points[0]?.lon ?? 0) - (points[0]?.lon ?? 0)) / 2 : 0.0005;
  return {
    coverage: { type: 'FeatureCollection', features: points.map((point, index) => ({ type: 'Feature', id: `cell-${index}`, properties: { rsrp: point.bestRsrp, site: point.servingSite, color: coverageColor(point.bestRsrp, thresholds), height: rsrpHeight(point.bestRsrp), los: point.los ? 'LOS' : 'NLOS' }, geometry: { type: 'Polygon', coordinates: [cellPolygon(point, latHalf, lonHalf)] } })) },
    sites: { type: 'FeatureCollection', features: sites.map((site) => ({ type: 'Feature', id: site.id, properties: { name: site.name, freq: site.freqMHz, power: site.txPowerDbm, height: site.heightM }, geometry: { type: 'Point', coordinates: [site.lon, site.lat] } })) },
    sectors: { type: 'FeatureCollection', features: sites.map((site) => ({ type: 'Feature', id: `sector-${site.id}`, properties: { name: site.name }, geometry: { type: 'Polygon', coordinates: [[[site.lon, site.lat], bearingDestination(site.lat, site.lon, site.azimuth - 32, 0.65), bearingDestination(site.lat, site.lon, site.azimuth, 1.4), bearingDestination(site.lat, site.lon, site.azimuth + 32, 0.65), [site.lon, site.lat]]] } })) },
    route: { type: 'FeatureCollection', features: route.slice(1).map((point, index) => ({ type: 'Feature', properties: { color: coverageColor((route[index].bestRsrp + point.bestRsrp) / 2, thresholds) }, geometry: { type: 'LineString', coordinates: [[route[index].lon, route[index].lat], [point.lon, point.lat]] } })) },
    handovers: { type: 'FeatureCollection', features: handovers.map((event) => ({ type: 'Feature', id: event.id, properties: { from: event.fromSite, to: event.toSite, gain: event.gainDb }, geometry: { type: 'Point', coordinates: [event.lon, event.lat] } })) },
    active: { type: 'FeatureCollection', features: route[activeIndex] ? [{ type: 'Feature', properties: { site: route[activeIndex].servingSite, rsrp: route[activeIndex].bestRsrp }, geometry: { type: 'Point', coordinates: [route[activeIndex].lon, route[activeIndex].lat] } }] : [] },
  };
}

function setSourceData(map: any, id: string, data: unknown) {
  const source = map.getSource(id);
  if (source) source.setData(data);
  else map.addSource(id, { type: 'geojson', data });
}

export function Vdt3DMap({ points, rows, cols, sites, route, handovers, thresholds, activeRouteIndex, height = 620, styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/bright' }: { points: VdtPredictionPoint[]; rows: number; cols: number; sites: VdtSite[]; route: VdtPredictionPoint[]; handovers: VdtHandoverEvent[]; thresholds: VdtThresholds; activeRouteIndex: number; height?: number; styleUrl?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [showCoverage, setShowCoverage] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [coverageOpacity, setCoverageOpacity] = useState(0.64);
  const [selected, setSelected] = useState('Click a coverage column, site, or handover for detail.');
  const latest = useRef({ points, rows, cols, sites, route, handovers, thresholds, activeRouteIndex, showCoverage, showBuildings, coverageOpacity });
  latest.current = { points, rows, cols, sites, route, handovers, thresholds, activeRouteIndex, showCoverage, showBuildings, coverageOpacity };

  const syncScenario = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const state = latest.current;
    const data = scenarioGeoJson(state.points, state.rows, state.cols, state.sites, state.route, state.handovers, state.thresholds, state.activeRouteIndex);
    setSourceData(map, COVERAGE_SOURCE, data.coverage);
    setSourceData(map, ROUTE_SOURCE, data.route);
    setSourceData(map, SITE_SOURCE, data.sites);
    setSourceData(map, SECTOR_SOURCE, data.sectors);
    setSourceData(map, HANDOVER_SOURCE, data.handovers);
    setSourceData(map, ACTIVE_SOURCE, data.active);
    const add = (layer: any, before?: string) => { if (!map.getLayer(layer.id)) map.addLayer(layer, before); };
    add({ id: 'cakra-vdt-coverage', type: 'fill-extrusion', source: COVERAGE_SOURCE, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': state.coverageOpacity } });
    add({ id: 'cakra-vdt-sector', type: 'fill', source: SECTOR_SOURCE, paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.12 } });
    add({ id: 'cakra-vdt-sector-line', type: 'line', source: SECTOR_SOURCE, paint: { 'line-color': '#38bdf8', 'line-width': 1.5, 'line-opacity': 0.85 } });
    add({ id: 'cakra-vdt-route', type: 'line', source: ROUTE_SOURCE, paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.95 } });
    add({ id: 'cakra-vdt-sites', type: 'circle', source: SITE_SOURCE, paint: { 'circle-radius': 7, 'circle-color': '#0ea5e9', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    add({ id: 'cakra-vdt-handovers', type: 'circle', source: HANDOVER_SOURCE, paint: { 'circle-radius': 6, 'circle-color': '#a855f7', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    add({ id: 'cakra-vdt-active', type: 'circle', source: ACTIVE_SOURCE, paint: { 'circle-radius': 10, 'circle-color': '#0284c7', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
    const styleLayers = map.getStyle().layers || [];
    const building = styleLayers.find((layer: any) => layer['source-layer'] === 'building' && layer.source);
    if (building && !map.getLayer('cakra-vdt-buildings')) {
      try { map.addLayer({ id: 'cakra-vdt-buildings', type: 'fill-extrusion', source: building.source, 'source-layer': 'building', paint: { 'fill-extrusion-color': '#64748b', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0], 'fill-extrusion-opacity': 0.72 } }); } catch { /* Style has no compatible building attributes. */ }
    }
    ['cakra-vdt-coverage', 'cakra-vdt-sector', 'cakra-vdt-sector-line'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', state.showCoverage ? 'visible' : 'none'); });
    if (map.getLayer('cakra-vdt-buildings')) map.setLayoutProperty('cakra-vdt-buildings', 'visibility', state.showBuildings ? 'visible' : 'none');
    if (map.getLayer('cakra-vdt-coverage')) map.setPaintProperty('cakra-vdt-coverage', 'fill-extrusion-opacity', state.coverageOpacity);
  };

  useEffect(() => {
    let disposed = false;
    loadMapLibre().then((maplibregl) => {
      if (disposed || !maplibregl || !containerRef.current) return;
      const center: Position = [sites[0]?.lon ?? 107.6191, sites[0]?.lat ?? -6.9175];
      const map = new maplibregl.Map({ container: containerRef.current, style: styleUrl, center, zoom: 14, pitch: 55, bearing: -20, antialias: true, attributionControl: true });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.FullscreenControl(), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
      map.on('load', () => { if (!disposed) { syncScenario(); setReady(true); } });
      map.on('click', (event: any) => {
        const features = map.queryRenderedFeatures(event.point, { layers: ['cakra-vdt-coverage', 'cakra-vdt-sites', 'cakra-vdt-handovers'] });
        const feature = features[0];
        if (!feature) return;
        if (feature.layer.id === 'cakra-vdt-coverage') setSelected(`${feature.properties.site} · ${feature.properties.rsrp} dBm · ${feature.properties.los}`);
        if (feature.layer.id === 'cakra-vdt-sites') setSelected(`${feature.properties.name} · ${feature.properties.freq} MHz · ${feature.properties.power} dBm · tower ${feature.properties.height} m`);
        if (feature.layer.id === 'cakra-vdt-handovers') setSelected(`Handover: ${feature.properties.from} → ${feature.properties.to} · +${feature.properties.gain} dB`);
      });
      map.on('error', (event: any) => { if (!disposed && event?.error) setError('Peta tidak dapat dimuat. Periksa koneksi lalu coba lagi.'); });
    }).catch(() => { if (!disposed) setError('MapLibre GL could not be initialized.'); });
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; };
  // The engine intentionally initializes once; scenario changes are synchronized below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { syncScenario(); }, [points, rows, cols, sites, route, handovers, thresholds, activeRouteIndex, showCoverage, showBuildings, coverageOpacity]);

  return <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-zinc-800" style={{ height }}>
    <div ref={containerRef} className="absolute inset-0" aria-label="Interactive 3D RF map" />
    <div className="absolute left-3 top-3 z-10 max-w-[min(320px,calc(100%-24px))] rounded-lg bg-white/95 p-3 text-xs shadow-lg backdrop-blur dark:bg-zinc-950/95">
      <div className="font-semibold">Peta coverage 3D</div><p className="mt-1 text-[11px] text-slate-500">Geser untuk rotasi · klik kanan untuk pan · scroll untuk zoom · klik objek untuk detail.</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1"><label className="flex items-center gap-1"><input type="checkbox" checked={showCoverage} onChange={(event) => setShowCoverage(event.target.checked)} /> Coverage</label><label className="flex items-center gap-1"><input type="checkbox" checked={showBuildings} onChange={(event) => setShowBuildings(event.target.checked)} /> Buildings</label></div>
      <label className="mt-2 block text-[11px]">Coverage opacity <span className="font-mono">{Math.round(coverageOpacity * 100)}%</span><input className="mt-1 w-full" type="range" min="0.15" max="0.9" step="0.05" value={coverageOpacity} onChange={(event) => setCoverageOpacity(Number(event.target.value))} /></label>
      <div className="mt-2 border-t pt-2 text-[11px] text-slate-600 dark:text-zinc-300">{selected}</div>
    </div>
    {!ready && !error && <div className="absolute inset-0 grid place-items-center bg-slate-950/80 text-xs font-mono text-slate-200">MEMUAT PETA 3D…</div>}
    {error && <div className="absolute inset-0 grid place-items-center bg-slate-950/90 p-6 text-center text-sm text-rose-200">{error}</div>}
  </div>;
}
