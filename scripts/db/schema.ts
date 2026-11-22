/**
 * Drizzle ORM (PostgreSQL) schema contract for Scrappy's Nest (Era 3).
 * Aligned 1:1 with scripts/db/schema.sql, ADR 009 & docs/specs/schema-postgres-e-seed-era2.md.
 *
 * Ready to copy into the Next.js portal repository (requires `drizzle-orm`).
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ----------------------------------------------------------------------------
// Shared JSONB Type Contracts
// ----------------------------------------------------------------------------

export type LocalizedTextFields = Record<string, unknown>;

export type SymmetricTranslations<T = LocalizedTextFields> = {
  en: T;
  it: T;
  [locale: string]: T;
};

// ----------------------------------------------------------------------------
// 1. CATALOG TABLES (Managed exclusively by Seed / Admin)
// ----------------------------------------------------------------------------

// Level 0: No Foreign Keys
export const catalogMaps = pgTable('catalog_maps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  badge: text('badge'),
  hasMultiFloor: boolean('has_multi_floor').notNull().default(false),
  bounds: jsonb('bounds').$type<number[]>().notNull(),
  defaultZoom: smallint('default_zoom').notNull().default(2),
  minZoom: smallint('min_zoom').notNull().default(1),
  maxZoom: smallint('max_zoom').notNull().default(5),
  areas: jsonb('areas').$type<unknown[]>().notNull().default([]),
  nameplates: jsonb('nameplates').$type<unknown[]>().notNull().default([]),
});

export const catalogTraders = pgTable('catalog_traders', {
  id: text('id').primaryKey(),
  currency: text('currency').notNull(),
  resetType: text('reset_type').notNull(),
  translations: jsonb('translations').$type<SymmetricTranslations>().notNull(),
});

export const catalogSkills = pgTable('catalog_skills', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  isMajor: boolean('is_major').notNull().default(false),
  maxPoints: smallint('max_points').notNull().default(1),
  minPointsSpent: smallint('min_points_spent').notNull().default(0),
  posX: real('pos_x').notNull(),
  posY: real('pos_y').notNull(),
  iconPath: text('icon_path'),
  knownValues: jsonb('known_values').$type<unknown[]>().notNull().default([]),
  translations: jsonb('translations').$type<SymmetricTranslations>().notNull(),
});

export const catalogCodexEntries = pgTable('catalog_codex_entries', {
  page: text('page').primaryKey(),
  section: text('section').notNull(),
  categories: text('categories').array().notNull().default([]),
  source: text('source'),
  translations: jsonb('translations').$type<SymmetricTranslations>().notNull(),
});

export const catalogWeaponResearch = pgTable('catalog_weapon_research', {
  id: text('id').primaryKey(),
  xp: integer('xp').notNull().default(0),
  translations: jsonb('translations').$type<SymmetricTranslations>().notNull(),
});

// Level 1: Dependencies from Level 0 + Deferrable Self-FKs
export const catalogMapFloors = pgTable(
  'catalog_map_floors',
  {
    mapId: text('map_id')
      .notNull()
      .references(() => catalogMaps.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    layerKey: text('layer_key').notNull(),
    floorLevel: smallint('floor_level').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    translations: jsonb('translations').$type<SymmetricTranslations>().notNull().default({ en: {}, it: {} }),
  },
  (table) => [primaryKey({ columns: [table.mapId, table.id] })],
);

export const catalogMapPois = pgTable(
  'catalog_map_pois',
  {
    id: text('id').primaryKey(),
    mapId: text('map_id')
      .notNull()
      .references(() => catalogMaps.id, { onDelete: 'cascade' }),
    layer: text('layer').notNull(),
    floorLevel: smallint('floor_level').notNull().default(0),
    category: text('category').notNull(),
    title: text('title').notNull().default(''),
    description: text('description'),
    coordX: real('coord_x').notNull(),
    coordY: real('coord_y').notNull(),
    image: text('image'),
    isUgc: boolean('is_ugc').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    index('idx_catalog_map_pois_map_layer').on(table.mapId, table.layer),
    index('idx_catalog_map_pois_map_category').on(table.mapId, table.category),
  ],
);

export const catalogSkillEdges = pgTable(
  'catalog_skill_edges',
  {
    skillId: text('skill_id')
      .notNull()
      .references(() => catalogSkills.id, { onDelete: 'cascade' }),
    prerequisiteId: text('prerequisite_id')
      .notNull()
      .references(() => catalogSkills.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.skillId, table.prerequisiteId] })],
);

export const catalogItems = pgTable('catalog_items', {
  id: text('id').primaryKey(),
  baseItemId: text('base_item_id').references((): AnyPgColumn => catalogItems.id),
  isVirtualBase: boolean('is_virtual_base').notNull().default(false),
  itemType: text('item_type').notNull(),
  subcategory: text('subcategory'),
  rarity: text('rarity').notNull().default(''),
  value: integer('value'),
  stackSize: integer('stack_size'),
  lootArea: text('loot_area'),
  iconPath: text('icon_path'),
  iconFromItemId: text('icon_from_item_id').references((): AnyPgColumn => catalogItems.id),
  unlocksItemId: text('unlocks_item_id').references((): AnyPgColumn => catalogItems.id),
  craftWorkbenchId: text('craft_workbench_id'),
  craftLevelRequired: smallint('craft_level_required'),
  craftRecipeId: text('craft_recipe_id').references((): AnyPgColumn => catalogItems.id),
  isDeprecated: boolean('is_deprecated').notNull().default(false),
  isHidden: boolean('is_hidden').notNull().default(false),
  upstreamIds: jsonb('upstream_ids').$type<Record<string, string[]>>().notNull().default({}),
  translations: jsonb('translations').$type<SymmetricTranslations>().notNull(),
});

// Level 2: Dependencies from catalog_items
export const catalogItemRecipes = pgTable('catalog_item_recipes', {
  itemId: text('item_id')
    .primaryKey()
    .references(() => catalogItems.id, { onDelete: 'cascade' }),
  blueprintRequired: boolean('blueprint_required').notNull().default(false),
  craftQuantity: smallint('craft_quantity').notNull().default(1),
  benches: jsonb('benches').$type<Record<string, unknown> | null>(),
  ingredients: jsonb('ingredients').$type<Record<string, number> | null>(),
  upgradeInfo: jsonb('upgrade_info').$type<Record<string, unknown> | null>(),
  repairInfo: jsonb('repair_info').$type<Record<string, unknown> | null>(),
  recyclingInfo: jsonb('recycling_info').$type<Record<string, unknown> | null>(),
});

export const catalogItemSalvageSources = pgTable(
  'catalog_item_salvage_sources',
  {
    sourceItemId: text('source_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    targetItemId: text('target_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    recycleYield: integer('recycle_yield').notNull().default(0),
    salvageYield: integer('salvage_yield').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.sourceItemId, table.targetItemId] })],
);

export const catalogTraderOffers = pgTable(
  'catalog_trader_offers',
  {
    traderId: text('trader_id')
      .notNull()
      .references(() => catalogTraders.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    price: integer('price').notNull(),
    dailyLimit: smallint('daily_limit'),
  },
  (table) => [primaryKey({ columns: [table.traderId, table.itemId] })],
);

// Level 3: Lists & Quest Graph
export const catalogLists = pgTable('catalog_lists', {
  id: text('id').primaryKey(),
  listType: text('list_type').notNull(),
  maxLevel: smallint('max_level').notNull().default(1),
  extractionWiped: boolean('extraction_wiped').notNull().default(false),
  expeditionIndex: smallint('expedition_index'),
  traderId: text('trader_id').references(() => catalogTraders.id, { onDelete: 'set null' }),
  premiumCostTokens: integer('premium_cost_tokens'),
  isActive: boolean('is_active').notNull().default(true),
  isDeprecated: boolean('is_deprecated').notNull().default(false),
  startDate: timestamp('start_date', { withTimezone: true }),
  expirationDate: timestamp('expiration_date', { withTimezone: true }),
  tracks: jsonb('tracks').$type<unknown[] | null>(),
  damageChallenge: jsonb('damage_challenge').$type<Record<string, unknown> | null>(),
  canvasPosition: jsonb('canvas_position').$type<Record<string, unknown> | null>(),
  xpReward: integer('xp_reward'),
  translations: jsonb('translations').$type<SymmetricTranslations>().notNull(),
});

export const catalogListPrerequisites = pgTable(
  'catalog_list_prerequisites',
  {
    listId: text('list_id')
      .notNull()
      .references(() => catalogLists.id, { onDelete: 'cascade' }),
    prerequisiteListId: text('prerequisite_list_id')
      .notNull()
      .references(() => catalogLists.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.listId, table.prerequisiteListId] })],
);

// Level 4: List Levels Details
export const catalogListLevels = pgTable(
  'catalog_list_levels',
  {
    listId: text('list_id')
      .notNull()
      .references(() => catalogLists.id, { onDelete: 'cascade' }),
    level: smallint('level').notNull(),
    requiresListLevels: jsonb('requires_list_levels').$type<unknown[] | null>(),
    actions: jsonb('actions').$type<unknown[] | null>(),
    tieredActions: jsonb('tiered_actions').$type<unknown[] | null>(),
  },
  (table) => [primaryKey({ columns: [table.listId, table.level] })],
);

export const catalogListLevelRequirements = pgTable(
  'catalog_list_level_requirements',
  {
    listId: text('list_id').notNull(),
    level: smallint('level').notNull(),
    itemId: text('item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    rewards: jsonb('rewards').$type<unknown[] | null>(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.level, table.itemId] }),
    foreignKey({
      columns: [table.listId, table.level],
      foreignColumns: [catalogListLevels.listId, catalogListLevels.level],
    }).onDelete('cascade'),
  ],
);

export const catalogListLevelRewards = pgTable(
  'catalog_list_level_rewards',
  {
    id: serial('id').primaryKey(),
    listId: text('list_id').notNull(),
    level: smallint('level').notNull(),
    trackId: text('track_id'),
    itemId: text('item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.listId, table.level],
      foreignColumns: [catalogListLevels.listId, catalogListLevels.level],
    }).onDelete('cascade'),
  ],
);

// ----------------------------------------------------------------------------
// 2. USER TABLES (Read/Write App, protected by ON DELETE RESTRICT on catalog)
// ----------------------------------------------------------------------------

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  isMain: boolean('is_main').notNull().default(false),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  expeditionState: jsonb('expedition_state').$type<Record<string, unknown>>().notNull().default({}),
  skillAllocations: jsonb('skill_allocations').$type<Record<string, number>>().notNull().default({}),
  activeRewardPassId: text('active_reward_pass_id').references(() => catalogLists.id, {
    onDelete: 'set null',
  }),
  completedRewardPasses: jsonb('completed_reward_passes').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userStashItems = pgTable(
  'user_stash_items',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.itemId] }),
    check('chk_user_stash_items_quantity_non_negative', sql`${table.quantity} >= 0`),
  ],
);

export const userCollections = pgTable(
  'user_collections',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    collectionType: text('collection_type').notNull(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.itemId] })],
);

export const userListProgress = pgTable(
  'user_list_progress',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    listId: text('list_id')
      .notNull()
      .references(() => catalogLists.id, { onDelete: 'restrict' }),
    currentLevel: smallint('current_level').notNull().default(0),
    targetLevels: jsonb('target_levels').$type<number[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    checkedActions: jsonb('checked_actions').$type<Record<string, boolean>>().notNull().default({}),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.listId] })],
);

export const userCustomLists = pgTable('user_custom_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  profileId: uuid('profile_id').references(() => userProfiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  levels: jsonb('levels').$type<unknown[]>().notNull().default([]),
  currentLevel: smallint('current_level').notNull().default(0),
  targetLevels: jsonb('target_levels').$type<number[]>().notNull().default([]),
  isShared: boolean('is_shared').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userRaidPlans = pgTable('user_raid_plans', {
  profileId: uuid('profile_id')
    .primaryKey()
    .references(() => userProfiles.id, { onDelete: 'cascade' }),
  isRunning: boolean('is_running').notNull().default(false),
  items: jsonb('items').$type<unknown[]>().notNull().default([]),
  actions: jsonb('actions').$type<unknown[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
