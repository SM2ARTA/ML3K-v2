# ML3K v2 — FIFA World Cup 2026 Logistics Manager

## Project Overview
SvelteKit rebuild of ML3K. Ground transport logistics for FWC26 — trucks, stadiums, venues, routes, and staffing across USA, Canada, and Mexico host cities.

## Architecture
- **Framework**: SvelteKit with TypeScript
- **Backend**: Supabase PostgreSQL with proper normalized tables (30 tables + 2 views)
- **Hosting**: Vercel at `ml3k.smmarta.com` (auto-deploys from GitHub)
- **Build**: Vite
- **v1 app**: Still running at `SM2ARTA/LM-3000` (single `index.html`, ~11,000 lines) — shares same Supabase project

## Migration Status
- **Phase 1** ✅: `shared_state` bridge via `migrate.ts`
- **Phase 2** ✅: Proper database tables created + data migrated via `002_migrate_data.sql`
- **Phase 3** (current): Building v2 UI with proper table reads/writes via `db.ts`
- **Phase 4**: Full feature parity, switch users, deprecate v1

## Supabase
- Project URL: `https://stwopndhnxcjyomkufii.supabase.co`
- Anon key in `.env` (public, safe)
- **v1 table**: `shared_state` (JSON blobs — DO NOT MODIFY, v1 still uses it)
- **v2 tables**: 30 normalized tables with indexes, triggers, RLS (see Database Schema below)
- **Disk IO**: v1 had budget issues from writing 6 giant JSON blobs per edit. v2 solves this with row-level writes.

## Project Structure
```
src/
├── lib/
│   ├── components/        — 12 shared Svelte components (see below)
│   │   ├── TabBar.svelte, StatBadge.svelte, Spinner.svelte, Card.svelte
│   │   ├── SearchInput.svelte, FilterDropdown.svelte, Modal.svelte
│   │   ├── EditableCell.svelte, ConfirmButton.svelte, DestBadge.svelte
│   │   ├── ProgressBar.svelte, TruckCard.svelte
│   │   └── index.ts       — barrel export
│   ├── supabase.ts        — Supabase client (reads from .env)
│   ├── db.ts              — v2 database access layer (RPC + proper tables)
│   ├── table.svelte.ts    — TanStack Table adapter for Svelte 5 (uses $state)
│   ├── stores.ts          — Svelte stores (role, module, state)
│   ├── migrate.ts         — Bridge: reads v1 shared_state (keeps v1 working)
│   └── index.ts
├── routes/
│   ├── +layout.svelte     — App shell (header, module switcher, auth, routing)
│   ├── +page.svelte       — Login + dashboard with v1/v2 comparison stats
│   ├── lp/+page.svelte    — Load Plan (Demand, Plan, Arrivals, Late tabs)
│   ├── lm/+page.svelte    — Last Mile (placeholder)
│   └── v26/+page.svelte   — Vision 2026 (placeholder)
├── app.css                — Design tokens (matches v1)
└── app.html               — HTML template with Google Fonts
supabase/
├── 001_initial_schema.sql — 30 tables, views, triggers, RLS
├── 002_migrate_data.sql   — Data migration from shared_state to proper tables
└── 003_demand_aggregate.sql — RPC function: get_lp_demand_by_sku()
```

## Build Status & What's Left to Port from v1

