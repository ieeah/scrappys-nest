# Architettura delle Pagine e Navigazione (Portale Next.js & Supabase)

Documento di specifica architetturale consolidato a seguito della sessione di interrogatorio e validazione avversariale (`/grill-me`) del 2026-11-23 / 2026-11-24.

---

## 1. Contesto Operativo & Modello Mentale

L'analisi dell'utilizzo reale di **Scrappy's Nest** ha evidenziato due contesti fisici e operativi distinti che guidano l'esperienza:

1. **Mobile / Tablet da Scrivania:**
   * Utilizzo prevalente come console tascabile di **Briefing Pre-Raid** (preparazione e scelta obiettivi) e di **Debriefing Post-Raid** (check-in e registrazione del bottino).
   * L'interazione *durante* il raid su smartphone è virtualmente nulla: il giocatore non distoglie le mani dai comandi per evitare rischi in partita.
2. **Desktop su Secondo Monitor (Sempre Acceso Durante la Partita):**
   * Funge da **HUD / Lavagna Tattica Live**: una vista a colpo d'occhio (*glanceable*, a zero o minimi click) con mappa interattiva, percorsi e checklist obiettivi affiancati.
3. **Navigazione Asincrona "A Bocce Ferme":**
   * Consultazione rilassata di enciclopedia, guide di approfondimento, catalogo oggetti, alberi abilità e collezioni cosmetiche fuori dalla sessione di gioco attiva.

