import fs from 'node:fs';
import path from 'node:path';

export const HYPHEN_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_ID_RE = /^[a-z0-9_]+$/;
export const DEFAULT_BLUEPRINT_ALLOWLIST = new Set(['purification-system-blueprint']);

export const RULE_SEVERITY = {
  'VAL-ID-001': 'error',
  'VAL-FK-001': 'error',
  'VAL-FK-002': 'error',
  'VAL-FK-003': 'error',
  'VAL-FK-004': 'error',
  'VAL-FK-005': 'error',
  'VAL-FK-006': 'error',
  'VAL-FK-007': 'error',
  'VAL-FK-008': 'error',
  'VAL-FK-009': 'error',
  'VAL-DAG-001': 'error',
  'VAL-BP-001': 'warning',
  'VAL-BP-002': 'warning',
  'VAL-VAR-001': 'warning',
  'VAL-RES-001': 'warning',
  'VAL-I18N-001': 'warning',
};

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Carica tutti i file JSON del dataset da `dataDir` e i custom-items opzionali.
 * @param {string} dataDir
 * @param {string} [customItemsPath]
 * @returns {Record<string, unknown>}
 */
export function loadDatasetFromDir(dataDir, customItemsPath) {
  const load = (name) => readJsonIfExists(path.join(dataDir, name));
  return {
    items: load('items.json'),
    itemVariants: load('item-variants.json'),
    workbenches: load('workbenches.json'),
    projects: load('projects.json'),
    expeditions: load('expeditions.json'),
    passes: load('passes.json'),
    quests: load('quests.json'),
    questsSource: load('quests-source.json'),
    questMetadata: load('quest-metadata.json'),
    recipes: load('recipes.json'),
    traders: load('traders.json'),
    skills: load('skills.json'),
    weaponAmplificationResearch: load('weapon-amplification-research.json'),
    maps: load('maps.json'),
    mapPois: load('map-pois.json'),
    mapAreas: load('map-areas.json'),
    mapNameplates: load('map-nameplates.json'),
    codex: load('codex.json'),
    overridesConflicts: load('overrides-conflicts.json'),
    customItems: readJsonIfExists(customItemsPath),
  };
}

function createCollector() {
  const errors = [];
  const warnings = [];
  const push = (severity, rule, file, message, extra = {}) => {
    const issue = { rule, severity, file, message, ...extra };
    if (severity === 'error') errors.push(issue);
    else warnings.push(issue);
  };
  return {
    errors,
    warnings,
    addError: (rule, file, message, extra) => push('error', rule, file, message, extra),
    addWarning: (rule, file, message, extra) => push('warning', rule, file, message, extra),
  };
}

function getAllListGroups(dataset) {
  return [
    { file: 'workbenches.json', lists: dataset.workbenches?.items ?? [] },
    { file: 'projects.json', lists: dataset.projects?.lists ?? [] },
    { file: 'expeditions.json', lists: dataset.expeditions?.lists ?? [] },
    { file: 'passes.json', lists: dataset.passes?.lists ?? [] },
    { file: 'quests.json', lists: dataset.quests?.lists ?? [] },
  ];
}

function buildAllListsMap(dataset) {
  const map = new Map();
  for (const { lists } of getAllListGroups(dataset)) {
    for (const list of lists) {
      if (list?.id && !map.has(list.id)) {
        map.set(list.id, list);
      }
    }
  }
  return map;
}

function checkDictIds(dict, file, idField, col) {
  if (!dict || typeof dict !== 'object') return;
  for (const [key, entity] of Object.entries(dict)) {
    if (!key) {
      col.addError('VAL-ID-001', file, 'Empty dictionary key', { entityId: key });
      continue;
    }
    if (!HYPHEN_CASE_RE.test(key)) {
      col.addError('VAL-ID-001', file, `Dictionary key "${key}" is not valid hyphen-case`, { entityId: key });
    }
    const entityId = entity?.[idField];
    if (!entityId) {
      col.addError('VAL-ID-001', file, `Missing "${idField}" on entry "${key}"`, { entityId: key, field: idField });
    } else if (entityId !== key) {
      col.addError('VAL-ID-001', file, `Dictionary key "${key}" !== entity.${idField} "${entityId}"`, { entityId: key, field: idField });
    }
  }
}

