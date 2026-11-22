-- ============================================================================
-- Scrappy's Nest (ARC Raiders Companion) — Postgres Schema (Era 2 -> Era 3)
-- Aligned with ADR 009, ADR 010 & docs/specs/schema-postgres-e-seed-era2.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CATALOG TABLES (Managed exclusively by Seed / Admin)
-- ----------------------------------------------------------------------------

-- Level 0: No Foreign Keys
CREATE TABLE IF NOT EXISTS catalog_maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  badge TEXT,
  has_multi_floor BOOLEAN NOT NULL DEFAULT false,
  bounds JSONB NOT NULL,
  default_zoom SMALLINT NOT NULL DEFAULT 2,
  min_zoom SMALLINT NOT NULL DEFAULT 1,
  max_zoom SMALLINT NOT NULL DEFAULT 5,
  areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  nameplates JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS catalog_traders (
  id TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  reset_type TEXT NOT NULL,
  translations JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_skills (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  is_major BOOLEAN NOT NULL DEFAULT false,
  max_points SMALLINT NOT NULL DEFAULT 1,
  min_points_spent SMALLINT NOT NULL DEFAULT 0,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL,
  icon_path TEXT,
  known_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  translations JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_codex_entries (
  page TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}'::text[],
  source TEXT,
  translations JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_weapon_research (
  id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  translations JSONB NOT NULL
);

-- Level 1: Dependencies from Level 0 + Deferrable Self-FKs
CREATE TABLE IF NOT EXISTS catalog_map_floors (
  map_id TEXT NOT NULL REFERENCES catalog_maps(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  layer_key TEXT NOT NULL,
  floor_level SMALLINT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (map_id, id)
);

CREATE TABLE IF NOT EXISTS catalog_map_pois (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES catalog_maps(id) ON DELETE CASCADE,
  layer TEXT NOT NULL,
  floor_level SMALLINT NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  coord_x REAL NOT NULL,
  coord_y REAL NOT NULL,
  image TEXT,
  is_ugc BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_catalog_map_pois_map_layer
  ON catalog_map_pois (map_id, layer);

CREATE INDEX IF NOT EXISTS idx_catalog_map_pois_map_category
  ON catalog_map_pois (map_id, category);

CREATE TABLE IF NOT EXISTS catalog_skill_edges (
  skill_id TEXT NOT NULL REFERENCES catalog_skills(id) ON DELETE CASCADE,
  prerequisite_id TEXT NOT NULL REFERENCES catalog_skills(id) ON DELETE CASCADE,
  PRIMARY KEY (skill_id, prerequisite_id)
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  base_item_id TEXT REFERENCES catalog_items(id) DEFERRABLE INITIALLY DEFERRED,
  is_virtual_base BOOLEAN NOT NULL DEFAULT false,
  item_type TEXT NOT NULL,
  subcategory TEXT,
  rarity TEXT NOT NULL DEFAULT '',
  value INTEGER,
  stack_size INTEGER,
  loot_area TEXT,
  icon_path TEXT,
  icon_from_item_id TEXT REFERENCES catalog_items(id) DEFERRABLE INITIALLY DEFERRED,
  unlocks_item_id TEXT REFERENCES catalog_items(id) DEFERRABLE INITIALLY DEFERRED,
  craft_workbench_id TEXT,
  craft_level_required SMALLINT,
  craft_recipe_id TEXT REFERENCES catalog_items(id) DEFERRABLE INITIALLY DEFERRED,
  is_deprecated BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  upstream_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  translations JSONB NOT NULL
);

-- Level 2: Dependencies from catalog_items
CREATE TABLE IF NOT EXISTS catalog_item_recipes (
  item_id TEXT PRIMARY KEY REFERENCES catalog_items(id) ON DELETE CASCADE,
  blueprint_required BOOLEAN NOT NULL DEFAULT false,
  craft_quantity SMALLINT NOT NULL DEFAULT 1,
  benches JSONB,
  ingredients JSONB,
  upgrade_info JSONB,
  repair_info JSONB,
  recycling_info JSONB
);

CREATE TABLE IF NOT EXISTS catalog_item_salvage_sources (
  source_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  target_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  recycle_yield INTEGER NOT NULL DEFAULT 0,
  salvage_yield INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_item_id, target_item_id)
);

CREATE TABLE IF NOT EXISTS catalog_trader_offers (
  trader_id TEXT NOT NULL REFERENCES catalog_traders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  price INTEGER NOT NULL,
  daily_limit SMALLINT,
  PRIMARY KEY (trader_id, item_id)
);

-- Level 3: Lists & Quest Graph
CREATE TABLE IF NOT EXISTS catalog_lists (
  id TEXT PRIMARY KEY,
  list_type TEXT NOT NULL,
  max_level SMALLINT NOT NULL DEFAULT 1,
  extraction_wiped BOOLEAN NOT NULL DEFAULT false,
  expedition_index SMALLINT,
  trader_id TEXT REFERENCES catalog_traders(id) ON DELETE SET NULL,
  premium_cost_tokens INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deprecated BOOLEAN NOT NULL DEFAULT false,
  start_date TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  tracks JSONB,
  damage_challenge JSONB,
  canvas_position JSONB,
  xp_reward INTEGER,
  translations JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_list_prerequisites (
  list_id TEXT NOT NULL REFERENCES catalog_lists(id) ON DELETE CASCADE,
  prerequisite_list_id TEXT NOT NULL REFERENCES catalog_lists(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, prerequisite_list_id)
);

-- Level 4: List Levels Details
CREATE TABLE IF NOT EXISTS catalog_list_levels (
  list_id TEXT NOT NULL REFERENCES catalog_lists(id) ON DELETE CASCADE,
  level SMALLINT NOT NULL,
  requires_list_levels JSONB,
  actions JSONB,
  tiered_actions JSONB,
  PRIMARY KEY (list_id, level)
);

CREATE TABLE IF NOT EXISTS catalog_list_level_requirements (
  list_id TEXT NOT NULL,
  level SMALLINT NOT NULL,
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  rewards JSONB,
  PRIMARY KEY (list_id, level, item_id),
  FOREIGN KEY (list_id, level) REFERENCES catalog_list_levels(list_id, level) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_list_level_rewards (
  id SERIAL PRIMARY KEY,
  list_id TEXT NOT NULL,
  level SMALLINT NOT NULL,
  track_id TEXT,
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  FOREIGN KEY (list_id, level) REFERENCES catalog_list_levels(list_id, level) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 2. USER TABLES (Read/Write App, protected by ON DELETE RESTRICT on catalog)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_main BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  expedition_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  skill_allocations JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_reward_pass_id TEXT REFERENCES catalog_lists(id) ON DELETE SET NULL,
  completed_reward_passes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_stash_items (
  profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (profile_id, item_id)
);

CREATE TABLE IF NOT EXISTS user_collections (
  profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  collection_type TEXT NOT NULL,
  PRIMARY KEY (profile_id, item_id)
);

CREATE TABLE IF NOT EXISTS user_list_progress (
  profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES catalog_lists(id) ON DELETE RESTRICT,
  current_level SMALLINT NOT NULL DEFAULT 0,
  target_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  checked_actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (profile_id, list_id)
);

CREATE TABLE IF NOT EXISTS user_custom_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_level SMALLINT NOT NULL DEFAULT 0,
  target_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_raid_plans (
  profile_id UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  is_running BOOLEAN NOT NULL DEFAULT false,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
