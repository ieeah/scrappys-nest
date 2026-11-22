import { describe, expect, it } from 'vitest';
import {
  buildUpstreamIdsMap,
  generateSeedSql,
  normalizeSymmetricTranslations,
  sqlJsonb,
  sqlText,
} from './seed-generator.mjs';

function makeMinimalValidDataset() {
  return {
    maps: {
      bounds: [0, 0, 4096, 4096],
      defaultZoom: 2,
      minZoom: 1,
      maxZoom: 5,
      maps: [
        {
          id: 'dam',
          name: 'Dam Battlegrounds',
          badge: 'Swamp',
          hasMultiFloor: false,
          floors: [{ id: 'dam', name: 'Superficie', floorLevel: 0, layerKey: 'dam', isDefault: true }],
        },
      ],
    },
    mapPois: {
      pois: [
        {
          id: 'poi-1',
          mapId: 'dam',
          layer: 'dam',
          floorLevel: 0,
          category: 'loot',
          title: "Raider's Cache",
          coordinate: [100.5, 200.5],
        },
      ],
    },
    traders: {
      traders: [
        {
          id: 'celeste',
          name: 'Celeste',
          currency: 'seeds',
          resetType: 'daily',
          role: { en: 'Leader', it: 'Leader' },
          description: { en: 'Provides materials', it: 'Fornisce materiali' },
        },
      ],
      items: [{ id: 'metal-parts', trader: 'celeste', price: 100, dailyLimit: 5 }],
    },
    skills: [
      {
        id: 'cond_1',
        name: { en: 'Used To Weight', it: 'Abitudine al peso' },
        category: 'CONDITIONING',
        isMajor: true,
        maxPoints: 1,
        minPointsSpent: 0,
        position: { x: 10, y: 20 },
        prerequisiteNodeIds: [],
        description: { en: 'Desc EN', it: 'Desc IT' },
        impactedSkill: { en: 'Speed', it: 'Velocita' },
      },
      {
        id: 'cond_2',
        name: { en: 'Tier 2', it: 'Livello 2' },
        category: 'CONDITIONING',
        isMajor: false,
        maxPoints: 3,
        minPointsSpent: 1,
        position: { x: 20, y: 30 },
        prerequisiteNodeIds: ['cond_1'],
        description: { en: 'Desc 2 EN', it: 'Desc 2 IT' },
        impactedSkill: { en: 'Stamina', it: 'Resistenza' },
      },
    ],
    codex: {
      sections: {
        History: [
          {
            page: 'The Collapse (lore)',
            label: { en: 'The Collapse', it: 'Il Crollo' },
            subtitle: { en: 'Sub EN', it: 'Sub IT' },
            text: { en: 'Body EN', it: 'Body IT' },
            source: 'wiki',
            categories: ['Lore'],
          },
        ],
      },
    },
    weaponAmplificationResearch: [
      {
        id: 'action-economy',
        name: 'Action Economy',
        translations: { it: { name: 'Economia delle azioni' } },
        xp: 0,
        objectives: [{ en: 'Deal 1000 damage', it: 'Infliggi 1000 danni' }],
      },
    ],
    items: {
      'metal-parts': {
        id: 'metal-parts',
        name: 'Metal Parts',
        description: "Basic \"metal\" \\ parts with 'quotes'",
        item_type: 'Basic Material',
        rarity: 'Common',
        translations: { it: { name: 'Parti metalliche' } },
      },
      'anvil-i': {
        id: 'anvil-i',
        name: 'Anvil I',
        item_type: 'Weapon',
        rarity: 'Rare',
      },
      canto: {
        id: 'canto',
        name: 'Canto',
        item_type: 'Weapon',
        rarity: 'Rare',
      },
      'canto-ii': {
        id: 'canto-ii',
        name: 'Canto II',
        item_type: 'Weapon',
        rarity: 'Rare',
      },
    },
    itemVariants: {
      baseItems: {
        anvil: {
          id: 'anvil',
          name: 'Anvil',
          item_type: 'Weapon',
          rarity: 'Rare',
          variantItemIds: ['anvil-i'],
          translations: { it: { name: 'Incudine' } },
        },
        canto: {
          id: 'canto',
          name: 'Canto',
          item_type: 'Weapon',
          rarity: 'Rare',
          variantItemIds: ['canto', 'canto-ii'],
        },
      },
    },
    recipes: {
      recipes: {
        'anvil-i': {
          itemId: 'anvil-i',
          crafting: {
            benches: { 'gun-bench': { levelRequired: 1 } },
            blueprintRequired: false,
            craftQuantity: 1,
            ingredients: { 'metal-parts': 4 },
          },
          recycling: {
            recyclesInto: { 'metal-parts': 2 },
            salvagesInto: { 'metal-parts': 1 },
          },
        },
      },
    },
    workbenches: {
      items: [
        {
          id: 'gun-bench',
          name: 'Gunsmith',
          listType: 'workbench',
          maxLevel: 1,
          extractionWiped: false,
          translations: { it: { name: 'Armaiolo' } },
          levels: [
            {
              level: 1,
              requirementItemIds: [{ itemId: 'metal-parts', quantity: 10 }],
              rewards: [{ itemId: 'anvil-i', quantity: 1 }],
            },
          ],
        },
      ],
    },
    quests: {
      lists: [
        {
          id: 'quest-one',
          name: 'Quest One',
          listType: 'quest',
          maxLevel: 1,
          extractionWiped: false,
          trader: 'celeste',
          prerequisites: [],
          levels: [{ level: 1, requirementItemIds: [] }],
        },
        {
          id: 'quest-two',
          name: 'Quest Two',
          listType: 'quest',
          maxLevel: 1,
          extractionWiped: false,
          trader: 'celeste',
          prerequisites: ['quest-one'],
          levels: [{ level: 1, requirementItemIds: [] }],
        },
      ],
    },
  };
}

