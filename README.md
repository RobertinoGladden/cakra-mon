# CAKRA v2

**Drive Test Intelligence** untuk RF Engineer — analisis LTE & 5G NR dari G-NetTrack Pro, TEMS Investigation, NEMO Outdoor, NEMO Handy, dan SIGMON. Berjalan sepenuhnya sebagai web app statis langsung di browser, tanpa instalasi dan tanpa backend.

![version](https://img.shields.io/badge/versi-2.0.1-38bdf8?style=flat-square) ![type](https://img.shields.io/badge/tipe-static%20web%20app-4ade80?style=flat-square) ![PWA](https://img.shields.io/badge/PWA-enabled-a78bfa?style=flat-square)

---

## Fitur

| Fitur | Keterangan |
|---|---|
| **Import TXT** | Parse otomatis file `.txt` export G-NetTrack Pro, mendukung multi-file |
| **Import KML** | Parse file `.kml` events — Handover dan Cell Reselection |
| **Grafik Interaktif** | Visualisasi RSRP, RSRQ, SNR, Throughput DL/UL berbasis Chart.js |
| **Peta Sinyal** | Peta berbasis Leaflet — layer RSRP, RSRQ, SNR, Rawan, dan Events overlay |
| **Tabel Events** | Daftar dan marker Handover & Cell Reselection dengan detail parameter |
| **Distribusi Parameter** | Bar chart distribusi persentase per kategori kualitas |
| **Deteksi Titik Rawan** | Auto-deteksi titik di luar ambang batas threshold |
| **Export PNG** | Unduh tiap grafik sebagai gambar |
| **AI Analyst** | Analisis otomatis & chat interaktif berbasis Groq LLM (llama-3.3-70b) |
| **Responsif** | Sidebar collapsible, mobile-friendly |

---

## AI Analyst

Fitur AI Analyst memungkinkan RF engineer mendiskusikan data drive test secara interaktif menggunakan model bahasa besar melalui Groq API. Tersedia enam mode analisis cepat yang menghasilkan laporan terstruktur dalam Bahasa Indonesia teknis.

| Mode | Cakupan |
|---|---|
| Laporan Lengkap | Ringkasan eksekutif + semua parameter |
| Evaluasi KPI | RSRP, RSRQ, SNR vs standar 3GPP dengan quality score |
| Analisis Coverage | Distribusi sinyal, coverage holes, fluktuasi |
| Analisis Handover | Frekuensi, ping-pong, parameter A3/TTT |
| Throughput | Performa DL/UL, korelasi RF, bottleneck |
| Rekomendasi | Optimasi quick-wins hingga long-term planning |

Data drive test diproses **100% di browser** dan tidak pernah dikirim ke server selain ke endpoint Groq API untuk keperluan inferensi LLM. API key hanya disimpan di `sessionStorage` dan hilang ketika tab ditutup.

---

## Virtual Drive Test — Mobility Engine & Peta 3D (v2.2)

Modul `predict.html` (Virtual Drive Test) kini memakai engine handover berbasis standar, bukan lagi "site RSRP tertinggi langsung menang":

- **L3 quality filtering** (3GPP TS 36.331 §5.5.3.2): `F_n = (1-a)·F_{n-1} + a·M_n`, `a = 1/2^(k/4)` — meredam fast-fading sebelum dipakai untuk keputusan mobility.
- **Event A3** (§5.5.4.4): `Mn − Hysteresis > Mp + A3-Offset` — neighbour harus lebih baik dari serving cell sebesar margin tertentu.
- **Time-to-Trigger**: kondisi A3 harus bertahan terus-menerus selama TTT (0–5120 ms, nilai standar 3GPP) sebelum handover benar-benar dieksekusi.
- **Ping-pong**: HO balik ke sel asal dalam jendela waktu pendek pasca-HO sebelumnya ditandai sbg indikator tuning kurang tepat.

Parameter ini (`Hysteresis`, `A3-Offset`, `TimeToTrigger`, `FilterCoefficient`) sama persis dengan yang di-tuning RF engineer di OSS Huawei/Ericsson/Nokia, bisa diatur langsung di Step 4. Implementasi ada di `js/handover.js`, dipakai oleh `js/predict.js`.

Peta 3D (tombol "🧊 Peta 3D" di halaman Virtual Drive Test) memakai **MapLibre GL JS + OpenFreeMap** (`js/map3d.js`) — gratis, tanpa API key, dengan 3D building extrusion native dari data OSM asli. Ini murni untuk visualisasi konteks lapangan (skyline, ketinggian bangunan vs antena); perhitungan obstruksi LOS/NLOS tetap memakai data Overpass API (`js/buildings.js`, juga OSM, juga tanpa API key — kadang kena rate-limit, bukan butuh key).

---

## Update Peta & Layout Dashboard (v2.3)

- **Basemap diganti dari CARTO → MapLibre GL JS + OpenFreeMap** (`js/map.js`, `js/predict.js`, via plugin `maplibre-gl-leaflet`). CARTO sejak akhir Agustus 2026 mewajibkan API key untuk raster basemap dan menampilkan watermark "API KEY REQUIRED" tanpa key. OpenFreeMap gratis, tanpa API key sama sekali. Semua peta "flat" (dashboard Peta Sinyal, peta Virtual Drive Test) memakai style vector `dark`/`positron` sesuai tema; peta 3D (`js/map3d.js`) tetap terpisah sbg fitur lanjutan.
- **Tabel Events & Titik Rawan: 10 baris/halaman** (sebelumnya 25).
- **Dashboard kini panel-switch, bukan satu halaman scroll panjang.** Klik item di sidebar langsung menampilkan section tsb saja (spt dashboard profesional/Grafana-style), section lain disembunyikan (`display:none`). Judul topbar otomatis mengikuti section aktif.

---

## Struktur File

```
cakra/
├── index.html              ← Halaman upload
├── dashboard.html          ← Dashboard analisis utama
├── compare.html            ← Halaman perbandingan sesi
├── about.html              ← Halaman tentang
├── docs.html               ← Dokumentasi teknis
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service worker (offline cache)
├── api/
│   └── groq.js             ← Proxy handler Groq API
├── css/
│   ├── base.css            ← Design tokens & shared styles
│   ├── upload.css          ← Halaman upload
│   └── dashboard.css       ← Dashboard layout & komponen
├── js/
│   ├── parser.js           ← Parser TXT & KML (multi-tool)
│   ├── upload.js           ← Logika upload & validasi
│   ├── charts.js           ← Chart.js rendering (LTE & 5G NR)
│   ├── map.js              ← Leaflet map & signal layers
│   ├── export.js           ← Export PNG, CSV, laporan
│   ├── ai.js               ← AI Analyst & streaming chat
│   └── dashboard.js        ← Controller dashboard
└── icons/
    └── icon.svg
```

---

## Format File yang Didukung

### TXT — G-NetTrack Pro Export
File tab-separated hasil export dari menu Session. Kolom yang diproses: `Timestamp`, `Longitude`, `Latitude`, `Level (RSRP)`, `Qual (RSRQ)`, `SNR`, `DL_bitrate`, `UL_bitrate`, `Cellname`, `Node`, `CellID`, `LAC`, `Band`, dan kolom 5G NR bila tersedia (`NR RSRP`, `SS-SINR`, `NR Band`, dll).

### KML — Events Export
File export events dari G-NetTrack Pro. Mendukung event `HANDOVER_DATA_4G4G` dan `CELL_RESELECTION_4G4G`. Data yang ditampilkan: From/To cell, RSRP, RSRQ, SNR, eNB, DL/UL bitrate, Speed.

---

## Standar Parameter

| Parameter | Kategori | Rentang |
|---|---|---|
| **RSRP** | Sangat Baik | > −80 dBm |
| | Baik | −80 ~ −90 dBm |
| | Normal | −90 ~ −100 dBm |
| | Buruk | −100 ~ −110 dBm |
| | Sangat Buruk | < −110 dBm |
| **RSRQ** | Excellent | > −9 dB |
| | Best | −10 ~ −9 dB |
| | Good | −15 ~ −10 dB |
| | Poor | −19 ~ −15 dB |
| | Bad | < −19 dB |
| **SNR** | Sangat Baik | > 20 dB |
| | Baik | 10 ~ 20 dB |
| | Cukup | 0 ~ 10 dB |
| | Buruk | −10 ~ 0 dB |
| | Sangat Buruk | < −10 dB |

Threshold di atas mengacu pada rentang valid 3GPP TS 36.133 / 38.215 dengan label kualitatif yang umum digunakan di lingkungan operator Indonesia.

---

## Dependensi

| Library | Versi | Fungsi |
|---|---|---|
| Chart.js | 4.4.1 | Grafik interaktif |
| Leaflet | 1.9.4 | Peta interaktif |
| CARTO Dark Tile | — | Basemap gelap |
| Groq API | — | Inferensi LLM (AI Analyst) |
| Google Fonts | — | JetBrains Mono, Barlow |

---

## Catatan Teknis

- Semua data diproses di sisi klien — tidak ada server yang menyimpan data pengguna.
- `sessionStorage` digunakan untuk transfer data antar halaman dan dibersihkan otomatis saat tab ditutup.
- Untuk file berukuran besar (>50 ribu baris), data secara otomatis di-*thin* menggunakan algoritma berbasis jarak Haversine agar performa rendering tetap optimal tanpa bias terhadap area urban yang padat sample.
- Peta menggunakan CARTO Dark tiles yang berfungsi baik dari `file://` maupun dari server.

---

## Lingkup Penggunaan

CAKRA adalah **engineer's exploration tool** — dirancang untuk eksplorasi cepat data drive test, eksperimentasi parameter, dan diskusi internal tim RNO/RNP. Tool ini bukan instrumen formal untuk pelaporan compliance ke regulator.

Threshold KPI yang digunakan selaras dengan rentang valid 3GPP TS 36.133 / 38.215, namun label kualitatif tidak distandarisasi 3GPP secara formal. Untuk verifikasi formal dan pelaporan ke Kominfo, gunakan tool planning resmi (Atoll, Asset, MapInfo Pro, TEMS Investigation laporan resmi, atau Nemo Analyzer).

---

© 2026 Robertino Gladden Narendra. Hak cipta dilindungi.