> ⚠️ **Decisione Chiave sulla Home / Dashboard:**
> La "Dashboard" generica (intesa come pagina vetrina con widget riassuntivi statici, [#56](https://github.com/ieeah/arc-benches/issues/56)) viene **eliminata**.
> L'apertura dell'applicazione porta direttamente allo **Stash / Magazzino** o alla pagina preferita impostata dall'utente.

---

## 2. I 5 Macro-Domini Semantici (+ Sistema)

L'intera applicazione è organizzata in **5 aree logiche primarie**, accessibili da menu ad alta densità senza elenchi sterminati:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. RAID (Ciclo Operativo della Sortita: Pre ──> In ──> Post)            │
│ 2. RIFUGIO (Magazzino e Strutture: Stash, Banchi, Outpost, Progetti)    │
│ 3. PROGRESSIONE (Carriera Globale: Skill Tree, Pass, Spedizioni, Quest) │
│ 4. COLLEZIONI (Album del Possesso: Blueprint, Design, Guardaroba)       │
│ 5. COMPENDIO (Conoscenza & Atlante: Catalogo, Mappe, Mob, Blog/Guide)   │
├────────────────────────────────────────────────────────────────────────┤
│ ⚙️ SISTEMA (Impostazioni, Gestione Profili, Account & Sync Cloud)       │
└────────────────────────────────────────────────────────────────────────┘
```

Tutte le sezioni e i sottomoduli rispettano l'architettura dei **moduli attivabili per profilo** ([#102](https://github.com/ieeah/arc-benches/issues/102)): se un utente disattiva un dominio (es. *Collezioni*), la voce scompare dal menu senza lasciare spazi vuoti e disattivando a cascata le relative dipendenze.

---

## 3. Dettaglio delle Aree e Mappa delle Pagine

### Dominio 1: RAID (La Sortita Operativa) — `/raid`
Orchestratore del ciclo di vita della partita. Dispone di un'impostazione utente per scegliere tra:
* **Modalità Completa (Lavagna Tattica):** Flusso esteso in 3 fasi (dietro user & system feature-flag con telemetria dedicata):
  * **Fase Pre-Raid:** Selezione mappa ed eventi attivi, selezione quest (con proiezione automatica di POI/zone su mappa e materiali in checklist), tracciamento percorsi ottimali, aggiunta materiali/azioni extra.
  * **Fase In-Raid (HUD 2° Monitor):** Schermata divisa in griglia multi-widget (mappa con percorsi + checklist compatta con stepper touch/click rapidi e checkbox).
  * **Fase Post-Raid (Debriefing):** Schermata di consolidamento: accredito bottino allo Stash, marcatura quest/azioni chiuse o reset rapido in caso di morte. Include il **Check-in rapido** (+livelli Reward Pass, danni challenge spedizioni, collezionabili registrati) senza navigare altrove.
* **Modalità Semplificata:** La vista compatta attuale (`RaidPlanPage`), incentrata unicamente sulla checklist degli oggetti e azioni a breve termine (1–3 raid), ideale per mobile o per chi preferisce zero complessità cartografica.
* **Moduli Correlati:**
  * Condizioni Mappe & Eventi Live (`/live` o `/events`, [#55](https://github.com/ieeah/arc-benches/issues/55)).
  * Calcolatori & Audit Stash (`/calculators`, [#168](https://github.com/ieeah/arc-benches/issues/168): ottimizzatore slot, loot filter in-raid).

### Dominio 2: RIFUGIO (Magazzino & Strutture a Lungo Termine)
Gestione a medio-lungo termine dei materiali fisici e dei potenziamenti della base:
* **Stash / Magazzino** (`/stash`) — Monitoraggio scorte fisiche, aggregazione fabbisogni, modalità griglia/lista, ordinamento multi-criterio e deficit materiali.
* **Banchi e Liste** (`/lists`) — Panoramica gerarchica strutturata con TabNav:
  * Tab *"Tutto"* (con filtri e priorità unificata).
  * Tab *"Banchi"* (banchi da lavoro ufficiali).
  * Tab *"Progetti"* (progetti permanenti del rifugio).
  * Tab *"Custom"* (liste personalizzate/sfide, visibile solo sotto feature-flag o controllo utente premium).
* **Hub dell'Outpost:** Fuso temporaneamente all'interno di *Banchi e Liste* (vedi sezione dedicata).

### Dominio 3: PROGRESSIONE (Carriera Permanente, Stagioni & Contratti)
Traguardi macro e storia del Raider che trascendono il ciclo dei singoli raid:
* **Albero delle Abilità (Skill Tree)** (`/skills`) — Visualizzatore vettoriale dei tre rami (Condizionamento, Mobilità, Sopravvivenza), calcolo budget punti (base + extra carovane) e sandbox build ([#62](https://github.com/ieeah/arc-benches/issues/62)).
* **Reward Pass** (`/passes`) — Vista unica unificata: se il pass è *attivo* le tracce (Free/Premium/Legacy) sono interattive; se è *inattivo* la vista è in sola consultazione. Il level-up rapido è fruibile dal Debriefing del Raid.
* **Spedizioni & Prestigio** (`/expeditions`) — Carovana attiva, 6 fasi sequenziali, scaglioni danno, formula fabbisogno scalare e reset prestigio ([#146](https://github.com/ieeah/arc-benches/issues/146)).
* **Quest Tracker** (`/quests`) — Grafo narrativo e contratti dei mercanti (Celeste, Tian Wen, Shani, ecc.) con tappe e ricompense ([#58](https://github.com/ieeah/arc-benches/issues/58)).
* **Bacheca dei Trofei** (`/trophies`) — Archivio storico: spedizioni concluse con data e streak, banchi masterati al 100% e record ([#70](https://github.com/ieeah/arc-benches/issues/70)).

### Dominio 4: COLLEZIONI (Album del Possesso & Completismo)
Tutto ciò che si "spunta" e si colleziona come possesso permanente dell'account:
* **Collezioni In-Raid** (`/collections`) — 91 Blueprint, 101 Design d'Arredo e 14 Stencil per armi con stato di possesso ([#145](https://github.com/ieeah/arc-benches/issues/145)).
* **Guardaroba** (`/wardrobe`) — Personalizzazioni estetiche (88 Outfit e varianti subordinate, aspetto Raider, 38 Zaini con charm/accessori, cosmetici di Scartino ed Emote, [#131](https://github.com/ieeah/arc-benches/issues/131)).
* **Tracker Ricerche Armi Amplificate** (`/weapons/tracker`) — Griglia operativa delle 21 armi amplificate con checkbox dei nodi di ricerca sbloccati nella Research Station ([#165](https://github.com/ieeah/arc-benches/issues/165)).

### Dominio 5: COMPENDIO (Atlante, Mercato, Enciclopedia & Blog)
Documentazione di riferimento e consultazione a freddo fuori dalla partita:
* **Catalogo Oggetti & Fabbricazione** (`/items`) — Database materiali, armi, upgrade I→IV, riparazione rifugio/in-raid, riciclo inverso e zone di drop. Espone badge cliccabili verso Collezioni (possesso blueprint/ricerca).
* **Mappe Interattive (Atlante Topside)** (`/maps`) — Cartografia completa a tutto schermo per esplorazione, studio bunker e zone loot ([#170](https://github.com/ieeah/arc-benches/issues/170)).
* **Commercianti & Offerte** (`/traders`) — Catalogo merci fisse e offerte a rotazione settimanale Cassio/Ermal con costi di scambio ([#147](https://github.com/ieeah/arc-benches/issues/147)).
* **Codex di Speranza & Bestiario ARC** (`/codex`) — Macchine ARC (punti deboli, drop %), fazioni, trascrizioni radio e lore ([#64](https://github.com/ieeah/arc-benches/issues/64), [#57](https://github.com/ieeah/arc-benches/issues/57)).
* **Guide & Blog** (`/guides` o `/blog`) — Articoli redazionali e guide alle meccaniche (es. *"Guida al funzionamento delle Amplificazioni"* con widget dinamico che legge lo stato del giocatore dal Tracker).

### Dominio 6: SISTEMA & STRUMENTI
* **Impostazioni & Moduli** (`/settings`) — Preferenze UI, selezione pagine preferite del FloatingNav, tema, backup e toggle moduli on/off.
* **Gestione Profili Raider** (`/profiles`) — Creazione, switch rapido e import/export JSON.
* **Account & Sincronizzazione** (`/account`, `/auth/*`) — Autenticazione Supabase, gestione sync cloud e sessioni.
* **Role Maker** (`/role-maker` o micro-app autonoma, [#38](https://github.com/ieeah/arc-benches/issues/38)) — Strumento opzionale per generare identità e vincoli GDR, fruibile in fase di prestigio/creazione nuovo Raider.
* **Condivisione Liste & Build** (`/share/[token]`, `/skills/share/[token]`) — Landing page pubbliche per importare liste o visualizzare configurazioni condivise via link ([#25](https://github.com/ieeah/arc-benches/issues/25), [#98](https://github.com/ieeah/arc-benches/issues/98)).

---

## 4. Struttura Cartelle Next.js App Router (`src/app`)

L'organizzazione del codice sfrutta i **Route Groups** con parentesi `(gruppo)` per separare i layout e raggruppare i file sorgente, **mantenendo gli URL HTTP completamente piatti e canonici** ([#171](https://github.com/ieeah/arc-benches/issues/171)):

```text
src/app/
├── layout.tsx                      # Root Layout (font, provider, tema, viewport)
├── (auth)/                         # Flusso Autenticazione
│   ├── login/page.tsx              # URL: /login
│   └── callback/route.ts           # URL: /callback
│
├── (shell)/                        # App Shell Utente (Sidebar Desktop + FloatingNav Mobile)
│   ├── layout.tsx                  # Gestione responsive, Command Palette (Cmd+K)
│   ├── page.tsx                    # Reindirizza a /stash (o pagina preferita profilo)
│   │
│   ├── (raid)/                     # DOMINIO 1: RAID
│   │   ├── raid/page.tsx           # URL: /raid (Pre/In/Post o Semplificata)
│   │   ├── live/page.tsx           # URL: /live
│   │   └── calculators/page.tsx    # URL: /calculators
│   │
│   ├── (shelter)/                  # DOMINIO 2: RIFUGIO
│   │   ├── stash/page.tsx          # URL: /stash
│   │   └── lists/
│   │       ├── page.tsx            # URL: /lists (Banchi, Progetti, Custom)
│   │       └── [id]/page.tsx       # URL: /lists/[id]
│   │
│   ├── (progression)/              # DOMINIO 3: PROGRESSIONE
│   │   ├── skills/
│   │   │   ├── page.tsx            # URL: /skills
│   │   │   └── [id]/page.tsx       # URL: /skills/[id]
│   │   ├── passes/
│   │   │   ├── page.tsx            # URL: /passes
│   │   │   └── [id]/page.tsx       # URL: /passes/[id]
│   │   ├── expeditions/
│   │   │   ├── page.tsx            # URL: /expeditions
│   │   │   └── [id]/page.tsx       # URL: /expeditions/[id]
│   │   ├── quests/
│   │   │   ├── page.tsx            # URL: /quests
│   │   │   └── [id]/page.tsx       # URL: /quests/[id]
│   │   └── trophies/page.tsx       # URL: /trophies
│   │
│   ├── (collections)/              # DOMINIO 4: COLLEZIONI
│   │   ├── collections/page.tsx    # URL: /collections
│   │   ├── wardrobe/page.tsx       # URL: /wardrobe
│   │   └── weapons/
│   │       └── tracker/page.tsx    # URL: /weapons/tracker
│   │
│   ├── (compendium)/               # DOMINIO 5: COMPENDIO
│   │   ├── items/
│   │   │   ├── layout.tsx          # Master-Detail split view su desktop
│   │   │   ├── page.tsx            # URL: /items
│   │   │   ├── @detail/            # Slot parallelo desktop
│   │   │   │   └── [id]/page.tsx
│   │   │   └── [id]/page.tsx       # URL: /items/[id] (Mobile full-page & deep link)
│   │   ├── maps/
│   │   │   ├── page.tsx            # URL: /maps
│   │   │   └── [mapId]/page.tsx    # URL: /maps/[mapId]
│   │   ├── traders/
│   │   │   ├── page.tsx            # URL: /traders
│   │   │   └── [id]/page.tsx       # URL: /traders/[id]
│   │   ├── codex/
│   │   │   ├── page.tsx            # URL: /codex
│   │   │   └── [section]/
│   │   │       └── [slug]/page.tsx # URL: /codex/[section]/[slug]
│   │   └── guides/
│   │       ├── page.tsx            # URL: /guides
│   │       └── [slug]/page.tsx     # URL: /guides/[slug]
│   │
│   ├── share/
│   │   └── [token]/page.tsx        # URL: /share/[token]
│   ├── settings/page.tsx           # URL: /settings
│   ├── account/page.tsx            # URL: /account
│   └── role-maker/page.tsx         # URL: /role-maker
│
└── (admin)/                        # AREA RISERVATA (Layout protetto senza shell pubblica)
    ├── layout.tsx                  # Guard ruolo Admin (RLS Supabase)
    ├── admin/page.tsx              # URL: /admin (Pipeline sync & storage status)
    ├── overrides/page.tsx          # URL: /admin/overrides
    └── translations/page.tsx       # URL: /admin/translations
```

---

## 5. Strategia Outpost: Decisione Attuale & Prospettive

Sulla gestione dell'**Outpost** si definiscono due opzioni evolutive:

1. **Opzione A (Stato Attuale — Adottata per il lancio):**
   * L'Outpost non ha una pagina dedicata. Viene gestito dentro **Banchi e Liste** (`/lists`) come banco di riferimento primario a 4 livelli, sfruttando i prerequisiti `requires` concatenati (`sheltered-retreat` $\rightarrow$ `outpost` $\rightarrow$ `research-station` / `gunsmith`).
2. **Opzione B (Macro-Wrapper Post-Rework Spedizioni):**
   * Il sistema delle Spedizioni subirà un rework ufficiale di gioco previsto a inizio 2027.
   * Se il rework legherà l'Outpost al ciclo stagionale di estrazione/wipe, l'Outpost verrà promosso a **Macro-Wrapper del Rifugio Temporaneo**, contenendo tutto ciò che si resetta durante la spedizione e separandolo da ciò che è permanente nell'account.

---

## 6. Ergonomia e Navigazione Reattiva (Mobile vs Desktop)

| Contesto | Componente Principale | Meccanica di Interazione |
| :--- | :--- | :--- |
| **Mobile** | **FloatingNav** + **Drawer a 5 Sezioni** | • Tap rapido sulla pillola: toggle istantaneo tra le 2 pagine preferite.<br>• Tocco prolungato o tap menu `☰`: apre il BottomSheet con le sole 5 macro-card (`Raid`, `Rifugio`, `Progressione`, `Collezioni`, `Compendio`).<br>• Tasto radar dedicato per aprire direttamente il Raid. |
| **Desktop** | **Sidebar Iconica** + **Command Palette (`Cmd+K`)** | • Sidebar a sinistra a scomparsa/espandibile con le 5 icone dei domini.<br>• Scorciatoia `Cmd+K` globale per teletrasportarsi a qualsiasi oggetto, quest, arma o mappa istantaneamente.<br>• Nella vista `/raid` in modalità completa: layout a schermo intero HUD (2° monitor) ottimizzato per la consultazione glanceable senza mani. |
