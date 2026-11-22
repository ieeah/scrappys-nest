/**
 * Libreria pura per il calcolo e la formattazione delle differenze tra due snapshot
 * del dataset Scrappy's Nest (ADR 010 — flusso `patch-diff`).
 */

const ITEM_TRACKED_FIELDS = [
  'name',
  'description',
  'rarity',
  'item_type',
  'subcategory',
  'value',
  'workbench',
  'loot_area',
  'stack_size',
  'unlocks_item_id',
  'deprecated',
];

const RECIPE_SECTIONS = ['crafting', 'upgrading', 'repair', 'recycling'];
const QUEST_TRACKED_FIELDS = ['name', 'trader', 'prerequisites', 'translations', 'levels'];
const SKILL_TRACKED_FIELDS = [
  'name',
  'description',
  'category',
  'isMajor',
  'maxPoints',
  'prerequisiteNodeIds',
  'minPointsSpent',
  'knownValue',
  'impactedSkill',
];

function normalizeValue(value) {
  return value === undefined ? null : value;
}

function stableEqual(a, b) {
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  if (Object.is(na, nb)) return true;
  if (na === null || nb === null || typeof na !== typeof nb) return false;
  if (typeof na !== 'object') return false;

  if (Array.isArray(na) !== Array.isArray(nb)) return false;
  if (Array.isArray(na)) {
    if (na.length !== nb.length) return false;
    return na.every((item, idx) => stableEqual(item, nb[idx]));
  }

  const keysA = Object.keys(na).filter((k) => na[k] !== undefined);
  const keysB = Object.keys(nb).filter((k) => nb[k] !== undefined);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(nb, k) && stableEqual(na[k], nb[k]));
}

function addRef(refsMap, itemId, location) {
  if (!itemId) return;
  let set = refsMap.get(itemId);
  if (!set) {
    set = new Set();
    refsMap.set(itemId, set);
  }
  set.add(location);
}

function collectListGroupRefs(refsMap, fileLabel, lists = []) {
  for (const list of lists) {
    if (!list?.id) continue;
    for (const lvl of list.levels ?? []) {
      const prefix = `${fileLabel}:${list.id}#L${lvl.level ?? '?'}`;
      for (const req of lvl.requirementItemIds ?? []) addRef(refsMap, req?.itemId, prefix);
      for (const rew of lvl.rewards ?? []) addRef(refsMap, rew?.itemId, `${prefix}:rewards`);
      for (const action of lvl.actions ?? []) {
        for (const rew of action.rewards ?? []) addRef(refsMap, rew?.itemId, `${prefix}:action-rewards`);
        for (const carry of action.carryItems ?? []) addRef(refsMap, carry?.itemId, `${prefix}:carryItems`);
        for (const step of action.tieredSteps ?? []) {
          for (const rew of step.rewards ?? []) addRef(refsMap, rew?.itemId, `${prefix}:step-rewards`);
          for (const carry of step.carryItems ?? []) addRef(refsMap, carry?.itemId, `${prefix}:step-carryItems`);
        }
      }
    }
  }
}

/**
 * Raccoglie tutti i luoghi in cui ciascun `itemId` è referenziato nel dataset.
 * Usato per segnalare gli item rimossi che sono candidati a `is_deprecated`.
 * @param {Record<string, any>} dataset
 * @returns {Map<string, Set<string>>}
 */
export function collectItemReferences(dataset = {}) {
  const refs = new Map();

  collectListGroupRefs(refs, 'workbenches', dataset.workbenches?.items);
  collectListGroupRefs(refs, 'projects', dataset.projects?.lists);
  collectListGroupRefs(refs, 'expeditions', dataset.expeditions?.lists);
  collectListGroupRefs(refs, 'passes', dataset.passes?.lists);
  collectListGroupRefs(refs, 'quests', dataset.quests?.lists);

  const recipes = dataset.recipes?.recipes ?? {};
  for (const [recipeId, recipe] of Object.entries(recipes)) {
    for (const ingId of Object.keys(recipe?.crafting?.ingredients ?? {})) {
      addRef(refs, ingId, `recipes:${recipeId}:crafting`);
    }
    const tiers = recipe?.upgrading?.tiers ?? {};
    for (const [tierKey, tier] of Object.entries(tiers)) {
      for (const ingId of Object.keys(tier?.ingredients ?? {})) {
        addRef(refs, ingId, `recipes:${recipeId}:upgrading.${tierKey}`);
      }
    }
    for (const costId of Object.keys(recipe?.repair?.cost ?? {})) {
      addRef(refs, costId, `recipes:${recipeId}:repair`);
    }
    for (const outId of Object.keys(recipe?.recycling?.recyclesInto ?? {})) {
      addRef(refs, outId, `recipes:${recipeId}:recycling`);
    }
    for (const outId of Object.keys(recipe?.recycling?.salvagesInto ?? {})) {
      addRef(refs, outId, `recipes:${recipeId}:salvaging`);
    }
  }

  for (const traderItem of dataset.traders?.items ?? []) {
    addRef(refs, traderItem?.id, `traders:${traderItem?.trader ?? 'unknown'}`);
  }

  return refs;
}

