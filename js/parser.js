// parser.js — multi-tool drive test file parser (G-NetTrack Pro, TEMS, NEMO, SIGMON) — Cakra v2.0.1
// © 2026 Robertino Gladden Narendra. Hak cipta dilindungi.
'use strict';

window.CakraParser = (() => {

  // LTE column map: G-NetTrack Pro (legacy default indices)
  const C = { ts:0,lon:1,lat:2,speed:3,operator:4,mcc:5,cgi:6,cellname:7,node:8,cellid:9,lac:10,tech:11,mode:12,level:13,qual:14,snr:15,cqi:16,lte_rssi:17,arfcn:18,dl:19,ul:20,altitude:22,height:23,accuracy:24,state:27,ping_avg:28,ping_min:29,ping_max:30,dl_test:32,ul_test:33,device:53,band:54,bw:55 };

  // Sanity ranges per 3GPP TS 36.133/38.215 — reject contaminated/misaligned rows
  const _RSRP_MIN = -160, _RSRP_MAX = -30;  // LTE: -140..-44 / NR: -156..-31, padded
  const _RSRQ_MIN = -45,  _RSRQ_MAX = 25;   // LTE: -19.5..-3 / NR Rel-15: -43..20, padded
  const _SNR_MIN  = -25,  _SNR_MAX  = 50;   // SS-SINR: -23..40, SINR LTE: -20..30+, padded
  function _validRanges(rsrp, rsrq, snr) {
    return rsrp >= _RSRP_MIN && rsrp <= _RSRP_MAX
        && rsrq >= _RSRQ_MIN && rsrq <= _RSRQ_MAX
        && snr  >= _SNR_MIN  && snr  <= _SNR_MAX;
  }

  // Header-name lookup, case-insensitive. Returns first match or fallback.
  function _resolveCol(headers, candidates, fallback) {
    const upper = headers.map(h => (h||'').trim().toUpperCase());
    for (const cand of candidates) {
      const idx = upper.indexOf(cand.toUpperCase());
      if (idx >= 0) return idx;
    }
    return fallback;
  }

  const NR_KEYS = {
    nr_rsrp:['NR RSRP','NR-RSRP','NRRSRP','SS-RSRP','SS_RSRP','SSRSRP'],
    nr_rsrq:['NR RSRQ','NR-RSRQ','NRRSRQ','SS-RSRQ','SS_RSRQ'],
    nr_sinr:['NR SINR','SS-SINR','SS_SINR','NR_SINR','NR SNR','SSSINR'],
    nr_rssi:['NR RSSI','NR-RSSI','NRRSSI'],
    nr_band:['NR Band','NR_Band','NR BAND','NRBAND'],
    nr_arfcn:['NR ARFCN','NR_ARFCN','NRARFCN'],
    nr_pci:['NR PCI','NR_PCI','NRPCI'],
    nr_dl:['NR DL Bitrate','NR DL','NR_DL_BITRATE'],
    nr_ul:['NR UL Bitrate','NR UL','NR_UL_BITRATE'],
  };

  function detectTool(firstLine) {
    const l = firstLine.toLowerCase();
    if (l.includes('tems') || l.includes('message type') || l.includes('serving cell info')) return 'TEMS';
    if (l.includes('nemo') || l.includes('scan result') || l.includes('meas_time')) return 'NEMO';
    if (l.includes('sigmon') || l.includes('signalmaster')) return 'SIGMON';
    if (l.includes('timestamp') && l.includes('longitude') && l.includes('latitude')) return 'GNET';
    const parts = firstLine.split('\t');
    if (parts.length > 20 && !isNaN(parseFloat(parts[1])) && !isNaN(parseFloat(parts[2]))) return 'GNET';
    return 'GNET'; // fallback
  }

  function resolveNrCols(headers) {
    const map = {};
    const upper = headers.map(h => (h||'').trim().toUpperCase());
    for (const [key, candidates] of Object.entries(NR_KEYS)) {
      for (const cand of candidates) {
        const idx = upper.indexOf(cand.toUpperCase());
        if (idx !== -1) { map[key] = idx; break; }
      }
    }
    return map;
  }

  function resolveLtePci(headers) {
    const upper = headers.map(h => (h||'').trim().toUpperCase());
    const candidates = ['PCI', 'PCI SERVING', 'PHYS CELL ID', 'PHYSCELLID', 'LTE PCI', 'PSC'];
    for (const c of candidates) {
      const idx = upper.indexOf(c);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function parseCakra(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split('\t');
    const NRC = resolveNrCols(headers);
    const iLtePci = resolveLtePci(headers);
    const hasNrCols = Object.keys(NRC).length > 0;
    // Header-based column resolution (fallback to legacy index)
    const iBand  = _resolveCol(headers, ['BAND','LTE BAND','NR BAND'],         C.band);
    const iBw    = _resolveCol(headers, ['BANDWIDTH','BW','LTE BW','NR BW'],   C.bw);
    const iCqi   = _resolveCol(headers, ['CQI','LTE CQI'],                     C.cqi);
    const iState = _resolveCol(headers, ['STATE','PHONESTATE','PHONE STATE'],  C.state);
    const rows = [];
    let _rejectedRange = 0;

    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split('\t');
      if (p.length < 20) continue;
      const rsrp = parseFloat(p[C.level]);
      const rsrq = parseFloat(p[C.qual]);
      const snr  = parseFloat(p[C.snr]);
      if (isNaN(rsrp) || isNaN(rsrq) || isNaN(snr)) continue;
      if (!_validRanges(rsrp, rsrq, snr)) { _rejectedRange++; continue; }
      const lat = parseFloat(p[C.lat]), lon = parseFloat(p[C.lon]);
      const tsRaw = p[C.ts]||'';
      const tsDisp = tsRaw.replace('_',' ').replace(/\./g,':');
      const timePart = tsRaw.includes('_') ? tsRaw.split('_')[1].replace(/\./g,':') : tsRaw;
      const nrGet = k => NRC[k] !== undefined ? parseFloat(p[NRC[k]]) : null;
      const nrStr = k => NRC[k] !== undefined ? (p[NRC[k]]||'').trim() : null;
      const ltePciVal = iLtePci >= 0 ? parseInt(p[iLtePci]) : NaN;
      rows.push({
        _tool:'GNET', ts:tsRaw, tsDisp, timePart,
        lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon,
        rsrp, rsrq, snr,
        speed: parseFloat(p[C.speed])||0,
        operator:(p[C.operator]||'').trim(), cgi:(p[C.cgi]||'').trim(),
        cellname:(p[C.cellname]||'').trim(), node:(p[C.node]||'').trim(),
        cellid:(p[C.cellid]||'').trim(), lac:(p[C.lac]||'').trim(),
        tech:(p[C.tech]||'').trim(), arfcn:(p[C.arfcn]||'').trim(),
        pci: isNaN(ltePciVal) ? null : ltePciVal,
        dl:parseFloat(p[C.dl])||0, ul:parseFloat(p[C.ul])||0,
        band:(p[iBand]||'').trim(), bw:(p[iBw]||'').trim(),
        device:(p[C.device]||'').trim(), state:(p[iState]||'').trim(),
        cqi:p[iCqi]||'', ping_avg:parseFloat(p[C.ping_avg])||null,
        nr_rsrp: isNaN(nrGet('nr_rsrp'))?null:nrGet('nr_rsrp'),
        nr_rsrq: isNaN(nrGet('nr_rsrq'))?null:nrGet('nr_rsrq'),
        nr_sinr: isNaN(nrGet('nr_sinr'))?null:nrGet('nr_sinr'),
        nr_rssi: isNaN(nrGet('nr_rssi'))?null:nrGet('nr_rssi'),
        nr_band: nrStr('nr_band'), nr_arfcn: nrStr('nr_arfcn'), nr_pci: nrStr('nr_pci'),
        nr_dl: isNaN(nrGet('nr_dl'))?null:nrGet('nr_dl'),
        nr_ul: isNaN(nrGet('nr_ul'))?null:nrGet('nr_ul'),
        _hasNrCols: hasNrCols,
      });
    }
    if (_rejectedRange > 0) {
      console.warn(`[Cakra parser] Rejected ${_rejectedRange} row(s) with out-of-range RSRP/RSRQ/SNR (likely contamination)`);
    }
    return rows;
  }

  function parseTEMS(text) {
    const lines = text.trim().split('\n');
    let headerIdx = lines.findIndex(l => l.includes('Timestamp') || l.includes('Time') || l.includes('Latitude'));
    if (headerIdx < 0) headerIdx = 0;
    const headers = lines[headerIdx].split('\t').map(h => h.trim().toUpperCase());
    const col = name => headers.findIndex(h => h.includes(name.toUpperCase()));

    const iTime = col('TIME'), iLat = col('LAT'), iLon = col('LON') !== -1 ? col('LON') : col('LONG');
    const iRsrp = col('RSRP'), iRsrq = col('RSRQ'), iSinr = col('SINR') !== -1 ? col('SINR') : col('SNR');
    const iDl = col('DL THROUGHPUT') !== -1 ? col('DL THROUGHPUT') : col('DL_THRU');
    const iUl = col('UL THROUGHPUT') !== -1 ? col('UL THROUGHPUT') : col('UL_THRU');
    const iCell = col('SERVING CELL') !== -1 ? col('SERVING CELL') : col('CELL NAME');
    const iOp = col('OPERATOR') !== -1 ? col('OPERATOR') : col('PLMN');
    const iTech = col('RAT') !== -1 ? col('RAT') : col('TECHNOLOGY');
    const iBand = col('BAND');
    const iArfcn = col('EARFCN') !== -1 ? col('EARFCN') : col('ARFCN');
    const iSpeed = col('SPEED');
    const iNrRsrp = col('NR RSRP') !== -1 ? col('NR RSRP') : col('SS-RSRP');
    const iNrSinr = col('SS-SINR') !== -1 ? col('SS-SINR') : col('NR SINR');
    const iPci = col('PCI') !== -1 ? col('PCI') : (col('PHYS CELL') !== -1 ? col('PHYS CELL') : col('PSC'));

    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const p = lines[i].split('\t');
      if (p.length < 5) continue;
      const rsrp = iRsrp >= 0 ? parseFloat(p[iRsrp]) : NaN;
      const rsrq = iRsrq >= 0 ? parseFloat(p[iRsrq]) : NaN;
      const snr  = iSinr >= 0 ? parseFloat(p[iSinr]) : NaN;
      if (isNaN(rsrp)) continue;
      if (rsrp < -160 || rsrp > -30) continue;
      if (!isNaN(rsrq) && (rsrq < -45 || rsrq > 25)) continue;
      if (!isNaN(snr)  && (snr  < -25 || snr  > 50)) continue;
      const lat  = iLat >= 0 ? parseFloat(p[iLat]) : null;
      const lon  = iLon >= 0 ? parseFloat(p[iLon]) : null;
      const ts   = iTime >= 0 ? (p[iTime]||'').trim() : '';
      rows.push({
        _tool:'TEMS', ts, tsDisp:ts, timePart:ts.substring(11)||ts,
        lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon,
        rsrp, rsrq:isNaN(rsrq)?0:rsrq, snr:isNaN(snr)?0:snr,
        speed: iSpeed>=0?parseFloat(p[iSpeed])||0:0,
        operator: iOp>=0?(p[iOp]||'').trim():'',
        cellname: iCell>=0?(p[iCell]||'').trim():'', cgi:'', node:'', cellid:'', lac:'',
        tech: iTech>=0?(p[iTech]||'').trim():'LTE',
        arfcn: iArfcn>=0?(p[iArfcn]||'').trim():'',
        pci: iPci>=0 && !isNaN(parseInt(p[iPci])) ? parseInt(p[iPci]) : null,
        dl: iDl>=0?parseFloat(p[iDl])||0:0,
        ul: iUl>=0?parseFloat(p[iUl])||0:0,
        band: iBand>=0?(p[iBand]||'').trim():'',
        bw:'', device:'', state:'', cqi:'', ping_avg:null,
        nr_rsrp: iNrRsrp>=0&&!isNaN(parseFloat(p[iNrRsrp]))?parseFloat(p[iNrRsrp]):null,
        nr_rsrq:null, nr_sinr: iNrSinr>=0&&!isNaN(parseFloat(p[iNrSinr]))?parseFloat(p[iNrSinr]):null,
        nr_rssi:null, nr_band:null, nr_arfcn:null, nr_pci:null, nr_dl:null, nr_ul:null,
        _hasNrCols: iNrRsrp>=0,
      });
    }
    return rows;
  }

  function parseNEMO(text) {
    const lines = text.trim().split('\n');
    let sep = '\t';
    if (lines[0]?.includes(';')) sep = ';';
    if (lines[0]?.includes(',') && !lines[0]?.includes('\t')) sep = ',';

    let headerIdx = lines.findIndex(l => /time|lat|rsrp/i.test(l));
    if (headerIdx < 0) headerIdx = 0;
    const headers = lines[headerIdx].split(sep).map(h => h.trim().replace(/"/g,'').toUpperCase());
    const col = (...names) => { for (const n of names) { const i = headers.findIndex(h => h.includes(n.toUpperCase())); if (i>=0) return i; } return -1; };

    const iTime=col('MEAS_TIME','TIME','TIMESTAMP'), iLat=col('LAT'), iLon=col('LON','LONG');
    const iRsrp=col('LTE RSRP','RSRP'), iRsrq=col('LTE RSRQ','RSRQ');
    const iSinr=col('LTE SINR','LTE SNR','SINR','SNR');
    const iDl=col('DL THROUGHPUT','DL_THRU','LTE DL'), iUl=col('UL THROUGHPUT','UL_THRU','LTE UL');
    const iCell=col('SERVING CELL NAME','CELL NAME','CELLNAME'), iOp=col('OPERATOR','PLMN');
    const iTech=col('RAT','TECHNOLOGY'), iBand=col('BAND','LTE BAND'), iBw=col('BANDWIDTH','BW');
    const iArfcn=col('EARFCN','ARFCN'), iSpeed=col('SPEED','VELOCITY');
    const iNrRsrp=col('NR RSRP','SS-RSRP'), iNrSinr=col('SS-SINR','NR SINR','NR SNR');
    const iNrBand=col('NR BAND'), iNrArfcn=col('NR ARFCN'), iNrPci=col('NR PCI');
    const iPci=col('LTE PCI','PCI','PHYS CELL ID','PHYSCELLID','PSC');

    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const p = lines[i].split(sep).map(v => v.trim().replace(/"/g,''));
      if (p.length < 4) continue;
      const rsrp = iRsrp>=0?parseFloat(p[iRsrp]):NaN;
      if (isNaN(rsrp)) continue;
      if (rsrp < -160 || rsrp > -30) continue;
      if (!isNaN(rsrq) && (rsrq < -45 || rsrq > 25)) continue;
      if (!isNaN(snr)  && (snr  < -25 || snr  > 50)) continue;
      const rsrq=iRsrq>=0?parseFloat(p[iRsrq]):0, snr=iSinr>=0?parseFloat(p[iSinr]):0;
      const lat=iLat>=0?parseFloat(p[iLat]):null, lon=iLon>=0?parseFloat(p[iLon]):null;
      const ts=iTime>=0?(p[iTime]||'').trim():'';
      const nrR=iNrRsrp>=0?parseFloat(p[iNrRsrp]):null, nrS=iNrSinr>=0?parseFloat(p[iNrSinr]):null;
      rows.push({
        _tool:'NEMO', ts, tsDisp:ts, timePart:ts.substring(11)||ts,
        lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon,
        rsrp, rsrq:isNaN(rsrq)?0:rsrq, snr:isNaN(snr)?0:snr,
        speed:iSpeed>=0?parseFloat(p[iSpeed])||0:0,
        operator:iOp>=0?(p[iOp]||'').trim():'',
        cellname:iCell>=0?(p[iCell]||'').trim():'', cgi:'', node:'', cellid:'', lac:'',
        tech:iTech>=0?(p[iTech]||'').trim():'LTE',
        arfcn:iArfcn>=0?(p[iArfcn]||'').trim():'',
        pci: iPci>=0 && !isNaN(parseInt(p[iPci])) ? parseInt(p[iPci]) : null,
        dl:iDl>=0?parseFloat(p[iDl])||0:0, ul:iUl>=0?parseFloat(p[iUl])||0:0,
        band:iBand>=0?(p[iBand]||'').trim():'', bw:iBw>=0?(p[iBw]||'').trim():'',
        device:'', state:'', cqi:'', ping_avg:null,
        nr_rsrp:isNaN(nrR)?null:nrR, nr_rsrq:null, nr_sinr:isNaN(nrS)?null:nrS,
        nr_rssi:null, nr_band:iNrBand>=0?(p[iNrBand]||'').trim():null,
        nr_arfcn:iNrArfcn>=0?(p[iNrArfcn]||'').trim():null,
        nr_pci:iNrPci>=0?(p[iNrPci]||'').trim():null, nr_dl:null, nr_ul:null,
        _hasNrCols:iNrRsrp>=0,
      });
    }
    return rows;
  }

  function parseSIGMON(text) {
    const lines = text.trim().split('\n');
    let headerIdx = lines.findIndex(l => /rsrp|rsrq|timestamp/i.test(l));
    if (headerIdx < 0) headerIdx = 0;
    const sep = lines[headerIdx].includes(';') ? ';' : ',';
    const headers = lines[headerIdx].split(sep).map(h => h.trim().replace(/"/g,'').toUpperCase());
    const col = (...names) => { for (const n of names) { const i = headers.findIndex(h => h.includes(n.toUpperCase())); if (i>=0) return i; } return -1; };

    const iTime=col('TIMESTAMP','TIME'), iLat=col('LAT'), iLon=col('LON','LNG');
    const iRsrp=col('RSRP'), iRsrq=col('RSRQ'), iSinr=col('SINR','SNR');
    const iDl=col('DL','DOWNLINK'), iUl=col('UL','UPLINK');
    const iCell=col('CELL_ID','CELL NAME','CELLID'), iOp=col('OPERATOR','MNO');
    const iBand=col('BAND'), iSpeed=col('SPEED');
    const iPci=col('PCI','PHYS_CELL','PHYSCELLID','PSC');

    const rows = [];
    for (let i = headerIdx+1; i<lines.length; i++) {
      const p = lines[i].split(sep).map(v => v.trim().replace(/"/g,''));
      const rsrp = iRsrp>=0?parseFloat(p[iRsrp]):NaN;
      if (isNaN(rsrp)) continue;
      if (rsrp < -160 || rsrp > -30) continue;
      if (!isNaN(rsrq) && (rsrq < -45 || rsrq > 25)) continue;
      if (!isNaN(snr)  && (snr  < -25 || snr  > 50)) continue;
      const rsrq=iRsrq>=0?parseFloat(p[iRsrq]):0, snr=iSinr>=0?parseFloat(p[iSinr]):0;
      const lat=iLat>=0?parseFloat(p[iLat]):null, lon=iLon>=0?parseFloat(p[iLon]):null;
      const ts=iTime>=0?(p[iTime]||'').trim():'';
      rows.push({
        _tool:'SIGMON', ts, tsDisp:ts, timePart:ts.substring(11)||ts,
        lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon,
        rsrp, rsrq:isNaN(rsrq)?0:rsrq, snr:isNaN(snr)?0:snr,
        speed:iSpeed>=0?parseFloat(p[iSpeed])||0:0,
        operator:iOp>=0?(p[iOp]||'').trim():'', cgi:'',
        cellname:iCell>=0?(p[iCell]||'').trim():'', node:'', cellid:'', lac:'',
        tech:'LTE', arfcn:'',
        pci: iPci>=0 && !isNaN(parseInt(p[iPci])) ? parseInt(p[iPci]) : null,
        dl:iDl>=0?parseFloat(p[iDl])||0:0, ul:iUl>=0?parseFloat(p[iUl])||0:0,
        band:iBand>=0?(p[iBand]||'').trim():'', bw:'',
        device:'', state:'', cqi:'', ping_avg:null,
        nr_rsrp:null,nr_rsrq:null,nr_sinr:null,nr_rssi:null,
        nr_band:null,nr_arfcn:null,nr_pci:null,nr_dl:null,nr_ul:null,_hasNrCols:false,
      });
    }
    return rows;
  }

  function parseTxt(text) {
    const firstLine = text.split('\n')[0] || '';
    const tool = detectTool(firstLine);
    let rows;
    switch (tool) {
      case 'TEMS':   rows = parseTEMS(text);   break;
      case 'NEMO':   rows = parseNEMO(text);   break;
      case 'SIGMON': rows = parseSIGMON(text); break;
      default:       rows = parseCakra(text);
    }
    // Attach session tech
    const tech = detectSessionTech(rows);
    rows.forEach(r => r._sessionTech = tech);
    return rows;
  }

  function detectSessionTech(rows) {
    if (!rows.length) return '4G';
    const hasNr = rows.some(r => r.nr_rsrp !== null && !isNaN(r.nr_rsrp));
    const techVals = rows.map(r => (r.tech||'').toUpperCase());
    const hasNSA = techVals.some(t => t.includes('NSA')||t.includes('ENDC')||t.includes('EN-DC'));
    const hasNRSA = techVals.some(t => t.includes('NR')||t.includes('5G'));
    if (hasNSA || (hasNr && hasNRSA)) return 'NSA';
    if (hasNRSA || hasNr) return 'NR';
    return '4G';
  }

  function mapDetailedEventType(info, details, fromCell, toCell) {
    const isHO = info.includes('HANDOVER');
    const isRS = info.includes('RESELECTION');
    const hasNR = info.includes('NR') || info.includes('5G');
    
    if (isRS) {
      return hasNR ? 'CELL_RESELECTION_4G5G' : 'CELL_RESELECTION_4G4G';
    }
    
    if (isHO) {
      const detailsUpper = (details || '').toUpperCase();
      const isFromNR = detailsUpper.includes('5G') || detailsUpper.includes('NR');
      const isToNR = detailsUpper.includes('5G') || detailsUpper.includes('NR') || hasNR;
      
      if (isFromNR && isToNR) return 'HANDOVER_DATA_5G5G';
      if (isFromNR && !isToNR) return 'IRAT_HANDOVER_DATA_5G4G';
      if (!isFromNR && isToNR) return 'IRAT_HANDOVER_DATA_4G5G';
      return 'HANDOVER_DATA_4G4G';
    }
    
    return hasNR ? 'RESELECTION_5G' : 'RESELECTION_4G';
  }

  function parseKml(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const placemarks = doc.querySelectorAll('Placemark');
    const events = [];
    placemarks.forEach(pm => {
      const coordEl = pm.querySelector('coordinates');
      if (!coordEl) return;
      const [lonStr, latStr] = coordEl.textContent.trim().split(',');
      const lat = parseFloat(latStr), lon = parseFloat(lonStr);
      if (isNaN(lat)||isNaN(lon)) return;
      const getData = name => { for (const el of pm.querySelectorAll('Data')) { if (el.getAttribute('name')===name) { const v=el.querySelector('value'); return v?v.textContent.trim():''; } } return ''; };
      const info = getData('INFO')||pm.querySelector('n')?.textContent?.trim()||'';
      const isHO = info.includes('HANDOVER'), isRS = info.includes('RESELECTION');
      if (!isHO&&!isRS) return;
      const details = getData('DETAILS'), fromTo = details.split(':');
      const eventType = mapDetailedEventType(info, details, fromTo[0], fromTo[1]);
      events.push({
        type: eventType,
        typeCategory: isHO ? 'HANDOVER' : 'RESELECTION',
        isNr: info.includes('NR')||info.includes('5G'),
        lat, lon, time:getData('TIME'), timeDisp:getData('TIME').replace('_',' ').replace(/\./g,':'),
        details, fromCell:fromTo[0]||'—', toCell:fromTo[1]||'—',
        rsrp:getData('RSRP'), rsrq:getData('RSRQ'), snr:getData('SNR'),
        nr_rsrp:getData('NR_RSRP')||getData('SS_RSRP')||'',
        nr_sinr:getData('NR_SINR')||getData('SS_SINR')||'',
        enb:getData('eNB')||getData('gNB')||'', cellid:getData('CELLID'),
        cellname:getData('CELLNAME'), dl:getData('DL_BITRATE'), ul:getData('UL_BITRATE'),
        speed:getData('SPEED'), cqi:getData('CQI'),
      });
    });
    return events;
  }

  function parseLiveLine(line, tool='GNET', colMap=null) {
    if (!line||line.trim()==='') return null;
    try {
      const p = line.split('\t');
      if (p.length < 4) return null;
      if (tool==='GNET'||!colMap) {
        const rsrp=parseFloat(p[13]),rsrq=parseFloat(p[14]),snr=parseFloat(p[15]);
        if (isNaN(rsrp)) return null;
        const ts=p[0]||'', tsDisp=ts.replace('_',' ').replace(/\./g,':'), timePart=tsDisp.substring(11)||tsDisp;
        return { _tool:'GNET',_live:true,ts,tsDisp,timePart,lat:parseFloat(p[2]),lon:parseFloat(p[1]),rsrp,rsrq:isNaN(rsrq)?0:rsrq,snr:isNaN(snr)?0:snr,speed:parseFloat(p[3])||0,operator:(p[4]||'').trim(),cellname:(p[7]||'').trim(),tech:(p[11]||'').trim(),pci:null,dl:parseFloat(p[19])||0,ul:parseFloat(p[20])||0,band:(p[54]||'').trim(),nr_rsrp:null,nr_rsrq:null,nr_sinr:null,nr_rssi:null,nr_band:null,nr_arfcn:null,nr_pci:null,nr_dl:null,nr_ul:null,_hasNrCols:false,_sessionTech:'4G' };
      }
    } catch(e) { return null; }
    return null;
  }

  function stats(arr, key) {
    const vals = arr.map(d=>d[key]).filter(v=>v!==null&&!isNaN(v));
    if (!vals.length) return {avg:0,min:0,max:0,count:0};
    const sum = vals.reduce((a,b)=>a+b,0);
    return {avg:parseFloat((sum/vals.length).toFixed(1)),min:parseFloat(Math.min(...vals).toFixed(1)),max:parseFloat(Math.max(...vals).toFixed(1)),count:vals.length};
  }

  function calcDuration(t0,t1) {
    try {
      const parse = t => { const clean=t.replace('_','T').replace(/\./g,':'); const [date,time]=clean.split('T'); const [y,m,d]=date.split(':'); return new Date(`${y}-${m}-${d}T${time}`); };
      const diff=(parse(t1)-parse(t0))/1000;
      if (isNaN(diff)||diff<0) return '—';
      const h=Math.floor(diff/3600),m=Math.floor((diff%3600)/60),s=Math.round(diff%60);
      return h>0?`${h}j ${m}m ${s}s`:`${m}m ${s}s`;
    } catch { return '—'; }
  }

  function _hav(lat1, lon1, lat2, lon2) {
    const R = 6371000; // earth radius m
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Distance-based thinning, ~1 point per (routeLen/maxPts). Falls back to index-based if no GPS.
  function thin(arr, maxPts=800) {
    if (arr.length <= maxPts) return arr;
    const hasGeo = arr[0] && typeof arr[0].lat === 'number' && typeof arr[0].lon === 'number';
    if (!hasGeo) {
      const step = Math.ceil(arr.length / maxPts);
      return arr.filter((_, i) => i % step === 0);
    }
    let totalDist = 0;
    const segs = new Array(arr.length);
    segs[0] = 0;
    for (let i = 1; i < arr.length; i++) {
      let d = _hav(arr[i-1].lat, arr[i-1].lon, arr[i].lat, arr[i].lon);
      if (d > 1000) d = 0; // ignore jumps > 1km
      totalDist += d;
      segs[i] = d;
    }
    if (totalDist < 1) {
      const step = Math.ceil(arr.length / maxPts);
      return arr.filter((_, i) => i % step === 0);
    }
    const stepDist = totalDist / maxPts;
    const out = [arr[0]];
    let acc = 0;
    for (let i = 1; i < arr.length; i++) {
      acc += segs[i];
      if (acc >= stepDist) {
        out.push(arr[i]);
        acc = 0;
      }
    }
    if (out[out.length-1] !== arr[arr.length-1]) out.push(arr[arr.length-1]);
    return out;
  }

  function nrStats(data) {
    const nrPts=data.filter(d=>d.nr_rsrp!==null&&!isNaN(d.nr_rsrp));
    if (!nrPts.length) return null;
    return {count:nrPts.length,rsrp:stats(nrPts,'nr_rsrp'),rsrq:stats(nrPts,'nr_rsrq'),sinr:stats(nrPts,'nr_sinr'),rssi:stats(nrPts,'nr_rssi')};
  }

  function getToolName(rows) {
    if (!rows.length) return 'Unknown';
    const t = rows[0]._tool;
    const map = {GNET:'G-NetTrack Pro',TEMS:'TEMS Investigation',NEMO:'NEMO Outdoor/Handy',SIGMON:'SIGMON'};
    return map[t]||t;
  }

  return { parseTxt, parseKml, parseLiveLine, stats, calcDuration, thin, nrStats, getToolName, detectTool, mapDetailedEventType };
})();