### LP Module — Load Plan
| Feature | Status | v1 Reference |
|---|---|---|
| Demand table with TanStack sorting | ✅ Done | `LP_renderDemand()` |
| Inline customs editing (HS, COO, price, name) | ✅ Done | `LP_customsInput()` |
| HS confirm button (○/✓) | ✅ Done | `LP_toggleHSConfirm()` |
| Source + Destination multi-select filters | ✅ Done | `LP_filterDemand()` |
| Global search | ✅ Done | TanStack globalFilter |
| Plan tab with truck cards grouped by date | ✅ Basic | `LP_renderPlan()` |
| Arrivals table | ✅ Basic | `LP_renderArrivals()` |
| **Hold by source bar** | ✅ Done | `HoldBar.svelte` + `holdBySource()` in db.ts |
| **Combined CI button + modal** | ❌ Not ported | `LP_showCombinedCIModal()` |
| **CAN/MEX/USA dest quick-select** | ✅ Partial | In HoldBar, not yet in filter dropdown |
| **HS Code Assistant (AI wizard)** | ✅ Done | `HSLookup.svelte` + `hs-utils.ts` + `hs-data.ts` |
| **Stock qty column** | ✅ Done | Green/red color coding |
| **Destination color coding** | ✅ Done | `destColor()` in utils.ts, DestBadge uses it |
| **Truck card click → detail modal** | ✅ Done | `TruckModal.svelte` with SKU manifest |
| **CI export (per truck)** | ✅ Done | `exportCI()` in exports.ts with party data |
| **Plan export (Excel)** | ✅ Done | `exportLPPlan()` with 2 sheets |
| **Demand export (Excel)** | ✅ Done | `exportLPDemand()` |
| **Arrivals export (Excel)** | ✅ Done | `exportLPArrivals()` |
| **Lock/dispatch with Supabase save** | ✅ Done | `updateTruckDispatch()` |
| **Date change on trucks** | ✅ Done | Date picker in TruckCard |
| **LSR save to Supabase** | ✅ Done | `saveLSR()` |
| **Engine settings (collapsible)** | ✅ Done | Plan tab, saves to lp_settings |
| **Transit times (collapsible)** | ✅ Done | Plan tab, saves to lp_destinations |
| **File upload (nom, demand, arrivals)** | ✅ Done | `/lp/upload` with auto-detect + batch save |
| **Container date overrides** | ✅ Done | Inline date picker in arrivals, orange highlight |
| **Manual arrivals** | ✅ Done | Add form + delete button in arrivals tab |
| **Pallet qty editing** | ✅ Done | Inline number input in demand table |
| **Late tab** | ✅ Done | Items not yet ready, days-until-ready color coding |
| **Plan regeneration engine** | ✅ Done | Full bin-packing port, 🔄 Regenerate button |
| **Nom update (partial re-import)** | ✅ Done | `NomUpdateModal.svelte`, preserves overrides |
| **Combined CI modal** | ✅ Done | 8-dest selection, source filter, aggregate export |

### LM Module — Last Mile
| Feature | Status |
|---|---|
| Dashboard (venue stats, top venues) | ✅ Done |
| Demand table (searchable) | ✅ Done |
| Venues settings cards | ✅ Done |
| Venue sidebar with clusters | ✅ Done | Collapsible, searchable, grouped by cluster |
| Truck plan view | ✅ Done | LM engine: pallet calc + truck packing + date grouping |
| LM file upload | ✅ Done | `/lm/upload` — nom + material plan |
| LM exports | ✅ Done | Demand + venue summary Excel |
| Dispatch controls | ❌ Not ported |
| Plan engine | ❌ Not ported |
| File upload | ❌ Not ported |

### V26 Module — Vision 2026
| Feature | Status |
|---|---|
| KPI dashboard | ✅ Done | 4 stat cards + destination breakdown |
| Dispatch volume chart (SVG) | ✅ Done | `DispatchChart.svelte` — bar chart with dispatch status colors |
| Dispatch timeline table | ✅ Done | Date/trucks/pallets/pieces/dispatched |
| V26 export | ✅ Done | By destination + timeline sheets |
| Cross-module stats | ✅ Done | LP + LM + Stock counts |
| Network map | ❌ Not ported |

### Shared Features
| Feature | Status |
|---|---|
| Backup/Restore (Excel) | ✅ Done | `backup.ts` — 17 tables to Excel, restore from Excel |
| Help dialog | ✅ Done | `HelpDialog.svelte` — full system guide |
| Bottom support bar | ✅ Done | `BottomBar.svelte` — context-sensitive exports |
| Backup/Restore buttons | ✅ Done | Header — 💾 Backup, 📂 Restore |
| Undo system | ✅ Done | `undo.ts` — snapshot/restore, ↩ Undo button |
| Real-time multi-admin sync | ✅ Ready | `realtime.ts` — subscription framework, not yet wired to UI |
| Supabase Auth (replace password) | ❌ Not built |

## Technical Notes for Next Session
- **Supabase 1000 row limit**: Use RPC functions for large datasets. `get_lp_demand_by_sku()` aggregates 24k rows to ~350 SKU rows server-side.
- **Svelte 5 runes**: Files using `$state` must be `.svelte.ts` not plain `.ts`
- **TanStack Table**: Using `@tanstack/table-core` with custom adapter in `table.svelte.ts` (official Svelte 5 adapter not available yet)
- **Vercel adapter**: `@sveltejs/adapter-vercel` — local build fails on Windows (symlink perms) but Vercel builds fine on Linux
- **Build tag**: Bump `b0316x` in `+layout.svelte` header to verify deployments

