// upload.js — upload page interactions & file validation — Cakra v2.0.1
// © 2026 Robertino Gladden Narendra. Hak cipta dilindungi.

'use strict';

let _txtData = null;
let _kmlData = null;
let _txtFilename = '';
let _kmlFilename = '';

function setupDropZone(zoneId, inputId, onFiles, opts = {}) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragging');
    const files = Array.from(e.dataTransfer.files);
    onFiles(files);
  });
  input.addEventListener('change', () => {
    if (input.files.length) onFiles(Array.from(input.files));
    input.value = '';
  });
}

function handleTxtFiles(files) {
  const auxPattern = /_(cellinfo|datatest|datateststate|events)\.(txt|csv)$/i;
  const aux = files.filter(f => auxPattern.test(f.name));
  if (aux.length) {
    const names = aux.map(f => f.name).join(', ');
    showTxtStatus(`File aux G-NetTrack di-skip: ${names}. Upload hanya master .txt-nya.`, 'warn');
  }
  const valid = files.filter(f =>
    (f.name.toLowerCase().endsWith('.txt') || f.name.toLowerCase().endsWith('.csv'))
    && !auxPattern.test(f.name)
  );
  if (!valid.length) {
    showTxtStatus(aux.length
      ? 'Semua file yang di-upload adalah file aux. Upload master .txt G-NetTrack (yang tanpa suffix _cellinfo/_datatest/_events).'
      : 'Format tidak dikenal. Gunakan file .txt dari G-NetTrack Pro.', 'err');
    return;
  }

  showTxtStatus('Memuat file...', 'loading');
  let allRows = [], pending = valid.length, names = [];

  valid.forEach(f => {
    names.push(f.name);
    const reader = new FileReader();
    reader.onload = e => {
      const rows = CakraParser.parseTxt(e.target.result);
      allRows = allRows.concat(rows);
      pending--;
      if (pending === 0) {
        if (!allRows.length) {
          showTxtStatus('Tidak ada data valid. Pastikan format file benar.', 'err');
          return;
        }
        _txtData = allRows;
        _txtFilename = names[0].replace(/\.[^.]+$/, '');
        showTxtStatus(`✓ ${allRows.length.toLocaleString()} data point dari ${names.join(', ')}`, 'ok');
        markZoneLoaded('txtDrop', `${allRows.length.toLocaleString()} rows`);
        checkAnalyzeReady();
      }
    };
    reader.onerror = () => { pending--; if (!pending) showTxtStatus('Gagal membaca file.', 'err'); };
    reader.readAsText(f);
  });
}

function handleKmlFiles(files) {
  const f = files.find(f => f.name.toLowerCase().endsWith('.kml'));
  if (!f) return;

  const reader = new FileReader();
  reader.onload = e => {
    const events = CakraParser.parseKml(e.target.result);
    _kmlData = events;
    _kmlFilename = f.name;
    if (!events.length) {
      showKmlStatus('Tidak ada event dalam KML atau format tidak dikenal.', 'warn');
    } else {
      showKmlStatus(`✓ ${events.length} event dari ${f.name}`, 'ok');
      markZoneLoaded('kmlDrop', `${events.length} events`);
    }
  };
  reader.readAsText(f);
}

function showTxtStatus(msg, type) {
  const el = document.getElementById('statusTxt');
  if (!el) return;
  el.className = 'status-item' + (type === 'err' ? ' status-err' : type === 'loading' ? '' : '');
  el.textContent = type === 'loading' ? '… ' + msg : msg;
  document.getElementById('statusContainer').style.display = 'flex';
}
function showKmlStatus(msg, type) {
  const el = document.getElementById('statusKml');
  if (!el) return;
  el.style.display = 'flex';
  el.className = 'status-item status-item-amber' + (type === 'err' ? ' status-err' : '');
  el.textContent = msg;
  document.getElementById('statusContainer').style.display = 'flex';
}

function markZoneLoaded(zoneId, label) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;
  zone.classList.add('loaded');
  const icon = zone.querySelector('.drop-icon');
  if (icon) {
    icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
  }
}

function checkAnalyzeReady() {
  const wrap = document.getElementById('analyzeWrap');
  if (wrap && _txtData && _txtData.length > 0) {
    wrap.style.display = 'block';
    wrap.style.animation = 'fadeUp 0.4s ease both';
  }
}

function startAnalysis() {
  if (!_txtData || !_txtData.length) return;

  const btn = document.getElementById('analyzeBtn');
  if (btn) {
    btn.innerHTML = `<span class="analyze-btn-text"><div style="width:18px;height:18px;border:2px solid rgba(56,189,248,0.3);border-top-color:var(--cyan);border-radius:50%;animation:spin 0.7s linear infinite"></div> Memproses...</span>`;
    btn.disabled = true;
  }

  try {
    sessionStorage.setItem('cakra_data', JSON.stringify(_txtData));
    sessionStorage.setItem('cakra_filename', _txtFilename);
    if (_kmlData && _kmlData.length) {
      sessionStorage.setItem('cakra_events', JSON.stringify(_kmlData));
      sessionStorage.setItem('cakra_kmlname', _kmlFilename);
    } else {
      sessionStorage.removeItem('cakra_events');
      sessionStorage.removeItem('cakra_kmlname');
    }
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 300);
  } catch (e) {
    // SessionStorage full — try chunked or warn
    alert('Data terlalu besar untuk disimpan. Coba file yang lebih kecil atau buka di browser lain.');
    if (btn) {
      btn.innerHTML = `<span class="analyze-btn-text"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Mulai Analisis</span><span class="analyze-btn-arrow">→</span>`;
      btn.disabled = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupDropZone('txtDrop', 'txtInput', handleTxtFiles);
  setupDropZone('kmlDrop', 'kmlInput', handleKmlFiles);
});
