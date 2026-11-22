# ADR 009 — Schema Relazionale Postgres del Catalogo e Seed Idempotente (Era 2 → Era 3)

* **Data**: 2026-11-22
* **Stato**: Approvato
* **Riferimenti**: [transizione-next-supabase.md](../specs/transizione-next-supabase.md), [confronto-stack-backend-supabase-vs-neon.md](../specs/confronto-stack-backend-supabase-vs-neon.md), [schema-postgres-e-seed-era2.md](../specs/schema-postgres-e-seed-era2.md)

---

## Contesto

Al termine della fase di Data Mining (`v0.6.9`, Era 1), il dataset statico di **Scrappy's Nest** (`src/data/*.json`) deve essere tradotto in uno schema relazionale Postgres (Era 2 / Era 3) che supporti il futuro portale Next.js mantenendo:
1. Compatibilità agnostica tra **Supabase** e **Neon + Better-Auth + Drizzle** fino alla scelta definitiva dello stack.
2. Integrità referenziale rigorosa tra catalogo di gioco (`catalog_*`) e progressi utente (`user_*`), anche attraverso future patch di *ARC Raiders*.
3. Supporto futuro per **Admin UI e contributi UGC** (es. POI delle mappe) e internazionalizzazione multi-lingua (`react-i18next` / `next-intl`).

---

## Decisioni Approvate

### 1. Formato del Generatore di Seed (`D-05`)
* Il generatore di Seed di Era 2 produce **SQL Postgres standard puro e idempotente** (`INSERT ... ON CONFLICT DO UPDATE` dentro un'unica transazione `BEGIN ... COMMIT`), affiancato dallo **schema TypeScript Drizzle (`schema.ts`)** come contratto tipizzato.
* Questo garantisce portabilità totale al 100% sia su Supabase sia su Neon + Drizzle.

### 2. Tabella Unica `catalog_items` per Base Items e Varianti (`D-02`, `D-03`)
* Tutti i 27 Base Item (`item-variants.json`, inclusi i 22 Base Item puramente virtuali come `anvil` o `ferro`) vivono nella **tabella unica `catalog_items`** con flag `is_virtual_base = true`.
* Le 183 varianti (`I–IV` e `Amplified`) puntano al proprio gruppo tramite self-FK `base_item_id REFERENCES catalog_items(id)`. Tutte le Foreign Key dell'intero DB (inventario, collezioni, ricette, liste) puntano quindi a un'unica tabella.
* **Regola canonica per `unlocks_item_id` (`D-03`)**: sui Blueprint delle armi con varianti, `unlocks_item_id` punta sempre all'**oggetto Lvl 1 realmente fabbricabile** in `items.json` (es. `anvil-i`, `aphelion-rifle`, `bantam`, `canto`, `rascal`, `stiletto`, `dolabra`), mentre il legame col gruppo arma resta su `base_item_id` / `blueprint_item_id`.
* Le **Armi Leggendarie** (`Aphelion`, `Dolabra`, `Jupiter`, `Equalizer`) hanno un unico livello base (niente `I–IV`), mentre `Bantam`, `Canto`, `Rascal` e `Stiletto` hanno i 4 livelli canonici `I–IV`.

### 3. Traduzioni Multilingua (`D-06`)
* I 3 pattern i18n presenti nei JSON di Era 1 vengono unificati su una singola colonna **`translations JSONB NOT NULL`** su ciascuna tabella `catalog_*`, con chiave BCP-47 simmetrica:
  ```json
  { "en": { "name": "...", "description": "..." }, "it": { "name": "...", "description": "..." } }
  ```
* Garantisce 0 `JOIN` nelle letture dei Server Components, cambio lingua istantaneo senza refetch e zero migrazioni DDL per aggiungere nuove lingue (`fr`, `de`, `es`, ecc.).

### 4. Soft-Deprecation alle Patch e Protezione Dati Utente (`D-07`)
* Il Seed **non esegue mai `DELETE`** su `catalog_items` o `catalog_lists`.
* Eventuali oggetti o liste rimossi in future patch di gioco vengono marcati con `is_deprecated = true`.
* Le tabelle utente (`user_stash_items`, `user_collections`, `user_list_progress`) adottano vincoli `ON DELETE RESTRICT` verso il catalogo, preservando integralmente inventari, trofei e storico utente.

### 5. Storage POI delle Mappe (`D-04`, `M-02`)
* **Architettura DB + Cache Edge (`B-Cached`)**: tutti i POI (previa pre-scrematura dei record non corretti) vengono caricati nella tabella Postgres **`catalog_map_pois`** e serviti all'app tramite endpoint/RSC dietro Cache Edge invalidata (`revalidateTag`) solo in caso di modifiche Admin o approvazioni UGC.
* Il campo ridondante `totalPois` viene rimosso da `maps.json` e dal modello `GameMap` (dato derivato calcolabile su DB o non necessario).

### 6. Classificazione Valute e Ricerche Armi (`D-08`, `VAL-RES-001`)
* **`assorted-seeds`** mantiene `item_type = "Nature"` (è un oggetto fisico droppabile/riciclabile di gioco, con ruolo secondario di valuta presso Celeste).
* Le **5 risorse virtuali d'account** vengono unificate sotto `item_type = "Currency"` e distinte tramite `subcategory`:
  * `"Purchase"`: `coins`, `raider-tokens`.
  * `"Progression"`: `reward-points`, `xp-points`, `research-points`.
* Le **15 ricerche della Research Station** nel nuovo DB Postgres vivono esclusivamente nella tabella dedicata **`catalog_weapon_research`** (non in `catalog_items`).

---

## Conseguenze

* **Vantaggi**:
  * Schema pulito, privo di tabelle parallele ridondanti per traduzioni o Base Item virtuali.
  * Nessuna perdita di dati utente durante gli aggiornamenti post-patch.
  * Piena predisposizione per il futuro modulo Admin/UGC sui POI delle mappe e per il supporto multi-lingua.
* **Impegni**:
  * Ogni query di ricerca/lookup su testi e chiavi deve essere **case-insensitive** (`M-04`).
  * Le regole di integrità su campi `JSONB` (es. presenza chiave `'en'` in `translations`) sono garantite a monte dal validatore `validate-dataset` prima del Seed.
