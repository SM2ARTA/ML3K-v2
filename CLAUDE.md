# ML3K v2 — FIFA World Cup 2026 Logistics Manager

## Project Overview
SvelteKit rebuild of ML3K (formerly single-file `index.html`). Ground transport logistics for FWC26 across USA, Canada, and Mexico.

## Architecture
- **Framework**: SvelteKit with TypeScript
- **Backend**: Supabase (PostgreSQL + Realtime)
- **Hosting**: TBD (Vercel recommended)
- **Build**: Vite
- **Original app**: Still running at `SM2ARTA/LM-3000` — this project runs in parallel

## Migration Strategy
- **Phase 1** (current): Read from `shared_state` JSON blobs via `migrate.ts` bridge
- **Phase 2**: Create proper database tables, write migration scripts
- **Phase 3**: Full feature parity with v1, switch users over
- **Phase 4**: Deprecate v1, remove `shared_state` dependency

## Supabase
- Project URL: `https://stwopndhnxcjyomkufii.supabase.co`
- Anon key in `.env` (public, safe to keep)
- Currently shares the same Supabase project as v1 — reads from `shared_state` table
- Future: proper tables (nomenclature, material_plan, trucks, customs_overrides, etc.)

## Project Structure
```
src/
├── lib/
│   ├── supabase.ts      — Supabase client init
│   ├── stores.ts        — Svelte stores (role, module, LP/LM state)
│   ├── migrate.ts       — Bridge: reads v1 shared_state data
│   └── index.ts         — Library exports
├── routes/
│   ├── +layout.svelte   — App shell (header, module switcher, auth gate)
│   └── +page.svelte     — Login + migration dashboard
├── app.css              — Design tokens (matches v1)
└── app.html             — HTML template with Google Fonts
```

## Design Tokens
Same as v1 — defined in `app.css`:
- `--ac` (#CF5D5D) accent red, `--gn` (#12804A) green, `--pu` (#6E3FF3) purple
- `--fd` DM Sans, `--fm` IBM Plex Mono
- Button classes: `.rbtn` (toolbar), `.mbtn` (modal)

## Three Modules
- **Vision 2026** (`v26`): Unified command view
- **Load Plan** (`lp`): Warehouse dispatch to MEX/CAN/RIC
- **Last Mile** (`lm`): Venue delivery planning

## Key Files from v1 to Migrate
| v1 Feature | v1 Location | v2 Target |
|---|---|---|
| LP Plan Engine | `LP_buildLoadPlan()` | `src/lib/lp/engine.ts` |
| LM Plan Engine | `bV()`, `numberAll()` | `src/lib/lm/engine.ts` |
| CI Export (ExcelJS) | `LP_exportCI_ExcelJS()` | `src/lib/exports/ci.ts` |
| HS Code Assistant | `LP_showHSLookup()` | `src/lib/components/HSLookup.svelte` |
| Supabase persistence | `LP_saveToSupabase()` | `src/lib/lp/persistence.ts` |
| Backup/Restore | `masterBackupExport()` | `src/lib/backup.ts` |

## Shared State Keys (v1 format, read by migrate.ts)
**LP keys**: `lp-config`, `lp-nom`, `lp-demand`, `lp-arrivals`, `lp-plan`, `lp-truck-state`
**LM keys**: `fm-nom`, `fm-rw`, `fm-vs`, `fm-stock`, `fm-lm-dispatch`, `fm-manual-items`, `fm-lm-demand-adj`, `fm-lm-nom-ovr`, `fm-cluster-ta`, `fm-lm-manual-demand`, `fm-lm-kits`, `fm-lm-stp-deliveries`, `fm-dist-overrides`, `fm-pallet-cfg`
**Other**: `hs-ai-config`

## Dev Environment
- **Node**: v24.14.0, **npm**: 11.9.0
- **SSL**: `npm config set strict-ssl false` required (FIFA corporate proxy)
- **Git**: user.name=SM2ARTA, user.email=sm2arta@outlook.com
- **No admin rights** on this machine

## Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
```
