-- ============================================================================
-- ML3K v2 — PostgreSQL Schema Migration
-- FIFA World Cup 2026 Logistics Manager
-- ============================================================================
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This migration is idempotent: uses IF NOT EXISTS / CREATE OR REPLACE
-- The v1 shared_state table is preserved and untouched.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";   -- auto-update updated_at

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ENUM TYPES
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app_module AS ENUM ('lm', 'lp', 'v26');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pallet_mode AS ENUM ('dis', 'asm');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE country_group AS ENUM ('usa', 'can', 'mex');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. REFERENCE / LOOKUP TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- 2a. Venues (stadiums / sites)
-- Populated from Material Plan "Venue" column + venue metadata
CREATE TABLE IF NOT EXISTS venues (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL UNIQUE,               -- e.g. "AT&T Stadium"
  code          TEXT,                                -- e.g. "DAL" (from "Venue code")
  venue_type    TEXT,                                -- e.g. "Stadium", "Training Site"
  cluster       TEXT,                                -- e.g. "Dallas / Arlington"
  country_group country_group,                       -- usa / can / mex
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT                                 -- user identifier
);

CREATE INDEX IF NOT EXISTS idx_venues_cluster ON venues (cluster);
CREATE INDEX IF NOT EXISTS idx_venues_country ON venues (country_group);

