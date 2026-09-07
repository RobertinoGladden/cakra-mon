import type { DatasetMetadata, DriveTestEvent, DriveTestPoint } from './types';

const NUM = (value: unknown, fallback = 0) => {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  const number = Number(match?.[0]);
  return Number.isFinite(number) ? number : fallback;
};
const STR = (value: unknown) => String(value ?? '').trim();
const clean = (value: string) => value.trim().replace(/^"|"$/g, '').toLowerCase().replace(/[ _-]+/g, '');

const aliases: Record<string, string[]> = {
  ts: ['timestamp', 'time', 'datetime', 'date time', 'time stamp'],
  lon: ['longitude', 'long', 'lon'], lat: ['latitude', 'lat'], speed: ['speed', 'speed(km/h)', 'speed km/h'],
  rsrp: ['level', 'level (rsrp)', 'rsrp', 'lte rsrp', 'ss-rsrp'], rsrq: ['qual', 'qual (rsrq)', 'rsrq', 'lte rsrq'], snr: ['snr', 'sinr', 'lte snr'],
  dl: ['dl_bitrate', 'dl bitrate', 'dl throughput', 'downlink throughput', 'dl'], ul: ['ul_bitrate', 'ul bitrate', 'ul throughput', 'uplink throughput', 'ul'],
  pci: ['pci', 'pc', 'pci serving', 'phys cell id', 'physcellid', 'lte pci', 'psc'], cellname: ['cellname', 'cell name', 'serving cell', 'cell'],
  node: ['node', 'enodeb', 'enodeb id', 'enb'], cellid: ['cellid', 'cell id', 'eci'], lac: ['lac', 'tac', 'lac/tac', 'lac tac'],
  arfcn: ['arfcn', 'earfcn', 'lte arfcn'], band: ['band', 'lte band'], bw: ['bw', 'bandwidth', 'lte bw'],
  operator: ['operatorname', 'operator', 'plmn', 'mno'], tech: ['networktech', 'networkmode', 'tech', 'technology', 'rat', 'mode'], device: ['device', 'device model'],
  cgi: ['cgi', 'global cell id'], event: ['event', 'eventtype'], eventDetails: ['eventdetails', 'eventdetail', 'details'],
  nrRsrp: ['nr rsrp', 'nr-rsrp', 'ss-rsrp'], nrSinr: ['nr sinr', 'ss-sinr', 'ss sinr', 'nr snr'], nrPci: ['nr pci', 'nr-pci'], nrBand: ['nr band'], nrArfcn: ['nr arfcn'], nrDl: ['nr dl bitrate', 'nr dl', 'nr throughput dl'], nrUl: ['nr ul bitrate', 'nr ul', 'nr throughput ul'],
};

