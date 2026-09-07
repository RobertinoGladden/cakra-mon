'use client';
import { useMemo, useState } from 'react';
import { useDriveTest } from '@/context/DriveTestContext';
import { detectCoverageGaps, detectCellChurn, pearsonCorrelation } from '@/lib/rf/analysis';

export function CacaAssistant(){
  const {points,events,session}=useDriveTest();
  const[open,setOpen]=useState(false); const[message,setMessage]=useState(''); const[answer,setAnswer]=useState(''); const[busy,setBusy]=useState(false);
  const gaps=useMemo(()=>detectCoverageGaps(points),[points]); const churn=useMemo(()=>detectCellChurn(points),[points]); const corr=useMemo(()=>pearsonCorrelation(points,'rsrp','dl'),[points]);
  const localDiagnosis=()=>{
    if(!points.length)return 'Pilih file log utama .txt dan file _events.kml untuk memulai analisis.';
    const handovers=events.filter(event=>event.type==='HANDOVER').length;
    return `${session?.operator||'Sesi'} · ${points.length.toLocaleString()} titik · ${handovers} handover · ${events.length-handovers} reselection. ${gaps.length?`Prioritas: ${gaps.length} coverage gap; titik terburuk ${gaps[0].minRsrp} dBm selama ${gaps[0].durationSec.toFixed(1)} detik.`:'Tidak ada coverage gap di bawah ambang aktif.'} Churn: ${churn.unstableWindows} window · korelasi RSRP–DL ${corr.toFixed(3)}.`;
  };
  const ask=async(q:string)=>{
    setMessage(q); setBusy(true);
    try{
      const context=`Drive test: operator=${session?.operator||'unknown'}, technology=${session?.technology||'unknown'}, points=${points.length}, events=${events.length}, coverageGaps=${gaps.length}, churnWindows=${churn.unstableWindows}, pearsonRsrpDl=${corr.toFixed(3)}.`;
      const res=await fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'Anda adalah Caca, analis RF. Jawab Bahasa Indonesia secara singkat, berbasis metrik, dan berikan tindakan yang dapat dilakukan.'},{role:'user',content:`${context}\nPertanyaan: ${q}`}]})});
      const data=await res.json();
      if(res.ok && data?.choices?.[0]?.message?.content){setAnswer(data.choices[0].message.content);}
      else setAnswer(localDiagnosis());
    }catch{setAnswer(localDiagnosis());}finally{setBusy(false);}
  };
  return <div className="fixed bottom-5 right-5 z-40 w-[min(380px,calc(100vw-24px))]">{open&&<div className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"><div className="border-b border-slate-200 p-3 dark:border-zinc-800"><div className="font-mono text-xs font-semibold">◈ Caca</div><div className="text-[11px] text-slate-500">{busy?'Menganalisis…':'Analisis sesi'}</div></div><div className="max-h-72 space-y-3 overflow-y-auto p-3 text-xs"><div className="rounded-lg bg-slate-50 p-2 dark:bg-zinc-900">{answer||localDiagnosis()}</div>{message&&<div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">{message}</div>}</div><div className="border-t border-slate-200 p-3 dark:border-zinc-800"><div className="grid grid-cols-2 gap-2">{['Ringkas KPI','Coverage gap','Handover','Throughput'].map(q=><button disabled={busy} key={q} onClick={()=>ask(q)} className="rounded-md border px-2 py-1.5 text-[11px] hover:border-sky-400 disabled:opacity-50">{q}</button>)}</div></div></div>}<button aria-label="Buka Caca" onClick={()=>setOpen(v=>!v)} className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-500 text-lg text-white shadow-lg hover:bg-sky-600">◈</button></div>
}
