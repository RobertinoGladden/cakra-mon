import type { VdtScenario } from '@/lib/types';

const STORAGE_KEY = 'cakra.vdt.scenarios.v1';

function isScenario(value: unknown): value is VdtScenario {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<VdtScenario>;
  return item.schemaVersion === 1 && typeof item.id === 'string' && typeof item.name === 'string' &&
    Array.isArray(item.sites) && typeof item.radiusKm === 'number' && typeof item.sampleCount === 'number' &&
    !!item.thresholds;
}

export function listVdtScenarios(): VdtScenario[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isScenario).sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
  } catch {
    return [];
  }
}

export function saveVdtScenario(scenario: VdtScenario): VdtScenario[] {
  const all = listVdtScenarios();
  const next = [scenario, ...all.filter((item) => item.id !== scenario.id)].slice(0, 30);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function downloadText(filename: string, text: string, contentType: string) {
  const blob = new Blob([text], { type: `${contentType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