function checkArrayIds(arr, file, { idField = 'id', regex = HYPHEN_CASE_RE, checkFormat = true, globalSeen = null } = {}, col) {
  if (!Array.isArray(arr)) return;
  const localSeen = new Set();
  for (let i = 0; i < arr.length; i++) {
    const id = arr[i]?.[idField];
    if (typeof id !== 'string' || id.trim() === '') {
      col.addError('VAL-ID-001', file, `Empty "${idField}" at index ${i}`, { field: idField });
      continue;
    }
    if (localSeen.has(id)) {
      col.addError('VAL-ID-001', file, `Duplicate "${idField}" "${id}"`, { entityId: id, field: idField });
    }
    localSeen.add(id);

    if (globalSeen) {
      if (globalSeen.has(id)) {
        col.addError('VAL-ID-001', file, `Duplicate list id "${id}" across list files (also in ${globalSeen.get(id)})`, { entityId: id, field: idField });
      } else {
        globalSeen.set(id, file);
      }
    }

    if (checkFormat && !regex.test(id)) {
      col.addError('VAL-ID-001', file, `Invalid ID format "${id}" (expected ${regex})`, { entityId: id, field: idField });
    }
  }
}

function validateIds(dataset, col) {
  checkDictIds(dataset.items, 'items.json', 'id', col);
  checkDictIds(dataset.itemVariants?.baseItems, 'item-variants.json', 'id', col);
  checkDictIds(dataset.recipes?.recipes, 'recipes.json', 'itemId', col);

  const globalListIds = new Map();
  for (const { file, lists } of getAllListGroups(dataset)) {
    checkArrayIds(lists, file, { globalSeen: globalListIds }, col);
  }

  checkArrayIds(dataset.questsSource?.nodes, 'quests-source.json', {}, col);
  checkArrayIds(dataset.traders?.traders, 'traders.json', {}, col);
  checkArrayIds(dataset.skills, 'skills.json', { regex: SKILL_ID_RE }, col);
  checkArrayIds(dataset.weaponAmplificationResearch, 'weapon-amplification-research.json', {}, col);

  if (Array.isArray(dataset.maps?.maps)) {
    checkArrayIds(dataset.maps.maps, 'maps.json', {}, col);
    for (const m of dataset.maps.maps) {
      if (Array.isArray(m?.floors)) {
        checkArrayIds(m.floors, 'maps.json', {}, col);
      }
    }
  }

  // map-pois.id e codex.page: eccezione esplicita sul formato hyphen-case, solo non vuoto + univoco
  checkArrayIds(dataset.mapPois?.pois, 'map-pois.json', { checkFormat: false }, col);

  if (dataset.codex?.sections && typeof dataset.codex.sections === 'object') {
    const allCodexEntries = Object.values(dataset.codex.sections).flat();
    checkArrayIds(allCodexEntries, 'codex.json', { idField: 'page', checkFormat: false }, col);
  }
}

function validateListItemFks(dataset, items, col) {
  if (!items) return;

  const checkItemId = (file, listId, itemId, field) => {
    if (!itemId || !items[itemId]) {
      col.addError('VAL-FK-001', file, `Unknown itemId "${itemId}" in ${field} of "${listId}"`, { entityId: listId, field });
    }
  };

  const checkRewards = (file, listId, rewards, field) => {
    for (const r of rewards ?? []) {
      checkItemId(file, listId, r?.itemId, field);
    }
  };

  const checkCarryItems = (file, listId, carryItems, field) => {
    for (const c of carryItems ?? []) {
      const id = typeof c === 'string' ? c : c?.itemId;
      checkItemId(file, listId, id, field);
    }
  };

  for (const { file, lists } of getAllListGroups(dataset)) {
    for (const list of lists) {
      const listId = list?.id ?? '(unknown)';
      checkCarryItems(file, listId, list?.carryItems, 'carryItems');
      for (const lv of list?.levels ?? []) {
        const lvTag = `level[${lv?.level}]`;
        for (const req of lv?.requirementItemIds ?? []) {
          checkItemId(file, listId, req?.itemId, `${lvTag}.requirementItemIds`);
          checkRewards(file, listId, req?.rewards, `${lvTag}.requirementItemIds.rewards`);
        }
        checkRewards(file, listId, lv?.rewards, `${lvTag}.rewards`);
        checkCarryItems(file, listId, lv?.carryItems, `${lvTag}.carryItems`);
        for (const act of lv?.actions ?? []) {
          checkRewards(file, listId, act?.rewards, `${lvTag}.actions.rewards`);
          checkCarryItems(file, listId, act?.carryItems, `${lvTag}.actions.carryItems`);
        }
        for (const ta of lv?.tieredActions ?? []) {
          checkRewards(file, listId, ta?.rewards, `${lvTag}.tieredActions.rewards`);
          for (const step of ta?.steps ?? []) {
            checkRewards(file, listId, step?.rewards, `${lvTag}.tieredActions.steps.rewards`);
          }
        }
      }
    }
  }
}

