# Specifica Tecnica Era 2 → Era 3: Validazione, Schema Postgres & Seed Idempotente

Documento di riferimento operativo per la fase **Tooling & Seed (Era 2)** e la stesura dello **Schema Relazionale (Era 3)** nel nuovo repository Next.js. Consolida le decisioni formalizzate in [ADR 009](../adrs/009-schema-catalogo-postgres-e-seed-idempotente.md) e [ADR 010](../adrs/010-pipeline-dati-validazione-e-tracciabilita-upstream.md).

---

## 1. Architettura Relazionale Postgres (Separazione Catalogo vs Utente)

### 1.1 Tabelle Catalogo / Gioco (`catalog_*` — Gestite esclusivamente dal Seed / Admin)

| Tabella | Chiave Primaria | Campi Chiave & Vincoli | Note |
| :--- | :--- | :--- | :--- |
| `catalog_items` | `id TEXT PK` | `base_item_id TEXT FK -> catalog_items(id)`, `is_virtual_base BOOL`, `item_type TEXT`, `subcategory TEXT`, `rarity TEXT`, `value INT`, `stack_size INT`, `loot_area TEXT`, `icon_path TEXT`, `icon_from_item_id TEXT FK`, `unlocks_item_id TEXT FK`, `craft_workbench_id TEXT`, `craft_level_required SMALLINT`, `craft_recipe_id TEXT FK`, `is_deprecated BOOL`, `is_hidden BOOL`, `upstream_ids JSONB`, `translations JSONB` | Contiene sia i 1.567 oggetti reali sia i 22 Base Item virtuali (`is_virtual_base = true`). Le 5 risorse virtuali usano `item_type = 'Currency'` e `subcategory` (`Purchase` / `Progression`). `assorted-seeds` resta `Nature`. |
| `catalog_item_recipes` | `item_id TEXT PK FK -> catalog_items(id)` | `blueprint_required BOOL`, `craft_quantity SMALLINT`, `benches JSONB`, `ingredients JSONB`, `upgrade_info JSONB`, `repair_info JSONB`, `recycling_info JSONB` | Affiancata dalla tabella indice inverso `catalog_item_salvage_sources (source_item_id, target_item_id, recycle_yield, salvage_yield)`. |
| `catalog_weapon_research` | `id TEXT PK` | `xp INT`, `translations JSONB` (nome e `objectives[]` EN/IT) | Contiene le 15 ricerche della Research Station (non presenti in `catalog_items`). |
| `catalog_traders` | `id TEXT PK` | `currency TEXT`, `reset_type TEXT`, `translations JSONB` | 6 mercanti (`celeste`, `apollo`, `lance`, `shani`, `tian-wen`, `nomadic-envoy`). |
| `catalog_trader_offers` | `PK (trader_id, item_id)` | `trader_id FK -> catalog_traders`, `item_id FK -> catalog_items`, `price INT`, `daily_limit SMALLINT` | 108 offerte giornaliere/settimanali. |
| `catalog_skills` | `id TEXT PK` | `category TEXT`, `is_major BOOL`, `max_points SMALLINT`, `min_points_spent SMALLINT`, `pos_x REAL`, `pos_y REAL`, `icon_path TEXT`, `known_values JSONB`, `translations JSONB` | 48 nodi; usare sempre `category` (mai il prefisso dell'ID `snake_case`). |
| `catalog_skill_edges` | `PK (skill_id, prerequisite_id)` | `skill_id FK -> catalog_skills`, `prerequisite_id FK -> catalog_skills` | Grafo prerequisiti Skill Tree (DAG). |
| `catalog_lists` | `id TEXT PK` | `list_type TEXT`, `max_level SMALLINT`, `extraction_wiped BOOL`, `expedition_index SMALLINT`, `trader_id FK -> catalog_traders`, `premium_cost_tokens INT`, `is_active BOOL`, `is_deprecated BOOL`, `start_date TIMESTAMPTZ`, `expiration_date TIMESTAMPTZ`, `tracks JSONB`, `damage_challenge JSONB`, `canvas_position JSONB`, `xp_reward INT`, `translations JSONB` | Unifica `workbench`, `project`, `expedition`, `quest`, `pass` (147 liste totali). |
| `catalog_list_prerequisites` | `PK (list_id, prerequisite_list_id)` | `list_id FK -> catalog_lists`, `prerequisite_list_id FK -> catalog_lists` | 134 archi prerequisiti delle quest. |
| `catalog_list_levels` | `PK (list_id, level)` | `list_id FK -> catalog_lists`, `level SMALLINT`, `requires_list_levels JSONB`, `actions JSONB`, `tiered_actions JSONB` | 340 livelli totali. |
| `catalog_list_level_requirements` | `PK (list_id, level, item_id)` | `(list_id, level) FK -> catalog_list_levels`, `item_id FK -> catalog_items`, `quantity INT`, `rewards JSONB` | Materiali richiesti per livello. |
| `catalog_list_level_rewards` | `id SERIAL PK` | `(list_id, level) FK -> catalog_list_levels`, `track_id TEXT`, `item_id FK -> catalog_items`, `quantity INT` | Ricompense di livello e di traccia Reward Pass. |
| `catalog_codex_entries` | `page TEXT PK` | `section TEXT`, `categories TEXT[]`, `source TEXT`, `translations JSONB` | 88 voci lore/bestiario ARC. |
| `catalog_maps` | `id TEXT PK` | `name TEXT`, `badge TEXT`, `has_multi_floor BOOL`, `bounds JSONB`, `default_zoom SMALLINT`, `min_zoom SMALLINT`, `max_zoom SMALLINT`, `areas JSONB`, `nameplates JSONB` | 7 mappe. Nessun campo ridondante `totalPois`. |
| `catalog_map_floors` | `PK (map_id, id)` | `map_id FK -> catalog_maps`, `layer_key TEXT`, `floor_level SMALLINT`, `is_default BOOL`, `translations JSONB` | 10 piani. |
| `catalog_map_pois` | `id TEXT PK` | `map_id FK -> catalog_maps`, `layer TEXT`, `floor_level SMALLINT`, `category TEXT`, `title TEXT`, `description TEXT`, `coord_x REAL`, `coord_y REAL`, `image TEXT`, `is_ugc BOOL`, `is_active BOOL` | Caricata previa pre-scrematura; servita dietro Cache Edge con invalidazione su edit Admin/UGC. |

### 1.2 Tabelle Utente / Profilo (`user_*` — Read/Write App, protette da `ON DELETE RESTRICT`)

* `users` & sessioni Auth (`Better-Auth` / `Supabase Auth`).
* `user_profiles` (`id UUID PK`, `user_id UUID FK`, `name`, `is_main`, `settings JSONB`, `expedition_state JSONB`, `skill_allocations JSONB`, `active_reward_pass_id TEXT FK -> catalog_lists(id) ON DELETE SET NULL`, `completed_reward_passes JSONB`).
* `user_stash_items` (`PK (profile_id, item_id)`, `item_id FK -> catalog_items(id) ON DELETE RESTRICT`, `quantity INT CHECK (quantity >= 0)`).
* `user_collections` (`PK (profile_id, item_id)`, `item_id FK -> catalog_items(id) ON DELETE RESTRICT`, `collection_type`).
* `user_list_progress` (`PK (profile_id, list_id)`, `list_id FK -> catalog_lists(id) ON DELETE RESTRICT`, `current_level`, `target_levels`, `is_active`, `checked_actions JSONB`).
* `user_custom_lists` (`id UUID PK`, `user_id`, `profile_id` nullable se `is_shared = true`, `name`, `levels JSONB`, `current_level`, `target_levels`).
* `user_raid_plans` (`profile_id UUID PK FK`, `is_running`, `items JSONB`, `actions JSONB`, `updated_at`).

---

## 2. Ordine Topologico del Seed SQL (Singola Transazione `BEGIN ... COMMIT`)

1. **Livello 0 (0 FK)**: `catalog_maps` → `catalog_traders` → `catalog_skills` → `catalog_codex_entries` → `catalog_weapon_research`.
2. **Livello 1 (Dipendenze da L0 + Self-FK deferrable)**: `catalog_map_floors` → `catalog_map_pois` → `catalog_skill_edges` → `catalog_items` (con vincoli self-FK `DEFERRABLE INITIALLY DEFERRED` oppure in 2 passaggi `INSERT` + `UPDATE`).
3. **Livello 2 (Dipendenze da `catalog_items`)**: `catalog_item_recipes` + `catalog_item_salvage_sources` → `catalog_trader_offers`.
4. **Livello 3 (Liste e Grafo Quest)**: `catalog_lists` → `catalog_list_prerequisites`.
5. **Livello 4 (Dettaglio Livelli)**: `catalog_list_levels` → `catalog_list_level_requirements` → `catalog_list_level_rewards`.

### Strategia `UPSERT` Idempotente
* Entità principali (`catalog_items`, `catalog_lists`, `catalog_traders`, `catalog_skills`, `catalog_maps`, `catalog_codex_entries`, `catalog_weapon_research`): `INSERT ... ON CONFLICT (id) DO UPDATE SET ...`.
* Gli ID assenti dal nuovo seed vengono marcati `UPDATE ... SET is_deprecated = true` (mai `DELETE`).
* Tabelle figlie puramente descrittive (`catalog_trader_offers`, `catalog_list_level_requirements`, `catalog_list_level_rewards`, `catalog_skill_edges`): `UPSERT` + pulizia mirata delle righe figlie rimosse dal gioco all'interno della stessa transazione.

---

## 3. Regole del Validatore (`scripts/validate-dataset.mjs`)

* **11 Regole Bloccanti (`ERROR`, Exit Code `1`)**:
  * `VAL-ID-001`: ID non vuoto, univoco, chiave `=== id`, formato `hyphen-case` (`snake_case` ammesso solo su `skills.id`).
  * `VAL-FK-001..009`: integrità referenziale completa su liste, commercianti, quest, ricette (ingredienti, stazioni, skill, ricerche), self-FK `items.json` (con divieto assoluto di self-loop), `item-variants.json` (nessuna variante duplicata su più gruppi), mappe/piani/layer e `LevelRequirement` / `PassTrack`.
  * `VAL-DAG-001`: verifica aciclicità (DFS 3-stati) e assenza di prerequisiti orfani in `quests.json`, `skills.json` e `requires` tra liste.
* **5 Regole Non-Bloccanti (`WARNING`, Exit Code `0`, promuovibili con `--strict`)**:
  * `VAL-BP-001`: copertura e univocità `unlocks_item_id` su Blueprint e Design (salvo allowlist esplicita, es. `purification-system-blueprint`).
  * `VAL-BP-002`: i Blueprint d'arma con varianti devono puntare alla variante Lvl 1.
  * `VAL-VAR-001`: omogeneità `item_type` tra Base Item e varianti in `item-variants.json`.
  * `VAL-RES-001`: allineamento delle 15 ricerche su `v0.6.9` tra `weapon-amplification-research.json` e `items.json`.
  * `VAL-I18N-001`: segnalazione `rarity === ""`, traduzioni IT mancanti, note `review` aperte in `custom-items` e conflitti in `overrides-conflicts.json`.
