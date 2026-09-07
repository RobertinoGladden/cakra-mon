'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetMetadata, DriveTestEvent, DriveTestPoint, SessionInfo } from '@/lib/types';
import { filesToParseInput, parseDriveTestFiles } from '@/lib/parseDriveTestLog';
import { clearDriveTestSession, loadDriveTestSession, saveDriveTestSession } from '@/lib/driveTestSessionStore';

export interface Filters {
  minRsrp: number;
  maxRsrp: number;
  operator: string;
  cell: string;
}

interface Store {
  points: DriveTestPoint[];
  events: DriveTestEvent[];
  metadata: DatasetMetadata | null;
  session: SessionInfo | null;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  importFiles: (files: FileList | File[]) => Promise<void>;
  reset: () => void;
  filteredPoints: DriveTestPoint[];
  persistenceStatus: 'loading' | 'ready' | 'unavailable';
}

const Ctx = createContext<Store | null>(null);

function parseTimestamp(value: string) {
  if (!value) return NaN;
  const normalized = value.replace(/_/g, " " ).replace(/T(\d{2}):(\d{2}):(\d{2})$/, 'T$1:$2:$3Z');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const buildSession = (points: DriveTestPoint[], source: string): SessionInfo => {
  const valid = points.filter((p) => p.lat != null && p.lon != null);
  const sorted = [...points].filter((p) => p.ts).sort((a, b) => parseTimestamp(a.ts) - parseTimestamp(b.ts));
  const first = sorted[0]?.ts ?? '';
  const last = sorted.at(-1)?.ts ?? '';
  const firstMs = parseTimestamp(first);
  const lastMs = parseTimestamp(last);
  const duration = Number.isFinite(firstMs) && Number.isFinite(lastMs) && lastMs > firstMs ? (lastMs - firstMs) / 1000 : NaN;
  return {
    filename: source.split(', ')[0] || 'drive-test',
    date: first.slice(0, 10) || new Date().toISOString().slice(0, 10),
    timeRange: first && last ? `${first.slice(11) || first} — ${last.slice(11) || last}` : '—',
    durationLabel: Number.isFinite(duration) ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m ${Math.floor(duration % 60)}s` : '—',
    operator: points.find((p) => p.operator)?.operator || 'Unknown',
    technology: points.some((p) => /NR|5G/i.test(p.tech) || p.nrRsrp != null) ? '5G NR' : '4G LTE',
    totalDataPoints: points.length,
    gpsValidPoints: valid.length,
    avgSpeedKmh: points.length ? +(points.reduce((sum, p) => sum + p.speed, 0) / points.length).toFixed(1) : 0,
    deviceModel: points.find((p) => p.device)?.device || 'Unknown',
  };
};

export function DriveTestProvider({ children }: { children: React.ReactNode }) {
  const [points, setPoints] = useState<DriveTestPoint[]>([]);
  const [events, setEvents] = useState<DriveTestEvent[]>([]);
  const [metadata, setMetadata] = useState<DatasetMetadata | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [filters, setFilters] = useState<Filters>({ minRsrp: -160, maxRsrp: -30, operator: '', cell: '' });
  const [persistenceStatus, setPersistenceStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const changedBeforeRestore = useRef(false);

  useEffect(() => {
    let active = true;
    loadDriveTestSession().then((saved) => {
      if (!active) return;
      if (saved && !changedBeforeRestore.current) {
        setPoints(saved.points);
        setEvents(saved.events);
        setMetadata(saved.metadata);
        setSession(saved.session);
      }
      setPersistenceStatus('ready');
    }).catch(() => { if (active) setPersistenceStatus('unavailable'); });
    return () => { active = false; };
  }, []);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    changedBeforeRestore.current = true;
    const input = await filesToParseInput(files);
    const result = parseDriveTestFiles(input);
    setPoints(result.points);
    setEvents(result.events);
    setMetadata(result.metadata);
    const nextSession = buildSession(result.points, result.metadata.source);
    setSession(nextSession);
    setFilters({ minRsrp: -160, maxRsrp: -30, operator: '', cell: '' });
    try {
      await saveDriveTestSession({ points: result.points, events: result.events, metadata: result.metadata, session: nextSession, savedAt: new Date().toISOString() });
      setPersistenceStatus('ready');
    } catch {
      setPersistenceStatus('unavailable');
    }
  }, []);

  const reset = useCallback(() => {
    changedBeforeRestore.current = true;
    setPoints([]); setEvents([]); setMetadata(null); setSession(null);
    clearDriveTestSession().catch(() => undefined);
  }, []);

  const filteredPoints = useMemo(() => points.filter((p) =>
    p.rsrp >= filters.minRsrp && p.rsrp <= filters.maxRsrp &&
    (!filters.operator || p.operator === filters.operator) &&
    (!filters.cell || p.cellname === filters.cell)
  ), [points, filters]);

  return <Ctx.Provider value={{ points, events, metadata, session, filters, setFilters, importFiles, reset, filteredPoints, persistenceStatus }}>{children}</Ctx.Provider>;
}

export function useDriveTest() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useDriveTest must be inside DriveTestProvider');
  return value;
}