## Three Modules
- **Vision 2026** (`v26`): Unified command view — dispatch volume chart, network map, cross-module stats
- **Load Plan** (`lp`): Warehouse dispatch from Dallas to MEX/CAN/USA satellite warehouses
  - 4 tabs: Arrivals, Demand, Plan, Late
  - LP engine: `LP_buildLoadPlan()` — bin-packing algorithm for truck loading
  - 8 destinations: TOR, VAN, CDMX, GDL, MTY, KC, HOU, NY
- **Last Mile** (`lm`): Final mile delivery from regional hubs to individual venues
  - Venue-based planning with truck capacity constraints
  - Lead time calculation (bump-in date minus transit, skipping weekends)

## Database Schema (v2)

### LP Module (12 tables)
| Table | Purpose | Key columns |
|---|---|---|
| `lp_settings` | Engine config (1 row) | turnaround, max_pallets, max_trucks, max_dests, ric_start_date, exclude_staples |
| `lp_destinations` | 8 LP destinations | abbr (PK), name, country, transit_days, whs_days |
| `lp_nomenclature` | SKU master | sku (PK), name, source, pallet_qty, pallet_spc, hs_code, country, unit_price |
| `lp_demand` | Material plan rows | sku, destination, required_qty |
| `lp_arrivals` | Container arrivals | sku, container, qty, arrival_date, ready_date, is_manual |
| `lp_plan` | Generated truck plan | truck_id, dispatch_date, destination, sku, qty, pallets |
| `lp_truck_dispatch` | Truck dispatch state | truck_id (PK), dispatched, lsr_number |
| `lp_container_overrides` | Manual arrival date overrides | container (PK), override_date |
| `lp_arrived_containers` | Arrived container flags | container_key (PK) |
| `lp_pallet_overrides` | Manual pallet dimension overrides | sku (PK), pallet_qty, pallet_spc |
| `lp_customs_overrides` | HS codes, country, price, customs name | sku (PK), hs_code, country, price, customs_name, hs_confirmed |
| `lp_holds` | Destination+SKU holds | destination, sku, hold_type (UNIQUE) |

### LM Module (14 tables)
| Table | Purpose |
|---|---|
| `lm_nomenclature` | LM SKU master (pallet dims, assembled dims) |
| `lm_demand` | Material plan (venue, sku, qty, bump-in date) |
| `lm_venue_settings` | Per-venue config (capacity, max trucks, lead time) |
| `lm_dispatch` | Truck dispatch state + date overrides |
| `lm_excluded` | Excluded items |
| `lm_manual_items` | Manual items added to trucks |
| `lm_demand_adj` | Demand quantity adjustments |
| `lm_nom_overrides` | Pallet dimension overrides |
| `lm_manual_demand` | Manually added demand entries |
| `lm_kits` + `lm_kit_items` | Kit definitions with child items (CASCADE delete) |
| `lm_stp_deliveries` | STP delivery schedule |
| `lm_dist_overrides` | Distribution rate overrides |
| `lm_pallet_config` | Pallet mode (dis/asm) per venue type |

### Shared (4 tables)
| Table | Purpose |
|---|---|
| `stock_report` | Stock SKUs with quantities |
| `app_settings` | Key-value settings (cluster turnaround, AI config) |
| `audit_log` | Who changed what (table, row_id, action, old/new data) |

### Views
- `v_lp_demand` — joins demand + nomenclature + pallet overrides + customs overrides (single query for demand table)
- `v_lp_truck_summary` — aggregates plan rows into truck summaries with dispatch state

### Design Principles
- Every mutable table has `created_at`, `updated_at` (auto-trigger), `updated_by`
- RLS enabled on all tables (currently permissive, upgrade to JWT-based later)
- `shared_state` table preserved — v1 continues to write to it independently

## Design Tokens
Defined in `app.css`, matching v1 exactly:

| Token | Value | Usage |
|---|---|---|
| `--ac` | `#CF5D5D` | Accent / primary red |
| `--as` | `#FDF0F0` | Accent surface |
| `--ab` | `#E8A5A5` | Accent border |
| `--gn` | `#12804A` | Green (success) |
| `--gs` | `#E6F5ED` | Green surface |
| `--or` | `#C4550A` | Orange (warnings) |
| `--os` | `#FEF3EB` | Orange surface |
| `--rd` | `#C62A2F` | Red (danger) |
| `--pu` | `#6E3FF3` | Purple (overrides) |
| `--ps` | `#F0EBFE` | Purple surface |
| `--tp` | `#111318` | Text primary |
| `--ts` | `#60646C` | Text secondary |
| `--tt` | `#9CA0AA` | Text tertiary |
| `--sf` | `#FFF` | Surface |
| `--bg` | `#F4F5F7` | Background |
| `--bd` | `#E2E4E9` | Border |
| `--fd` | DM Sans | UI font |
| `--fm` | IBM Plex Mono | Data/code font |

