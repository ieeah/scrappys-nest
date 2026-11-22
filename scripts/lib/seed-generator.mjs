/**
 * Generatore SQL Postgres puro e idempotente (Era 2 -> Era 3).
 * Allineato con ADR 009, ADR 010 e docs/specs/schema-postgres-e-seed-era2.md.
 */

import { validateDataset } from './dataset-validator.mjs';

const DEFAULT_BATCH_SIZE = 500;

/**
 * Escapa un valore testuale per SQL Postgres (`'` -> `''`, rimozione null-byte).
 * @param {unknown} value
 * @returns {string}
 */
export function sqlText(value) {
  if (value === null || value === undefined) return 'NULL';
  const cleaned = String(value).replace(/\0/g, '').replace(/'/g, "''");
  return `'${cleaned}'`;
}

/**
 * Formatta un booleano SQL.
 * @param {unknown} value
 * @returns {string}
 */
export function sqlBool(value) {
  return value ? 'true' : 'false';
}

/**
 * Formatta un intero SQL o NULL.
 * @param {unknown} value
 * @returns {string}
 */
export function sqlInt(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  const num = Number(value);
  return Number.isFinite(num) ? String(Math.trunc(num)) : 'NULL';
}

/**
 * Formatta un numero floating-point SQL o NULL.
 * @param {unknown} value
 * @returns {string}
 */
export function sqlReal(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : 'NULL';
}

/**
 * Formatta un timestamp ISO SQL o NULL.
 * @param {unknown} value
 * @returns {string}
 */
export function sqlTimestamp(value) {
  if (!value) return 'NULL';
  return `${sqlText(String(value))}::timestamptz`;
}

/**
 * Formatta un array di stringhe Postgres (`TEXT[]`).
 * @param {unknown[]} values
 * @returns {string}
 */
export function sqlTextArray(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "'{}'::text[]";
  }
  return `ARRAY[${values.map((v) => sqlText(v)).join(', ')}]::text[]`;
}

/**
 * Formatta un valore JSONB usando dollar-quoting sicuro contro apici e backslash.
 * @param {unknown} value
 * @returns {string}
 */
export function sqlJsonb(value) {
  if (value === null || value === undefined) return 'NULL';
  const json = JSON.stringify(value).replace(/\0/g, '');
  let tag = '$json$';
  let idx = 0;
  while (json.includes(tag)) {
    idx += 1;
    tag = `$json_${idx}$`;
  }
  return `${tag}${json}${tag}::jsonb`;
}

/**
 * Normalizza le traduzioni nel formato simmetrico `{ en: { ... }, it: { ... } }` (D-06).
 * @param {Record<string, any>} entity
 * @param {'item' | 'list' | 'research' | 'trader' | 'skill' | 'codex' | 'floor'} pattern
 * @returns {{ en: Record<string, unknown>, it: Record<string, unknown> }}
 */
export function normalizeSymmetricTranslations(entity, pattern) {
  if (!entity || typeof entity !== 'object') {
    return { en: {}, it: {} };
  }

  switch (pattern) {
    case 'item':
    case 'list': {
      const en = { name: entity.name ?? '' };
      if (entity.description) en.description = entity.description;

      const itSrc = entity.translations?.it ?? {};
      const it = {};
      if (itSrc.name) it.name = itSrc.name;
      if (itSrc.description) it.description = itSrc.description;
      return { en, it };
    }
    case 'research': {
      const objectives = Array.isArray(entity.objectives) ? entity.objectives : [];
      const en = {
        name: entity.name ?? '',
        objectives: objectives.map((o) => o?.en ?? ''),
      };
      const it = {
        ...(entity.translations?.it?.name ? { name: entity.translations.it.name } : {}),
        objectives: objectives.map((o) => o?.it ?? o?.en ?? ''),
      };
      return { en, it };
    }
    case 'trader': {
      return {
        en: {
          name: entity.name ?? '',
          role: entity.role?.en ?? '',
          description: entity.description?.en ?? '',
        },
        it: {
          name: entity.name ?? '',
          role: entity.role?.it ?? '',
          description: entity.description?.it ?? '',
        },
      };
    }
    case 'skill': {
      return {
        en: {
          name: entity.name?.en ?? '',
          description: entity.description?.en ?? '',
          impactedSkill: entity.impactedSkill?.en ?? '',
        },
        it: {
          name: entity.name?.it ?? '',
          description: entity.description?.it ?? '',
          impactedSkill: entity.impactedSkill?.it ?? '',
        },
      };
    }
    case 'codex': {
      return {
        en: {
          label: entity.label?.en ?? '',
          subtitle: entity.subtitle?.en ?? '',
          text: entity.text?.en ?? '',
        },
        it: {
          label: entity.label?.it ?? '',
          subtitle: entity.subtitle?.it ?? '',
          text: entity.text?.it ?? '',
        },
      };
    }
    case 'floor': {
      return {
        en: { name: entity.translations?.en?.name ?? entity.name ?? '' },
        it: { name: entity.translations?.it?.name ?? entity.name ?? '' },
      };
    }
    default:
      return { en: {}, it: {} };
  }
}

