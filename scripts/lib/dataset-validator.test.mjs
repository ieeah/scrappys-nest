import { describe, it, expect } from 'vitest';
import {
  validateDataset,
  formatValidationReport,
  RULE_SEVERITY,
} from './dataset-validator.mjs';

function makeValidBaseline() {
  return {
    items: {
      'metal-parts': {
        id: 'metal-parts',
        name: 'Metal Parts',
        item_type: 'Basic Material',
        rarity: 'Common',
        translations: { it: { name: 'Parti metalliche' } },
      },
      'anvil-i': {
        id: 'anvil-i',
        name: 'Anvil I',
        item_type: 'Weapon',
        rarity: 'Rare',
        translations: { it: { name: 'Incudine I' } },
      },
      'anvil-ii': {
        id: 'anvil-ii',
        name: 'Anvil II',
        item_type: 'Weapon',
        rarity: 'Rare',
        translations: { it: { name: 'Incudine II' } },
      },
      'anvil-blueprint': {
        id: 'anvil-blueprint',
        name: 'Anvil Blueprint',
        item_type: 'Blueprint',
        rarity: 'Rare',
        unlocks_item_id: 'anvil-i',
        translations: { it: { name: 'Progetto Incudine' } },
      },
      'purification-system-blueprint': {
        id: 'purification-system-blueprint',
        name: 'Purification System Blueprint',
        item_type: 'Trinket',
        rarity: 'Rare',
        translations: { it: { name: 'Progetto sistema depurazione' } },
      },
      'embedded-blast-engineering': {
        id: 'embedded-blast-engineering',
        name: 'Embedded Blast Engineering',
        item_type: 'Research',
        rarity: 'Epic',
        translations: { it: { name: 'Ingegneria esplosiva' } },
      },
    },
    itemVariants: {
      baseItems: {
        anvil: {
          id: 'anvil',
          item_type: 'Weapon',
          blueprintItemId: 'anvil-blueprint',
          variantItemIds: ['anvil-i', 'anvil-ii'],
        },
      },
    },
    workbenches: {
      items: [
        {
          id: 'weapon-bench',
          maxLevel: 3,
          levels: [
            {
              level: 1,
              requirementItemIds: [{ itemId: 'metal-parts', quantity: 5 }],
            },
          ],
        },
      ],
    },
    projects: { lists: [] },
    expeditions: { lists: [] },
    passes: {
      lists: [
        {
          id: 'season-pass',
          maxLevel: 2,
          tracks: [{ id: 'free' }, { id: 'premium' }],
          levels: [
            {
              level: 1,
              requirementItemIds: [],
              rewards: [{ itemId: 'metal-parts', quantity: 10, track: 'free' }],
            },
          ],
        },
      ],
    },
    quests: {
      lists: [
        {
          id: 'first-quest',
          maxLevel: 1,
          trader: 'celeste',
          prerequisites: [],
          levels: [
            {
              level: 1,
              requires: [{ listId: 'weapon-bench', level: 1 }],
              requirementItemIds: [{ itemId: 'metal-parts', quantity: 2 }],
              actions: [
                {
                  id: 'act-1',
                  maps: ['dam'],
                  rewards: [{ itemId: 'metal-parts', quantity: 1 }],
                },
              ],
              rewards: [{ itemId: 'anvil-i', quantity: 1 }],
            },
          ],
        },
        {
          id: 'second-quest',
          maxLevel: 1,
          trader: 'celeste',
          prerequisites: ['first-quest'],
          levels: [{ level: 1, requirementItemIds: [] }],
        },
      ],
    },
    questsSource: {
      nodes: [{ id: 'first-quest', trader: 'celeste', map: 'dam' }],
      edges: [],
    },
    questMetadata: {
      'A Bad Feeling': { isSequential: false },
    },
    recipes: {
      recipes: {
        'anvil-i': {
          itemId: 'anvil-i',
          crafting: {
            benches: {
              'weapon-bench': { levelRequired: 1 },
              'in-raid': { skillRequired: 'cond_1' },
            },
            ingredients: { 'metal-parts': 5 },
          },
          upgrade: {
            upgradesTo: 'anvil-ii',
            upgradeCost: { 'metal-parts': 10 },
            requires: [
              { type: 'station', station: 'weapon-bench', level: 2 },
              { type: 'research', itemId: 'embedded-blast-engineering' },
            ],
          },
          repair: { cost: { 'metal-parts': 2 } },
          recycling: {
            recyclesInto: { 'metal-parts': 3 },
            salvagesInto: { 'metal-parts': 1 },
          },
        },
      },
    },
    traders: {
      traders: [{ id: 'celeste', name: 'Celeste' }],
      items: [{ id: 'metal-parts', trader: 'celeste', price: 100 }],
    },
    skills: [
      { id: 'cond_1', prerequisiteNodeIds: [] },
      { id: 'cond_2', prerequisiteNodeIds: ['cond_1'] },
    ],
    weaponAmplificationResearch: [{ id: 'embedded-blast-engineering' }],
    maps: {
      maps: [
        {
          id: 'dam',
          floors: [{ id: 'dam', layerKey: 'dam', floorLevel: 0 }],
        },
      ],
    },
    mapPois: {
      pois: [
        {
          id: 'Poi_ABC123',
          mapId: 'dam',
          layer: 'dam',
          category: 'quest',
          title: 'A Bad Feeling',
        },
      ],
    },
    mapAreas: { dam: [{ layer: 'dam' }] },
    mapNameplates: { dam: [{ layer: 'dam' }] },
    codex: {
      sections: {
        History: [{ page: 'The Collapse (lore)' }],
      },
    },
    overridesConflicts: { conflicts: [] },
    customItems: {},
  };
}

