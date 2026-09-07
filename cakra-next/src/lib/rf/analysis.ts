import type { CellChurnPoint, CoverageGapSegment, DriveTestEvent, DriveTestPoint, PciConflictPair, ThroughputBin } from '../types';

const median = (values: number[]) => { if (!values.length) return 0; const a = [...values].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; };
const tsMs = (v: string, fallback: number) => { const n = Date.parse(v.replace(/_/,' ')); return Number.isFinite(n) ? n : fallback; };

export function detectCoverageGaps(points: DriveTestPoint[], threshold = -100, minDurationSec = 5): CoverageGapSegment[] {
  const sorted = [...points].sort((a,b)=>tsMs(a.ts,0)-tsMs(b.ts,0));
  const segments: CoverageGapSegment[] = []; let start = -1;
  for (let i=0;i<=sorted.length;i++) {
    const weak = i < sorted.length && sorted[i].rsrp <= threshold;
    if (weak && start < 0) start = i;
    if ((!weak || i === sorted.length) && start >= 0) {
      const end=i-1, chunk=sorted.slice(start,end+1); const dSec = Math.max((tsMs(chunk[chunk.length - 1]?.ts??'',end)-tsMs(chunk[0]?.ts??'',start))/1000, chunk.length > 1 ? chunk.length-1 : 0);
      if (dSec >= minDurationSec) segments.push({ id:`gap-${start}-${end}`, startTs:chunk[0].ts, endTs:chunk[chunk.length - 1]?.ts??'', durationSec:+dSec.toFixed(1), avgRsrp:+(chunk.reduce((s,p)=>s+p.rsrp,0)/chunk.length).toFixed(1), minRsrp:Math.min(...chunk.map(p=>p.rsrp)), points:chunk.length, cell:median(chunk.map(p=>Number(p.cellid)||0)).toString(), lat:chunk[Math.floor(chunk.length/2)].lat, lon:chunk[Math.floor(chunk.length/2)].lon });
      start=-1;
    }
  }
  return segments;
}

export function detectCellChurn(points: DriveTestPoint[], windowPoints = 10, minChanges = 3): { churnPoints: CellChurnPoint[]; unstableWindows: number } {
  const cells = points.map(p=>p.cellname || p.cellid).filter(Boolean); const freq = new Map<string,number>(); let unstableWindows=0;
  for (let i=0;i<=cells.length-windowPoints;i++) { const w=cells.slice(i,i+windowPoints); let changes=0; for(let j=1;j<w.length;j++) if(w[j]!==w[j-1]) changes++; if(changes>=minChanges) unstableWindows++; }
  cells.forEach(c=>freq.set(c,(freq.get(c)||0)+1)); const total=cells.length||1;
  return { churnPoints:[...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([cell,n])=>({cellName:cell,frequency:n,pct:+(n/total*100).toFixed(1)})), unstableWindows };
}

export function pearsonCorrelation(points: DriveTestPoint[], xKey:'rsrp'|'rsrq'|'snr', yKey:'dl'|'ul') {
  const pairs=points.map(p=>[p[xKey],p[yKey]>0?p[yKey]/1000:0] as const).filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)); if(pairs.length<2)return 0;
  const mx=pairs.reduce((s,[x])=>s+x,0)/pairs.length, my=pairs.reduce((s,[,y])=>s+y,0)/pairs.length;
  const num=pairs.reduce((s,[x,y])=>s+(x-mx)*(y-my),0), dx=pairs.reduce((s,[x])=>s+(x-mx)**2,0), dy=pairs.reduce((s,[,y])=>s+(y-my)**2,0); return dx&&dy?num/Math.sqrt(dx*dy):0;
}

export function buildThroughputBins(points: DriveTestPoint[]): ThroughputBin[] {
  const buckets:[string, (v:number)=>boolean][]=[['> -80',v=>v>-80],['-80 ~ -90',v=>v>-90&&v<=-80],['-90 ~ -100',v=>v>-100&&v<=-90],['-100 ~ -110',v=>v>-110&&v<=-100],['< -110',v=>v<=-110]];
  return buckets.map(([category,match])=>{const rows=points.filter(p=>match(p.rsrp)); return {category,avgDlMbps:rows.length?+(rows.reduce((s,p)=>s+p.dl,0)/rows.length/1000).toFixed(2):0,points:rows.length};});
}

export function detectPciConflicts(points: DriveTestPoint[]): PciConflictPair[] {
  const byCell = new Map<string, { pci:number; count:number }>(); points.forEach(p=>{const cell=p.cellname||p.cellid;if(cell&&p.pci!=null){const x=byCell.get(cell); if(!x)byCell.set(cell,{pci:p.pci,count:1}); else x.count++;}});
  const cells=[...byCell.entries()]; const pairs:PciConflictPair[]=[];
  for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const [a,aa]=cells[i],[b,bb]=cells[j]; if(aa.pci%3===bb.pci%3) pairs.push({id:`pci-${i}-${j}`,cellA:a,pciA:aa.pci,cellB:b,pciB:bb.pci,mod3:aa.pci%3,coObserved:Math.min(aa.count,bb.count)});}
  return pairs.sort((a,b)=>b.coObserved-a.coObserved).slice(0,50);
}

export function annotatePingPong(events: DriveTestEvent[]) {
  return events.map((e,i)=>({...e,isPingPong:i>0 && e.fromCell===events[i-1].toCell && e.toCell===events[i-1].fromCell}));
}
