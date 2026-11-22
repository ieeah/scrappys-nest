/**
 * Sincronizza i dati completi delle quest narrative dei commercianti (123 quest)
 * incrociando MetaForge (albero, nodi, posizioni canvas, ricompense) e ARC Tracker
 * (nomi italiani ufficiali, descrizioni e obiettivi localizzati).
 *
 * Le 15 ricerche della Research Station (amplificazioni armi) vengono isolate
 * ed esportate a parte in src/data/weapon-amplification-research.json.
 *
 * Output:
 *  - src/data/quests-source.json (albero e grafo completo per visualizzazione/editing)
 *  - src/data/quests.json        (elenco QuestList conformato al modello List per l'app)
 *  - src/data/weapon-amplification-research.json (le 15 ricerche Research Station per le armi)
 *
 * Uso:
 *  node scripts/fetch-quests.mjs            (usa la cache se presente)
 *  node scripts/fetch-quests.mjs --refresh  (riscarica da MetaForge e ARC Tracker)
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadArcTracker, extractList, normalizeId } from './lib/arctracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const METAFORGE_CACHE = join(__dirname, 'metaforge-quests-raw.json');
const ARCTRACKER_CACHE = join(__dirname, 'arctracker-raw.json');

const QUESTS_SOURCE_PATH = join(ROOT, 'src', 'data', 'quests-source.json');
const QUESTS_JSON_PATH = join(ROOT, 'src', 'data', 'quests.json');
const QUESTS_OVERRIDES_PATH = join(ROOT, 'src', 'data', 'quests-overrides.json');
const AMP_RESEARCH_PATH = join(ROOT, 'src', 'data', 'weapon-amplification-research.json');
const UPSTREAM_ALIASES_PATH = join(__dirname, 'data', 'upstream-aliases.json');

const UPSTREAM_ALIASES = existsSync(UPSTREAM_ALIASES_PATH)
  ? JSON.parse(readFileSync(UPSTREAM_ALIASES_PATH, 'utf-8'))
  : {};

const TRADER_MAP = {
  celeste: 'celeste',
  shani: 'shani',
  apollo: 'apollo',
  lance: 'lance',
};

function normalizeTrader(rawTrader) {
  const norm = String(rawTrader || '').toLowerCase().trim();
  return UPSTREAM_ALIASES.traders?.[norm] || TRADER_MAP[norm] || norm.replace(/[\s_]+/g, '-');
}

function normalizeMap(rawMap) {
  if (!rawMap) return null;
  if (Array.isArray(rawMap)) {
    const normalized = rawMap.map((m) => normalizeMap(m)).filter(Boolean);
    return normalized.length > 0 ? normalized : null;
  }
  const norm = String(rawMap).toLowerCase().trim();
  return UPSTREAM_ALIASES.maps?.[norm] || norm.replace(/_/g, '-');
}

function normalizeItemId(rawId) {
  if (!rawId) return 'unknown';
  const id = String(rawId).toLowerCase().trim().replace(/_/g, '-');
  // Se finisce con -recipe o -blueprint ma è un comune materiale, rimuovi il suffisso
  const cleanId = id.endsWith('-recipe') && !id.includes('blueprint')
    ? id.replace(/-recipe$/, '')
    : id;
  return UPSTREAM_ALIASES.quests?.[cleanId] || cleanId;
}

function mergeTranslations(base = {}, override = {}) {
  const merged = { ...base };
  for (const [lang, fields] of Object.entries(override)) {
    if (fields && typeof fields === 'object') {
      merged[lang] = { ...(merged[lang] ?? {}), ...fields };
    }
  }
  return merged;
}

function mergeActions(baseActions = [], overrideActions) {
  if (!overrideActions) return baseActions;
  // Supporta sia array di patch con `id` sia mappa `{ [actionId]: patch }`
  const patches = Array.isArray(overrideActions)
    ? overrideActions
    : Object.entries(overrideActions).map(([id, fields]) => ({ id, ...fields }));

  const result = baseActions.map((a) => ({ ...a }));
  for (const patch of patches) {
    if (!patch?.id) continue;
    const idx = result.findIndex((a) => a.id === patch.id);
    if (idx === -1) {
      result.push(patch);
      continue;
    }
    const base = result[idx];
    result[idx] = {
      ...base,
      ...patch,
      ...(base.translations || patch.translations
        ? { translations: mergeTranslations(base.translations, patch.translations) }
        : {}),
    };
  }
  return result;
}

/**
 * Applica gli override manuali da `quests-overrides.json` alle liste generate.
 * Preserva campi di testata (`trader`, `prerequisites`, `translations`) e merge granulare
 * su `levels` e `actions` (inclusi `carryItems` e `maps`).
 */
