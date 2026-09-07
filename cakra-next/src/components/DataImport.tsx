'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDriveTest } from '@/context/DriveTestContext';

export function DataImport({compact=false}:{compact?:boolean}){const input=useRef<HTMLInputElement>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const {importFiles}=useDriveTest();const router=useRouter();const onChange=async(e:React.ChangeEvent<HTMLInputElement>)=>{if(!e.target.files?.length)return;setBusy(true);setError('');try{await importFiles(e.target.files);router.push('/overview');}catch(err){setError(err instanceof Error?err.message:'Gagal membaca file');}finally{setBusy(false);e.target.value='';}};return <div><input ref={input} type="file" multiple accept=".txt,.csv,.kml,text/plain,text/csv,application/vnd.google-earth.kml+xml" className="hidden" onChange={onChange}/><button onClick={()=>input.current?.click()} disabled={busy} className={`rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60 ${compact?'w-full':''}`}>{busy?'Membaca log…':'Import log'}</button>{error&&<p className="mt-2 text-xs text-rose-500">{error}</p>}</div>}
