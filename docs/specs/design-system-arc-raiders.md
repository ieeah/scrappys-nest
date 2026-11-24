# Design System — ARC Raiders × Scrappy's Nest

Specifica estratta dall'analisi visiva di **56 screenshot in-game** di *ARC Raiders* (incluse varianti hover, modali, impostazioni, quest complesse, research station, skill tree e mappa Topside) e dai dati tipografici di [Game Font Library](https://www.gamefontlibrary.com/games/arc-raiders), adattata ai vincoli mobile-first di **Scrappy's Nest** (`AGENTS-PROJECT-RULES.md`).

---

## 1. Principi Visivi & Adattamento Web

1. **Estetica "Cassette Futurism" Tattico**:
   - Forte dualismo cromatico tra **canvas profondo blu-notte/ardesia** (navigazione, griglie, inventario, sfondo) e **schede informative crema/pergamena calda** (dettagli oggetto, tooltip, body dei modali, quest).
   - Accenti **ambra-oro** riservati alle azioni primarie (`CRAFT`, `PLAY`, `CONFIRM`, `START`) e alle evidenziazioni di progresso attivo.
   - **Spettro arcobaleno ARC a 4 bande** (rosso, ambra, verde, blu/ciano) come firma identitaria e feedback dinamico su hover/focus.