/**
 * Inverte `upstream-aliases.json` in una mappa `canonicalId -> { recipes?: string[], quests?: string[] }`.
 * @param {Record<string, Record<string, string>>} [aliases]
 * @returns {Map<string, Record<string, string[]>>}
 */
export function buildUpstreamIdsMap(aliases = {}) {
  const result = new Map();
  for (const source of ['recipes', 'quests']) {
    const dict = aliases?.[source];
    if (!dict || typeof dict !== 'object') continue;
    for (const [upstreamId, canonicalId] of Object.entries(dict)) {
      if (!canonicalId) continue;
      if (!result.has(canonicalId)) result.set(canonicalId, {});
      const entry = result.get(canonicalId);
      if (!entry[source]) entry[source] = [];
      entry[source].push(upstreamId);
    }
  }
  return result;
}

function emitBatchUpsert(lines, table, columns, rows, conflictCols, updateCols, batchSize) {
  if (rows.length === 0) return;
  const conflictTarget = conflictCols.join(', ');
  const setClause =
    updateCols.length > 0
      ? `DO UPDATE SET ${updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`
      : 'DO NOTHING';

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES`);
    lines.push(chunk.map((r) => `  (${r.join(', ')})`).join(',\n'));
    lines.push(`ON CONFLICT (${conflictTarget}) ${setClause};`);
    lines.push('');
  }
}

function emitBatchInsert(lines, table, columns, rows, batchSize) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES`);
    lines.push(chunk.map((r) => `  (${r.join(', ')})`).join(',\n'));
    lines.push(';');
    lines.push('');
  }
}

function getAllLists(dataset) {
  return [
    ...(dataset.workbenches?.items ?? []),
    ...(dataset.projects?.lists ?? []),
    ...(dataset.expeditions?.lists ?? []),
    ...(dataset.passes?.lists ?? []),
    ...(dataset.quests?.lists ?? []),
  ];
}

function extractCraftBenchInfo(recipe) {
  const benches = recipe?.crafting?.benches;
  if (!benches || typeof benches !== 'object') {
    return { workbenchId: null, levelRequired: null };
  }
  const keys = Object.keys(benches);
  if (keys.length === 0) return { workbenchId: null, levelRequired: null };
  const preferred = keys.find((k) => k !== 'in-raid') ?? keys[0];
  return {
    workbenchId: preferred,
    levelRequired: benches[preferred]?.levelRequired ?? null,
  };
}

/**
 * Genera lo script SQL idempotente completo per Postgres.
 * Esegue preventivamente `validateDataset(dataset)` e lancia un errore se `errorCount > 0`.
 *
 * @param {Record<string, any>} dataset
 * @param {{ aliases?: Record<string, any>, includePois?: boolean, batchSize?: number }} [options]
 * @returns {{ sql: string, stats: Record<string, number> }}
 */