### Button Classes
- `.rbtn` — toolbar/inline buttons (11px, 6px radius)
- `.mbtn` — modal buttons (12px, 8px radius, 700 weight)
- `.mbtn-primary` — accent red, `.mbtn-danger` — red

## Key Business Logic (from v1, to be ported)

### LP Plan Engine
- Bin-packing: fills trucks by destination, respecting max pallets/trucks/dests per day
- Dispatched trucks are locked — regeneration only replans unlocked inventory
- Stock holds: if stock qty < demand, excess destinations get auto-held
- RIC start date: Richmond (USA domestic) trucks can't ship before this date

### LP Transit Defaults
| Destination | Transit Days | WHS Days | Country |
|---|---|---|---|
| Toronto | 7 | 3 | CAN |
| Vancouver | 7 | 3 | CAN |
| Mexico City | 7 | 3 | MEX |
| Guadalajara | 7 | 3 | MEX |
| Monterrey | 7 | 3 | MEX |
| Kansas City | 1 | 3 | USA |
| Houston | 1 | 3 | USA |
| New York NJ | 3 | 3 | USA |

### CI Export (Commercial Invoice)
- ExcelJS-based Excel generation with merged cells for party data
- Shipper (rows 12-17, A:D) / Consignee (E:I) / Broker (J:O)
- Party data varies by destination: Mexico / Canada / RIC / blank
- Customs overrides take priority: `co.hsCode||nm.hsCode`, `co.country||nm.country`, `co.price||nm.unitPrice`, `co.customsName||nm.name`
- Combined CI: multi-destination export summing demand across selected destinations

### HS Code Assistant
- 3-step wizard: siblings → AI classification → manual category drill-down
- AI providers: Claude Haiku, ChatGPT GPT-5 mini, Gemini Flash
- URL-first AI prompt for product identification from retailer URLs
- HS confirmation workflow: ○ unconfirmed / ✓ confirmed (green = ready for CI)
- `_hsNormalize()`: strips to 6-digit format XXXX.XX
- Sibling matching: only shows confirmed codes from same SKU prefix
- Google search button + clipboard auto-paste on tab return

### LM Plan Engine
- Pallet calculation: qty ÷ pallet_qty × pallet_spc = pallet count
- Date grouping: items grouped by bump-in date, dispatch = bump-in - lead_time (skip weekends)
- Truck filling: bin-pack items into trucks respecting capacity
- USA cluster trucks: add satellite warehouse turnaround to lead time
- Kit support: kit items expand into component SKUs with shared pallet dimensions

### Backup/Restore
- Excel-based: 20 sheets covering all state
- Includes: customs overrides, holds, locked rows, stock qtys, transit days, WHS days
- Excludes: AI API keys (security), filter state (ephemeral)

## Dev Environment
- **Node**: v24.14.0, **npm**: 11.9.0
- **SSL**: `npm config set strict-ssl false` required (FIFA corporate proxy)
- **Shell**: bash via PortableGit, use `.exe` suffix for Windows executables
- **Fork limitation**: msys2 programs (ls, grep) fail to fork — use Read/Grep/Glob tools
- **Git**: user.name=SM2ARTA, user.email=sm2arta@outlook.com
- **v1 repo**: `SM2ARTA/LM-3000` (GitHub Pages at sm2arta.github.io/LM-3000)
- **v2 repo**: `SM2ARTA/ML3K-v2` (Vercel at ml3k.smmarta.com)
- **No admin rights** on this machine (FIFA corporate domain)

## Commands
```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

## Post-Implementation Checklist (v2)

### Database
- [ ] New data goes to proper table, not shared_state
- [ ] Use `db.ts` functions for reads/writes — never raw Supabase calls in components
- [ ] Mutations debounced for rapid edits (use Svelte stores + save timers)
- [ ] Multi-admin safe: row-level updates, not bulk overwrites

### Components
- [ ] Use Svelte stores for shared state (`$role`, `$activeModule`, etc.)
- [ ] Admin-only elements check `$role === 'admin'`
- [ ] Use design tokens from `app.css` — no hardcoded colors
- [ ] `.rbtn` for toolbar, `.mbtn` for modals — never mix

### Exports
- [ ] CI exports use customs overrides: hs_code, country, price, customs_name
- [ ] HS codes normalized to XXXX.XX format
- [ ] Packing list and CI sheet both use override fallback chain

### Copyright
`©2026 Vladislav Abramov | SM²ARTA™`