function diffItems(beforeItems = {}, afterItems = {}, afterRefs, conflictsData) {
  const beforeIds = new Set(Object.keys(beforeItems));
  const afterIds = new Set(Object.keys(afterItems));

  const added = [];
  const removed = [];
  const modified = [];

  for (const id of [...afterIds].sort()) {
    if (!beforeIds.has(id)) {
      const item = afterItems[id];
      added.push({
        id,
        name: item?.name ?? id,
        item_type: item?.item_type ?? null,
        rarity: item?.rarity ?? null,
      });
    }
  }

  for (const id of [...beforeIds].sort()) {
    if (!afterIds.has(id)) {
      const item = beforeItems[id];
      const referencedIn = [...(afterRefs.get(id) ?? [])].sort();
      removed.push({
        id,
        name: item?.name ?? id,
        item_type: item?.item_type ?? null,
        referencedIn,
        isDeprecatedCandidate: referencedIn.length > 0,
      });
    }
  }

  for (const id of [...afterIds].sort()) {
    if (!beforeIds.has(id)) continue;
    const before = beforeItems[id];
    const after = afterItems[id];
    const changes = [];

    for (const field of ITEM_TRACKED_FIELDS) {
      if (!stableEqual(before?.[field], after?.[field])) {
        changes.push({
          field,
          before: normalizeValue(before?.[field]),
          after: normalizeValue(after?.[field]),
        });
      }
    }

    const beforeItName = normalizeValue(before?.translations?.it?.name);
    const afterItName = normalizeValue(after?.translations?.it?.name);
    if (!stableEqual(beforeItName, afterItName)) {
      changes.push({
        field: 'translations.it.name',
        before: beforeItName,
        after: afterItName,
      });
    }

    if (changes.length > 0) {
      modified.push({
        id,
        name: after?.name ?? before?.name ?? id,
        changes,
      });
    }
  }

  const rawConflicts = Array.isArray(conflictsData?.conflicts) ? conflictsData.conflicts : [];
  const byKind = { changed: 0, redundant: 0, orphan: 0 };
  for (const c of rawConflicts) {
    if (c?.kind && Object.prototype.hasOwnProperty.call(byKind, c.kind)) {
      byKind[c.kind]++;
    }
  }

  return {
    added,
    removed,
    modified,
    conflicts: {
      total: rawConflicts.length,
      byKind,
      items: rawConflicts,
    },
  };
}

function diffRecipes(beforeRecipesObj = {}, afterRecipesObj = {}) {
  const before = beforeRecipesObj?.recipes ?? {};
  const after = afterRecipesObj?.recipes ?? {};
  const beforeIds = new Set(Object.keys(before));
  const afterIds = new Set(Object.keys(after));

  const added = [...afterIds].filter((id) => !beforeIds.has(id)).sort().map((id) => ({ id }));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id)).sort().map((id) => ({ id }));
  const modified = [];

  for (const id of [...afterIds].sort()) {
    if (!beforeIds.has(id)) continue;
    const sectionsChanged = RECIPE_SECTIONS.filter(
      (section) => !stableEqual(before[id]?.[section], after[id]?.[section])
    );
    if (sectionsChanged.length > 0) {
      modified.push({ id, sectionsChanged });
    }
  }

  return { added, removed, modified };
}

function diffByIdList(beforeArr = [], afterArr = [], trackedFields, pickMeta) {
  const beforeMap = new Map(beforeArr.filter((x) => x?.id).map((x) => [x.id, x]));
  const afterMap = new Map(afterArr.filter((x) => x?.id).map((x) => [x.id, x]));

  const added = [];
  const removed = [];
  const modified = [];

  for (const id of [...afterMap.keys()].sort()) {
    if (!beforeMap.has(id)) {
      added.push(pickMeta(afterMap.get(id)));
    }
  }

  for (const id of [...beforeMap.keys()].sort()) {
    if (!afterMap.has(id)) {
      removed.push(pickMeta(beforeMap.get(id)));
    }
  }

  for (const id of [...afterMap.keys()].sort()) {
    if (!beforeMap.has(id)) continue;
    const before = beforeMap.get(id);
    const after = afterMap.get(id);
    const changes = trackedFields.filter((f) => !stableEqual(before?.[f], after?.[f]));
    if (changes.length > 0) {
      modified.push({ ...pickMeta(after), changes });
    }
  }

  return { added, removed, modified };
}