function applyQuestOverrides(lists, overrides) {
  if (!overrides || typeof overrides !== 'object') return { lists, applied: 0 };
  let applied = 0;

  const updated = lists.map((quest) => {
    const ovr = overrides[quest.id];
    if (!ovr || typeof ovr !== 'object') return quest;
    applied++;

    const { translations: ovrTranslations, levels: ovrLevels, ...headerPatch } = ovr;
    const merged = {
      ...quest,
      ...headerPatch,
      id: quest.id,
      ...(quest.translations || ovrTranslations
        ? { translations: mergeTranslations(quest.translations, ovrTranslations) }
        : {}),
    };

    if (ovrLevels) {
      const levelPatches = Array.isArray(ovrLevels)
        ? ovrLevels
        : Object.entries(ovrLevels).map(([lvl, fields]) => ({ level: Number(lvl), ...fields }));

      const nextLevels = (quest.levels ?? []).map((lvl) => ({ ...lvl }));
      for (const lvlPatch of levelPatches) {
        const targetLevelNum = lvlPatch.level ?? 1;
        const idx = nextLevels.findIndex((l) => l.level === targetLevelNum);
        if (idx === -1) {
          nextLevels.push({ level: targetLevelNum, requirementItemIds: [], ...lvlPatch });
          continue;
        }
        const baseLvl = nextLevels[idx];
        const { actions: ovrActions, ...lvlFields } = lvlPatch;
        nextLevels[idx] = {
          ...baseLvl,
          ...lvlFields,
          ...(baseLvl.actions || ovrActions
            ? { actions: mergeActions(baseLvl.actions, ovrActions) }
            : {}),
        };
      }
      merged.levels = nextLevels;
    }

    return merged;
  });

  return { lists: updated, applied };
}

async function fetchMetaForgeQuests(refresh = false) {
  if (!refresh && existsSync(METAFORGE_CACHE)) {
    console.log(`Uso cache MetaForge quests da ${METAFORGE_CACHE}`);
    return JSON.parse(readFileSync(METAFORGE_CACHE, 'utf-8'));
  }

  console.log('Scaricamento delle quest da MetaForge API…');
  const all = [];
  let page = 1;
  while (true) {
    const url = `https://metaforge.app/api/arc-raiders/quests?limit=100&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MetaForge quests HTTP ${res.status}`);
    const json = await res.json();
    all.push(...json.data);
    if (!json.pagination?.hasNextPage) break;
    page++;
  }

  writeFileSync(METAFORGE_CACHE, JSON.stringify(all, null, 2), 'utf-8');
  console.log(`Scaricate ${all.length} quest da MetaForge (cache salvata).`);
  return all;
}

