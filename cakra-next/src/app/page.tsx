'use client';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { DataImport } from '@/components/DataImport';
import { useDriveTest } from '@/context/DriveTestContext';
export default function Home(){const{points,session}=useDriveTest();return <main className="min-h-screen bg-app-grid px-6 py-12"><div className="mx-auto max-w-5xl"><h1 className="mb-8 font-mono text-2xl font-semibold tracking-wider">CAKRA</h1><Card><CardBody className="p-8"><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div><div className="font-mono text-xs text-slate-400">DATASET</div><div className="mt-1 text-lg font-semibold">{points.length?`${points.length.toLocaleString()} points · ${session?.operator}`:'Belum ada dataset aktif'}</div><div className="mt-1 text-sm text-slate-500">Log utama .txt + _events.kml</div></div><div className="flex gap-2"><DataImport/><Link href="/overview" className="rounded-lg border px-4 py-2.5 text-sm font-semibold">Dashboard</Link></div></div></CardBody></Card></div></main>}
