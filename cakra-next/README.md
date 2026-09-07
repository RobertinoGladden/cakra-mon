# CAKRA Next — Telecom Drive Test Intelligence

Current release: **v3.0.0**

This build extends the CAKRA Next scaffold from a static UI into a browser-first RF analytics application.

## Included

- Multi-file TXT/CSV/KML drive-test parsing with G-NetTrack/TEMS/NEMO/SIGMON header aliases and rejection counters.
- Global `DriveTestContext` state for active session, filters, events and parsed points.
- Chart.js KPI time-series for RSRP, RSRQ, SNR and DL throughput.
- Leaflet RF route map with RSRP-colored segments, weak-spot popups and signal legend.
- RF diagnostics: coverage gaps, cell churn windows, Pearson RSRP↔throughput correlation, throughput buckets and PCI Mod-3 conflicts.
- WebGL MapLibre VDT scene with camera controls, full-screen mode, coverage-column extrusion, sector cones, route playback, handover picking, and compatible vector-tile building extrusion.
- VDT scenario workspace: browser-persisted BTS/sector editor, JSON scenario export, configurable service/weak/A3 policy thresholds, geospatial prediction heatmap, and CSV export of hysteresis/dwell-time handover events.
- Parsed drive-test session persistence in IndexedDB, so a refresh does not discard the active dataset when browser storage is available.
- Caca contextual session diagnosis with private service fallback.
- Light/dark theme, EN/ID dictionary support, responsive mobile shell and zero-overflow table layout.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Architecture

```text
src/
├── app/                  App Router pages + API route
├── components/           UI, charts, map, VDT (including Vdt3DMap) and AI components
├── context/              Global drive-test state
└── lib/
    ├── parseDriveTestLog.ts
    ├── driveTestSessionStore.ts
    ├── rf/analysis.ts
    └── vdt/
        ├── predict.ts
        └── scenario.ts
```

## VDT model scope

The VDT is a deterministic planning and comparison tool. It calculates best-server
RSRP with free-space path loss, sector pattern, height gain and simple distance
loss. The WebGL 3D map is a real MapLibre scene: it offers camera controls,
coverage-column extrusion, and building extrusion whenever the configured vector
style exposes a compatible `building` layer. It is **not** yet an RF ray-tracing
engine: there is no terrain/clutter raster, building attenuation, or calibrated
antenna file. Treat exported results as scenario estimates until calibrated against
field measurements.

### 3D map style

The pinned MapLibre runtime is vendored under `public/vendor`, so the application
does not require npm to start the WebGL renderer. The map's vector style and tile
service are intentionally configurable with `NEXT_PUBLIC_MAP_STYLE_URL`. The
default uses OpenFreeMap's public bright style for development. For production,
point this variable to an approved, licensed vector style that includes building
height attributes; do not rely on a public tile endpoint for guaranteed capacity.

VDT "actual handovers" are modeled A3 decisions: a new best sector must exceed the
current sector by the selected margin for the selected number of route samples.