async function main() {
  const refresh = process.argv.includes('--refresh');

  console.log('=== Scrappy\'s Nest — Sincronizzatore Quest ===\n');

  // 1. Carica MetaForge
  const mfQuests = await fetchMetaForgeQuests(refresh);

  // 2. Carica ARC Tracker
  console.log('Caricamento dati ARC Tracker…');
  const arcData = await loadArcTracker({
    cachePath: ARCTRACKER_CACHE,
    refresh,
    log: (m) => console.log(`  ${m}`),
  });
  const arcQuests = extractList('quests', arcData.quests);
  console.log(`Caricate ${arcQuests.length} quest totali da ARC Tracker.\n`);

  // Indicizzazione ARC Tracker per matching
  const arcByName = new Map();
  const arcById = new Map();
  for (const q of arcQuests) {
    if (q.name?.en) arcByName.set(q.name.en.toLowerCase().trim(), q);
    if (q.id) arcById.set(normalizeId(q.id), q);
  }

  // 3. Separa le 15 ricerche della Research Station per le armi amplificate
  const rsQuests = arcQuests.filter((q) => q.trader === 'Research Station');
  console.log(`Isolamento delle ${rsQuests.length} ricerche per Stazione di Ricerca (amplificazioni armi)…`);

  const weaponResearchData = rsQuests.map((q) => {
    const rawId = normalizeId(q.id);
    return {
      id: UPSTREAM_ALIASES.research?.[rawId] || rawId,
      name: q.name?.en || q.id,
    translations: {
      it: {
        name: q.name?.it || q.name?.en || q.id,
      },
    },
    xp: q.xp ?? null,
    objectives: (q.objectives || []).map((obj) => ({
      en: obj.en || '',
      it: obj.it || obj.en || '',
    })),
    };
  });

  writeFileSync(AMP_RESEARCH_PATH, JSON.stringify(weaponResearchData, null, 2) + '\n', 'utf-8');
  console.log(`✓ Salvate 15 ricerche armi in ${AMP_RESEARCH_PATH}\n`);

  // 4. Elaborazione delle 123 Quest dei Commercianti
  console.log(`Elaborazione delle ${mfQuests.length} quest dei commercianti…`);

  const nodes = [];
  const edges = [];
  const lists = [];

  for (const mf of mfQuests) {
    const arcMatch = arcByName.get(mf.name.toLowerCase().trim()) || arcById.get(normalizeId(mf.id));
    const trader = normalizeTrader(mf.trader_name);

    // Prerequisiti
    const prereqs = (mf.manifest?.prerequisites || []).map((p) => p.quest_id);
    for (const prereqId of prereqs) {
      edges.push({
        id: `${prereqId}->${mf.id}`,
        source: prereqId,
        target: mf.id,
      });
    }

    // Traduzioni
    const itName = arcMatch?.name?.it || mf.name;
    const itDesc = arcMatch?.description?.it || mf.description || '';

    // Obiettivi / Azioni
    const actions = (mf.objectives || []).map((obj, i) => {
      const itLabel = arcMatch?.objectives?.[i]?.it || obj;
      return {
        id: `${mf.id}-action-${i + 1}`,
        label: obj,
        translations: {
          it: { label: itLabel },
        },
      };
    });

    // Ricompense
    const rewards = (mf.rewards || []).map((r) => ({
      itemId: normalizeItemId(r.item_id),
      quantity: r.quantity || 1,
    }));

    // Oggetti richiesti
    const requirementItemIds = (mf.required_items || []).map((r) => ({
      itemId: normalizeItemId(r.item_id),
      quantity: r.quantity || 1,
    }));

    // XP da additional_rewards o campo xp
    const xpReward =
      mf.additional_rewards?.find((r) => r.name === 'XP')?.quantity ||
      mf.xp ||
      arcMatch?.xp ||
      0;

    // Nodo per quests-source.json
    nodes.push({
      id: mf.id,
      metaforgeId: mf.id,
      name: mf.name,
      nameIT: itName,
      trader,
      map: normalizeMap(arcMatch?.map),
      description: mf.description || '',
      descriptionIT: itDesc,
      position: mf.position || { x: 0, y: 0 },
      image: mf.image || null,
      xp: xpReward,
      prerequisites: prereqs,
      rewards,
      requiredItems: requirementItemIds,
      objectives: (mf.objectives || []).map((obj, i) => ({
        en: obj,
        it: arcMatch?.objectives?.[i]?.it || obj,
      })),
    });

    // Oggetto List per quests.json
    lists.push({
      id: mf.id,
      name: mf.name,
      translations: {
        it: {
          name: itName,
          ...(itDesc ? { description: itDesc } : {}),
        },
      },
      maxLevel: 1,
      listType: 'quest',
      extractionWiped: false,
      trader,
      ...(prereqs.length > 0 ? { prerequisites: prereqs } : {}),
      levels: [
        {
          level: 1,
          requirementItemIds,
          ...(actions.length > 0 ? { actions } : {}),
          ...(rewards.length > 0 ? { rewards } : {}),
        },
      ],
      description: mf.description || undefined,
    });
  }

  // Ordina nodi e liste per ID
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));
  lists.sort((a, b) => a.id.localeCompare(b.id));

  // Scrivi quests-source.json
  const sourcePayload = {
    _meta: {
      description:
        'Dati completi delle 123 quest dei commercianti di Speranza. Nodi, posizioni canvas e reward da MetaForge; traduzioni IT ufficiali da ARC Tracker.',
      sources: [
        'https://metaforge.app/api/arc-raiders/quests',
        'https://arctracker.io/api/quests',
      ],
      totalQuests: nodes.length,
      totalEdges: edges.length,
      extractedAt: new Date().toISOString().slice(0, 10),
    },
    nodes,
    edges,
  };

  writeFileSync(QUESTS_SOURCE_PATH, JSON.stringify(sourcePayload, null, 2) + '\n', 'utf-8');
  console.log(`✓ Generato ${QUESTS_SOURCE_PATH} (${nodes.length} nodi, ${edges.length} archi).`);

  // Applica eventuali override manuali da quests-overrides.json
  let finalLists = lists;
  if (existsSync(QUESTS_OVERRIDES_PATH)) {
    try {
      const questOverrides = JSON.parse(readFileSync(QUESTS_OVERRIDES_PATH, 'utf-8'));
      const res = applyQuestOverrides(lists, questOverrides);
      finalLists = res.lists;
      if (res.applied > 0) {
        console.log(`✓ Applicati override manuali a ${res.applied} quest da ${QUESTS_OVERRIDES_PATH}`);
      }
    } catch (err) {
      console.warn(`⚠ Impossibile leggere ${QUESTS_OVERRIDES_PATH}: ${err.message}`);
    }
  }

  // Scrivi quests.json
  const listsPayload = {
    lists: finalLists,
  };

  writeFileSync(QUESTS_JSON_PATH, JSON.stringify(listsPayload, null, 2) + '\n', 'utf-8');
  console.log(`✓ Generato ${QUESTS_JSON_PATH} (${finalLists.length} quest pronte per il modello List).\n`);

  console.log('=== Sincronizzazione completata con successo! ===');
}

main().catch((err) => {
  console.error('Errore durante la sincronizzazione:', err);
  process.exit(1);
});