function validateTraderFks(dataset, items, col) {
  const traderIds = new Set((dataset.traders?.traders ?? []).map((t) => t?.id).filter(Boolean));

  if (Array.isArray(dataset.traders?.items)) {
    const seenPairs = new Set();
    for (const offer of dataset.traders.items) {
      const itemId = offer?.id;
      const traderId = offer?.trader;
      if (items && (!itemId || !items[itemId])) {
        col.addError('VAL-FK-002', 'traders.json', `Trader offer references unknown item "${itemId}"`, { entityId: itemId, field: 'items[].id' });
      }
      if (!traderId || !traderIds.has(traderId)) {
        col.addError('VAL-FK-002', 'traders.json', `Trader offer for "${itemId}" references unknown trader "${traderId}"`, { entityId: itemId, field: 'items[].trader' });
      }
      const pairKey = `${itemId}::${traderId}`;
      if (seenPairs.has(pairKey)) {
        col.addError('VAL-FK-002', 'traders.json', `Duplicate trader offer pair (${itemId}, ${traderId})`, { entityId: itemId, field: 'items[]' });
      }
      seenPairs.add(pairKey);
    }
  }

  if (dataset.traders?.traders) {
    for (const q of dataset.quests?.lists ?? []) {
      if (!q?.trader || !traderIds.has(q.trader)) {
        col.addError('VAL-FK-003', 'quests.json', `Quest "${q?.id}" references unknown trader "${q?.trader}"`, { entityId: q?.id, field: 'trader' });
      }
    }
    for (const node of dataset.questsSource?.nodes ?? []) {
      if (!node?.trader || !traderIds.has(node.trader)) {
        col.addError('VAL-FK-003', 'quests-source.json', `Quest source node "${node?.id}" references unknown trader "${node?.trader}"`, { entityId: node?.id, field: 'trader' });
      }
    }
  }
}

function validateRecipeFks(dataset, items, col) {
  const recipes = dataset.recipes?.recipes;
  if (!recipes || typeof recipes !== 'object') return;

  const workbenchIds = new Set((dataset.workbenches?.items ?? []).map((w) => w?.id).filter(Boolean));
  const hasWorkbenches = Boolean(dataset.workbenches?.items);
  const skillIds = new Set((dataset.skills ?? []).map((s) => s?.id).filter(Boolean));
  const hasSkills = Array.isArray(dataset.skills);

  const checkItemMap = (recipeId, obj, field) => {
    if (!obj || typeof obj !== 'object' || !items) return;
    for (const itemId of Object.keys(obj)) {
      if (!items[itemId]) {
        col.addError('VAL-FK-004', 'recipes.json', `Recipe "${recipeId}" references unknown item "${itemId}" in ${field}`, { entityId: recipeId, field });
      }
    }
  };

  const checkRequiresList = (recipeId, requires, field) => {
    for (const req of requires ?? []) {
      if (!req || typeof req !== 'object') continue;
      if (req.type === 'station') {
        const st = req.station ?? req.stationId ?? req.id;
        if (hasWorkbenches && st !== 'in-raid' && !workbenchIds.has(st)) {
          col.addError('VAL-FK-005', 'recipes.json', `Recipe "${recipeId}" references unknown station "${st}" in ${field}`, { entityId: recipeId, field });
        }
      } else if (req.type === 'research' || req.type === 'item') {
        const targetId = req.itemId ?? req.id;
        if (items && (!targetId || !items[targetId])) {
          col.addError('VAL-FK-005', 'recipes.json', `Recipe "${recipeId}" references unknown ${req.type} "${targetId}" in ${field}`, { entityId: recipeId, field });
        }
      }
    }
  };

  for (const [key, recipe] of Object.entries(recipes)) {
    if (items && !items[key]) {
      col.addError('VAL-FK-004', 'recipes.json', `Recipe key "${key}" does not exist in items.json`, { entityId: key, field: 'itemId' });
    }

    // VAL-FK-004: ingredients & targets
    checkItemMap(key, recipe?.crafting?.ingredients, 'crafting.ingredients');
    checkItemMap(key, recipe?.upgrade?.upgradeCost, 'upgrade.upgradeCost');
    if (items && recipe?.upgrade?.upgradesTo && !items[recipe.upgrade.upgradesTo]) {
      col.addError('VAL-FK-004', 'recipes.json', `Recipe "${key}" upgrade.upgradesTo "${recipe.upgrade.upgradesTo}" does not exist in items.json`, { entityId: key, field: 'upgrade.upgradesTo' });
    }
    for (const branch of recipe?.upgrade?.branches ?? []) {
      if (items && branch?.to && !items[branch.to]) {
        col.addError('VAL-FK-004', 'recipes.json', `Recipe "${key}" upgrade.branches[].to "${branch.to}" does not exist in items.json`, { entityId: key, field: 'upgrade.branches[].to' });
      }
      checkItemMap(key, branch?.cost, 'upgrade.branches[].cost');
      checkRequiresList(key, branch?.requires, 'upgrade.branches[].requires');
    }
    checkItemMap(key, recipe?.repair?.cost, 'repair.cost');
    checkItemMap(key, recipe?.recycling?.recyclesInto, 'recycling.recyclesInto');
    checkItemMap(key, recipe?.recycling?.salvagesInto, 'recycling.salvagesInto');

    // VAL-FK-005: benches, skills, requires
    if (recipe?.crafting?.benches && typeof recipe.crafting.benches === 'object') {
      for (const [benchId, benchCfg] of Object.entries(recipe.crafting.benches)) {
        if (hasWorkbenches && benchId !== 'in-raid' && !workbenchIds.has(benchId)) {
          col.addError('VAL-FK-005', 'recipes.json', `Recipe "${key}" references unknown bench "${benchId}" in crafting.benches`, { entityId: key, field: 'crafting.benches' });
        }
        if (hasSkills && benchCfg?.skillRequired && !skillIds.has(benchCfg.skillRequired)) {
          col.addError('VAL-FK-005', 'recipes.json', `Recipe "${key}" references unknown skill "${benchCfg.skillRequired}" in crafting.benches.${benchId}`, { entityId: key, field: 'skillRequired' });
        }
      }
    }
    if (hasSkills && recipe?.crafting?.skillRequired && !skillIds.has(recipe.crafting.skillRequired)) {
      col.addError('VAL-FK-005', 'recipes.json', `Recipe "${key}" references unknown skill "${recipe.crafting.skillRequired}" in crafting.skillRequired`, { entityId: key, field: 'crafting.skillRequired' });
    }
    if (hasSkills && recipe?.upgrade?.skillRequired && !skillIds.has(recipe.upgrade.skillRequired)) {
      col.addError('VAL-FK-005', 'recipes.json', `Recipe "${key}" references unknown skill "${recipe.upgrade.skillRequired}" in upgrade.skillRequired`, { entityId: key, field: 'upgrade.skillRequired' });
    }
    checkRequiresList(key, recipe?.crafting?.requires, 'crafting.requires');
    checkRequiresList(key, recipe?.upgrade?.requires, 'upgrade.requires');
  }
}

