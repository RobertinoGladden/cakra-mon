'use client';
import { useEffect, useRef, useState } from 'react';
import type { DriveTestPoint, VdtHandoverEvent, VdtPredictionPoint, VdtSite, VdtThresholds } from '@/lib/types';
import { MapSkeleton } from '@/components/ui/MapSkeleton';

declare global { interface Window { L?: any } }

export interface VdtMapOverlay {
  grid: VdtPredictionPoint[];
  rows: number;
  cols: number;
  sites: VdtSite[];
  thresholds: VdtThresholds;
  activeRouteIndex?: number;
  handovers?: VdtHandoverEvent[];
}

let leafletPromise: Promise<any> | null = null;
function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.getElementById('leaflet-css') || Object.assign(document.createElement('link'), { id: 'leaflet-css', rel: 'stylesheet', href: '/vendor/leaflet.min.css' });
      if (!css.parentNode) document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = '/vendor/leaflet.min.js';
      script.onload = () => resolve(window.L);
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }
  return leafletPromise;
}

const signalColor = (rsrp: number) => rsrp > -80 ? '#10b981' : rsrp > -90 ? '#22c55e' : rsrp > -100 ? '#f59e0b' : rsrp > -110 ? '#f97316' : '#ef4444';
const vdtColor = (rsrp: number, thresholds: VdtThresholds) => rsrp >= thresholds.excellentRsrp ? '#10b981' : rsrp >= thresholds.serviceableRsrp ? '#f59e0b' : rsrp >= thresholds.weakRsrp ? '#f97316' : '#ef4444';
const validPoint = (p: DriveTestPoint) => p.lat != null && p.lon != null;

function drawPredictionHeatmap(L: any, map: any, overlay: VdtMapOverlay) {
  const { grid, rows, cols, thresholds } = overlay;
  if (!grid.length) return;
  const latStep = rows > 1 ? Math.abs(grid[cols]?.lat - grid[0].lat) : 0.001;
  const lonStep = cols > 1 ? Math.abs(grid[1]?.lon - grid[0].lon) : 0.001;
  grid.forEach((point) => {
    L.rectangle([[point.lat - latStep / 2, point.lon - lonStep / 2], [point.lat + latStep / 2, point.lon + lonStep / 2]], {
      stroke: false, fillColor: vdtColor(point.bestRsrp, thresholds), fillOpacity: 0.42, interactive: false,
    }).addTo(map);
  });
  overlay.sites.forEach((site) => {
    const marker = L.circleMarker([site.lat, site.lon], { radius: 7, color: '#0f172a', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 });
    marker.bindPopup(`<div style="font:11px ui-monospace,monospace"><b>${site.name}</b><br/>${site.freqMHz} MHz · ${site.txPowerDbm} dBm<br/>Azimuth ${site.azimuth}° · Gain ${site.gainDbi} dBi</div>`);
    marker.addTo(map);
  });
  overlay.handovers?.forEach((event) => {
    const marker = L.circleMarker([event.lat, event.lon], { radius: 5, color: '#7c3aed', weight: 2, fillColor: '#fff', fillOpacity: 1 });
    marker.bindPopup(`<div style="font:11px ui-monospace,monospace"><b>SIMULATED HANDOVER</b><br/>${event.fromSite} → ${event.toSite}<br/>${event.fromRsrp} → ${event.toRsrp} dBm (+${event.gainDb} dB)</div>`);
    marker.addTo(map);
  });
}

export function MapContainer({ points, height = 520, vdt }: { points: DriveTestPoint[]; height?: number; vdt?: VdtMapOverlay }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const legend = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setReady(false);
        const L = await loadLeaflet();
        if (disposed || !L || !el.current) return;
        if (!map.current) map.current = L.map(el.current, { zoomControl: true, preferCanvas: true });
        const m = map.current;
        if (legend.current) { legend.current.remove(); legend.current = null; }
        m.eachLayer((layer: any) => m.removeLayer(layer));
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(m);
        if (vdt) drawPredictionHeatmap(L, m, vdt);

        const valid = points.filter(validPoint);
        if (!valid.length) {
          const fallback = vdt?.sites[0];
          m.setView(fallback ? [fallback.lat, fallback.lon] : [-6.9175, 107.6191], 12);
          setReady(true);
          return;
        }
        const bounds = L.latLngBounds(valid.map((point) => [point.lat!, point.lon!]));
        if (vdt?.grid.length) bounds.extend(vdt.grid.map((point) => [point.lat, point.lon]));
        m.fitBounds(bounds.pad(0.08), { maxZoom: 16 });
        for (let index = 1; index < valid.length; index += 1) {
          const a = valid[index - 1]; const b = valid[index];
          L.polyline([[a.lat!, a.lon!], [b.lat!, b.lon!]], { weight: 4, opacity: 0.8, color: signalColor((a.rsrp + b.rsrp) / 2) }).addTo(m);
        }
        valid.forEach((point, index) => {
          const weak = point.rsrp <= -100;
          const marker = L.circleMarker([point.lat!, point.lon!], { radius: weak ? 5 : 2.5, weight: weak ? 2 : 1, color: signalColor(point.rsrp), fillColor: signalColor(point.rsrp), fillOpacity: 0.9 });
          marker.bindPopup(`<div style="font:11px ui-monospace,monospace"><b>${weak ? 'WEAK SPOT' : 'DRIVE TEST SAMPLE'}</b><br/>RSRP ${point.rsrp} dBm<br/>RSRQ ${point.rsrq} dB · SNR ${point.snr} dB<br/>${point.cellname || point.cellid || 'Cell n/a'}<br/>${point.ts}</div>`);
          marker.addTo(m);
          if (index === 0 && valid.length === 1) marker.openPopup();
        });
        if (vdt?.activeRouteIndex != null && valid[vdt.activeRouteIndex]) {
          const active = valid[vdt.activeRouteIndex];
          L.circleMarker([active.lat!, active.lon!], { radius: 9, color: '#fff', weight: 3, fillColor: '#0284c7', fillOpacity: 1 }).addTo(m);
        }
        const control = L.control({ position: 'bottomright' });
        control.onAdd = () => {
          const div = L.DomUtil.create('div');
          div.style.cssText = 'background:white;padding:8px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.18);font:10px ui-monospace,monospace';
          div.innerHTML = vdt ? `<b>VDT RSRP</b><br/><span style="color:#10b981">●</span> ≥ ${vdt.thresholds.excellentRsrp}<br/><span style="color:#f59e0b">●</span> ≥ ${vdt.thresholds.serviceableRsrp}<br/><span style="color:#f97316">●</span> ≥ ${vdt.thresholds.weakRsrp}<br/><span style="color:#ef4444">●</span> weak` : '<b>RSRP</b><br/><span style="color:#10b981">●</span> > -80<br/><span style="color:#22c55e">●</span> -80…-90<br/><span style="color:#f59e0b">●</span> -90…-100<br/><span style="color:#f97316">●</span> -100…-110<br/><span style="color:#ef4444">●</span> ≤ -110';
          return div;
        };
        control.addTo(m);
        legend.current = control;
        m.invalidateSize();
        setReady(true);
      } catch { if (!disposed) setReady(false); }
    })();
    return () => { disposed = true; };
  }, [points, vdt]);

  return <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-800" style={{ height }}><div ref={el} className="absolute inset-0" />{!ready && <div className="absolute inset-0"><MapSkeleton label="INITIALIZING RF MAP ENGINE..." /></div>}</div>;
}
