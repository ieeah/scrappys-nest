import { describe, it, expect } from 'vitest';
import {
  computeDatasetDiff,
  formatPatchDiffReport,
  collectItemReferences,
} from './patch-diff.mjs';

function makeBaseline() {
  return {
    items: {
      'metal-parts': {
        id: 'metal-parts',
        name: 'Metal Parts',
        rarity: 'Common',
        item_type: 'Basic Material',
        value: 50,
        translations: { it: { name: 'Parti metalliche' } },
      },
      'old-part': {
        id: 'old-part',
        name: 'Old Part',
        rarity: 'Uncommon',
        item_type: 'Material',
        value: 100,
      },
      'unused-trinket': {
        id: 'unused-trinket',
        name: 'Unused Trinket',
        rarity: 'Common',
        item_type: 'Trinket',
      },
    },
    workbenches: {
      items: [
        {
          id: 'gunsmith',
          levels: [
            {
              level: 1,
              requirementItemIds: [{ itemId: 'old-part', quantity: 3 }],
            },
          ],
        },
      ],
    },
    recipes: {
      recipes: {
        'anvil-i': {
          itemId: 'anvil-i',
          crafting: { ingredients: { 'metal-parts': 5 } },
          repair: { cost: { 'metal-parts': 2 } },
        },
      },
    },
    quests: {
      lists: [
        {
          id: 'q-1',
          name: 'First Quest',
          trader: 'celeste',
          prerequisites: [],
          levels: [{ level: 1, requirementItemIds: [], actions: [] }],
        },
      ],
    },
    skills: [
      {
        id: 'cond_1',
        name: { en: 'Used To The Weight', it: 'Abitudine al peso' },
        category: 'CONDITIONING',
        maxPoints: 1,
      },
    ],
    maps: {
      maps: [{ id: 'dam' }, { id: 'spaceport' }],
    },
    mapPois: {
      pois: [
        { id: 'p1', mapId: 'dam' },
        { id: 'p2', mapId: 'dam' },
        { id: 'p3', mapId: 'spaceport' },
      ],
    },
    overridesConflicts: { conflicts: [] },
  };
}