function validateItemSelfFks(items, col) {
  if (!items) return;
  const selfFkFields = ['unlocks_item_id', 'iconFromItem', 'craft_recipe_id'];
  for (const [id, item] of Object.entries(items)) {
    for (const field of selfFkFields) {
      const target = item?.[field];
      if (target === undefined || target === null || target === '') continue;
      if (target === id) {
        col.addError('VAL-FK-006', 'items.json', `Self-loop on "${id}.${field}" -> "${target}"`, { entityId: id, field });
      } else if (!items[target]) {
        col.addError('VAL-FK-006', 'items.json', `Item "${id}.${field}" references missing item "${target}"`, { entityId: id, field });
      }
    }
  }
}

function validateVariantFks(dataset, items, col) {
  const baseItems = dataset.itemVariants?.baseItems;
  if (!baseItems || typeof baseItems !== 'object') return;

  const variantOwner = new Map();
  for (const [baseId, baseItem] of Object.entries(baseItems)) {
    const bpId = baseItem?.blueprintItemId;
    if (bpId && items && !items[bpId]) {
      col.addError('VAL-FK-007', 'item-variants.json', `Base item "${baseId}" references missing blueprintItemId "${bpId}"`, { entityId: baseId, field: 'blueprintItemId' });
    }
    for (const varId of baseItem?.variantItemIds ?? []) {
      if (items && !items[varId]) {
        col.addError('VAL-FK-007', 'item-variants.json', `Base item "${baseId}" references missing variantItemId "${varId}"`, { entityId: baseId, field: 'variantItemIds' });
      }
      if (variantOwner.has(varId)) {
        col.addError('VAL-FK-007', 'item-variants.json', `Variant "${varId}" belongs to multiple base items ("${variantOwner.get(varId)}" and "${baseId}")`, { entityId: baseId, field: 'variantItemIds' });
      } else {
        variantOwner.set(varId, baseId);
      }
    }
  }
}

