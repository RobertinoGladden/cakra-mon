'use client';
import { useEffect, useRef } from 'react';
import type { DriveTestPoint } from '@/lib/types';

declare global { interface Window { Chart?: any } }
let chartPromise:Promise<any>|null=null;
const loadChart=()=>{if(typeof window==='undefined')return Promise.resolve(null);if(window.Chart)return Promise.resolve(window.Chart);if(!chartPromise)chartPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/chart.umd.js';s.onload=()=>resolve(window.Chart);s.onerror=reject;document.body.appendChild(s)});return chartPromise;};

export function ChartEngine({points,height=360}:{points:DriveTestPoint[];height?:number}){
  const ref=useRef<HTMLCanvasElement>(null); const instance=useRef<any>(null);
  useEffect(()=>{let dead=false;(async()=>{const Chart=await loadChart();if(dead||!Chart||!ref.current)return;instance.current?.destroy();const sample=points.length>1800?points.filter((_,i)=>i%Math.ceil(points.length/1800)===0):points;const labels=sample.map(p=>p.ts.slice(11)||p.ts);
    instance.current=new Chart(ref.current,{type:'line',data:{labels,datasets:[
      {label:'RSRP',data:sample.map(p=>p.rsrp),yAxisID:'signal',borderWidth:1.7,pointRadius:0,tension:.18},
      {label:'RSRQ',data:sample.map(p=>p.rsrq),yAxisID:'signal',borderWidth:1.2,pointRadius:0,tension:.18},
      {label:'SNR',data:sample.map(p=>p.snr),yAxisID:'signal',borderWidth:1.2,pointRadius:0,tension:.18},
      {label:'DL Mbps',data:sample.map(p=>p.dl/1000),yAxisID:'throughput',borderWidth:1.3,pointRadius:0,tension:.18,borderDash:[5,4]}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{usePointStyle:true,font:{size:10}}},tooltip:{displayColors:true}},scales:{x:{ticks:{maxTicksLimit:14,font:{size:9}}},signal:{type:'linear',position:'left',title:{display:true,text:'dBm / dB'},ticks:{font:{size:9}}},throughput:{type:'linear',position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'Mbps'},ticks:{font:{size:9}}}}}});
  })();return()=>{dead=true;instance.current?.destroy();instance.current=null}},[points]);
  return <div style={{height}} className="relative w-full"><canvas ref={ref}/></div>;
}