2. **Calibrazione HDR → SDR**:
   - Gli screenshot di riferimento PNG provengono da tone-mapping HDR→SDR (leggermente più scuri nei mezzitoni rispetto all'HDR nativo). I token CSS riportati qui compensano i mezzitoni per garantire contrasto **WCAG AA/AAA** su display SDR desktop e smartphone al buio.
3. **Ponte con le regole di Scrappy's Nest**:
   - **Superellissi**: contenitori principali e card di sezione usano `rounded-[24px]` o `rounded-[28px]`.
   - **Touch-First**: aree interattive minime `44×44px`, feedback tattile `active:scale-95`.
   - **Reduced Motion**: tutte le animazioni (incluso il bordo conico rotante) rispettano `prefers-reduced-motion: reduce` e il toggle in-app.

---

## 2. Palette & Token Colore (CSS / Tailwind v4)

### 2.1 Superfici & Sfondo

| Token | Valore | Uso |
|---|---|---|
| `--bg-canvas` | `#080C16` | Sfondo radice pagina |
| `--bg-canvas-radial` | `radial-gradient(circle at 50% 25%, #121B36 0%, #080C16 70%)` | Sfondo atmosferico delle schermate |
| `--surface-dark` | `#0E1322` | Pannelli scuri, bottoni secondari, card liste |
| `--surface-dark-glass` | `rgba(14, 19, 34, 0.86)` + `backdrop-blur-md` | Pannelli flottanti su mappa/hub (Feats, Legenda, Info) |
| `--surface-slot` | `#121829` | Sfondo base celle griglia Stash / Collezioni |
| `--border-subtle` | `rgba(255, 255, 255, 0.12)` | Bordi righe impostazioni, divisori sottili, slot vuoti |
| `--surface-cream` | `#EAE0CE` | Pannello dettaglio oggetto, tooltip, body modale, card Trials |
| `--surface-cream-bright` | `#F3EAD8` | Slot selezionato nella griglia |
| `--surface-cream-inset` | `#D8CEBC` | Sezione inferiore `REQUIRED RESOURCES`, footer peso/valore, gruppi annidati quest |
| `--text-on-dark` | `#F4F6FA` | Testo primario su sfondo scuro |
| `--text-on-dark-muted` | `#8E98AD` | Etichette secondarie, step bloccati |
| `--text-on-cream` | `#14161D` | Titoli e testo primario su card crema |
| `--text-on-cream-muted` | `#525663` | Descrizioni, label statistiche su card crema |

### 2.2 Accenti, Azioni & Stati Semantici

| Token | Valore | Uso |
|---|---|---|
| `--accent-primary` | `#F5A600` | Pulsante CTA primario (`CRAFT`, `PLAY`, `CONFIRM`, `START`) |
| `--accent-primary-hover` | `#FFB81C` | Stato hover CTA primario (testo `#111318`) |
| `--accent-secondary-bg` | `#0C111E` | Pulsante secondario a pillola (`TRACK RESOURCES`, `INSPECT`) |
| `--cta-disabled-cream` | `#C4BCB0` | Pulsante disabilitato su card crema (`IN PROGRESS`, `COMPLETE RESEARCH`) |
| `--status-ready` | `#1E88E5` / `#29B6F6` | Quantità materiale sufficiente (`30/2` su crema / `20/10` su scuro) |
| `--status-success` | `#16B856` | Stato completato / `RETURNED SAFELY` / barra verde |
| `--status-danger` | `#C61A1A` | Banner errore/blocco (`Max Level`, `Fullfil the previous step...`) e deficit `0/2` (`#B71C1C` su crema) |
| `--status-warning` | `#F5A600` | Timer eventi (`57:18`, `33 days`), header `< STEP 1/2 >`, checkmark giallo |
| `--arc-stripe-gradient` | `linear-gradient(90deg, #E62E2D, #F5A600, #00C853, #00A8FF)` | Firma 4-bande ARC Raiders |

### 2.3 Sistema Rarità & Tipologie Speciali

Ogni slot oggetto applica:
1. Bordo `1px solid` nel colore della rarità (al ~55% opacità a riposo, 100% su selezione/hover);
2. Gradiente lineare dal basso (`rgba(rarità, 0.28)` → `transparent 55%`);
3. **Triangolo d'angolo** in basso a sinistra pieno nel colore della rarità con icona categoria bianca (`12×12px`).

| Rarità / Tipo | Colore Principale | Badge / Sfondo Speciale |
|---|---|---|
| **Common** (`Comune`) | `#8B95A5` | Grigio ardesia |
| **Uncommon** (`Non Comune`) | `#16B856` | Verde smeraldo |
| **Rare** (`Raro`) | `#1D8FE1` | Blu/azzurro vivo |
| **Epic** (`Epico`) | `#D91E85` | Magenta/fucsia |
| **Legendary** (`Leggendario`) | `#F5A600` | Ambra-oro |
| **Amplified** (`Amplificato`) | `#FF6B00` | Arancione intenso (badge `AMPLIFIED`, varianti arma con bande arancioni) |
| **Blueprint** | `#1D4ED8` | Griglia ortogonale blu (`#0D1B4C` + linee `#1E3A8A`) + icona libro |
| **Design** | `#182336` + tinta rarità | Griglia di crocette `+` su gradiente della rarità + triangolo d'angolo rarità |

---

## 3. Tipografia (Game Font Library)

| Ruolo | Font Family | Peso & Stile | Tracking / Note |
|---|---|---|---|
| **Logo / Brand** | `ITC Avant Garde Gothic` | Bold / Bold Condensed | Solo logotipo principale |
| **Titoli Sezione / H1** | `Urbanist`, `Prompt` | `800` ExtraBold, `UPPERCASE` | `letter-spacing: -0.01em` (es. `BLUEPRINTS`, `FLICKERING FLAMES`) |
| **Tab Nav / Intestazioni Primarie** | `Handel Gothic`, `Urbanist` | `500`–`700`, `UPPERCASE` | `letter-spacing: 0.06em` (es. `WORKSHOP`, `REWARD PASS`) |
| **Titolo Oggetto / H2** | `Urbanist`, `Barlow` | `700`–`800`, `UPPERCASE` | Su card crema: `18px–22px`, line-height `1.15` |
| **Body / Descrizioni / Liste** | `Barlow` | `400` Regular, `500` Medium, `600` SemiBold | Ottima leggibilità su mobile anche a `13px–14px` |
| **HUD / Numeri / Timer / Valute** | `JetBrains Mono` | `500`–`700` | Obbligatorio `font-variant-numeric: tabular-nums` per contatori `12/2`, `97/130`, timer `57:18` |

---

## 4. Geometria, Bordi & Raggi

- **Pillole (`rounded-full`)**:
  - Tab attive nella barra superiore (`border: 1.5px solid #FFFFFF`)
  - Bottoni CTA primari e secondari (`CRAFT`, `TRACK RESOURCES`, `CANCEL`, `CONFIRM & RESET`)
  - Righe delle Impostazioni (`rounded-full`, `border: 1px solid rgba(255,255,255,0.14)`)
  - Badge compatti (`IN ONE ROUND`, `33 days`)
- **Card & Pannelli**:
  - In-game: `rounded-[10px]`–`rounded-[14px]` su card crema e pannelli modali.
  - Adattamento *Scrappy's Nest*: `rounded-[24px]` o `rounded-[28px]` per card principali di pagina, drawer e contenitori di sezione; `rounded-[12px]` per card interne e modali compatti.
- **Slot Griglia**: `rounded-[6px]`–`rounded-[8px]`, `border: 1px solid`.

---

## 5. Catalogo Componenti UI

### 5.1 Navigazione & Header
- **Top Bar**: freccia indietro circolare (`<`), breadcrumb testuale (`RESEARCH STATION — LEVEL 04`), pillole tab orizzontali (attiva con bordo bianco `1.5px`, inattive testo `#8E98AD`), valute e livello Raider a destra.
- **Rail Verticale Stazioni / Categorie**: colonna di bottoni circolari (`36px–40px`, su mobile `44px`); stato attivo = riempimento `#EAE0CE` con icona `#14161D`; inattivo = `#121829` con icona `#8E98AD`.
- **Keybind / Shortcut Pill**: badge tasto bianco/crema (`ESC`, `TAB`, `E`) con testo `#14161D` bold; su mobile sostituibile con icona azione touch.

### 5.2 Bottoni & Effetto Hover Conico (`arc-hover-ring`)
- **Primary CTA**: pillola piena `#F5A600`, testo `#111318` uppercase bold.
- **Secondary CTA**: pillola `#0C111E`, testo `#F4F6FA` uppercase bold, bordo sottile.
- **Segmented Toggle (`ON | OPEN | OFF`)**: gruppo di bottoni rettangolari compatti su crema (`border: 1px solid #B8B0A0`), stato attivo marcato da un badge circolare giallo `#F5A600` con checkmark nero sull'angolo.
- **Effetto Hover Conico (Arc Raiders Signature)**:
  Bordo sottile (`2px`) **staccato di `2px` dal pulsante** (gap trasparente ottenuto con `inset: -4px; padding: 2px;`) a `conic-gradient` rotante lungo lo spettro ARC (**ciano → blu → viola → magenta → rosso → ambra → verde → ciano**) su hover/focus di bottoni pillola e slot selezionabili.
- **Keybind su CTA Primario & Hold-to-Confirm**:
  Sui pulsanti ambra (`CRAFT`, `PURCHASE`, `AMPLIFY`), il tasto (`E`) è contenuto in un **box quadrato pieno `#14161D`** (testo ambra `#F5A600`), circondato da un piccolo gap trasparente (`2px`) e da un **bordo esterno più scuro** (`rgba(20,22,29,0.38)`). Tenendo premuto il pulsante (stato `active` / hold), è proprio **il bordo esterno attorno al box della `E`** a riempirsi gradualmente in senso orario in `#14161D` fino a `360°`, scatenando l'azione al completamento.

```css
@property --arc-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes arc-border-spin {
  to { --arc-angle: 360deg; }
}

.arc-hover-ring {
  position: relative;
}

.arc-hover-ring::before {
  content: '';
  position: absolute;
  inset: -4px;
  padding: 2px;
  border-radius: inherit;
  background: conic-gradient(
    from var(--arc-angle),
    #22d3ee, #3b82f6, #8b5cf6, #ec4899, #ff3b30, #ffaa00, #22c55e, #22d3ee
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.arc-hover-ring:hover::before,
.arc-hover-ring:focus-visible::before {
  opacity: 1;
  animation: arc-border-spin 2.5s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .arc-hover-ring:hover::before,
  .arc-hover-ring:focus-visible::before {
    animation: none;
  }
}
```

### 5.3 Scheda Dettaglio Crema & Stepper
Struttura verticale a 2 fasce:
1. **Fascia Superiore (`#EAE0CE`)**:
   - Dual-badge in testa: icona + categoria (`REFINED MATERIAL`) | rarità (`EPIC`) colorata;
   - Titolo uppercase bold (`MAGNETIC ACCELERATOR`);
   - Descrizione + eventuali barre statistiche orizzontali (`Damage`, `Stability`, ecc.) o barra `REPAIR` (`97/130`).
2. **Fascia Inferiore (`#D8CEBC`)**:
   - Header `REQUIRED RESOURCES`;
   - Righe materiale con icona slot + nome + contatore tabulare (`0/2` rosso se mancante, `30/2` blu/ciano se sufficiente);
   - Eventuale banner di stato pieno (rosso `#C61A1A` per `Max Level` / blocco step);
   - Controllo quantità (`-` cerchio scuro | box `×1` | `+` cerchio scuro) + stack bottoni CTA (`TRACK RESOURCES` + `CRAFT`).

### 5.4 Quest & Azioni Complesse (4 Varianti Canoniche)
Dai riferimenti di Logbook e Quest dei Commercianti:
1. **Azione Singola**: checkbox quadrato (`16px`) + testo + eventuale contatore tabulare sotto (`0/3`).
2. **In Singolo Raid**: badge pillola nero `#14161D` con testo bianco `IN ONE ROUND` sopra il blocco obiettivi.
3. **Azioni Concatenate**: sotto-step indentato collegato da una linea sottile ad `L` al passo genitore; resta visivamente attenuato finché il passo precedente non è spuntato *(in Scrappy's Nest li mostriamo tutti subito, mantenendo l'indicazione di dipendenza)*.
4. **Gruppo Annidato**: contenitore inset `#D8CEBC` con bordo sottile che raggruppa i sotto-obiettivi di una macro-azione.
5. **Opzionale**: icona a cerchio con punto centrale (`◉`) e prefisso `(Optional)`.

### 5.5 Research, Skill Tree & Progressione
- **Research Card**: header superiore pieno `#F5A600` con frecce `< STEP 1/2 >` (e lucchetto se step futuro bloccato); accordions a sinistra (`STEP 1 IN PROGRESS 2/5`, `NOT STARTED`, `RESEARCH COMPLETED`).
- **Skill Tree**: 3 rami cromatici netti su sfondo `#080C16`:
  - **Conditioning**: `#00E65B` (verde neon)
  - **Mobility**: `#F5B800` (ambra-oro)
  - **Survival**: `#F01E1E` (rosso)
  - Nodi circolari con pillola contatore `N/5`, milestone a rombo ruotato di `45°`, nodi bloccati `#1A2236` con `?` e lucchetto.

### 5.6 Modali, Controlli Impostazioni & Mappa
- **Modale di Conferma**: overlay scuro con forte blur (`backdrop-blur-md bg-black/70`), box centrato diviso in **body crema** (`#EAE0CE`, titolo + descrizione + divisore + costo) e **footer azioni navy scuro** (`#0C111E`, `CANCEL` grigio `#6B7280` + `CONFIRM` ambra `#F5A600`).
- **Toast / Alert di Avvenuta Consegna (`RESOURCE ADDED`)**: banner flottante in alto al centro su `#0E1322` (`border: 1px solid rgba(255,255,255,0.16)`, `rounded-[8px]`), composto da **slot oggetto compatto** a sinistra (`×N` + rarità) + label uppercase `#8E98AD` (`RESOURCE ADDED`) + titolo oggetto `#F4F6FA` bold.
- **Barre di Progresso Consegna (Progetti / Banchi)**: barra lineare sottile `rounded-full` con riempimento **ciano/teal** (`#1CA3C8` / `#29B6F6`) sia su riga scura (`#0E1322`, traccia `#2A3142`) che su riga selezionata crema (`#EAE0CE`, traccia `#C9BFAE`); il contatore (`10/10`, `5/5`) si colora in ciano al raggiungimento del target.
- **Impostazioni**: righe a pillola (`rounded-full`) con controllo a destra: `< VALORE >` per selettori, barra lineare con thumb rettangolare verticale per slider (`75%`), badge tasto bianco per keybind.
- **Mappa Topside**: aree loot delimitate da poligoni con bordo colorato (**Rosso** `#E53935` = High Value, **Ambra** `#F5A600` = Medium Value) e legenda flottante `#0E1322/85` a destra.
