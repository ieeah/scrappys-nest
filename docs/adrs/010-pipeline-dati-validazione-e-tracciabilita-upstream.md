# ADR 010 — Pipeline Dati, Validazione Integrità e Tracciabilità Upstream (Era 2)

* **Data**: 2026-11-22
* **Stato**: Approvato
* **Riferimenti**: [ADR 009](009-schema-catalogo-postgres-e-seed-idempotente.md), [schema-postgres-e-seed-era2.md](../specs/schema-postgres-e-seed-era2.md)

---

## Contesto

L'audit di integrità referenziale eseguito sul dataset congelato alla `v0.6.9` ha evidenziato discrepanze di nomenclatura tra le fonti upstream (MetaForge, ARC Tracker, RaidTheory, arcraidersmaps.app), bug di normalizzazione negli script `scripts/fetch-*.mjs` e rischi di sovrascrittura delle correzioni manuali a ogni aggiornamento di patch.

---

## Decisioni Approvate

### 1. Bonifica alla Radice & Registro Alias Tracciabile (`D-01`, `Q-01`..`Q-06`, `T-01`..`T-04`, `REC-01`..`REC-32`)
* Tutte le anomalie rilevate nell'audit vengono corrette direttamente negli script `scripts/fetch-*.mjs` e nei file `src/data/*.json` prima della generazione del Seed, garantendo integrità referenziale al 100% senza rompere alcun riferimento esistente.
* **Tracciabilità Upstream 1:1**: ogni rimappatura o correzione di refuso upstream (es. `burltetta` → `burletta-i`, `bastion-cell` → `bastion-part`, `sentinel-firing-core` → `sentinel-part`, `damaged-rocketeer-driver` → `damaged-rocketeer-part`, `smoke-grenade-trap` → `laser-trap-smoke`, `res-sofa-01-y150-a` → `study-armchair`, ecc.) è registrata in modo esplicito e versionato in `scripts/data/upstream-aliases.json` e conservata in Postgres nella colonna `upstream_ids JSONB` di `catalog_items`.
* **Normalizzazione alla fonte in `fetch-quests.mjs` (`M-01`, `Q-04`, `Q-05`)**: i nomi delle mappe (`dam_battlegrounds` → `dam`, `the_spaceport` → `spaceport`, ecc.) e i trader (`tian_wen` → `tian-wen`, `cassio` → `nomadic-envoy`) vengono normalizzati direttamente in fase di estrazione.
* **Ricompense Quest verificate in-game (`Q-01`..`Q-03`)**:
  * `greasing-her-palms` → `lure-grenade` e `worth-your-salt` → `vita-spray` sono **corrette** (in-game consegnano l'oggetto singolo, non più il blueprint).
  * `industrial-espionage` → **`burletta-i`** (confermato in-game che consegna l'arma singola, correggendo il refuso `burltetta` di MetaForge).
* **Research Station (`D-09`)**: `mobile-fire-grip-fittings` è l'ID canonico della ricerca, mentre `sprint-shooting` è il nome dell'amplificazione sbloccata.
* **Blueprint, Design e Varianti (`UV-01`..`UV-18`, `C-02`, `C-03`)**:
  * Rimozione dei 2 self-loop su `study-armchair-design-*` verso i rispettivi due mobili distinti (`study-armchair-res-armchair-01-a` e `study-armchair`).
  * Fix `combat-mk-3-flanking` → `combat-mk3-flanking` (augment distinti).
  * Rimozione intrusi da `item-variants.json` (`anvil-splitter` marcato `deprecated: true`, `renegade-censer-backpack-attachment` rimosso) e aggiunta `blueprintItemId` mancanti (`burletta`, `torrente`).
  * `purification-system-blueprint` (`Trinket`) escluso dalla collezione Blueprint tramite allowlist; gli `Stencil` restano senza `unlocks_item_id`.

### 2. Resilienza Pipeline & Protezione Override (`D-10`, `D-11`, `P-01`..`P-04`)
* **`quests-overrides.json` (`D-10`)**: introdotto per applicare in coda a `fetch-quests.mjs` eventuali fix o arricchimenti manuali (`carryItems`, `maps` sulle azioni) senza perderli ai `--refresh`.
* **Conservazione Traduzioni (`P-02`)**: `fetch-items.mjs` preserva o riapplica automaticamente le traduzioni dalla cache locale anche quando viene eseguito singolarmente senza `fetch-all.mjs`.
* **Cache Locale Skill e Mappe (`D-11`)**: `fetch-skills.mjs` e `fetch-arc-maps.mjs` adottano cache locali (`scripts/skills-raw.json`, `scripts/maps-pois-raw.json`) governate dal flag `--refresh`, più supporto `map-pois-overrides.json`.
* **Flusso `patch-diff`**: prima di applicare nuovi dati o rigenerare il Seed, `scripts/patch-diff.mjs` produce un report delle differenze rispetto allo snapshot precedente (nuovi item, item scomparsi candidati a `is_deprecated`, cambi costi ricette, conflitti override).

### 3. Gate di Validazione `validate-dataset` (`D-12`, `VAL-*`)
* Tutti i JSON devono superare `scripts/validate-dataset.mjs` prima del Seed:
  * **11 regole `ERROR` (bloccanti, Exit 1)**: formato e univocità ID (`VAL-ID-001`), integrità di tutte le FK (`VAL-FK-001..009`, incluso divieto di self-loop su `unlocks_item_id`), assenza di cicli o prerequisiti orfani nei grafi (`VAL-DAG-001`).
  * **5 regole `WARNING` (non-bloccanti, Exit 0 salvo `--strict`)**: copertura/univocità `unlocks_item_id` (`VAL-BP-001/002`), omogeneità tipi nelle varianti (`VAL-VAR-001`), coerenza ricerche su `v0.6.9` (`VAL-RES-001`), qualità catalogo / `rarity` / traduzioni IT / note `review` dei custom-items (`VAL-I18N-001`, `D-12`).
* **Lookup Case-Insensitive (`M-04`)**: tutti i lookup e le ricerche su titoli e chiavi (es. `groupQuestPoisByQuest`) devono essere case-insensitive.

---

## Conseguenze

* I dati in `src/data/` e gli script `scripts/fetch-*.mjs` diventano riproducibili e verificabili automaticamente a ogni patch del gioco.
* Il futuro pannello `/admin` del portale Next.js potrà consultare `upstream_ids` per riconciliare automaticamente eventuali cambiamenti di ID o nome nelle API esterne.
