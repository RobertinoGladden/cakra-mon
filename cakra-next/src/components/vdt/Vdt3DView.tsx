'use client';
import { useEffect, useRef } from 'react';
import type { VdtPredictionPoint } from '@/lib/types';

export function Vdt3DView({ points, rows, cols, height = 360, playbackIndex = -1 }: { points: VdtPredictionPoint[]; rows: number; cols: number; height?: number; playbackIndex?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 900;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...points.map(p => p.bestRsrp), -120);
    const max = Math.max(...points.map(p => p.bestRsrp), -55);
    const getNorm = (value: number) => Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 1)));
    const colorFor = (value: number) => `hsl(${8 + getNorm(value) * 145} 78% 48%)`;

    ctx.save();
    ctx.translate(width / 2, 38);
    const sx = Math.min(width * 0.86 / Math.max(cols, 1), 34);
    const sy = Math.min(20, sx * 0.72);
    for (let r = rows - 1; r >= 0; r -= 1) {
      for (let c = 0; c < cols; c += 1) {
        const p = points[r * cols + c];
        if (!p) continue;
        const h = 10 + getNorm(p.bestRsrp) * 105;
        const x = (c - r) * sx * 0.52;
        const y = (c + r) * sy * 0.36;
        ctx.fillStyle = colorFor(p.bestRsrp);
        ctx.beginPath();
        ctx.moveTo(x, y - h);
        ctx.lineTo(x + sx * 0.42, y - h + sy * 0.24);
        ctx.lineTo(x + sx * 0.42, y + sy * 0.22);
        ctx.lineTo(x, y);
        ctx.lineTo(x - sx * 0.42, y + sy * 0.22);
        ctx.lineTo(x - sx * 0.42, y - h + sy * 0.24);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    if (playbackIndex >= 0) {
      const route = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / 60)) === 0);
      if (route.length > 1) {
        const current = Math.min(route.length - 1, Math.floor((playbackIndex / 100) * (route.length - 1)));
        const p = route[current];
        const x = 16 + (current / Math.max(route.length - 1, 1)) * (width - 32);
        const y = height - 24;
        ctx.fillStyle = '#0ea5e9';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`${p.bestRsrp.toFixed(1)} dBm · ${p.servingSite}`, 16, height - 40);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(16, y); ctx.lineTo(width - 16, y); ctx.stroke();
      }
    }
  }, [points, rows, cols, height, playbackIndex]);

  return <canvas ref={canvasRef} className="w-full rounded-xl bg-slate-950" style={{ height }} aria-label="3D virtual drive test coverage surface" />;
}