function countPoisByMap(pois = []) {
  const counts = new Map();
  for (const poi of pois) {
    if (!poi?.mapId) continue;
    counts.set(poi.mapId, (counts.get(poi.mapId) ?? 0) + 1);
  }
  return counts;
}

function diffMapPois(beforeDataset = {}, afterDataset = {}) {
  const beforePois = beforeDataset.mapPois?.pois ?? [];
  const afterPois = afterDataset.mapPois?.pois ?? [];
  const beforeCounts = countPoisByMap(beforePois);
  const afterCounts = countPoisByMap(afterPois);

  const mapIds = new Set([
    ...(beforeDataset.maps?.maps ?? []).map((m) => m.id),
    ...(afterDataset.maps?.maps ?? []).map((m) => m.id),
    ...beforeCounts.keys(),
    ...afterCounts.keys(),
  ]);

  const byMap = [...mapIds]
    .sort()
    .map((mapId) => {
      const beforeCount = beforeCounts.get(mapId) ?? 0;
      const afterCount = afterCounts.get(mapId) ?? 0;
      return {
        mapId,
        beforeCount,
        afterCount,
        delta: afterCount - beforeCount,
      };
    });

  return {
    totalBefore: beforePois.length,
    totalAfter: afterPois.length,
    totalDelta: afterPois.length - beforePois.length,
    byMap,
  };
}

/**
 * Calcola le differenze strutturali tra due snapshot del dataset (`beforeDataset` vs `afterDataset`).
 * @param {Record<string, any>} beforeDataset
 * @param {Record<string, any>} afterDataset
 */
export function computeDatasetDiff(beforeDataset = {}, afterDataset = {}) {
  const afterRefs = collectItemReferences(afterDataset);

  const items = diffItems(
    beforeDataset.items ?? {},
    afterDataset.items ?? {},
    afterRefs,
    afterDataset.overridesConflicts
  );

  const recipes = diffRecipes(beforeDataset.recipes, afterDataset.recipes);

  const quests = diffByIdList(
    beforeDataset.quests?.lists ?? [],
    afterDataset.quests?.lists ?? [],
    QUEST_TRACKED_FIELDS,
    (q) => ({ id: q.id, name: q.name ?? q.id, trader: q.trader ?? null })
  );

  const skills = diffByIdList(
    Array.isArray(beforeDataset.skills) ? beforeDataset.skills : [],
    Array.isArray(afterDataset.skills) ? afterDataset.skills : [],
    SKILL_TRACKED_FIELDS,
    (s) => ({ id: s.id, name: s.name?.en ?? s.id })
  );

  const mapPois = diffMapPois(beforeDataset, afterDataset);

  const hasChanges =
    items.added.length > 0 ||
    items.removed.length > 0 ||
    items.modified.length > 0 ||
    recipes.added.length > 0 ||
    recipes.removed.length > 0 ||
    recipes.modified.length > 0 ||
    quests.added.length > 0 ||
    quests.removed.length > 0 ||
    quests.modified.length > 0 ||
    skills.added.length > 0 ||
    skills.removed.length > 0 ||
    skills.modified.length > 0 ||
    mapPois.byMap.some((m) => m.delta !== 0);

  return {
    hasChanges,
    items,
    recipes,
    quests,
    skills,
    mapPois,
  };
}

function formatListBlock(lines, title, entries, formatter, limit = 50) {
  if (entries.length === 0) return;
  lines.push(`### ${title} (${entries.length})`);
  for (const entry of entries.slice(0, limit)) {
    lines.push(`- ${formatter(entry)}`);
  }
  if (entries.length > limit) {
    lines.push(`- ... e altri ${entries.length - limit}`);
  }
  lines.push('');
}

/**
 * Formatta il risultato di `computeDatasetDiff` in un report Markdown leggibile.
 * @param {ReturnType<typeof computeDatasetDiff>} diff
 * @returns {string}
 */
