'use client';
import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { MapContainer, type VdtMapOverlay } from '@/components/map/MapContainer';
import { Vdt3DMap } from '@/components/vdt/Vdt3DMap';
import { useDriveTest } from '@/context/DriveTestContext';
import { DEFAULT_VDT_THRESHOLDS, deriveVirtualHandovers, generateCoverageGrid, generateVirtualRoute, predictRouteAtCoordinates } from '@/lib/vdt/predict';
import { downloadText, listVdtScenarios, saveVdtScenario } from '@/lib/vdt/scenario';
import type { DriveTestPoint, VdtScenario, VdtSite, VdtThresholds } from '@/lib/types';

const defaultSites: VdtSite[] = [
  { id: 'site-1', name: 'BTS-01 Sector 1', lat: -6.9175, lon: 107.6191, azimuth: 30, heightM: 30, gainDbi: 17, txPowerDbm: 43, freqMHz: 1800 },
  { id: 'site-2', name: 'BTS-02 Sector 1', lat: -6.9145, lon: 107.6231, azimuth: 210, heightM: 25, gainDbi: 17, txPowerDbm: 43, freqMHz: 1800 },
  { id: 'site-3', name: 'BTS-03 Sector 1', lat: -6.9221, lon: 107.6142, azimuth: 100, heightM: 28, gainDbi: 18, txPowerDbm: 43, freqMHz: 2100 },
];