describe('computeDatasetDiff', () => {
  it('restituisce hasChanges: false per snapshot identici', () => {
    const base = makeBaseline();
    const diff = computeDatasetDiff(base, structuredClone(base));

    expect(diff.hasChanges).toBe(false);
    expect(diff.items.added).toHaveLength(0);
    expect(diff.items.removed).toHaveLength(0);
    expect(diff.items.modified).toHaveLength(0);
    expect(diff.recipes.added).toHaveLength(0);
    expect(diff.recipes.removed).toHaveLength(0);
    expect(diff.recipes.modified).toHaveLength(0);
    expect(diff.quests.added).toHaveLength(0);
    expect(diff.skills.added).toHaveLength(0);
    expect(diff.mapPois.totalDelta).toBe(0);
  });

  it('rileva items aggiunti, modificati (incluso translations.it.name) e rimossi con candidati is_deprecated', () => {
    const before = makeBaseline();
    const after = makeBaseline();

    // Aggiungi un item
    after.items['new-alloy'] = {
      id: 'new-alloy',
      name: 'New Alloy',
      rarity: 'Rare',
      item_type: 'Material',
    };

    // Rimuovi un item referenziato in workbenches e uno non referenziato
    delete after.items['old-part'];
    delete after.items['unused-trinket'];

    // Modifica campi chiave e translations.it.name
    after.items['metal-parts'].value = 75;
    after.items['metal-parts'].translations.it.name = 'Parti di metallo';

    after.overridesConflicts = {
      conflicts: [
        { id: 'metal-parts', key: 'value', kind: 'changed', oldUpstream: 50, newUpstream: 75 },
      ],
    };

    const diff = computeDatasetDiff(before, after);
    expect(diff.hasChanges).toBe(true);
    expect(diff.items.added).toEqual([
      { id: 'new-alloy', name: 'New Alloy', item_type: 'Material', rarity: 'Rare' },
    ]);

    expect(diff.items.removed).toHaveLength(2);
    const oldPartRemoved = diff.items.removed.find((r) => r.id === 'old-part');
    const unusedRemoved = diff.items.removed.find((r) => r.id === 'unused-trinket');
    expect(oldPartRemoved?.isDeprecatedCandidate).toBe(true);
    expect(oldPartRemoved?.referencedIn).toContain('workbenches:gunsmith#L1');
    expect(unusedRemoved?.isDeprecatedCandidate).toBe(false);
    expect(unusedRemoved?.referencedIn).toEqual([]);

    expect(diff.items.modified).toEqual([
      {
        id: 'metal-parts',
        name: 'Metal Parts',
        changes: [
          { field: 'value', before: 50, after: 75 },
          { field: 'translations.it.name', before: 'Parti metalliche', after: 'Parti di metallo' },
        ],
      },
    ]);

    expect(diff.items.conflicts.total).toBe(1);
    expect(diff.items.conflicts.byKind.changed).toBe(1);
  });

  it('raccoglie riferimenti anche da recipes, traders, quests (carryItems/rewards) e passes', () => {
    const dataset = {
      recipes: {
        recipes: {
          'test-item': {
            crafting: { ingredients: { 'ing-a': 1 } },
            recycling: { recyclesInto: { 'ing-b': 2 } },
          },
        },
      },
      traders: {
        items: [{ id: 'tr-item', trader: 'apollo' }],
      },
      quests: {
        lists: [
          {
            id: 'q-ref',
            levels: [
              {
                level: 1,
                actions: [{ id: 'a1', carryItems: [{ itemId: 'carry-x', quantity: 1 }] }],
              },
            ],
          },
        ],
      },
    };

    const refs = collectItemReferences(dataset);
    expect([...(refs.get('ing-a') ?? [])]).toContain('recipes:test-item:crafting');
    expect([...(refs.get('ing-b') ?? [])]).toContain('recipes:test-item:recycling');
    expect([...(refs.get('tr-item') ?? [])]).toContain('traders:apollo');
    expect([...(refs.get('carry-x') ?? [])]).toContain('quests:q-ref#L1:carryItems');
  });

  it('rileva diff su recipes, quests, skills e mapPois', () => {
    const before = makeBaseline();
    const after = makeBaseline();

    // Recipes: aggiunta, modificata (crafting)
    after.recipes.recipes['anvil-i'].crafting.ingredients['metal-parts'] = 8;
    after.recipes.recipes['new-gun'] = { itemId: 'new-gun', crafting: { ingredients: {} } };

    // Quests: aggiunta, modificata
    after.quests.lists[0].trader = 'shani';
    after.quests.lists.push({ id: 'q-2', name: 'Second Quest', trader: 'apollo' });

    // Skills: modificata, rimossa
    after.skills = [
      {
        id: 'cond_1',
        name: { en: 'Used To The Weight', it: 'Abitudine al peso' },
        category: 'CONDITIONING',
        maxPoints: 3,
      },
    ];

    // Map POIs: +1 su dam, -1 su spaceport
    after.mapPois.pois = [
      { id: 'p1', mapId: 'dam' },
      { id: 'p2', mapId: 'dam' },
      { id: 'p4', mapId: 'dam' },
    ];

    const diff = computeDatasetDiff(before, after);

    expect(diff.recipes.added).toEqual([{ id: 'new-gun' }]);
    expect(diff.recipes.modified).toEqual([{ id: 'anvil-i', sectionsChanged: ['crafting'] }]);

    expect(diff.quests.added).toEqual([{ id: 'q-2', name: 'Second Quest', trader: 'apollo' }]);
    expect(diff.quests.modified).toEqual([
      { id: 'q-1', name: 'First Quest', trader: 'shani', changes: ['trader'] },
    ]);

    expect(diff.skills.modified).toEqual([
      { id: 'cond_1', name: 'Used To The Weight', changes: ['maxPoints'] },
    ]);

    expect(diff.mapPois.totalBefore).toBe(3);
    expect(diff.mapPois.totalAfter).toBe(3);
    expect(diff.mapPois.totalDelta).toBe(0);
    expect(diff.mapPois.byMap).toEqual([
      { mapId: 'dam', beforeCount: 2, afterCount: 3, delta: 1 },
      { mapId: 'spaceport', beforeCount: 1, afterCount: 0, delta: -1 },
    ]);
  });
});

describe('formatPatchDiffReport', () => {
  it('formatta un report Markdown leggibile con le sezioni attese', () => {
    const before = makeBaseline();
    const after = makeBaseline();
    delete after.items['old-part'];
    after.mapPois.pois.push({ id: 'p4', mapId: 'dam' });

    const diff = computeDatasetDiff(before, after);
    const report = formatPatchDiffReport(diff);

    expect(report).toContain('# Patch Diff Report');
    expect(report).toContain('## Riepilogo');
    expect(report).toContain('CANDIDATO is_deprecated');
    expect(report).toContain('old-part');
    expect(report).toContain('`dam`: 2 -> 3 (+1)');
  });
});