function validateMapFks(dataset, col) {
  if (!Array.isArray(dataset.maps?.maps)) return;

  const mapLayers = new Map();
  for (const m of dataset.maps.maps) {
    const layers = new Set();
    for (const f of m?.floors ?? []) {
      if (f?.layerKey) layers.add(f.layerKey);
      if (f?.id) layers.add(f.id);
    }
    if (m?.id) mapLayers.set(m.id, layers);
  }

  const checkMapAndLayer = (file, entityId, mapId, layer, fieldPrefix = '') => {
    if (!mapId || !mapLayers.has(mapId)) {
      col.addError('VAL-FK-008', file, `Unknown mapId "${mapId}"${entityId ? ` on "${entityId}"` : ''}`, { entityId, field: `${fieldPrefix}mapId` });
      return;
    }
    const validLayers = mapLayers.get(mapId);
    if (validLayers.size > 0 && (!layer || !validLayers.has(layer))) {
      col.addError('VAL-FK-008', file, `Unknown layer "${layer}" for map "${mapId}"${entityId ? ` on "${entityId}"` : ''}`, { entityId, field: `${fieldPrefix}layer` });
    }
  };

  for (const poi of dataset.mapPois?.pois ?? []) {
    checkMapAndLayer('map-pois.json', poi?.id, poi?.mapId, poi?.layer);
  }

  const checkKeyedMapObjects = (dict, file) => {
    if (!dict || typeof dict !== 'object') return;
    for (const [mapId, entries] of Object.entries(dict)) {
      if (!mapLayers.has(mapId)) {
        col.addError('VAL-FK-008', file, `Unknown mapId key "${mapId}"`, { entityId: mapId, field: 'mapId' });
        continue;
      }
      const validLayers = mapLayers.get(mapId);
      for (let i = 0; i < (entries ?? []).length; i++) {
        const layer = entries[i]?.layer;
        if (validLayers.size > 0 && (!layer || !validLayers.has(layer))) {
          col.addError('VAL-FK-008', file, `Unknown layer "${layer}" in "${mapId}[${i}]"`, { entityId: mapId, field: 'layer' });
        }
      }
    }
  };

  checkKeyedMapObjects(dataset.mapAreas, 'map-areas.json');
  checkKeyedMapObjects(dataset.mapNameplates, 'map-nameplates.json');

  for (const { file, lists } of getAllListGroups(dataset)) {
    for (const list of lists) {
      for (const lv of list?.levels ?? []) {
        for (const act of lv?.actions ?? []) {
          for (const m of act?.maps ?? []) {
            if (!mapLayers.has(m)) {
              col.addError('VAL-FK-008', file, `Unknown map "${m}" in action "${act?.id}" of "${list?.id}"`, { entityId: list?.id, field: 'actions[].maps' });
            }
          }
        }
        for (const ta of lv?.tieredActions ?? []) {
          for (const step of ta?.steps ?? []) {
            for (const m of step?.maps ?? []) {
              if (!mapLayers.has(m)) {
                col.addError('VAL-FK-008', file, `Unknown map "${m}" in tieredAction step of "${list?.id}"`, { entityId: list?.id, field: 'tieredActions[].steps[].maps' });
              }
            }
          }
        }
      }
    }
  }

  for (const node of dataset.questsSource?.nodes ?? []) {
    const maps = Array.isArray(node?.map) ? node.map : (node?.map ? [node.map] : []);
    for (const m of maps) {
      if (m && !mapLayers.has(m)) {
        col.addError('VAL-FK-008', 'quests-source.json', `Unknown map "${m}" on quest source node "${node?.id}"`, { entityId: node?.id, field: 'map' });
      }
    }
  }
}

function validateLevelRequirementsAndPassTracks(dataset, allListsById, col) {
  for (const { file, lists } of getAllListGroups(dataset)) {
    for (const list of lists) {
      const checkReq = (req, field) => {
        const target = allListsById.get(req?.listId);
        if (!target) {
          col.addError('VAL-FK-009', file, `List "${list?.id}" requires unknown listId "${req?.listId}"`, { entityId: list?.id, field });
          return;
        }
        if (typeof req?.level !== 'number' || req.level < 1 || req.level > target.maxLevel) {
          col.addError('VAL-FK-009', file, `List "${list?.id}" requires invalid level ${req?.level} on "${req?.listId}" (maxLevel: ${target.maxLevel})`, { entityId: list?.id, field });
        }
      };

      for (const req of list?.requires ?? []) checkReq(req, 'requires');
      for (const lv of list?.levels ?? []) {
        for (const req of lv?.requires ?? []) checkReq(req, `level[${lv?.level}].requires`);
      }
    }
  }

  for (const pass of dataset.passes?.lists ?? []) {
    const trackIds = new Set((pass?.tracks ?? []).map((t) => t?.id).filter(Boolean));
    const checkRewardsTrack = (rewards, field) => {
      for (const r of rewards ?? []) {
        if (r?.track !== undefined && r?.track !== null && !trackIds.has(r.track)) {
          col.addError('VAL-FK-009', 'passes.json', `Pass "${pass?.id}" reward references unknown track "${r.track}"`, { entityId: pass?.id, field });
        }
      }
    };
    for (const lv of pass?.levels ?? []) {
      checkRewardsTrack(lv?.rewards, `level[${lv?.level}].rewards`);
      for (const req of lv?.requirementItemIds ?? []) checkRewardsTrack(req?.rewards, `level[${lv?.level}].requirementItemIds.rewards`);
      for (const act of lv?.actions ?? []) checkRewardsTrack(act?.rewards, `level[${lv?.level}].actions.rewards`);
      for (const ta of lv?.tieredActions ?? []) {
        checkRewardsTrack(ta?.rewards, `level[${lv?.level}].tieredActions.rewards`);
        for (const step of ta?.steps ?? []) checkRewardsTrack(step?.rewards, `level[${lv?.level}].tieredActions.steps.rewards`);
      }
    }
  }
}