const makeId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `vdt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const numberFields: { key: Exclude<keyof VdtSite, 'id' | 'name'>; label: string; step?: string }[] = [
  { key: 'lat', label: 'Latitude', step: '0.00001' }, { key: 'lon', label: 'Longitude', step: '0.00001' },
  { key: 'azimuth', label: 'Azimuth °' }, { key: 'heightM', label: 'Height m' }, { key: 'gainDbi', label: 'Gain dBi', step: '0.1' },
  { key: 'txPowerDbm', label: 'Tx power dBm', step: '0.1' }, { key: 'freqMHz', label: 'Frequency MHz' },
];

function toRoutePoint(point: ReturnType<typeof generateVirtualRoute>[number], index: number): DriveTestPoint {
  return { id: `vdt-${index}`, ts: new Date(index * 1000).toISOString(), lat: point.lat, lon: point.lon, speed: 40, rsrp: point.bestRsrp, rsrq: -10, snr: 10, dl: Math.max(0, (point.bestRsrp + 120) * 1500), ul: 2000, pci: null, cellname: point.servingSite, node: point.servingSite, cellid: point.servingSiteId, enodeb: point.servingSiteId, lacTac: 'VDT', arfcn: '', band: '', bw: 20, operator: 'SIM', tech: 'LTE', device: 'Virtual', nrRsrp: null, nrSinr: null, nrPci: null, nrBand: '', nrArfcn: '', nrDl: null, nrUl: null };
}

export default function VirtualDriveTestPage() {
  const { points } = useDriveTest();
  const [sites, setSites] = useState(defaultSites);
  const [sampleCount, setSampleCount] = useState(80);
  const [radiusKm, setRadiusKm] = useState(3);
  const [routeMode, setRouteMode] = useState<'virtual' | 'imported'>('virtual');
  const [thresholds, setThresholds] = useState<VdtThresholds>(DEFAULT_VDT_THRESHOLDS);
  const [playing, setPlaying] = useState(false);
  const [playback, setPlayback] = useState(0);
  const [scenarioName, setScenarioName] = useState('Bandung baseline');
  const [activeScenarioId, setActiveScenarioId] = useState('');
  const [savedScenarios, setSavedScenarios] = useState<VdtScenario[]>([]);

  const origin = points.find((point) => point.lat != null && point.lon != null);
  const centerLat = origin?.lat ?? sites[0]?.lat ?? -6.9175;
  const centerLon = origin?.lon ?? sites[0]?.lon ?? 107.6191;
  const importedCoordinates = useMemo(() => {
    const gps = points.flatMap((point) => point.lat != null && point.lon != null ? [{ lat: point.lat, lon: point.lon }] : []);
    if (gps.length <= sampleCount) return gps;
    const stride = Math.ceil(gps.length / sampleCount);
    return gps.filter((_, index) => index % stride === 0 || index === gps.length - 1);
  }, [points, sampleCount]);
  const grid = useMemo(() => generateCoverageGrid(sites, centerLat, centerLon, radiusKm, 25, 25), [sites, centerLat, centerLon, radiusKm]);
  const route = useMemo(() => routeMode === 'imported' && importedCoordinates.length > 1 ? predictRouteAtCoordinates(sites, importedCoordinates) : generateVirtualRoute(sites, centerLat, centerLon, sampleCount, radiusKm * 0.8), [routeMode, importedCoordinates, sites, centerLat, centerLon, sampleCount, radiusKm]);
  const handovers = useMemo(() => deriveVirtualHandovers(route, sites, thresholds), [route, sites, thresholds]);
  const currentIndex = Math.min(route.length - 1, Math.floor((playback / 100) * Math.max(route.length - 1, 0)));
  const current = route[currentIndex];
  const coverage = route.length ? route.filter((point) => point.bestRsrp >= thresholds.serviceableRsrp).length / route.length * 100 : 0;
  const avg = route.length ? route.reduce((sum, point) => sum + point.bestRsrp, 0) / route.length : 0;
  const routePoints = useMemo(() => route.map(toRoutePoint), [route]);
  const mapOverlay = useMemo<VdtMapOverlay>(() => ({ grid: grid.points, rows: grid.rows, cols: grid.cols, sites, thresholds, activeRouteIndex: currentIndex, handovers }), [grid, sites, thresholds, currentIndex, handovers]);

  useEffect(() => { setSavedScenarios(listVdtScenarios()); }, []);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setPlayback((value) => {
      const next = value + 100 / Math.max(route.length - 1, 1);
      if (next >= 100) { setPlaying(false); return 100; }
      return next;
    }), 90);
    return () => window.clearInterval(id);
  }, [playing, route.length]);

  function updateSite<K extends keyof VdtSite>(id: string, key: K, value: VdtSite[K]) {
    setSites((items) => items.map((site) => site.id === id ? { ...site, [key]: value } : site));
  }
  const addSite = () => setSites((items) => [...items, { id: makeId(), name: `BTS-${String(items.length + 1).padStart(2, '0')} Sector 1`, lat: centerLat, lon: centerLon, azimuth: 0, heightM: 25, gainDbi: 17, txPowerDbm: 43, freqMHz: 1800 }]);
  const removeSite = (id: string) => { if (sites.length > 1) setSites((items) => items.filter((site) => site.id !== id)); };
  const setThreshold = (key: keyof VdtThresholds, value: number) => setThresholds((items) => ({ ...items, [key]: value }));

  const snapshot = (): VdtScenario => ({ schemaVersion: 1, id: activeScenarioId || makeId(), name: scenarioName.trim() || 'Untitled scenario', savedAt: new Date().toISOString(), sites, radiusKm, sampleCount, thresholds });
  const saveScenario = () => {
    const scenario = snapshot();
    setActiveScenarioId(scenario.id);
    setScenarioName(scenario.name);
    setSavedScenarios(saveVdtScenario(scenario));
  };
  const loadScenario = (id: string) => {
    const scenario = savedScenarios.find((item) => item.id === id);
    if (!scenario) return;
    setActiveScenarioId(scenario.id); setScenarioName(scenario.name); setSites(scenario.sites); setRadiusKm(scenario.radiusKm); setSampleCount(scenario.sampleCount); setThresholds(scenario.thresholds); setPlayback(0); setPlaying(false);
  };
  const exportScenario = () => downloadText(`${scenarioName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'cakra-vdt'}.json`, JSON.stringify(snapshot(), null, 2), 'application/json');
  const exportTimeline = () => {
    const header = 'sample,from_site,to_site,from_rsrp_dbm,to_rsrp_dbm,gain_db,latitude,longitude';
    const rows = handovers.map((event) => [event.sampleIndex, event.fromSite, event.toSite, event.fromRsrp, event.toRsrp, event.gainDb, event.lat.toFixed(6), event.lon.toFixed(6)].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    downloadText(`${scenarioName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'cakra-vdt'}-handover.csv`, [header, ...rows].join('\n'), 'text/csv');
  };

  return <DashboardLayout><div className="mx-auto max-w-[1600px] space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-lg font-semibold">Virtual Drive Test</h1><div className="flex flex-wrap gap-2"><button onClick={saveScenario} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white">Save scenario</button><button onClick={exportScenario} className="rounded-lg border px-3 py-2 text-xs font-semibold">Export JSON</button><button onClick={exportTimeline} className="rounded-lg border px-3 py-2 text-xs font-semibold">Export handovers</button></div></div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card><CardHeader title="Scenario control"/><CardBody className="space-y-4">
          <label className="block text-xs font-medium">Scenario name<input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} className="mt-1 w-full rounded border bg-transparent px-2 py-1.5" /></label>
          <label className="block text-xs font-medium">Saved scenarios<select value={activeScenarioId} onChange={(event) => loadScenario(event.target.value)} className="mt-1 w-full rounded border bg-transparent px-2 py-1.5"><option value="">Current unsaved scenario</option>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name} · {new Date(scenario.savedAt).toLocaleDateString()}</option>)}</select></label>
          <label className="block text-xs">Simulation radius: <span className="font-mono">{radiusKm.toFixed(1)} km</span><input type="range" min="1" max="8" step="0.5" value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} className="mt-2 w-full" /></label>
          <label className="block text-xs">Playback samples: <span className="font-mono">{sampleCount}</span><input type="range" min="20" max="200" value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value))} className="mt-2 w-full" /></label>
          <label className="block text-xs font-medium">Route input<select value={routeMode} onChange={(event) => setRouteMode(event.target.value as 'virtual' | 'imported')} className="mt-1 w-full rounded border bg-transparent px-2 py-1.5"><option value="virtual">Generated virtual route</option><option value="imported" disabled={importedCoordinates.length < 2}>Imported GPS route ({importedCoordinates.length} samples)</option></select></label>
          <div className="grid grid-cols-2 gap-2"><button onClick={() => { setPlayback(0); setPlaying(true); }} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-zinc-950">{playing ? 'Restart' : 'Play route'}</button><button onClick={() => setPlaying(false)} className="rounded-lg border px-3 py-2 text-xs font-semibold">Pause</button></div>
        </CardBody></Card>
        <Card><CardHeader title="3GPP policy & handover"/><CardBody className="grid grid-cols-2 gap-3">{([{ key: 'excellentRsrp', label: 'Excellent RSRP' }, { key: 'serviceableRsrp', label: 'Serviceable RSRP' }, { key: 'weakRsrp', label: 'Weak RSRP' }, { key: 'handoverMarginDb', label: 'A3 margin dB' }, { key: 'handoverDwellSamples', label: 'Dwell samples' }] as { key: keyof VdtThresholds; label: string }[]).map((field) => <label key={field.key} className="text-[11px]">{field.label}<input type="number" step={field.key === 'handoverDwellSamples' ? 1 : 0.5} value={thresholds[field.key]} onChange={(event) => setThreshold(field.key, Number(event.target.value))} className="mt-1 w-full rounded border bg-transparent px-2 py-1.5 text-xs" /></label>)}</CardBody></Card>
        <Card><CardHeader title={`BTS / sector editor · ${sites.length}`}/><CardBody className="space-y-3"><button onClick={addSite} className="w-full rounded-lg border border-dashed px-3 py-2 text-xs font-semibold hover:border-sky-400">+ Add site / sector</button>{sites.map((site) => <div key={site.id} className="rounded-lg border p-3"><div className="flex gap-2"><input value={site.name} onChange={(event) => updateSite(site.id, 'name', event.target.value)} className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs font-semibold" /><button onClick={() => removeSite(site.id)} disabled={sites.length === 1} className="rounded border px-2 text-[10px] text-rose-500 disabled:opacity-30">Remove</button></div><div className="mt-2 grid grid-cols-2 gap-2">{numberFields.map((field) => <label key={field.key} className="text-[10px] text-slate-500">{field.label}<input type="number" step={field.step ?? 1} value={site[field.key]} onChange={(event) => updateSite(site.id, field.key, Number(event.target.value))} className="mt-0.5 w-full rounded border bg-transparent px-1.5 py-1 text-xs text-slate-900 dark:text-zinc-100" /></label>)}</div></div>)}</CardBody></Card>
      </div>
      <div className="space-y-4">
        <Card><CardHeader title="Peta coverage 3D" subtitle={routeMode === 'imported' ? 'Prediksi sepanjang rute GPS.' : 'Rute virtual, sector, coverage, dan handover.'}/><CardBody><Vdt3DMap points={grid.points} rows={grid.rows} cols={grid.cols} sites={sites} route={route} handovers={handovers} thresholds={thresholds} activeRouteIndex={currentIndex} /></CardBody></Card>
        <Card><CardHeader title="Predicted RF heatmap & virtual route" subtitle="Leaflet map: geographic cells, sector locations, route, and A3 handovers."/><CardBody><MapContainer points={routePoints} height={460} vdt={mapOverlay} /></CardBody></Card>
        <Card><CardHeader title="RINGKASAN PREDIKSI"/><CardBody><div className="grid grid-cols-2 gap-2 md:grid-cols-6">{[['Avg best RSRP', `${avg.toFixed(1)} dBm`], [`Coverage ≥ ${thresholds.serviceableRsrp}`, `${coverage.toFixed(1)}%`], ['Sites / sectors', sites.length], ['Grid cells', grid.points.length], ['Handovers', handovers.length], ['Route', routeMode === 'imported' ? 'Imported GPS' : 'Virtual']].map(([key, value]) => <div key={key} className="rounded-lg border p-3"><div className="text-[10px] uppercase text-slate-400">{key}</div><div className="mt-1 font-mono text-base font-semibold">{value}</div></div>)}</div></CardBody></Card>
        <Card><CardHeader title={`Simulated handover timeline · ${handovers.length}`}/><CardBody>{handovers.length ? <div className="divide-y rounded-lg border text-xs">{handovers.map((event) => <div key={event.id} className="grid grid-cols-[70px_1fr_auto] gap-2 p-2"><span className="font-mono text-slate-500">Sample {event.sampleIndex + 1}</span><span className="min-w-0 truncate">{event.fromSite} <span className="text-violet-500">→</span> {event.toSite}</span><span className="font-mono">+{event.gainDb} dB</span></div>)}</div> : <p className="text-sm text-slate-500">Tidak ada handover yang memenuhi A3 margin dan dwell-time pada skenario ini.</p>}<div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-zinc-900"><div className="font-semibold">Current virtual sample</div><div className="mt-1 font-mono">{current ? `${current.bestRsrp.toFixed(1)} dBm · ${current.servingSite}` : 'No route samples'}</div><div className="text-slate-500">Step {currentIndex + 1}/{route.length}</div></div></CardBody></Card>
      </div>
    </div>
  </div></DashboardLayout>;
}