describe('dataset-validator', () => {
  it('passes with 0 errors and 0 warnings on a clean baseline', () => {
    const res = validateDataset(makeValidBaseline());
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.summary.errorCount).toBe(0);
    expect(res.summary.warningCount).toBe(0);
    expect(Object.keys(RULE_SEVERITY)).toHaveLength(16);
  });

  it('VAL-ID-001: detects non-hyphen-case, key!==id, duplicates, and respects exceptions', () => {
    const ds = makeValidBaseline();
    ds.items['Bad_Key'] = { id: 'wrong-id', rarity: 'Common', translations: { it: { name: 'x' } } };
    ds.skills.push({ id: 'bad-hyphen', prerequisiteNodeIds: [] });
    ds.quests.lists.push({ ...ds.quests.lists[0], id: 'weapon-bench' });

    const res = validateDataset(ds);
    const idErrors = res.errors.filter((e) => e.rule === 'VAL-ID-001');
    expect(idErrors.length).toBeGreaterThanOrEqual(4);
  });

  it('VAL-FK-001: detects missing itemId in lists (requirements, rewards, carryItems, actions, tieredActions)', () => {
    const ds = makeValidBaseline();
    ds.quests.lists[0].levels[0].carryItems = [{ itemId: 'missing-carry' }];
    ds.quests.lists[0].levels[0].tieredActions = [
      { steps: [{ rewards: [{ itemId: 'missing-step-reward' }] }] },
    ];
    ds.workbenches.items[0].levels[0].requirementItemIds.push({ itemId: 'missing-req', quantity: 1 });

    const res = validateDataset(ds);
    const fk1 = res.errors.filter((e) => e.rule === 'VAL-FK-001');
    expect(fk1).toHaveLength(3);
  });

  it('VAL-FK-002 & VAL-FK-003: detects missing trader items, unknown traders, and duplicate pairs', () => {
    const ds = makeValidBaseline();
    ds.traders.items.push({ id: 'metal-parts', trader: 'celeste', price: 200 }); // duplicate pair
    ds.traders.items.push({ id: 'ghost-item', trader: 'ghost-trader', price: 50 });
    ds.quests.lists[0].trader = 'tian_wen';
    ds.questsSource.nodes[0].trader = 'cassio';

    const res = validateDataset(ds);
    expect(res.errors.filter((e) => e.rule === 'VAL-FK-002')).toHaveLength(3);
    expect(res.errors.filter((e) => e.rule === 'VAL-FK-003')).toHaveLength(2);
  });

  it('VAL-FK-004 & VAL-FK-005: detects missing recipe items, stations, skills, and research', () => {
    const ds = makeValidBaseline();
    ds.recipes.recipes['missing-recipe'] = {
      itemId: 'missing-recipe',
      crafting: {
        benches: { 'unknown-bench': { skillRequired: 'unknown_skill' } },
        ingredients: { 'unknown-ing': 1 },
      },
      upgrade: {
        upgradesTo: 'unknown-target',
        branches: [{ to: 'unknown-branch', cost: { 'unknown-cost': 1 } }],
        requires: [
          { type: 'station', station: 'unknown-station', level: 1 },
          { type: 'research', itemId: 'unknown-research' },
        ],
      },
    };

    const res = validateDataset(ds);
    expect(res.errors.filter((e) => e.rule === 'VAL-FK-004').length).toBeGreaterThanOrEqual(5);
    expect(res.errors.filter((e) => e.rule === 'VAL-FK-005').length).toBeGreaterThanOrEqual(4);
  });

  it('VAL-FK-006: detects self-loops and missing targets on item self-FKs', () => {
    const ds = makeValidBaseline();
    ds.items['metal-parts'].unlocks_item_id = 'metal-parts';
    ds.items['anvil-i'].iconFromItem = 'nonexistent-icon';

    const res = validateDataset(ds);
    const fk6 = res.errors.filter((e) => e.rule === 'VAL-FK-006');
    expect(fk6).toHaveLength(2);
  });

  it('VAL-FK-007: detects missing variant/blueprint refs and shared variants across base items', () => {
    const ds = makeValidBaseline();
    ds.itemVariants.baseItems['anvil-clone'] = {
      id: 'anvil-clone',
      item_type: 'Weapon',
      blueprintItemId: 'missing-bp',
      variantItemIds: ['anvil-i', 'missing-var'],
    };

    const res = validateDataset(ds);
    const fk7 = res.errors.filter((e) => e.rule === 'VAL-FK-007');
    expect(fk7).toHaveLength(3);
  });

  it('VAL-FK-008: detects invalid mapId and layer across POIs, areas, nameplates, actions, and quests-source', () => {
    const ds = makeValidBaseline();
    ds.mapPois.pois.push({ id: 'p2', mapId: 'dam', layer: 'underground' });
    ds.mapAreas.unknown_map = [{ layer: 'surface' }];
    ds.mapNameplates.dam.push({ layer: 'bad-layer' });
    ds.quests.lists[0].levels[0].actions[0].maps.push('dam_battlegrounds');
    ds.questsSource.nodes[0].map = 'the_spaceport';

    const res = validateDataset(ds);
    expect(res.errors.filter((e) => e.rule === 'VAL-FK-008')).toHaveLength(5);
  });

  it('VAL-FK-009: detects invalid LevelRequirement bounds/listId and unknown pass reward track', () => {
    const ds = makeValidBaseline();
    ds.quests.lists[0].levels[0].requires = [
      { listId: 'weapon-bench', level: 99 },
      { listId: 'missing-list', level: 1 },
    ];
    ds.passes.lists[0].levels[0].rewards.push({ itemId: 'metal-parts', quantity: 1, track: 'vip' });

    const res = validateDataset(ds);
    expect(res.errors.filter((e) => e.rule === 'VAL-FK-009')).toHaveLength(3);
  });

  it('VAL-DAG-001: detects cycles and orphan prerequisites in quests, skills, and list requires', () => {
    const ds = makeValidBaseline();
    ds.quests.lists[0].prerequisites = ['second-quest']; // cycle first-quest <-> second-quest
    ds.skills.push({ id: 'cond_orphan', prerequisiteNodeIds: ['cond_missing'] });

    const res = validateDataset(ds);
    const dag = res.errors.filter((e) => e.rule === 'VAL-DAG-001');
    expect(dag.length).toBeGreaterThanOrEqual(2);
  });

  it('VAL-BP-001 & VAL-BP-002: detects missing/duplicate blueprint unlocks and non-Lvl-1 weapon unlocks', () => {
    const ds = makeValidBaseline();
    ds.items['empty-design'] = {
      id: 'empty-design',
      item_type: 'Design',
      rarity: 'Common',
      translations: { it: { name: 'Design' } },
    };
    ds.items['dup-bp'] = {
      id: 'dup-bp',
      item_type: 'Blueprint',
      rarity: 'Rare',
      unlocks_item_id: 'anvil-ii',
      translations: { it: { name: 'Dup' } },
    };
    ds.items['anvil-blueprint'].unlocks_item_id = 'anvil-ii';

    const res = validateDataset(ds);
    expect(res.warnings.filter((w) => w.rule === 'VAL-BP-001')).toHaveLength(2);
    expect(res.warnings.filter((w) => w.rule === 'VAL-BP-002')).toHaveLength(1);
  });

  it('VAL-VAR-001 & VAL-RES-001: detects variant item_type mismatch, missing Lvl 1, and research mismatch', () => {
    const ds = makeValidBaseline();
    ds.items['anvil-splitter'] = {
      id: 'anvil-splitter',
      item_type: 'Misc',
      rarity: 'Rare',
      translations: { it: { name: 'Splitter' } },
    };
    ds.itemVariants.baseItems.anvil.variantItemIds = ['anvil-ii', 'anvil-splitter'];
    ds.weaponAmplificationResearch.push({ id: 'sprint-shooting' });

    const res = validateDataset(ds);
    expect(res.warnings.filter((w) => w.rule === 'VAL-VAR-001')).toHaveLength(2);
    expect(res.warnings.filter((w) => w.rule === 'VAL-RES-001')).toHaveLength(1);
  });

  it('VAL-I18N-001: detects empty rarity, missing IT, custom review notes, conflicts, totalPois mismatch, and POI case mismatch', () => {
    const ds = makeValidBaseline();
    ds.items['metal-parts'].rarity = '';
    delete ds.items['metal-parts'].translations;
    ds.customItems['custom-1'] = { id: 'custom-1', review: ['check icon'] };
    ds.overridesConflicts = { conflicts: [{ id: 'c1' }] };
    ds.maps.maps[0].totalPois = 999;
    ds.mapPois.pois[0].title = 'a bad feeling'; // case mismatch vs 'A Bad Feeling'

    const res = validateDataset(ds);
    expect(res.warnings.filter((w) => w.rule === 'VAL-I18N-001')).toHaveLength(6);
  });

  it('formatValidationReport renders summary and rule sections', () => {
    const ds = makeValidBaseline();
    ds.items['metal-parts'].rarity = '';
    const res = validateDataset(ds);
    const report = formatValidationReport(res);
    expect(report).toContain('Errors: 0 | Warnings: 1');
    expect(report).toContain('[WARNING] VAL-I18N-001: 1 issue(s)');
  });
});