function checkDag(nodes, getDeps, { file, field, checkOrphans = true }, col) {
  const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean));
  const adj = new Map();
  for (const n of nodes) {
    if (!n?.id) continue;
    const deps = [];
    for (const dep of getDeps(n) ?? []) {
      if (!nodeIds.has(dep)) {
        if (checkOrphans) {
          col.addError('VAL-DAG-001', file, `Node "${n.id}" references orphan prerequisite "${dep}"`, { entityId: n.id, field });
        }
      } else {
        deps.push(dep);
      }
    }
    adj.set(n.id, deps);
  }

  // 0 = unvisited, 1 = visiting, 2 = visited
  const state = new Map();
  const reportedCycles = new Set();

  const dfs = (u) => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) {
        const edgeKey = `${u}->${v}`;
        if (!reportedCycles.has(edgeKey)) {
          reportedCycles.add(edgeKey);
          col.addError('VAL-DAG-001', file, `Cycle detected involving "${u}" -> "${v}"`, { entityId: u, field });
        }
      } else if (s === 0) {
        dfs(v);
      }
    }
    state.set(u, 2);
  };

  for (const id of adj.keys()) {
    if ((state.get(id) ?? 0) === 0) {
      dfs(id);
    }
  }
}

function validateDags(dataset, allListsById, col) {
  if (Array.isArray(dataset.quests?.lists)) {
    checkDag(dataset.quests.lists, (q) => q?.prerequisites ?? [], { file: 'quests.json', field: 'prerequisites' }, col);
  }
  if (Array.isArray(dataset.skills)) {
    checkDag(dataset.skills, (s) => s?.prerequisiteNodeIds ?? [], { file: 'skills.json', field: 'prerequisiteNodeIds' }, col);
  }
  if (allListsById.size > 0) {
    const allLists = Array.from(allListsById.values());
    const getListDeps = (list) => {
      const deps = new Set();
      for (const r of list?.requires ?? []) {
        if (r?.listId) deps.add(r.listId);
      }
      for (const lv of list?.levels ?? []) {
        for (const r of lv?.requires ?? []) {
          if (r?.listId) deps.add(r.listId);
        }
      }
      return Array.from(deps);
    };
    // Orphan listId is already reported by VAL-FK-009; check cycles here.
    checkDag(allLists, getListDeps, { file: 'lists', field: 'requires', checkOrphans: false }, col);
  }
}

function validateBlueprints(dataset, items, allowlist, col) {
  if (!items) return;

  const claimedTargets = new Map();
  for (const [id, item] of Object.entries(items)) {
    if ((item?.item_type === 'Blueprint' || item?.item_type === 'Design') && !allowlist.has(id)) {
      const target = item?.unlocks_item_id;
      if (!target) {
        col.addWarning('VAL-BP-001', 'items.json', `${item.item_type} "${id}" is missing unlocks_item_id`, { entityId: id, field: 'unlocks_item_id' });
      } else if (claimedTargets.has(target)) {
        col.addWarning('VAL-BP-001', 'items.json', `Duplicate unlocks_item_id "${target}" on "${id}" (already unlocked by "${claimedTargets.get(target)}")`, { entityId: id, field: 'unlocks_item_id' });
      } else {
        claimedTargets.set(target, id);
      }
    }
  }

  const baseItems = dataset.itemVariants?.baseItems;
  if (baseItems && typeof baseItems === 'object') {
    for (const [baseId, baseItem] of Object.entries(baseItems)) {
      const bpId = baseItem?.blueprintItemId;
      if (!bpId || !items[bpId]) continue;
      const target = items[bpId]?.unlocks_item_id;
      if (!target) continue;
      if (target.startsWith('amplified-') || /-(ii|iii|iv)$/.test(target)) {
        col.addWarning('VAL-BP-002', 'items.json', `Weapon blueprint "${bpId}" (base "${baseId}") unlocks "${target}" instead of Lvl 1 variant`, { entityId: bpId, field: 'unlocks_item_id' });
      } else if (Array.isArray(baseItem.variantItemIds) && !baseItem.variantItemIds.includes(target)) {
        col.addWarning('VAL-BP-002', 'items.json', `Weapon blueprint "${bpId}" (base "${baseId}") unlocks "${target}" which is not in variantItemIds`, { entityId: bpId, field: 'unlocks_item_id' });
      }
    }
  }
}

