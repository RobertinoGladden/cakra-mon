import type { DatasetMetadata, DriveTestEvent, DriveTestPoint, SessionInfo } from '@/lib/types';

const DB_NAME = 'cakra-drive-test';
const STORE_NAME = 'sessions';
const CURRENT_KEY = 'current';

export interface PersistedDriveTestSession {
  points: DriveTestPoint[];
  events: DriveTestEvent[];
  metadata: DatasetMetadata;
  session: SessionInfo;
  savedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open CAKRA dataset store'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = work(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('CAKRA dataset store request failed'));
    });
  } finally {
    db.close();
  }
}

export async function loadDriveTestSession(): Promise<PersistedDriveTestSession | null> {
  if (typeof indexedDB === 'undefined') return null;
  return (await withStore<PersistedDriveTestSession | undefined>('readonly', (store) => store.get(CURRENT_KEY))) ?? null;
}

export async function saveDriveTestSession(value: PersistedDriveTestSession) {
  if (typeof indexedDB === 'undefined') return;
  await withStore<IDBValidKey>('readwrite', (store) => store.put(value, CURRENT_KEY));
}

export async function clearDriveTestSession() {
  if (typeof indexedDB === 'undefined') return;
  await withStore<undefined>('readwrite', (store) => store.delete(CURRENT_KEY));
}