-- 2b. LP Destinations (the 8 transit destinations)
-- Static reference: TOR, VAN, GDL, CDMX, MTY, NY, KC, HOU
CREATE TABLE IF NOT EXISTS lp_destinations (
  abbr          TEXT PRIMARY KEY,                    -- e.g. "TOR"
  city_name     TEXT NOT NULL,                       -- e.g. "Toronto"
  country_group country_group NOT NULL,              -- can / mex / usa
  transit_days  INT NOT NULL DEFAULT 3,              -- editable transit days
  whs_days      INT NOT NULL DEFAULT 3,              -- satellite warehouse processing days
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 8 fixed destinations
INSERT INTO lp_destinations (abbr, city_name, country_group, transit_days, whs_days) VALUES
  ('TOR', 'Toronto',      'can', 7, 3),
  ('VAN', 'Vancouver',    'can', 7, 3),
  ('GDL', 'Guadalajara',  'mex', 7, 3),
  ('CDMX','Mexico City',  'mex', 7, 3),
  ('MTY', 'Monterrey',    'mex', 7, 3),
  ('NY',  'New York',     'usa', 3, 3),
  ('KC',  'Kansas City',  'usa', 1, 3),
  ('HOU', 'Houston',      'usa', 1, 3)
ON CONFLICT (abbr) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. NOMENCLATURE (shared product catalog)
-- ────────────────────────────────────────────────────────────────────────────

-- 3a. LM Nomenclature — keyed by SKU code
-- Source: fm-nom (v1 key), parsed from uploaded Nomenclature Excel
CREATE TABLE IF NOT EXISTS lm_nomenclature (
  sku           TEXT PRIMARY KEY,                    -- e.g. "CTBAR-001-002"
  name          TEXT NOT NULL DEFAULT '',             -- nm in v1
  source        TEXT NOT NULL DEFAULT '',             -- src: "CT RNT", "CT RTL", "STP", etc.
  uom           TEXT NOT NULL DEFAULT 'pc',           -- unit of measure
  ppu           NUMERIC NOT NULL DEFAULT 1,           -- pieces per unit
  pallet_qty_dis NUMERIC NOT NULL DEFAULT 0,          -- pq: pallet quantity, disassembled
  pallet_spc_dis NUMERIC NOT NULL DEFAULT 0,          -- ps: pallet spaces, disassembled
  pallet_qty_asm NUMERIC NOT NULL DEFAULT 0,          -- pqA: pallet quantity, assembled
  pallet_spc_asm NUMERIC NOT NULL DEFAULT 0,          -- psA: pallet spaces, assembled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT
);

-- 3b. LP Nomenclature — keyed by SKU, separate from LM
-- Source: lp-nom (v1 key), parsed from uploaded LP Nomenclature Excel
CREATE TABLE IF NOT EXISTS lp_nomenclature (
  sku           TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT '',             -- supplier / source SKU
  pallet_qty    NUMERIC NOT NULL DEFAULT 0,           -- units per pallet (disassembled)
  pallet_spc    NUMERIC NOT NULL DEFAULT 0,           -- pallet spaces (disassembled)
  hs_code       TEXT NOT NULL DEFAULT '',              -- harmonized system code (6-digit: XXXX.XX)
  country       TEXT NOT NULL DEFAULT '',              -- country of origin
  unit_price    NUMERIC NOT NULL DEFAULT 0,            -- unit price for customs
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. LM MODULE TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- 4a. LM Material Plan (raw demand rows)
-- Source: fm-rw (v1 key), each row = one venue+SKU demand line
CREATE TABLE IF NOT EXISTS lm_material_plan (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_name      TEXT NOT NULL,                      -- "Venue" column
  sku             TEXT NOT NULL,                      -- "Nomenclature" column
  required_qty    INT NOT NULL DEFAULT 0,             -- "Required" column
  bump_in_date    DATE,                               -- "Estimated bump-in date"
  venue_cluster   TEXT,                               -- "Venue cluster"
  venue_code      TEXT,                               -- "Venue code"
  venue_type      TEXT,                               -- "Venue type"
  is_manual       BOOLEAN NOT NULL DEFAULT false,     -- injected by LM_MANUAL_DEMAND
  is_kit          BOOLEAN NOT NULL DEFAULT false,     -- injected by LM_KITS
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_lm_mp_venue ON lm_material_plan (venue_name);
CREATE INDEX IF NOT EXISTS idx_lm_mp_sku ON lm_material_plan (sku);
CREATE INDEX IF NOT EXISTS idx_lm_mp_venue_sku ON lm_material_plan (venue_name, sku);

-- 4b. LM Venue Settings
-- Source: fm-vs (v1 key). Per-venue overrides: truck capacity, max trucks, lead time, bump-in
CREATE TABLE IF NOT EXISTS lm_venue_settings (
  venue_name    TEXT PRIMARY KEY,
  truck_cap     INT,                                 -- tc: truck capacity in pallets (26 or 12)
  max_trucks    INT,                                 -- mt: max trucks per day
  lead_time     INT,                                 -- lt: lead time in days
  bump_in       TEXT,                                -- bi: bump-in date override (YYYY-MM-DD)
  extra         JSONB NOT NULL DEFAULT '{}',         -- future extensibility
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT
);

-- 4c. LM Excluded venues/items
-- Source: fm-excl + fm-excl-ovr (v1 keys)
CREATE TABLE IF NOT EXISTS lm_exclusions (
  item_id       TEXT PRIMARY KEY,                    -- truck/item fingerprint
  is_excluded   BOOLEAN NOT NULL DEFAULT true,       -- in LM_excluded set
  user_override BOOLEAN NOT NULL DEFAULT false,      -- has manual override
  override_val  BOOLEAN,                             -- the override value (true=force include, false=force exclude)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT
);

-- 4d. LM Dispatch State
-- Source: fm-lm-dispatch (v1 key). Tracks locked trucks and date overrides.
CREATE TABLE IF NOT EXISTS lm_dispatch (
  fingerprint   TEXT PRIMARY KEY,                    -- truck fingerprint
  is_locked     BOOLEAN NOT NULL DEFAULT false,      -- in LM_dispatched set
  date_override TEXT,                                -- manual date override (YYYY-MM-DD)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT
);

-- 4e. LM Demand Adjustments
-- Source: fm-lm-demand-adj (v1 key). "venue|sku" -> adjusted qty
CREATE TABLE IF NOT EXISTS lm_demand_adjustments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_name    TEXT NOT NULL,
  sku           TEXT NOT NULL,
  adjusted_qty  NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT,
  UNIQUE (venue_name, sku)
);

-- 4f. LM Nomenclature Overrides (pallet dimension overrides per SKU)
-- Source: fm-lm-nom-ovr (v1 key). Overrides pallet dims from the nom file.
CREATE TABLE IF NOT EXISTS lm_nom_overrides (
  sku             TEXT PRIMARY KEY,
  pallet_qty_dis  NUMERIC,                           -- pq override
  pallet_spc_dis  NUMERIC,                           -- ps override
  pallet_qty_asm  NUMERIC,                           -- pqA override
  pallet_spc_asm  NUMERIC,                           -- psA override
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 4g. LM Manual Demand entries
-- Source: fm-lm-manual-demand (v1 key)
-- [{sku,nm,src,venue,qty,biDate,cluster,venueCode,venueType,uom,ppu,pq,ps,pqA,psA}]
CREATE TABLE IF NOT EXISTS lm_manual_demand (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT '',
  venue_name      TEXT NOT NULL,
  qty             INT NOT NULL DEFAULT 0,
  bump_in_date    TEXT,                               -- YYYY-MM-DD
  cluster         TEXT,
  venue_code      TEXT,
  venue_type      TEXT,
  uom             TEXT NOT NULL DEFAULT 'pc',
  ppu             NUMERIC NOT NULL DEFAULT 1,
  pallet_qty_dis  NUMERIC NOT NULL DEFAULT 0,
  pallet_spc_dis  NUMERIC NOT NULL DEFAULT 0,
  pallet_qty_asm  NUMERIC NOT NULL DEFAULT 0,
  pallet_spc_asm  NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 4h. LM Kits
-- Source: fm-lm-kits (v1 key)
-- [{id,sku,name,venue,items:[{sku,qty}],pq,ps}]
CREATE TABLE IF NOT EXISTS lm_kits (
  id              TEXT PRIMARY KEY,                   -- e.g. "KIT-1"
  sku             TEXT NOT NULL,                      -- kit SKU code
  name            TEXT NOT NULL DEFAULT '',
  venue_name      TEXT NOT NULL,
  pallet_qty      NUMERIC,                           -- pq (nullable = use default)
  pallet_spc      NUMERIC,                           -- ps (nullable = use default)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

CREATE TABLE IF NOT EXISTS lm_kit_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kit_id          TEXT NOT NULL REFERENCES lm_kits(id) ON DELETE CASCADE,
  sku             TEXT NOT NULL,
  qty             INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kit_items_kit ON lm_kit_items (kit_id);

-- 4i. LM STP Deliveries
-- Source: fm-lm-stp-deliveries (v1 key)
-- [{id,venue,date,rate}]
CREATE TABLE IF NOT EXISTS lm_stp_deliveries (
  id              TEXT PRIMARY KEY,                   -- e.g. "STP-1"
  venue_name      TEXT NOT NULL,
  delivery_date   TEXT,                               -- YYYY-MM-DD
  rate            NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 4j. LM Manual Items (per-truck manual line items)
-- Source: fm-manual-items (v1 key)
-- MANUAL_ITEMS = { "LP-truckId" or "LM-fp": [{sku,name,qty,pallets}] }
CREATE TABLE IF NOT EXISTS lm_manual_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  truck_key       TEXT NOT NULL,                      -- "LP-truckId" or "LM-fingerprint"
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  qty             INT NOT NULL DEFAULT 0,
  pallets         NUMERIC NOT NULL DEFAULT 0,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_manual_items_truck ON lm_manual_items (truck_key);

-- 4k. LM Distribution Rate Overrides
-- Source: fm-dist-overrides (v1 key). DIST_OVERRIDES = { key: rate }
CREATE TABLE IF NOT EXISTS lm_dist_overrides (
  key             TEXT PRIMARY KEY,                   -- override key
  rate            NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 4l. LM Pallet Config (per venue type)
-- Source: fm-pallet-cfg (v1 key). LM_palletCfg = { venueType: {mode:'dis'|'asm', overrides:Set(sku)} }
CREATE TABLE IF NOT EXISTS lm_pallet_config (
  venue_type      TEXT PRIMARY KEY,
  mode            pallet_mode NOT NULL DEFAULT 'dis',
  override_skus   TEXT[] NOT NULL DEFAULT '{}',       -- SKUs that are OPPOSITE of mode
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 4m. LM Cluster Turnaround
-- Source: fm-cluster-ta (v1 key). Single integer value.
CREATE TABLE IF NOT EXISTS lm_config (
  key             TEXT PRIMARY KEY,
  value           JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- Seed cluster turnaround default
INSERT INTO lm_config (key, value) VALUES ('cluster_turnaround', '5')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. STOCK REPORT
-- ────────────────────────────────────────────────────────────────────────────
-- Source: fm-stock (v1 key). STOCK_SKUS (Set), STOCK_QTYS (obj), STOCK_REPORT_NAME (string)
CREATE TABLE IF NOT EXISTS stock_report (
  sku             TEXT PRIMARY KEY,
  qty             NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_report_meta (
  key             TEXT PRIMARY KEY DEFAULT 'current',
  report_name     TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

INSERT INTO stock_report_meta (key, report_name) VALUES ('current', '')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. LP MODULE TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- 6a. LP Config (engine settings)
-- Source: lp-config (v1 key)
CREATE TABLE IF NOT EXISTS lp_config (
  key             TEXT PRIMARY KEY DEFAULT 'current',
  turnaround      INT NOT NULL DEFAULT 6,
  max_pallets     INT NOT NULL DEFAULT 26,
  max_trucks      INT NOT NULL DEFAULT 4,
  max_dests       INT NOT NULL DEFAULT 2,
  ric_start_date  TEXT NOT NULL DEFAULT '2026-04-01', -- YYYY-MM-DD
  plan_generated  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

INSERT INTO lp_config (key) VALUES ('current')
ON CONFLICT (key) DO NOTHING;

-- 6b. LP Material Plan (demand rows)
-- Source: lp-demand (v1 key)
-- {uid, destination, sku, name, requiredQty, rawPallets, inputMode, palletQty, palletSpc, sourceIds}
CREATE TABLE IF NOT EXISTS lp_material_plan (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid             TEXT NOT NULL,                      -- unique row ID from Excel
  destination     TEXT NOT NULL,                      -- venue cluster / destination name
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  required_qty    NUMERIC NOT NULL DEFAULT 0,
  raw_pallets     NUMERIC NOT NULL DEFAULT 0,
  input_mode      TEXT NOT NULL DEFAULT 'qty',        -- 'qty' or 'pallets'
  pallet_qty      NUMERIC NOT NULL DEFAULT 0,         -- from nomenclature join
  pallet_spc      NUMERIC NOT NULL DEFAULT 0,         -- from nomenclature join
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_mp_sku ON lp_material_plan (sku);
CREATE INDEX IF NOT EXISTS idx_lp_mp_dest ON lp_material_plan (destination);

-- 6c. LP Arrivals (FF&E container arrivals)
-- Source: lp-arrivals (v1 key)
-- {sku, name, arrivalDate, readyDate, availPallets, container, qty, _manual, _localName, _origArrDate}
CREATE TABLE IF NOT EXISTS lp_arrivals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  container       TEXT NOT NULL DEFAULT '',            -- container number
  group_name      TEXT NOT NULL DEFAULT '',            -- _localName
  arrival_date    TEXT,                                -- YYYY-MM-DD (planned delivery)
  ready_date      TEXT,                                -- YYYY-MM-DD (arrival + turnaround)
  orig_arr_date   TEXT,                                -- original arrival date before overrides
  qty             NUMERIC NOT NULL DEFAULT 0,
  avail_pallets   NUMERIC NOT NULL DEFAULT 0,
  is_manual       BOOLEAN NOT NULL DEFAULT false,      -- added via LP_addArrivalItem()
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_arr_sku ON lp_arrivals (sku);
CREATE INDEX IF NOT EXISTS idx_lp_arr_container ON lp_arrivals (container);

-- 6d. LP Generated Plan (truck load plan output)
-- Source: lp-plan (v1 key)
-- {truckId, date, destination, sku, name, qty, pallets}
CREATE TABLE IF NOT EXISTS lp_plan_rows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  truck_id        TEXT NOT NULL,                       -- e.g. "T001"
  dispatch_date   TEXT NOT NULL,                       -- YYYY-MM-DD
  destination     TEXT NOT NULL,
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  qty             NUMERIC NOT NULL DEFAULT 0,
  pallets         NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_plan_truck ON lp_plan_rows (truck_id);
CREATE INDEX IF NOT EXISTS idx_lp_plan_date ON lp_plan_rows (dispatch_date);
CREATE INDEX IF NOT EXISTS idx_lp_plan_dest ON lp_plan_rows (destination);

-- 6e. LP Truck State — dispatched trucks
-- Source: lp-truck-state → dispatched array
CREATE TABLE IF NOT EXISTS lp_truck_dispatch (
  truck_id        TEXT PRIMARY KEY,
  is_dispatched   BOOLEAN NOT NULL DEFAULT true,
  lsr_number      TEXT,                                -- e.g. "LSR625-001"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 6f. LP Container Date Overrides
-- Source: lp-truck-state → contDateOverrides
CREATE TABLE IF NOT EXISTS lp_container_date_overrides (
  container       TEXT PRIMARY KEY,                    -- container name
  override_date   TEXT NOT NULL,                       -- YYYY-MM-DD
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 6g. LP Arrived Containers
-- Source: lp-truck-state → arrivedConts
CREATE TABLE IF NOT EXISTS lp_arrived_containers (
  container_key   TEXT PRIMARY KEY,
  arrived_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 6h. LP Pallet Overrides (per SKU)
-- Source: lp-truck-state → palletOverrides
-- {sku: {palletQty, palletSpc}}
CREATE TABLE IF NOT EXISTS lp_pallet_overrides (
  sku             TEXT PRIMARY KEY,
  pallet_qty      NUMERIC,
  pallet_spc      NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 6i. LP Customs Overrides (per SKU)
-- Source: lp-truck-state → customsOverrides
-- {sku: {hsCode, country, price, customsName, hsConfirmed}}
CREATE TABLE IF NOT EXISTS lp_customs_overrides (
  sku             TEXT PRIMARY KEY,
  hs_code         TEXT,                                -- 6-digit HS code (XXXX.XX)
  country         TEXT,                                -- country of origin
  unit_price      NUMERIC,                             -- customs unit price
  customs_name    TEXT,                                -- short customs description (5-8 words)
  hs_confirmed    BOOLEAN NOT NULL DEFAULT false,      -- manually confirmed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 6j. LP Holds (dest|sku pairs excluded from plan generation)
-- Source: lp-truck-state → holds
CREATE TABLE IF NOT EXISTS lp_holds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  destination     TEXT NOT NULL,
  sku             TEXT NOT NULL,
  hold_type       TEXT NOT NULL DEFAULT 'manual',      -- 'manual' or 'stock'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT,
  UNIQUE (destination, sku, hold_type)
);

CREATE INDEX IF NOT EXISTS idx_lp_holds_dest ON lp_holds (destination);

-- 6k. LP Locked Rows (plan rows locked from regeneration)
-- Source: lp-truck-state → lockedRows
CREATE TABLE IF NOT EXISTS lp_locked_rows (
  row_key         TEXT PRIMARY KEY,                    -- serialized row identifier
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- 6l. LP Engine Settings Flag
-- Source: lp-truck-state → excludeStaples
CREATE TABLE IF NOT EXISTS lp_settings (
  key             TEXT PRIMARY KEY,
  value           JSONB NOT NULL DEFAULT 'true',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

INSERT INTO lp_settings (key, value) VALUES ('exclude_staples', 'true')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. HS CODE AI CONFIG
-- ────────────────────────────────────────────────────────────────────────────
-- Source: hs-ai-config (v1 key). Stores AI provider + API key.
-- Excluded from backup (security). Cleared on system reset.
CREATE TABLE IF NOT EXISTS hs_ai_config (
  key             TEXT PRIMARY KEY DEFAULT 'current',
  provider        TEXT,                                -- 'claude', 'chatgpt', 'gemini'
  api_key         TEXT,                                -- encrypted in production
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. AUDIT LOG
-- ────────────────────────────────────────────────────────────────────────────
-- Tracks all write operations for multi-admin conflict resolution
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name      TEXT NOT NULL,
  record_id       TEXT,                                -- primary key of affected row
  action          TEXT NOT NULL,                        -- 'INSERT', 'UPDATE', 'DELETE'
  old_data        JSONB,
  new_data        JSONB,
  user_id         TEXT,                                -- who made the change
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. AUTO-UPDATE updated_at TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────
-- Uses moddatetime extension for automatic updated_at maintenance

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'venues',
      'lp_destinations',
      'lm_nomenclature',
      'lp_nomenclature',
      'lm_material_plan',
      'lm_venue_settings',
      'lm_exclusions',
      'lm_dispatch',
      'lm_demand_adjustments',
      'lm_nom_overrides',
      'lm_manual_demand',
      'lm_kits',
      'lm_stp_deliveries',
      'lm_manual_items',
      'lm_dist_overrides',
      'lm_pallet_config',
      'lm_config',
      'stock_report',
      'stock_report_meta',
      'lp_config',
      'lp_material_plan',
      'lp_arrivals',
      'lp_plan_rows',
      'lp_truck_dispatch',
      'lp_container_date_overrides',
      'lp_arrived_containers',
      'lp_pallet_overrides',
      'lp_customs_overrides',
      'lp_holds',
      'lp_settings',
      'hs_ai_config'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; '
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. AUDIT LOG TRIGGER FUNCTION
-- ────────────────────────────────────────────────────────────────────────────
-- Attach to tables where you want change history

CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', to_jsonb(NEW), current_setting('app.user_id', true));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), current_setting('app.user_id', true));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', to_jsonb(OLD), current_setting('app.user_id', true));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach audit triggers to key mutable tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'lm_venue_settings',
      'lm_exclusions',
      'lm_dispatch',
      'lm_demand_adjustments',
      'lm_nom_overrides',
      'lm_manual_demand',
      'lm_kits',
      'lm_stp_deliveries',
      'lm_manual_items',
      'lm_pallet_config',
      'lp_truck_dispatch',
      'lp_customs_overrides',
      'lp_holds',
      'lp_pallet_overrides',
      'stock_report'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS audit_trigger ON %I; '
      'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. ROW-LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────────────────────
-- Pattern: everyone can SELECT (viewer + admin), only admin can INSERT/UPDATE/DELETE
-- Role is determined by app.role session variable set by the frontend via Supabase RPC

-- Enable RLS on all v2 tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'venues',
      'lp_destinations',
      'lm_nomenclature',
      'lp_nomenclature',
      'lm_material_plan',
      'lm_venue_settings',
      'lm_exclusions',
      'lm_dispatch',
      'lm_demand_adjustments',
      'lm_nom_overrides',
      'lm_manual_demand',
      'lm_kits',
      'lm_kit_items',
      'lm_stp_deliveries',
      'lm_manual_items',
      'lm_dist_overrides',
      'lm_pallet_config',
      'lm_config',
      'stock_report',
      'stock_report_meta',
      'lp_config',
      'lp_material_plan',
      'lp_arrivals',
      'lp_plan_rows',
      'lp_truck_dispatch',
      'lp_container_date_overrides',
      'lp_arrived_containers',
      'lp_pallet_overrides',
      'lp_customs_overrides',
      'lp_holds',
      'lp_locked_rows',
      'lp_settings',
      'hs_ai_config',
      'audit_log'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

    -- Allow anon (public) reads on all tables
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I; '
      'CREATE POLICY %I ON %I FOR SELECT TO anon USING (true);',
      'select_' || tbl, tbl,
      'select_' || tbl, tbl
    );

    -- Allow anon writes (admin check is done in app layer, matching v1 pattern)
    -- In production, replace with JWT-based role check:
    --   USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'admin')
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I; '
      'CREATE POLICY %I ON %I FOR INSERT TO anon WITH CHECK (true);',
      'insert_' || tbl, tbl,
      'insert_' || tbl, tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I; '
      'CREATE POLICY %I ON %I FOR UPDATE TO anon USING (true) WITH CHECK (true);',
      'update_' || tbl, tbl,
      'update_' || tbl, tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I; '
      'CREATE POLICY %I ON %I FOR DELETE TO anon USING (true);',
      'delete_' || tbl, tbl,
      'delete_' || tbl, tbl
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. HELPER VIEWS
-- ────────────────────────────────────────────────────────────────────────────

-- Demand with nomenclature joined (LM)
CREATE OR REPLACE VIEW v_lm_demand AS
SELECT
  mp.id,
  mp.venue_name,
  mp.sku,
  mp.required_qty,
  mp.bump_in_date,
  mp.venue_cluster,
  mp.venue_code,
  mp.venue_type,
  mp.is_manual,
  mp.is_kit,
  n.name AS nom_name,
  n.source AS nom_source,
  n.uom,
  n.ppu,
  COALESCE(ov.pallet_qty_dis, n.pallet_qty_dis) AS pallet_qty_dis,
  COALESCE(ov.pallet_spc_dis, n.pallet_spc_dis) AS pallet_spc_dis,
  COALESCE(ov.pallet_qty_asm, n.pallet_qty_asm) AS pallet_qty_asm,
  COALESCE(ov.pallet_spc_asm, n.pallet_spc_asm) AS pallet_spc_asm
FROM lm_material_plan mp
LEFT JOIN lm_nomenclature n ON n.sku = mp.sku
LEFT JOIN lm_nom_overrides ov ON ov.sku = mp.sku;

-- LP demand with nomenclature + customs overrides
CREATE OR REPLACE VIEW v_lp_demand AS
SELECT
  mp.id,
  mp.uid,
  mp.destination,
  mp.sku,
  mp.required_qty,
  n.name AS nom_name,
  n.source AS nom_source,
  COALESCE(po.pallet_qty, n.pallet_qty) AS pallet_qty,
  COALESCE(po.pallet_spc, n.pallet_spc) AS pallet_spc,
  COALESCE(co.hs_code, n.hs_code) AS hs_code,
  COALESCE(co.country, n.country) AS country,
  COALESCE(co.unit_price, n.unit_price) AS unit_price,
  COALESCE(co.customs_name, '') AS customs_name,
  COALESCE(co.hs_confirmed, false) AS hs_confirmed
FROM lp_material_plan mp
LEFT JOIN lp_nomenclature n ON n.sku = mp.sku
LEFT JOIN lp_pallet_overrides po ON po.sku = mp.sku
LEFT JOIN lp_customs_overrides co ON co.sku = mp.sku;

-- LP truck summary (for plan tab)
CREATE OR REPLACE VIEW v_lp_truck_summary AS
SELECT
  p.truck_id,
  p.dispatch_date,
  p.destination,
  COUNT(DISTINCT p.sku) AS sku_count,
  SUM(p.qty) AS total_qty,
  SUM(p.pallets) AS total_pallets,
  COALESCE(td.is_dispatched, false) AS is_dispatched,
  td.lsr_number
FROM lp_plan_rows p
LEFT JOIN lp_truck_dispatch td ON td.truck_id = p.truck_id
GROUP BY p.truck_id, p.dispatch_date, p.destination, td.is_dispatched, td.lsr_number
ORDER BY p.dispatch_date, p.truck_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. CONCURRENCY: OPTIMISTIC LOCKING SUPPORT
-- ────────────────────────────────────────────────────────────────────────────
-- The updated_at column on every table serves as the version vector.
-- Client reads updated_at, then on write includes:
--   UPDATE ... SET ... WHERE id = $1 AND updated_at = $2
-- If 0 rows affected, another admin edited first -> client refetches.
--
-- For bulk operations (plan generation), use a transaction:
--   BEGIN;
--   DELETE FROM lp_plan_rows;
--   INSERT INTO lp_plan_rows (...) VALUES ...;
--   COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. V1 COMPATIBILITY
-- ────────────────────────────────────────────────────────────────────────────
-- The shared_state table is PRESERVED. V1 continues to use it.
-- V2 migration functions can read from shared_state and write to the new tables.
-- Once v2 is stable, shared_state rows can be archived.

-- Convenience function to migrate a v1 JSON blob key into the new schema
-- Usage: SELECT migrate_v1_key('fm-nom') to read the blob
CREATE OR REPLACE FUNCTION get_v1_blob(p_key TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT value::JSONB INTO result
  FROM shared_state
  WHERE id = p_key;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────────────────────
-- Table count: 30 tables + 3 views + shared_state (preserved)
--
-- v1 key mapping to v2 tables:
--   fm-nom                -> lm_nomenclature
--   fm-rw                 -> lm_material_plan
--   fm-vs                 -> lm_venue_settings
--   fm-excl + fm-excl-ovr -> lm_exclusions
--   fm-stock              -> stock_report + stock_report_meta
--   fm-lm-dispatch        -> lm_dispatch
--   fm-manual-items       -> lm_manual_items
--   fm-lm-demand-adj      -> lm_demand_adjustments
--   fm-lm-nom-ovr        -> lm_nom_overrides
--   fm-cluster-ta         -> lm_config (key='cluster_turnaround')
--   fm-lm-manual-demand   -> lm_manual_demand
--   fm-lm-kits            -> lm_kits + lm_kit_items
--   fm-lm-stp-deliveries  -> lm_stp_deliveries
--   fm-dist-overrides     -> lm_dist_overrides
--   fm-pallet-cfg         -> lm_pallet_config
--   lp-config             -> lp_config
--   lp-nom                -> lp_nomenclature
--   lp-demand             -> lp_material_plan
--   lp-arrivals           -> lp_arrivals
--   lp-plan               -> lp_plan_rows
--   lp-truck-state        -> lp_truck_dispatch + lp_container_date_overrides
--                            + lp_arrived_containers + lp_pallet_overrides
--                            + lp_customs_overrides + lp_holds + lp_locked_rows
--                            + lp_settings (exclude_staples)
--                            + lp_destinations (transit_days, whs_days)
--   hs-ai-config          -> hs_ai_config
