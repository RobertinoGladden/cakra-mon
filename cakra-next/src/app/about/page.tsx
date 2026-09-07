'use client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

const releases = [
  { version: 'v3.0.0', date: '2026-09', changes: ['Parser Telkomsel untuk log utama tab-separated, format waktu G-NetTrack, dan field 4G/5G.', 'Event KML dibaca dari ExtendedData dengan transisi cell, KPI, waktu, dan koordinat yang utuh.', 'Peta coverage 3D, playback rute GPS, dan skenario RF multisite diperbarui.'] },
  { version: 'v2.9.0', date: '2026-09', changes: ['Skenario BTS/sector tersimpan di browser dan dapat diekspor.', 'Handover A3, threshold, heatmap prediksi, dan ekspor timeline tersedia.'] },
  { version: 'v2.7.0', date: '2026-09', changes: ['Parsing log, peta rute, grafik KPI, diagnosis RF, dan session workspace diperkenalkan.'] },
];

export default function AboutPage() {
  return <DashboardLayout><div className="mx-auto max-w-4xl space-y-4"><h1 className="text-lg font-semibold">Tentang Cakra</h1>{releases.map((release) => <Card key={release.version}><CardHeader title={release.version} subtitle={release.date}/><CardBody><ul className="space-y-2 text-sm text-slate-600 dark:text-zinc-300">{release.changes.map((change) => <li key={change} className="flex gap-2"><span className="text-sky-500">•</span><span>{change}</span></li>)}</ul></CardBody></Card>)}</div></DashboardLayout>;
}