export function generateSeedSql(dataset, options = {}) {
  const { aliases = {}, includePois = true, batchSize = DEFAULT_BATCH_SIZE } = options;

  const validation = validateDataset(dataset);
  if (validation.summary.errorCount > 0) {
    const firstFew = validation.errors
      .slice(0, 5)
      .map((e) => `[${e.rule}] ${e.file}: ${e.message}`)
      .join('; ');
    throw new Error(
      `Dataset validation failed with ${validation.summary.errorCount} error(s): ${firstFew}`
    );
  }

  const lines = [
    "-- ============================================================================",
    "-- Scrappy's Nest — Idempotent Postgres Seed (Generated)",
    '-- ============================================================================',
    'BEGIN;',
    'SET LOCAL standard_conforming_strings = on;',
    '',
  ];

  // --------------------------------------------------------------------------
  // LEVEL 0: maps, traders, skills, codex_entries, weapon_research
  // --------------------------------------------------------------------------
  const mapsList = dataset.maps?.maps ?? [];
  const mapAreas = dataset.mapAreas ?? {};
  const mapNameplates = dataset.mapNameplates ?? {};
  const mapRows = mapsList.map((m) => [
    sqlText(m.id),
    sqlText(m.name),
    sqlText(m.badge ?? null),
    sqlBool(m.hasMultiFloor),
    sqlJsonb(m.bounds ?? dataset.maps?.bounds ?? [0, 0, 4096, 4096]),
    sqlInt(m.defaultZoom ?? dataset.maps?.defaultZoom ?? 2),
    sqlInt(m.minZoom ?? dataset.maps?.minZoom ?? 1),
    sqlInt(m.maxZoom ?? dataset.maps?.maxZoom ?? 5),
    sqlJsonb(mapAreas[m.id] ?? []),
    sqlJsonb(mapNameplates[m.id] ?? []),
  ]);
  emitBatchUpsert(
    lines,
    'catalog_maps',
    ['id', 'name', 'badge', 'has_multi_floor', 'bounds', 'default_zoom', 'min_zoom', 'max_zoom', 'areas', 'nameplates'],
    mapRows,
    ['id'],
    ['name', 'badge', 'has_multi_floor', 'bounds', 'default_zoom', 'min_zoom', 'max_zoom', 'areas', 'nameplates'],
    batchSize
  );

  const tradersList = dataset.traders?.traders ?? [];
  const traderRows = tradersList.map((t) => [
    sqlText(t.id),
    sqlText(t.currency),
    sqlText(t.resetType),
    sqlJsonb(normalizeSymmetricTranslations(t, 'trader')),
  ]);
  emitBatchUpsert(
    lines,
    'catalog_traders',
    ['id', 'currency', 'reset_type', 'translations'],
    traderRows,
    ['id'],
    ['currency', 'reset_type', 'translations'],
    batchSize
  );

  const skillsList = Array.isArray(dataset.skills) ? dataset.skills : [];
  const skillRows = skillsList.map((s) => [
    sqlText(s.id),
    sqlText(s.category),
    sqlBool(s.isMajor),
    sqlInt(s.maxPoints ?? 1),
    sqlInt(s.minPointsSpent ?? 0),
    sqlReal(s.position?.x ?? 0),
    sqlReal(s.position?.y ?? 0),
    sqlText(s.icon ?? null),
    sqlJsonb(s.knownValue ?? []),
    sqlJsonb(normalizeSymmetricTranslations(s, 'skill')),
  ]);
  emitBatchUpsert(
    lines,
    'catalog_skills',
    ['id', 'category', 'is_major', 'max_points', 'min_points_spent', 'pos_x', 'pos_y', 'icon_path', 'known_values', 'translations'],
    skillRows,
    ['id'],
    ['category', 'is_major', 'max_points', 'min_points_spent', 'pos_x', 'pos_y', 'icon_path', 'known_values', 'translations'],
    batchSize
  );

  const codexRows = [];
  for (const [section, entries] of Object.entries(dataset.codex?.sections ?? {})) {
    for (const entry of entries ?? []) {
      codexRows.push([
        sqlText(entry.page),
        sqlText(section),
        sqlTextArray(entry.categories ?? []),
        sqlText(entry.source ?? null),
        sqlJsonb(normalizeSymmetricTranslations(entry, 'codex')),
      ]);
    }
  }
  emitBatchUpsert(
    lines,
    'catalog_codex_entries',
    ['page', 'section', 'categories', 'source', 'translations'],
    codexRows,
    ['page'],
    ['section', 'categories', 'source', 'translations'],
    batchSize
  );

  const researchList = Array.isArray(dataset.weaponAmplificationResearch)
    ? dataset.weaponAmplificationResearch
    : [];
  const researchIds = new Set(researchList.map((r) => r.id));
  const researchRows = researchList.map((r) => [
    sqlText(r.id),
    sqlInt(r.xp ?? 0),
    sqlJsonb(normalizeSymmetricTranslations(r, 'research')),
  ]);
  emitBatchUpsert(
    lines,
    'catalog_weapon_research',
    ['id', 'xp', 'translations'],
    researchRows,
    ['id'],
    ['xp', 'translations'],
    batchSize
  );

  // --------------------------------------------------------------------------
  // LEVEL 1: map_floors, map_pois, skill_edges, items (real + virtual bases)
  // --------------------------------------------------------------------------
  const floorRows = [];
  for (const m of mapsList) {
    for (const f of m.floors ?? []) {
      floorRows.push([
        sqlText(m.id),
        sqlText(f.id),
        sqlText(f.layerKey),
        sqlInt(f.floorLevel ?? 0),
        sqlBool(f.isDefault),
        sqlJsonb(normalizeSymmetricTranslations(f, 'floor')),
      ]);
    }
  }
  emitBatchUpsert(
    lines,
    'catalog_map_floors',
    ['map_id', 'id', 'layer_key', 'floor_level', 'is_default', 'translations'],
    floorRows,
    ['map_id', 'id'],
    ['layer_key', 'floor_level', 'is_default', 'translations'],
    batchSize
  );

  const poisList = includePois ? (dataset.mapPois?.pois ?? []) : [];
  const poiRows = poisList.map((p) => [
    sqlText(p.id),
    sqlText(p.mapId),
    sqlText(p.layer ?? p.mapId),
    sqlInt(p.floorLevel ?? 0),
    sqlText(p.category ?? ''),
    sqlText(p.title ?? ''),
    sqlText(p.description ?? null),
    sqlReal(p.coordinate?.[0] ?? 0),
    sqlReal(p.coordinate?.[1] ?? 0),
    sqlText(p.image ?? null),
    'false',
    'true',
  ]);
  emitBatchUpsert(
    lines,
    'catalog_map_pois',
    ['id', 'map_id', 'layer', 'floor_level', 'category', 'title', 'description', 'coord_x', 'coord_y', 'image', 'is_ugc', 'is_active'],
    poiRows,
    ['id'],
    ['map_id', 'layer', 'floor_level', 'category', 'title', 'description', 'coord_x', 'coord_y', 'image', 'is_active'],
    batchSize
  );

  const skillEdgeRows = [];
  const skillEdgeKeys = [];
  for (const s of skillsList) {
    for (const prereqId of s.prerequisiteNodeIds ?? []) {
      skillEdgeRows.push([sqlText(s.id), sqlText(prereqId)]);
      skillEdgeKeys.push(`(${sqlText(s.id)}, ${sqlText(prereqId)})`);
    }
  }
  emitBatchUpsert(
    lines,
    'catalog_skill_edges',
    ['skill_id', 'prerequisite_id'],
    skillEdgeRows,
    ['skill_id', 'prerequisite_id'],
    [],
    batchSize
  );
  if (skillEdgeKeys.length > 0) {
    lines.push(`DELETE FROM catalog_skill_edges WHERE (skill_id, prerequisite_id) NOT IN (${skillEdgeKeys.join(', ')});`);
    lines.push('');
  }

  // catalog_items: real items (excluding researchIds per ADR 009) + virtual base items (D-02)
  const itemsDict = dataset.items ?? {};
  const baseItemsDict = dataset.itemVariants?.baseItems ?? {};
  const recipesDict = dataset.recipes?.recipes ?? {};
  const upstreamIdsMap = buildUpstreamIdsMap(aliases);

  const variantToBase = new Map();
  for (const [baseId, group] of Object.entries(baseItemsDict)) {
    for (const variantId of group?.variantItemIds ?? []) {
      if (variantId !== baseId) {
        variantToBase.set(variantId, baseId);
      }
    }
  }

  const catalogItemIds = new Set();
  const itemRows = [];

  for (const [id, item] of Object.entries(itemsDict)) {
    if (researchIds.has(id)) continue;
    catalogItemIds.add(id);
    const recipe = recipesDict[id];
    const { workbenchId, levelRequired } = extractCraftBenchInfo(recipe);
    itemRows.push([
      sqlText(id),
      sqlText(variantToBase.get(id) ?? null),
      'false',
      sqlText(item.item_type ?? ''),
      sqlText(item.subcategory ?? null),
      sqlText(item.rarity ?? ''),
      sqlInt(item.value ?? null),
      sqlInt(item.stack_size ?? null),
      sqlText(item.loot_area ?? null),
      sqlText(item.icon ?? null),
      sqlText(item.iconFromItem ?? null),
      sqlText(item.unlocks_item_id ?? null),
      sqlText(workbenchId),
      sqlInt(levelRequired),
      sqlText(recipe ? id : null),
      sqlBool(item.deprecated ?? false),
      sqlBool(item.hidden ?? false),
      sqlJsonb(upstreamIdsMap.get(id) ?? {}),
      sqlJsonb(normalizeSymmetricTranslations(item, 'item')),
    ]);
  }

  for (const [baseId, baseItem] of Object.entries(baseItemsDict)) {
    if (catalogItemIds.has(baseId)) continue;
    catalogItemIds.add(baseId);
    itemRows.push([
      sqlText(baseId),
      'NULL',
      'true',
      sqlText(baseItem.item_type ?? ''),
      sqlText(baseItem.subcategory ?? null),
      sqlText(baseItem.rarity ?? ''),
      'NULL',
      'NULL',
      'NULL',
      sqlText(baseItem.icon ?? null),
      'NULL',
      'NULL',
      'NULL',
      'NULL',
      'NULL',
      'false',
      'false',
      sqlJsonb(upstreamIdsMap.get(baseId) ?? {}),
      sqlJsonb(normalizeSymmetricTranslations(baseItem, 'item')),
    ]);
  }

  const itemCols = [
    'id', 'base_item_id', 'is_virtual_base', 'item_type', 'subcategory', 'rarity',
    'value', 'stack_size', 'loot_area', 'icon_path', 'icon_from_item_id',
    'unlocks_item_id', 'craft_workbench_id', 'craft_level_required', 'craft_recipe_id',
    'is_deprecated', 'is_hidden', 'upstream_ids', 'translations',
  ];
  emitBatchUpsert(
    lines,
    'catalog_items',
    itemCols,
    itemRows,
    ['id'],
    itemCols.filter((c) => c !== 'id'),
    batchSize
  );

  // --------------------------------------------------------------------------
  // LEVEL 2: item_recipes, item_salvage_sources, trader_offers
  // --------------------------------------------------------------------------
  const recipeRows = [];
  const salvageRows = [];
  const salvageKeys = [];

  for (const [itemId, recipe] of Object.entries(recipesDict)) {
    if (!catalogItemIds.has(itemId)) continue;
    const crafting = recipe.crafting ?? null;
    recipeRows.push([
      sqlText(itemId),
      sqlBool(crafting?.blueprintRequired ?? false),
      sqlInt(crafting?.craftQuantity ?? 1),
      sqlJsonb(crafting?.benches ?? null),
      sqlJsonb(crafting?.ingredients ?? null),
      sqlJsonb(recipe.upgrade ?? null),
      sqlJsonb(recipe.repair ?? null),
      sqlJsonb(recipe.recycling ?? null),
    ]);

    const recyclesInto = recipe.recycling?.recyclesInto ?? {};
    const salvagesInto = recipe.recycling?.salvagesInto ?? {};
    const targets = new Set([...Object.keys(recyclesInto), ...Object.keys(salvagesInto)]);
    for (const targetId of targets) {
      if (!catalogItemIds.has(targetId)) continue;
      salvageRows.push([
        sqlText(itemId),
        sqlText(targetId),
        sqlInt(recyclesInto[targetId] ?? 0),
        sqlInt(salvagesInto[targetId] ?? 0),
      ]);
      salvageKeys.push(`(${sqlText(itemId)}, ${sqlText(targetId)})`);
    }
  }

  emitBatchUpsert(
    lines,
    'catalog_item_recipes',
    ['item_id', 'blueprint_required', 'craft_quantity', 'benches', 'ingredients', 'upgrade_info', 'repair_info', 'recycling_info'],
    recipeRows,
    ['item_id'],
    ['blueprint_required', 'craft_quantity', 'benches', 'ingredients', 'upgrade_info', 'repair_info', 'recycling_info'],
    batchSize
  );

  emitBatchUpsert(
    lines,
    'catalog_item_salvage_sources',
    ['source_item_id', 'target_item_id', 'recycle_yield', 'salvage_yield'],
    salvageRows,
    ['source_item_id', 'target_item_id'],
    ['recycle_yield', 'salvage_yield'],
    batchSize
  );
  if (salvageKeys.length > 0) {
    lines.push(`DELETE FROM catalog_item_salvage_sources WHERE (source_item_id, target_item_id) NOT IN (${salvageKeys.join(', ')});`);
    lines.push('');
  }

  const traderOffers = dataset.traders?.items ?? [];
  const offerRows = [];
  const offerKeys = [];
  for (const offer of traderOffers) {
    if (!catalogItemIds.has(offer.id)) continue;
    offerRows.push([
      sqlText(offer.trader),
      sqlText(offer.id),
      sqlInt(offer.price),
      sqlInt(offer.dailyLimit ?? null),
    ]);
    offerKeys.push(`(${sqlText(offer.trader)}, ${sqlText(offer.id)})`);
  }
  emitBatchUpsert(
    lines,
    'catalog_trader_offers',
    ['trader_id', 'item_id', 'price', 'daily_limit'],
    offerRows,
    ['trader_id', 'item_id'],
    ['price', 'daily_limit'],
    batchSize
  );
  if (offerKeys.length > 0) {
    lines.push(`DELETE FROM catalog_trader_offers WHERE (trader_id, item_id) NOT IN (${offerKeys.join(', ')});`);
    lines.push('');
  }

  // --------------------------------------------------------------------------
  // LEVEL 3: catalog_lists, catalog_list_prerequisites
  // --------------------------------------------------------------------------
  const allLists = getAllLists(dataset);
  const listIds = allLists.map((l) => l.id);
  const listRows = allLists.map((l) => [
    sqlText(l.id),
    sqlText(l.listType),
    sqlInt(l.maxLevel ?? 1),
    sqlBool(l.extractionWiped ?? false),
    sqlInt(l.expeditionIndex ?? null),
    sqlText(l.trader ?? null),
    sqlInt(l.premiumCostTokens ?? null),
    sqlBool(l.isActive ?? true),
    sqlBool(l.deprecated ?? false),
    sqlTimestamp(l.startDate ?? null),
    sqlTimestamp(l.expirationDate ?? null),
    sqlJsonb(l.tracks ?? null),
    sqlJsonb(l.damageChallenge ?? null),
    sqlJsonb(l.canvasPosition ?? null),
    sqlInt(l.xpReward ?? null),
    sqlJsonb(normalizeSymmetricTranslations(l, 'list')),
  ]);
  const listCols = [
    'id', 'list_type', 'max_level', 'extraction_wiped', 'expedition_index',
    'trader_id', 'premium_cost_tokens', 'is_active', 'is_deprecated',
    'start_date', 'expiration_date', 'tracks', 'damage_challenge',
    'canvas_position', 'xp_reward', 'translations',
  ];
  emitBatchUpsert(
    lines,
    'catalog_lists',
    listCols,
    listRows,
    ['id'],
    listCols.filter((c) => c !== 'id'),
    batchSize
  );

  const listPrereqRows = [];
  const listPrereqKeys = [];
  for (const l of allLists) {
    for (const prereqId of l.prerequisites ?? []) {
      listPrereqRows.push([sqlText(l.id), sqlText(prereqId)]);
      listPrereqKeys.push(`(${sqlText(l.id)}, ${sqlText(prereqId)})`);
    }
  }
  emitBatchUpsert(
    lines,
    'catalog_list_prerequisites',
    ['list_id', 'prerequisite_list_id'],
    listPrereqRows,
    ['list_id', 'prerequisite_list_id'],
    [],
    batchSize
  );
  if (listPrereqKeys.length > 0) {
    lines.push(`DELETE FROM catalog_list_prerequisites WHERE (list_id, prerequisite_list_id) NOT IN (${listPrereqKeys.join(', ')});`);
    lines.push('');
  }

  // --------------------------------------------------------------------------
  // LEVEL 4: catalog_list_levels, requirements, rewards
  // --------------------------------------------------------------------------
  const levelRows = [];
  const reqRows = [];
  const reqKeys = [];
  const rewardRows = [];

  for (const l of allLists) {
    for (const lv of l.levels ?? []) {
      levelRows.push([
        sqlText(l.id),
        sqlInt(lv.level),
        sqlJsonb(lv.requires ?? null),
        sqlJsonb(lv.actions ?? null),
        sqlJsonb(lv.tieredActions ?? null),
      ]);

      for (const req of lv.requirementItemIds ?? []) {
        reqRows.push([
          sqlText(l.id),
          sqlInt(lv.level),
          sqlText(req.itemId),
          sqlInt(req.quantity),
          sqlJsonb(req.rewards ?? null),
        ]);
        reqKeys.push(`(${sqlText(l.id)}, ${sqlInt(lv.level)}, ${sqlText(req.itemId)})`);
      }

      for (const rew of lv.rewards ?? []) {
        rewardRows.push([
          sqlText(l.id),
          sqlInt(lv.level),
          sqlText(rew.track ?? null),
          sqlText(rew.itemId),
          sqlInt(rew.quantity),
        ]);
      }
    }
  }

  emitBatchUpsert(
    lines,
    'catalog_list_levels',
    ['list_id', 'level', 'requires_list_levels', 'actions', 'tiered_actions'],
    levelRows,
    ['list_id', 'level'],
    ['requires_list_levels', 'actions', 'tiered_actions'],
    batchSize
  );

  emitBatchUpsert(
    lines,
    'catalog_list_level_requirements',
    ['list_id', 'level', 'item_id', 'quantity', 'rewards'],
    reqRows,
    ['list_id', 'level', 'item_id'],
    ['quantity', 'rewards'],
    batchSize
  );
  if (reqKeys.length > 0) {
    lines.push(`DELETE FROM catalog_list_level_requirements WHERE (list_id, level, item_id) NOT IN (${reqKeys.join(', ')});`);
    lines.push('');
  }

  if (listIds.length > 0) {
    lines.push(`DELETE FROM catalog_list_level_rewards WHERE list_id IN (${listIds.map((id) => sqlText(id)).join(', ')});`);
    lines.push('');
  }
  emitBatchInsert(
    lines,
    'catalog_list_level_rewards',
    ['list_id', 'level', 'track_id', 'item_id', 'quantity'],
    rewardRows,
    batchSize
  );

  // --------------------------------------------------------------------------
  // SOFT-DEPRECATION (D-07): mai DELETE su catalog_items o catalog_lists
  // --------------------------------------------------------------------------
  const activeItemIds = [...catalogItemIds];
  if (activeItemIds.length > 0) {
    lines.push(
      `UPDATE catalog_items SET is_deprecated = true WHERE id NOT IN (${activeItemIds.map((id) => sqlText(id)).join(', ')}) AND is_deprecated = false;`
    );
  }
  if (listIds.length > 0) {
    lines.push(
      `UPDATE catalog_lists SET is_deprecated = true WHERE id NOT IN (${listIds.map((id) => sqlText(id)).join(', ')}) AND is_deprecated = false;`
    );
  }

  lines.push('');
  lines.push('COMMIT;');
  lines.push('');

  return {
    sql: lines.join('\n'),
    stats: {
      maps: mapRows.length,
      mapFloors: floorRows.length,
      mapPois: poiRows.length,
      traders: traderRows.length,
      skills: skillRows.length,
      skillEdges: skillEdgeRows.length,
      codexEntries: codexRows.length,
      weaponResearch: researchRows.length,
      items: itemRows.length,
      recipes: recipeRows.length,
      salvageSources: salvageRows.length,
      traderOffers: offerRows.length,
      lists: listRows.length,
      listPrerequisites: listPrereqRows.length,
      listLevels: levelRows.length,
      listLevelRequirements: reqRows.length,
      listLevelRewards: rewardRows.length,
    },
  };
}