export function formatPatchDiffReport(diff) {
  const lines = ['# Patch Diff Report', ''];

  lines.push('## Riepilogo');
  lines.push(
    `- **Items**: +${diff.items.added.length} / -${diff.items.removed.length} / ~${diff.items.modified.length} (conflitti override: ${diff.items.conflicts.total})`
  );
  lines.push(
    `- **Recipes**: +${diff.recipes.added.length} / -${diff.recipes.removed.length} / ~${diff.recipes.modified.length}`
  );
  lines.push(
    `- **Quests**: +${diff.quests.added.length} / -${diff.quests.removed.length} / ~${diff.quests.modified.length}`
  );
  lines.push(
    `- **Skills**: +${diff.skills.added.length} / -${diff.skills.removed.length} / ~${diff.skills.modified.length}`
  );
  const deltaSign = diff.mapPois.totalDelta > 0 ? `+${diff.mapPois.totalDelta}` : `${diff.mapPois.totalDelta}`;
  lines.push(
    `- **Map POIs**: ${diff.mapPois.totalBefore} -> ${diff.mapPois.totalAfter} (${deltaSign})`
  );
  lines.push('');

  if (!diff.hasChanges && diff.items.conflicts.total === 0) {
    lines.push('Nessuna differenza rilevata tra i due snapshot.');
    return lines.join('\n');
  }

  // Items
  if (
    diff.items.added.length > 0 ||
    diff.items.removed.length > 0 ||
    diff.items.modified.length > 0 ||
    diff.items.conflicts.total > 0
  ) {
    lines.push('## Items', '');
    formatListBlock(
      lines,
      'Aggiunti',
      diff.items.added,
      (i) => `\`${i.id}\` — ${i.name} (${i.item_type ?? '?'}, ${i.rarity ?? '?'})`
    );
    formatListBlock(lines, 'Rimossi', diff.items.removed, (i) => {
      if (i.isDeprecatedCandidate) {
        return `\`${i.id}\` — ${i.name} **[CANDIDATO is_deprecated]** (referenziato in: ${i.referencedIn.slice(0, 5).join(', ')}${i.referencedIn.length > 5 ? ', …' : ''})`;
      }
      return `\`${i.id}\` — ${i.name}`;
    });
    formatListBlock(
      lines,
      'Modificati',
      diff.items.modified,
      (i) => `\`${i.id}\` (${i.changes.map((c) => c.field).join(', ')})`
    );

    if (diff.items.conflicts.total > 0) {
      const { byKind } = diff.items.conflicts;
      lines.push(
        `### Conflitti Override (${diff.items.conflicts.total}: ${byKind.changed} changed, ${byKind.redundant} redundant, ${byKind.orphan} orphan)`
      );
      for (const c of diff.items.conflicts.items.slice(0, 30)) {
        lines.push(`- \`${c.id}\` [${c.kind}] su \`${c.key}\``);
      }
      if (diff.items.conflicts.items.length > 30) {
        lines.push(`- ... e altri ${diff.items.conflicts.items.length - 30}`);
      }
      lines.push('');
    }
  }

  // Recipes
  if (
    diff.recipes.added.length > 0 ||
    diff.recipes.removed.length > 0 ||
    diff.recipes.modified.length > 0
  ) {
    lines.push('## Recipes', '');
    formatListBlock(lines, 'Aggiunte', diff.recipes.added, (r) => `\`${r.id}\``);
    formatListBlock(lines, 'Rimosse', diff.recipes.removed, (r) => `\`${r.id}\``);
    formatListBlock(
      lines,
      'Modificate',
      diff.recipes.modified,
      (r) => `\`${r.id}\` (${r.sectionsChanged.join(', ')})`
    );
  }

  // Quests
  if (
    diff.quests.added.length > 0 ||
    diff.quests.removed.length > 0 ||
    diff.quests.modified.length > 0
  ) {
    lines.push('## Quests', '');
    formatListBlock(lines, 'Aggiunte', diff.quests.added, (q) => `\`${q.id}\` — ${q.name} (${q.trader ?? '?'})`);
    formatListBlock(lines, 'Rimosse', diff.quests.removed, (q) => `\`${q.id}\` — ${q.name}`);
    formatListBlock(
      lines,
      'Modificate',
      diff.quests.modified,
      (q) => `\`${q.id}\` (${q.changes.join(', ')})`
    );
  }

  // Skills
  if (
    diff.skills.added.length > 0 ||
    diff.skills.removed.length > 0 ||
    diff.skills.modified.length > 0
  ) {
    lines.push('## Skills', '');
    formatListBlock(lines, 'Aggiunte', diff.skills.added, (s) => `\`${s.id}\` — ${s.name}`);
    formatListBlock(lines, 'Rimosse', diff.skills.removed, (s) => `\`${s.id}\` — ${s.name}`);
    formatListBlock(
      lines,
      'Modificate',
      diff.skills.modified,
      (s) => `\`${s.id}\` (${s.changes.join(', ')})`
    );
  }

  // Map POIs
  const changedMaps = diff.mapPois.byMap.filter((m) => m.delta !== 0);
  if (changedMaps.length > 0) {
    lines.push('## Map POIs (delta per mappa)', '');
    for (const m of changedMaps) {
      const sign = m.delta > 0 ? `+${m.delta}` : `${m.delta}`;
      lines.push(`- \`${m.mapId}\`: ${m.beforeCount} -> ${m.afterCount} (${sign})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