describe('seed-generator', () => {
  it('blocks generation when validateDataset reports errors', () => {
    const broken = makeMinimalValidDataset();
    broken.workbenches.items[0].levels[0].requirementItemIds[0].itemId = 'non-existent-item';

    expect(() => generateSeedSql(broken)).toThrow(/Dataset validation failed/);
  });

  it('emits idempotent transaction in topological order L0 -> L4', () => {
    const dataset = makeMinimalValidDataset();
    const { sql, stats } = generateSeedSql(dataset);

    expect(sql).toMatch(/^-- =+/);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');

    const order = [
      'INSERT INTO catalog_maps',
      'INSERT INTO catalog_traders',
      'INSERT INTO catalog_skills',
      'INSERT INTO catalog_codex_entries',
      'INSERT INTO catalog_weapon_research',
      'INSERT INTO catalog_map_floors',
      'INSERT INTO catalog_map_pois',
      'INSERT INTO catalog_skill_edges',
      'INSERT INTO catalog_items',
      'INSERT INTO catalog_item_recipes',
      'INSERT INTO catalog_item_salvage_sources',
      'INSERT INTO catalog_trader_offers',
      'INSERT INTO catalog_lists',
      'INSERT INTO catalog_list_prerequisites',
      'INSERT INTO catalog_list_levels',
      'INSERT INTO catalog_list_level_requirements',
      'INSERT INTO catalog_list_level_rewards',
    ];

    let prevIndex = -1;
    for (const marker of order) {
      const idx = sql.indexOf(marker);
      expect(idx, `Missing ${marker}`).toBeGreaterThan(prevIndex);
      prevIndex = idx;
    }

    expect(stats.items).toBe(5); // 4 real + 1 virtual base (anvil)
    expect(stats.mapPois).toBe(1);
  });

  it('uses soft-deprecation and never emits DELETE on catalog_items or catalog_lists', () => {
    const dataset = makeMinimalValidDataset();
    const { sql } = generateSeedSql(dataset);

    expect(sql).toContain('UPDATE catalog_items SET is_deprecated = true WHERE id NOT IN');
    expect(sql).toContain('UPDATE catalog_lists SET is_deprecated = true WHERE id NOT IN');
    expect(sql).not.toContain('DELETE FROM catalog_items');
    expect(sql).not.toContain('DELETE FROM catalog_lists ');
  });

  it('includes virtual base items with is_virtual_base = true and links variants via base_item_id', () => {
    const dataset = makeMinimalValidDataset();
    const { sql } = generateSeedSql(dataset);

    // Virtual base 'anvil' has is_virtual_base = true and base_item_id = NULL
    expect(sql).toMatch(/\('anvil', NULL, true,/);
    // Variant 'anvil-i' has base_item_id = 'anvil' and is_virtual_base = false
    expect(sql).toMatch(/\('anvil-i', 'anvil', false,/);
    // Real base 'canto' has base_item_id = NULL and is_virtual_base = false
    expect(sql).toMatch(/\('canto', NULL, false,/);
    // Variant 'canto-ii' has base_item_id = 'canto'
    expect(sql).toMatch(/\('canto-ii', 'canto', false,/);
  });

  it('normalizes translations into symmetric { en, it } format across all patterns', () => {
    const dataset = makeMinimalValidDataset();
    expect(normalizeSymmetricTranslations(dataset.items['metal-parts'], 'item')).toEqual({
      en: { name: 'Metal Parts', description: 'Basic "metal" \\ parts with \'quotes\'' },
      it: { name: 'Parti metalliche' },
    });

    expect(normalizeSymmetricTranslations(dataset.traders.traders[0], 'trader')).toEqual({
      en: { name: 'Celeste', role: 'Leader', description: 'Provides materials' },
      it: { name: 'Celeste', role: 'Leader', description: 'Fornisce materiali' },
    });

    expect(normalizeSymmetricTranslations(dataset.skills[0], 'skill')).toEqual({
      en: { name: 'Used To Weight', description: 'Desc EN', impactedSkill: 'Speed' },
      it: { name: 'Abitudine al peso', description: 'Desc IT', impactedSkill: 'Velocita' },
    });

    expect(normalizeSymmetricTranslations(dataset.codex.sections.History[0], 'codex')).toEqual({
      en: { label: 'The Collapse', subtitle: 'Sub EN', text: 'Body EN' },
      it: { label: 'Il Crollo', subtitle: 'Sub IT', text: 'Body IT' },
    });

    expect(normalizeSymmetricTranslations(dataset.weaponAmplificationResearch[0], 'research')).toEqual({
      en: { name: 'Action Economy', objectives: ['Deal 1000 damage'] },
      it: { name: 'Economia delle azioni', objectives: ['Infliggi 1000 danni'] },
    });
  });

  it('populates upstream_ids from upstream-aliases.json', () => {
    const aliases = {
      recipes: { 'old-metal': 'metal-parts', 'other-metal': 'metal-parts' },
      quests: { 'burltetta-anvil': 'anvil-i' },
    };
    const map = buildUpstreamIdsMap(aliases);
    expect(map.get('metal-parts')).toEqual({ recipes: ['old-metal', 'other-metal'] });
    expect(map.get('anvil-i')).toEqual({ quests: ['burltetta-anvil'] });

    const dataset = makeMinimalValidDataset();
    const { sql } = generateSeedSql(dataset, { aliases });
    expect(sql).toContain('{"recipes":["old-metal","other-metal"]}');
    expect(sql).toContain('{"quests":["burltetta-anvil"]}');
  });

  it('safely escapes single quotes, backslashes, and dollar-quote collisions', () => {
    expect(sqlText("Raider's Cache")).toBe("'Raider''s Cache'");
    expect(sqlText(null)).toBe('NULL');

    const tricky = { text: "a'b\\c $json$ marker" };
    const encoded = sqlJsonb(tricky);
    expect(encoded).toMatch(/^\$json_1\$.*\$json_1\$::jsonb$/);
    expect(encoded).toContain("a'b\\\\c $json$ marker");
  });

  it('omits catalog_map_pois when includePois is false', () => {
    const dataset = makeMinimalValidDataset();
    const { sql, stats } = generateSeedSql(dataset, { includePois: false });
    expect(sql).not.toContain('INSERT INTO catalog_map_pois');
    expect(stats.mapPois).toBe(0);
  });
});