function validateVariantsQuality(dataset, items, col) {
  const baseItems = dataset.itemVariants?.baseItems;
  if (!baseItems || typeof baseItems !== 'object' || !items) return;

  for (const [baseId, baseItem] of Object.entries(baseItems)) {
    const variants = baseItem?.variantItemIds ?? [];
    for (const varId of variants) {
      const variant = items[varId];
      if (variant && baseItem?.item_type && variant.item_type !== baseItem.item_type) {
        col.addWarning('VAL-VAR-001', 'item-variants.json', `Variant "${varId}" has item_type "${variant.item_type}", expected "${baseItem.item_type}" (base "${baseId}")`, { entityId: baseId, field: 'variantItemIds' });
      }
    }
    const lvl1Id = `${baseId}-i`;
    if (items[lvl1Id] && !variants.includes(lvl1Id)) {
      col.addWarning('VAL-VAR-001', 'item-variants.json', `Base item "${baseId}" is missing Lvl 1 variant "${lvl1Id}" in variantItemIds`, { entityId: baseId, field: 'variantItemIds' });
    } else if (!items[lvl1Id] && items[baseId] && !variants.includes(baseId)) {
      col.addWarning('VAL-VAR-001', 'item-variants.json', `Base item "${baseId}" is missing Lvl 1 item "${baseId}" in variantItemIds`, { entityId: baseId, field: 'variantItemIds' });
    }
  }
}

function validateResearchAlignment(dataset, items, col) {
  if (!Array.isArray(dataset.weaponAmplificationResearch) || !items) return;

  const warIds = new Set(dataset.weaponAmplificationResearch.map((r) => r?.id).filter(Boolean));
  const itemResearchIds = new Set(
    Object.values(items)
      .filter((it) => it?.item_type === 'Research')
      .map((it) => it.id)
  );

  for (const id of warIds) {
    if (!itemResearchIds.has(id)) {
      col.addWarning('VAL-RES-001', 'weapon-amplification-research.json', `Research "${id}" missing from items.json with item_type === "Research"`, { entityId: id });
    }
  }
  for (const id of itemResearchIds) {
    if (!warIds.has(id)) {
      col.addWarning('VAL-RES-001', 'items.json', `Item "${id}" with item_type === "Research" missing from weapon-amplification-research.json`, { entityId: id });
    }
  }
}

function validateI18nAndQuality(dataset, items, col) {
  if (items) {
    for (const [id, item] of Object.entries(items)) {
      if (item?.rarity === '') {
        col.addWarning('VAL-I18N-001', 'items.json', `Item "${id}" has empty rarity ""`, { entityId: id, field: 'rarity' });
      }
      if (!item?.translations?.it?.name) {
        col.addWarning('VAL-I18N-001', 'items.json', `Item "${id}" is missing Italian translation (translations.it.name)`, { entityId: id, field: 'translations.it.name' });
      }
    }
  }

  if (dataset.customItems && typeof dataset.customItems === 'object') {
    for (const [id, item] of Object.entries(dataset.customItems)) {
      const hasReview = Array.isArray(item?.review)
        ? item.review.length > 0
        : typeof item?.review === 'string' && item.review.trim() !== '';
      if (hasReview) {
        col.addWarning('VAL-I18N-001', 'scripts/data/custom-items/items.json', `Custom item "${id}" has open review notes (${Array.isArray(item.review) ? item.review.length : 1})`, { entityId: id, field: 'review' });
      }
    }
  }

  for (const conflict of dataset.overridesConflicts?.conflicts ?? []) {
    col.addWarning('VAL-I18N-001', 'overrides-conflicts.json', `Unresolved override conflict: ${JSON.stringify(conflict)}`, { entityId: conflict?.id });
  }

  if (Array.isArray(dataset.maps?.maps) && Array.isArray(dataset.mapPois?.pois)) {
    const poiCounts = new Map();
    for (const poi of dataset.mapPois.pois) {
      if (poi?.mapId) poiCounts.set(poi.mapId, (poiCounts.get(poi.mapId) ?? 0) + 1);
    }
    for (const m of dataset.maps.maps) {
      if (typeof m?.totalPois === 'number') {
        const actual = poiCounts.get(m.id) ?? 0;
        if (m.totalPois !== actual) {
          col.addWarning('VAL-I18N-001', 'maps.json', `Map "${m.id}" totalPois (${m.totalPois}) !== actual map-pois count (${actual})`, { entityId: m.id, field: 'totalPois' });
        }
      }
    }
  }

  if (dataset.questMetadata && Array.isArray(dataset.mapPois?.pois)) {
    const exactKeys = new Set(Object.keys(dataset.questMetadata));
    const lowerToKey = new Map();
    for (const k of exactKeys) lowerToKey.set(k.toLowerCase(), k);

    for (const poi of dataset.mapPois.pois) {
      if (poi?.category === 'quest' && poi?.title && !exactKeys.has(poi.title)) {
        const matched = lowerToKey.get(poi.title.toLowerCase());
        if (matched) {
          col.addWarning('VAL-I18N-001', 'map-pois.json', `Quest POI "${poi.id}" title "${poi.title}" has case mismatch vs quest-metadata.json key "${matched}"`, { entityId: poi.id, field: 'title' });
        }
      }
    }
  }
}

