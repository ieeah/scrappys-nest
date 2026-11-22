#!/usr/bin/env node

/**
 * Scrappy's Nest — ARC Raiders Maps Data & Tiles Synchronizer
 *
 * Sincronizza i dati da arcraidersmaps.app:
 * 1. Scarica i marker/POI per tutte le 7 mappe di gioco (stella-montis, spaceport, dam, buried-city, blue-gate, riven-tides, pendola-pass).
 * 2. Normalizza i POI in src/data/map-pois.json con coordinate Leaflet CRS.Simple [y, x].
 * 3. Aggiorna src/data/maps.json con i metadati dei piani, bounds [0, 0, 4096, 4096], zoom levels e conteggio POI.
 * 4. Scarica i tile piramidali (zoom 0..3: 85 tile per livello) per Stella Montis:
 *    - upper -> scripts/data/maps/stella-montis-l2/
 *    - lower -> scripts/data/maps/stella-montis-l1/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const RAW_CACHE = join(__dirname, 'maps-pois-raw.json');
const POI_OVERRIDES_PATH = join(ROOT, 'src', 'data', 'map-pois-overrides.json');

const MAP_DEFINITIONS = [
  { id: 'dam', name: 'Dam Battlegrounds', badge: 'Swamp & Dam' },
  { id: 'buried-city', name: 'Buried City', badge: 'Wasteland' },
  { id: 'spaceport', name: 'The Spaceport', badge: 'Acerra' },
  { id: 'blue-gate', name: 'The Blue Gate', badge: 'Valley' },
  { id: 'stella-montis', name: 'Stella Montis', badge: 'Mountain Lab' },
  { id: 'riven-tides', name: 'Riven Tides', badge: 'Coastal Harbor' },
  { id: 'pendola-pass', name: 'Pendola Pass', badge: 'Summit Basin' },
];

function getMapFloors(mapId) {
  switch (mapId) {
    case 'stella-montis':
      return [
        { id: 'stella-montis-l2', name: 'Livello 1 (Lobby)', floorLevel: 0, layerKey: 'stella-montis-l2', isDefault: true },
        { id: 'stella-montis-l1', name: 'Livello 2 (Metro & Vault)', floorLevel: -1, layerKey: 'stella-montis-l1' },
      ];
    case 'spaceport':
      return [
        { id: 'spaceport', name: 'Superficie', floorLevel: 0, layerKey: 'spaceport', isDefault: true },
        { id: 'underground', name: 'Sotterraneo', floorLevel: -1, layerKey: 'underground' },
      ];
    case 'blue-gate':
      return [
        { id: 'blue-gate', name: 'Superficie', floorLevel: 0, layerKey: 'blue-gate', isDefault: true },
        { id: 'underground', name: 'Sotterraneo', floorLevel: -1, layerKey: 'underground' },
      ];
    default:
      return [
        { id: mapId, name: 'Superficie', floorLevel: 0, layerKey: mapId, isDefault: true },
      ];
  }
}

async function fetchWithRetry(url, retries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
}

async function pMap(items, mapper, concurrency = 6) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await mapper(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function downloadTilesForLayer(remoteLayerName, targetFolder, refresh = false) {
  const targetDir = join(ROOT, 'scripts', 'data', 'maps', targetFolder);
  const tileTasks = [];

  // Zoom levels 0 to 3:
  // z=0: 1 tile, z=1: 4 tiles, z=2: 16 tiles, z=3: 64 tiles => total 85 tiles
  for (let z = 0; z <= 3; z++) {
    const maxCoord = Math.pow(2, z);
    for (let x = 0; x < maxCoord; x++) {
      for (let y = 0; y < maxCoord; y++) {
        tileTasks.push({ z, x, y });
      }
    }
  }

  console.log(`\n⬇️  Scaricamento di ${tileTasks.length} tile per ${remoteLayerName} -> ${targetFolder}...`);

  let completed = 0;
  let skipped = 0;
  await pMap(
    tileTasks,
    async ({ z, x, y }) => {
      const tileUrl = `https://arcraidersmaps.app/static/maps/v2/stella-montis/layers/${remoteLayerName}/tiles/${z}/${x}/${y}.webp`;
      const outDir = join(targetDir, String(z), String(x));
      const outFile = join(outDir, `${y}.webp`);

      if (!refresh && existsSync(outFile)) {
        skipped++;
        return;
      }

      mkdirSync(outDir, { recursive: true });

      try {
        const res = await fetchWithRetry(tileUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        writeFileSync(outFile, buffer);
        completed++;
      } catch (err) {
        console.warn(`  ⚠️ Errore download tile ${z}/${x}/${y}:`, err.message);
      }
    },
    8
  );

  console.log(`  ✓ Completati ${completed}/${tileTasks.length} tile in ${targetFolder} (${skipped} da cache)`);
}

function applyPoiOverrides(pois, poiOverrides) {
  if (!poiOverrides || typeof poiOverrides !== 'object') return pois;
  const hiddenSet = new Set(Array.isArray(poiOverrides.hidden) ? poiOverrides.hidden : []);
  const overridesMap = poiOverrides.overrides && typeof poiOverrides.overrides === 'object' ? poiOverrides.overrides : {};
  const addedList = Array.isArray(poiOverrides.added) ? poiOverrides.added : [];

  const filtered = [];
  const seenIds = new Set();
  for (const poi of pois) {
    if (hiddenSet.has(poi.id)) continue;
    const patch = overridesMap[poi.id];
    const merged = patch && typeof patch === 'object' ? { ...poi, ...patch, id: poi.id } : poi;
    filtered.push(merged);
    seenIds.add(merged.id);
  }

  for (const extra of addedList) {
    if (!extra?.id || hiddenSet.has(extra.id) || seenIds.has(extra.id)) continue;
    filtered.push(extra);
    seenIds.add(extra.id);
  }

  return filtered;
}

async function loadRawPoisByMap(refresh) {
  if (!refresh && existsSync(RAW_CACHE)) {
    const cached = JSON.parse(readFileSync(RAW_CACHE, 'utf-8'));
    console.log(`📦 Uso cache locale POI da ${RAW_CACHE} (passa --refresh per riscaricare).`);
    return cached;
  }

  const rawByMap = {};
  for (const def of MAP_DEFINITIONS) {
    const url = `https://api.arcraidersmaps.app/locations?mapId=${def.id}`;
    console.log(`\n📥 Fetching POIs per "${def.name}" (${def.id})...`);

    const res = await fetchWithRetry(url);
    const rawLocations = await res.json();

    if (!Array.isArray(rawLocations)) {
      console.warn(`  ⚠️ Risposta non valida per ${def.id}:`, rawLocations);
      rawByMap[def.id] = [];
      continue;
    }
    rawByMap[def.id] = rawLocations;
  }

  writeFileSync(RAW_CACHE, JSON.stringify(rawByMap, null, 2), 'utf-8');
  console.log(`💾 Salvata cache raw POI in ${RAW_CACHE}`);
  return rawByMap;
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  console.log(`🚀 Avvio sincronizzazione mappe da arcraidersmaps.app (${refresh ? 'NETWORK REFRESH' : 'CACHE LOCALE'})...`);

  const rawByMap = await loadRawPoisByMap(refresh);
  const allPois = [];

  for (const def of MAP_DEFINITIONS) {
    const rawLocations = rawByMap[def.id] ?? [];
    let mapCount = 0;
    for (const loc of rawLocations) {
      const layer = (def.id === 'pendola-pass' && loc.layer === 'surface')
        ? 'pendola-pass'
        : (loc.layer || def.id);
      const floorLevel = (layer === 'stella-montis-l1' || layer === 'underground') ? -1 : 0;

      allPois.push({
        id: loc.id,
        mapId: def.id,
        title: loc.name || loc.locationType.replace(/_/g, ' '),
        description: loc.description || undefined,
        coordinate: loc.coordinate,
        category: loc.locationType,
        floorLevel,
        layer,
        image: loc.image || undefined,
      });
      mapCount++;
    }

    console.log(`  ✓ Estratti ${mapCount} POI per ${def.name}`);
  }

  let finalPois = allPois;
  if (existsSync(POI_OVERRIDES_PATH)) {
    try {
      const poiOverrides = JSON.parse(readFileSync(POI_OVERRIDES_PATH, 'utf-8'));
      finalPois = applyPoiOverrides(allPois, poiOverrides);
      const delta = finalPois.length - allPois.length;
      if (delta !== 0 || Object.keys(poiOverrides.overrides ?? {}).length > 0) {
        console.log(`✔ Applicati override POI da ${POI_OVERRIDES_PATH} (${finalPois.length} POI finali)`);
      }
    } catch (err) {
      console.warn(`⚠️ Impossibile leggere ${POI_OVERRIDES_PATH}: ${err.message}`);
    }
  }

  // Salvataggio src/data/map-pois.json
  const poisOutputFile = join(ROOT, 'src', 'data', 'map-pois.json');
  const poisPayload = {
    _meta: {
      totalPois: finalPois.length,
      extractedAt: new Date().toISOString().split('T')[0],
      source: 'arcraidersmaps.app',
    },
    pois: finalPois,
  };
  writeFileSync(poisOutputFile, JSON.stringify(poisPayload, null, 2), 'utf-8');
  console.log(`\n✔ Salvati ${finalPois.length} POI in: ${poisOutputFile}`);

  // Salvataggio src/data/maps.json (senza totalPois per M-02)
  const mapsOutputFile = join(ROOT, 'src', 'data', 'maps.json');
  const mapsPayload = {
    bounds: [0, 0, 4096, 4096],
    defaultZoom: 2,
    minZoom: 1,
    maxZoom: 5,
    maps: MAP_DEFINITIONS.map(def => {
      const floors = getMapFloors(def.id);

      return {
        id: def.id,
        name: def.name,
        badge: def.badge,
        hasMultiFloor: floors.length > 1,
        bounds: [0, 0, 4096, 4096],
        defaultZoom: 2,
        minZoom: 1,
        maxZoom: 5,
        floors,
      };
    }),
  };
  writeFileSync(mapsOutputFile, JSON.stringify(mapsPayload, null, 2), 'utf-8');
  console.log(`✔ Aggiornato catalogo mappe in: ${mapsOutputFile}`);

  // Download dei tile per Stella Montis (upper e lower)
  await downloadTilesForLayer('stella-montis-upper', 'stella-montis-l2', refresh);
  await downloadTilesForLayer('stella-montis-lower', 'stella-montis-l1', refresh);

  console.log('\n🎉 Sincronizzazione mappe arcraidersmaps.app completata con successo!');
}

main().catch(err => {
  console.error('\n❌ Errore fatale:', err);
  process.exit(1);
});