function normalizedTimestamp(value: string) {
  const raw = STR(value);
  const match = raw.match(/^(\d{4})[./-](\d{2})[./-](\d{2})[ _T](\d{2})[:.](\d{2})[:.](\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` : raw;
}

function findIndex(headers: string[], names: string[]) {
  const normalized = headers.map(clean);
  return names.map(clean).reduce((result, name) => result >= 0 ? result : normalized.findIndex((header) => header === name || header.includes(name)), -1);
}

function delimiterFor(text: string) {
  const first = text.split(/\r?\n/).find(Boolean) ?? '';
  if (first.includes('\t')) return '\t';
  if (first.includes(';')) return ';';
  return ',';
}

function splitRow(line: string, delimiter: string) {
  const output: string[] = []; let current = ''; let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { output.push(current); current = ''; }
    else current += character;
  }
  output.push(current);
  return output;
}

function eventType(value: string): DriveTestEvent['type'] | null {
  if (/reselection/i.test(value)) return 'CELL_RESELECTION';
  if (/handover|intra.*cell|inter.*cell/i.test(value)) return 'HANDOVER';
  return null;
}

function shortCell(value: string) {
  const parts = STR(value).split('-');
  if (parts.length >= 5 && /^\d+$/.test(parts[3]) && /^\d+$/.test(parts[4])) return `${parts[3]}-${parts[4]}`;
  return STR(value);
}

function eventCells(details: string, fallback = '') {
  const [from = fallback, to = ''] = STR(details).split(/\s*:\s*|\s*->\s*/);
  return { fromCell: shortCell(from), toCell: shortCell(to) };
}

function toEvent(id: string, rawType: string, details: string, values: { timestamp: string; rsrp: number; rsrq: number; snr: number; lat: number | null; lon: number | null; fallbackCell?: string }): DriveTestEvent | null {
  const type = eventType(rawType);
  if (!type) return null;
  const cells = eventCells(details, values.fallbackCell);
  return { id, type, timestamp: normalizedTimestamp(values.timestamp), fromCell: cells.fromCell, toCell: cells.toCell, rsrp: values.rsrp, rsrq: values.rsrq, snr: values.snr, lat: values.lat, lon: values.lon, isPingPong: false };
}

function parseTelkomselEventRows(text: string, sourceName: string): DriveTestEvent[] {
  const delimiter = delimiterFor(text);
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0], delimiter);
  const idx = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, findIndex(headers, names)]));
  const at = (row: string[], key: string) => row[idx[key] >= 0 ? idx[key] : -1] ?? '';
  return lines.slice(1).flatMap((line, index) => {
    const row = splitRow(line, delimiter);
    const event = toEvent(`${sourceName}-event-${index + 1}`, at(row, 'event'), at(row, 'eventDetails'), {
      timestamp: at(row, 'ts'), rsrp: NUM(at(row, 'rsrp'), -100), rsrq: NUM(at(row, 'rsrq'), -10), snr: NUM(at(row, 'snr')), lat: Number.isFinite(NUM(at(row, 'lat'), NaN)) ? NUM(at(row, 'lat')) : null, lon: Number.isFinite(NUM(at(row, 'lon'), NaN)) ? NUM(at(row, 'lon')) : null,
      fallbackCell: `${STR(at(row, 'node'))}-${STR(at(row, 'cellid'))}`,
    });
    return event ? [event] : [];
  });
}

function parseDelimited(text: string, sourceName: string) {
  const delimiter = delimiterFor(text);
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { points: [] as DriveTestPoint[], events: [] as DriveTestEvent[], rejectedRows: 0 };
  const headers = splitRow(lines[0], delimiter);
  const idx = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, findIndex(headers, names)]));
  const fallback: Record<string, number> = { ts: 0, lon: 1, lat: 2, speed: 3, operator: 4, cgi: 6, cellname: 7, node: 8, cellid: 9, lac: 10, tech: 11, rsrp: 13, rsrq: 14, snr: 15, arfcn: 18, dl: 19, ul: 20, device: 53, band: 54, bw: 55 };
  const points: DriveTestPoint[] = []; const events: DriveTestEvent[] = []; let rejectedRows = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const row = splitRow(lines[index], delimiter);
    const at = (key: string) => row[idx[key] >= 0 ? idx[key] : (fallback[key] ?? -1)] ?? '';
    const rsrp = NUM(at('rsrp'), NaN); const rsrq = NUM(at('rsrq'), NaN); const snr = NUM(at('snr'), NaN);
    const lat = Number.isFinite(NUM(at('lat'), NaN)) ? NUM(at('lat')) : null;
    const lon = Number.isFinite(NUM(at('lon'), NaN)) ? NUM(at('lon')) : null;
    const fromEvent = toEvent(`${sourceName}-inline-event-${index}`, at('event'), at('eventDetails'), { timestamp: at('ts'), rsrp: Number.isFinite(rsrp) ? rsrp : -100, rsrq: Number.isFinite(rsrq) ? rsrq : -10, snr: Number.isFinite(snr) ? snr : 0, lat, lon, fallbackCell: `${STR(at('node'))}-${STR(at('cellid'))}` });
    if (fromEvent) events.push(fromEvent);
    if (!Number.isFinite(rsrp) || rsrp < -160 || rsrp > -30) { rejectedRows += 1; continue; }
    if (Number.isFinite(rsrq) && (rsrq < -45 || rsrq > 25)) { rejectedRows += 1; continue; }
    if (Number.isFinite(snr) && (snr < -25 || snr > 50)) { rejectedRows += 1; continue; }
    const nrRsrp = NUM(at('nrRsrp'), NaN); const nrSinr = NUM(at('nrSinr'), NaN); const nrPci = NUM(at('nrPci'), NaN);
    points.push({
      id: `${sourceName}-${index}`, ts: normalizedTimestamp(at('ts')), lat, lon, speed: NUM(at('speed')), rsrp, rsrq: Number.isFinite(rsrq) ? rsrq : 0, snr: Number.isFinite(snr) ? snr : 0,
      dl: NUM(at('dl')), ul: NUM(at('ul')), pci: Number.isFinite(NUM(at('pci'), NaN)) ? NUM(at('pci')) : null, cellname: STR(at('cellname')), node: STR(at('node')), cellid: STR(at('cellid')), enodeb: STR(at('node')), lacTac: STR(at('lac')), arfcn: STR(at('arfcn')), band: STR(at('band')), bw: NUM(at('bw')), operator: STR(at('operator')), tech: STR(at('tech')) || 'LTE', device: STR(at('device')), cgi: STR(at('cgi')),
      nrRsrp: Number.isFinite(nrRsrp) ? nrRsrp : null, nrSinr: Number.isFinite(nrSinr) ? nrSinr : null, nrPci: Number.isFinite(nrPci) ? nrPci : null, nrBand: STR(at('nrBand')), nrArfcn: STR(at('nrArfcn')), nrDl: Number.isFinite(NUM(at('nrDl'), NaN)) ? NUM(at('nrDl')) : null, nrUl: Number.isFinite(NUM(at('nrUl'), NaN)) ? NUM(at('nrUl')) : null,
    });
  }
  return { points, events, rejectedRows };
}

function decodeXml(value: string) {
  return STR(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

function kmlValue(block: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`<Data\\s+name=["']${escaped}["'][^>]*>\\s*<value>([\\s\\S]*?)<\\/value>|<SimpleData\\s+name=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/SimpleData>`, 'i'));
  return decodeXml(match?.[1] ?? match?.[2] ?? '');
}

function parseKmlEvents(text: string, sourceName: string) {
  const events: DriveTestEvent[] = [];
  const placemarks = text.match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [];
  placemarks.forEach((block, index) => {
    const name = decodeXml(block.match(/<name>([\s\S]*?)<\/name>/i)?.[1] ?? '');
    const details = kmlValue(block, 'DETAILS') || decodeXml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '');
    const coordinateText = decodeXml(block.match(/<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1] ?? '');
    const coordinate = coordinateText.split(/\s+/).find(Boolean)?.split(',').map(Number) ?? [];
    const event = toEvent(`${sourceName}-kml-${index}`, name || kmlValue(block, 'INFO'), details, {
      timestamp: kmlValue(block, 'TIME'), rsrp: NUM(kmlValue(block, 'RSRP'), -100), rsrq: NUM(kmlValue(block, 'RSRQ'), -10), snr: NUM(kmlValue(block, 'SNR')), lat: Number.isFinite(coordinate[1]) ? coordinate[1] : null, lon: Number.isFinite(coordinate[0]) ? coordinate[0] : null,
      fallbackCell: `${kmlValue(block, 'eNB')}-${kmlValue(block, 'CELLID')}`,
    });
    if (event) events.push(event);
  });
  return events;
}

function dedupeEvents(events: DriveTestEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = [event.type, event.timestamp, event.fromCell, event.toCell].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((event, index, all) => ({ ...event, isPingPong: index > 0 && event.fromCell === all[index - 1].toCell && event.toCell === all[index - 1].fromCell }));
}

export interface ParseResult { points: DriveTestPoint[]; events: DriveTestEvent[]; metadata: DatasetMetadata; }

export function parseDriveTestFiles(files: Array<{ name: string; text: string }>): ParseResult {
  const points: DriveTestPoint[] = []; const events: DriveTestEvent[] = []; let rejectedRows = 0;
  let parser: DatasetMetadata['parser'] = 'CSV';
  let parsedLog = false;
  for (const file of files) {
    const lowerName = file.name.toLowerCase(); const ext = lowerName.split('.').pop();
    if (ext === 'kml') { if (!parsedLog) parser = 'KML'; events.push(...parseKmlEvents(file.text, file.name)); continue; }
    parsedLog = true;
    const textHead = file.text.slice(0, 1000).toLowerCase();
    if (textHead.includes('tems')) parser = 'TEMS'; else if (textHead.includes('nemo')) parser = 'NEMO'; else if (textHead.includes('sigmon')) parser = 'SIGMON'; else if (ext === 'txt') parser = 'GNET';
    if (/(^|[_-])events?\.txt$/i.test(lowerName)) { events.push(...parseTelkomselEventRows(file.text, file.name)); continue; }
    const result = parseDelimited(file.text, file.name); points.push(...result.points); events.push(...result.events); rejectedRows += result.rejectedRows;
  }
  return { points, events: dedupeEvents(events), metadata: { source: files.map((file) => file.name).join(', '), fileCount: files.length, parser, parsedAt: new Date().toISOString(), rejectedRows } };
}

export async function filesToParseInput(fileList: FileList | File[]): Promise<Array<{ name: string; text: string }>> {
  return Promise.all(Array.from(fileList).map(async (file) => ({ name: file.name, text: await file.text() })));
}