/**
 * Esegue tutte le 16 regole di validazione sul dataset in ingresso.
 * @param {Record<string, unknown>} dataset
 * @param {{ blueprintAllowlist?: Set<string> }} [options]
 * @returns {{ errors: Array<object>, warnings: Array<object>, summary: { errorCount: number, warningCount: number, byRule: Record<string, number> } }}
 */
export function validateDataset(dataset = {}, options = {}) {
  const col = createCollector();
  const items = dataset.items && typeof dataset.items === 'object' ? dataset.items : null;
  const allowlist = options.blueprintAllowlist ?? DEFAULT_BLUEPRINT_ALLOWLIST;
  const allListsById = buildAllListsMap(dataset);

  // 11 ERROR rules
  validateIds(dataset, col);
  validateListItemFks(dataset, items, col);
  validateTraderFks(dataset, items, col);
  validateRecipeFks(dataset, items, col);
  validateItemSelfFks(items, col);
  validateVariantFks(dataset, items, col);
  validateMapFks(dataset, col);
  validateLevelRequirementsAndPassTracks(dataset, allListsById, col);
  validateDags(dataset, allListsById, col);

  // 5 WARNING rules
  validateBlueprints(dataset, items, allowlist, col);
  validateVariantsQuality(dataset, items, col);
  validateResearchAlignment(dataset, items, col);
  validateI18nAndQuality(dataset, items, col);

  const byRule = {};
  for (const rule of Object.keys(RULE_SEVERITY)) {
    byRule[rule] = 0;
  }
  for (const issue of [...col.errors, ...col.warnings]) {
    byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;
  }

  return {
    errors: col.errors,
    warnings: col.warnings,
    summary: {
      errorCount: col.errors.length,
      warningCount: col.warnings.length,
      byRule,
    },
  };
}

/**
 * Formatta il report di validazione in testo leggibile per CLI.
 * @param {ReturnType<typeof validateDataset>} result
 * @param {{ maxPerRule?: number }} [options]
 * @returns {string}
 */
export function formatValidationReport(result, options = {}) {
  const maxPerRule = options.maxPerRule ?? 10;
  const lines = [];
  lines.push('=== Dataset Validation Report ===');
  lines.push(`Errors: ${result.summary.errorCount} | Warnings: ${result.summary.warningCount}`);
  lines.push('');

  for (const [rule, severity] of Object.entries(RULE_SEVERITY)) {
    const count = result.summary.byRule[rule] ?? 0;
    const tag = severity.toUpperCase().padEnd(7);
    const status = count === 0 ? 'PASS' : `${count} issue(s)`;
    lines.push(`  [${tag}] ${rule}: ${status}`);
  }

  const printSection = (title, issues) => {
    if (issues.length === 0) return;
    lines.push('');
    lines.push(`--- ${title} ---`);
    const grouped = new Map();
    for (const issue of issues) {
      if (!grouped.has(issue.rule)) grouped.set(issue.rule, []);
      grouped.get(issue.rule).push(issue);
    }
    for (const [rule, list] of grouped.entries()) {
      lines.push(`\n[${rule}] (${list.length}):`);
      const shown = list.slice(0, maxPerRule);
      for (const item of shown) {
        lines.push(`  - (${item.file}) ${item.message}`);
      }
      if (list.length > maxPerRule) {
        lines.push(`  ... and ${list.length - maxPerRule} more`);
      }
    }
  };

  printSection('ERRORS', result.errors);
  printSection('WARNINGS', result.warnings);

  return lines.join('\n');
}
