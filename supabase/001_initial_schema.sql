-- ============================================================================
-- ML3K v2 — Initial Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================
-- NOTE: shared_state table is PRESERVED for v1 compatibility
-- ============================================================================

-- ── Helper: auto-update updated_at ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- LP MODULE — Load Plan
-- ============================================================================

-- LP Settings (engine config — one row)
CREATE TABLE lp_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  turnaround int DEFAULT 6,
  max_pallets int DEFAULT 26,
  max_trucks int DEFAULT 4,
  max_dests int DEFAULT 3,
  ric_start_date date DEFAULT '2026-04-01',
  plan_generated boolean DEFAULT false,
  exclude_staples boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
CREATE TRIGGER lp_settings_updated BEFORE UPDATE ON lp_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
INSERT INTO lp_settings DEFAULT VALUES;

-- LP Destinations (transit times + WHS processing days)
CREATE TABLE lp_destinations (
  abbr text PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL,
  transit_days int DEFAULT 3,
  whs_days int DEFAULT 3,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lp_dest_updated BEFORE UPDATE ON lp_destinations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO lp_destinations (abbr, name, country, transit_days, whs_days) VALUES
  ('TOR', 'Toronto', 'CAN', 7, 3),
  ('VAN', 'Vancouver', 'CAN', 7, 3),
  ('CDMX', 'Mexico City', 'MEX', 7, 3),
  ('GDL', 'Guadalajara', 'MEX', 7, 3),
  ('MTY', 'Monterrey', 'MEX', 7, 3),
  ('KC', 'Kansas City', 'USA', 1, 3),
  ('HOU', 'Houston', 'USA', 1, 3),
  ('NY', 'New York New Jersey', 'USA', 3, 3);

-- LP Nomenclature (SKU master)
CREATE TABLE lp_nomenclature (
  sku text PRIMARY KEY,
  name text,
  source text,
  pallet_qty numeric DEFAULT 0,
  pallet_spc numeric DEFAULT 0,
  hs_code text,
  country text,
  unit_price numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
CREATE TRIGGER lp_nom_updated BEFORE UPDATE ON lp_nomenclature FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LP Material Plan (demand)
CREATE TABLE lp_demand (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku text NOT NULL,
  destination text NOT NULL,
  required_qty int NOT NULL DEFAULT 0,
  pallet_qty numeric DEFAULT 0,
  pallet_spc numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lp_demand_sku ON lp_demand(sku);
CREATE INDEX idx_lp_demand_dest ON lp_demand(destination);

-- LP Arrivals
CREATE TABLE lp_arrivals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku text NOT NULL,
  name text,
  container text,
  qty int DEFAULT 0,
  arrival_date date,
  ready_date date,
  avail_pallets numeric DEFAULT 0,
  is_manual boolean DEFAULT false,
  local_name text,
  orig_arr_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lp_arrivals_sku ON lp_arrivals(sku);
CREATE INDEX idx_lp_arrivals_container ON lp_arrivals(container);
CREATE TRIGGER lp_arr_updated BEFORE UPDATE ON lp_arrivals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LP Generated Plan (truck loading — engine output)
CREATE TABLE lp_plan (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  truck_id int NOT NULL,
  dispatch_date date,
  destination text NOT NULL,
  sku text NOT NULL,
  name text,
  qty int DEFAULT 0,
  pallets numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lp_plan_truck ON lp_plan(truck_id);
CREATE INDEX idx_lp_plan_dest ON lp_plan(destination);

-- LP Truck Dispatch
CREATE TABLE lp_truck_dispatch (
  truck_id int PRIMARY KEY,
  dispatched boolean DEFAULT false,
  lsr_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
CREATE TRIGGER lp_td_updated BEFORE UPDATE ON lp_truck_dispatch FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LP Container Date Overrides
CREATE TABLE lp_container_overrides (
  container text PRIMARY KEY,
  override_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lp_co_updated BEFORE UPDATE ON lp_container_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LP Arrived Containers
CREATE TABLE lp_arrived_containers (
  container_key text PRIMARY KEY,
  arrived_at timestamptz DEFAULT now()
);

-- LP Pallet Overrides
CREATE TABLE lp_pallet_overrides (
  sku text PRIMARY KEY,
  pallet_qty numeric,
  pallet_spc numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
CREATE TRIGGER lp_po_updated BEFORE UPDATE ON lp_pallet_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LP Customs Overrides
CREATE TABLE lp_customs_overrides (
  sku text PRIMARY KEY,
  hs_code text,
  country text,
  price numeric,
  customs_name text,
  hs_confirmed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
CREATE TRIGGER lp_cust_updated BEFORE UPDATE ON lp_customs_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LP Holds
CREATE TABLE lp_holds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  destination text NOT NULL,
  sku text NOT NULL,
  hold_type text DEFAULT 'manual',
  created_at timestamptz DEFAULT now(),
  updated_by text,
  UNIQUE(destination, sku, hold_type)
);
CREATE INDEX idx_lp_holds_sku ON lp_holds(sku);

-- LP Locked Rows
CREATE TABLE lp_locked_rows (
  row_key text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- LM MODULE — Last Mile
-- ============================================================================

-- LM Nomenclature
CREATE TABLE lm_nomenclature (
  sku text PRIMARY KEY,
  name text,
  source text,
  uom text DEFAULT 'pc',
  pcs_per_unit int DEFAULT 1,
  pallet_qty numeric DEFAULT 0,
  pallet_spc numeric DEFAULT 0,
  pallet_qty_asm numeric DEFAULT 0,
  pallet_spc_asm numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lm_nom_updated BEFORE UPDATE ON lm_nomenclature FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LM Material Plan
CREATE TABLE lm_demand (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue text NOT NULL,
  venue_code text,
  venue_type text,
  venue_cluster text,
  sku text NOT NULL,
  required_qty int DEFAULT 0,
  bump_in_date date,
  is_manual boolean DEFAULT false,
  is_kit boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lm_demand_venue ON lm_demand(venue);
CREATE INDEX idx_lm_demand_sku ON lm_demand(sku);

-- LM Venue Settings
CREATE TABLE lm_venue_settings (
  venue text PRIMARY KEY,
  truck_capacity int DEFAULT 26,
  max_trucks int DEFAULT 2,
  lead_time int DEFAULT 3,
  bump_in_date date,
  settings_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
CREATE TRIGGER lm_vs_updated BEFORE UPDATE ON lm_venue_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LM Dispatch
CREATE TABLE lm_dispatch (
  fingerprint text PRIMARY KEY,
  dispatched boolean DEFAULT false,
  date_override date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lm_disp_updated BEFORE UPDATE ON lm_dispatch FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LM Excluded Items
CREATE TABLE lm_excluded (
  item_id text PRIMARY KEY,
  is_user_override boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- LM Manual Items
CREATE TABLE lm_manual_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  truck_key text NOT NULL,
  sku text NOT NULL,
  name text,
  qty int DEFAULT 0,
  pallets numeric DEFAULT 0,
  hs_code text,
  country text,
  unit_price numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lm_mi_truck ON lm_manual_items(truck_key);

-- LM Demand Adjustments
CREATE TABLE lm_demand_adj (
  venue_sku text PRIMARY KEY,
  adjusted_qty int NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lm_dadj_updated BEFORE UPDATE ON lm_demand_adj FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LM Nom Overrides
CREATE TABLE lm_nom_overrides (
  sku text PRIMARY KEY,
  pallet_qty numeric,
  pallet_spc numeric,
  pallet_qty_asm numeric,
  pallet_spc_asm numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lm_no_updated BEFORE UPDATE ON lm_nom_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LM Manual Demand
CREATE TABLE lm_manual_demand (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku text NOT NULL,
  name text,
  source text,
  venue text NOT NULL,
  qty int DEFAULT 0,
  bump_in_date date,
  cluster text,
  venue_code text,
  venue_type text,
  uom text DEFAULT 'pc',
  pcs_per_unit int DEFAULT 1,
  pallet_qty numeric DEFAULT 0,
  pallet_spc numeric DEFAULT 0,
  pallet_qty_asm numeric DEFAULT 0,
  pallet_spc_asm numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- LM Kits
CREATE TABLE lm_kits (
  id int PRIMARY KEY,
  sku text NOT NULL,
  name text,
  venue text NOT NULL,
  pallet_qty numeric DEFAULT 0,
  pallet_spc numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lm_kits_updated BEFORE UPDATE ON lm_kits FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LM Kit Items
CREATE TABLE lm_kit_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kit_id int NOT NULL REFERENCES lm_kits(id) ON DELETE CASCADE,
  sku text NOT NULL,
  qty int DEFAULT 0
);
CREATE INDEX idx_lm_ki_kit ON lm_kit_items(kit_id);

-- LM STP Deliveries
CREATE TABLE lm_stp_deliveries (
  id int PRIMARY KEY,
  venue text NOT NULL,
  delivery_date date,
  rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lm_stp_updated BEFORE UPDATE ON lm_stp_deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- LM Distribution Rate Overrides
CREATE TABLE lm_dist_overrides (
  route_key text PRIMARY KEY,
  rate numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- LM Pallet Config
CREATE TABLE lm_pallet_config (
  venue_type text PRIMARY KEY,
  mode text DEFAULT 'dis' CHECK (mode IN ('dis', 'asm')),
  override_skus text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER lm_pc_updated BEFORE UPDATE ON lm_pallet_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SHARED
-- ============================================================================

-- Stock Report
CREATE TABLE stock_report (
  sku text PRIMARY KEY,
  qty numeric,
  report_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER stock_updated BEFORE UPDATE ON stock_report FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- App Settings
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER app_set_updated BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
INSERT INTO app_settings (key, value) VALUES
  ('lm_cluster_turnaround', '5'),
  ('ai_config', '{}');

-- Audit Log
CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by text,
  changed_at timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_table ON audit_log(table_name, changed_at DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE VIEW v_lp_demand AS
SELECT
  d.id, d.sku, d.destination, d.required_qty,
  n.name, n.source,
  COALESCE(po.pallet_qty, d.pallet_qty, n.pallet_qty) AS pallet_qty,
  COALESCE(po.pallet_spc, d.pallet_spc, n.pallet_spc) AS pallet_spc,
  COALESCE(co.hs_code, n.hs_code) AS hs_code,
  COALESCE(co.country, n.country) AS country,
  COALESCE(co.price, n.unit_price) AS unit_price,
  co.customs_name, co.hs_confirmed
FROM lp_demand d
LEFT JOIN lp_nomenclature n ON n.sku = d.sku
LEFT JOIN lp_pallet_overrides po ON po.sku = d.sku
LEFT JOIN lp_customs_overrides co ON co.sku = d.sku;

CREATE VIEW v_lp_truck_summary AS
SELECT
  p.truck_id,
  MIN(p.dispatch_date) AS dispatch_date,
  p.destination,
  COUNT(DISTINCT p.sku) AS sku_count,
  SUM(p.qty) AS total_qty,
  SUM(p.pallets) AS total_pallets,
  td.dispatched,
  td.lsr_number
FROM lp_plan p
LEFT JOIN lp_truck_dispatch td ON td.truck_id = p.truck_id
GROUP BY p.truck_id, p.destination, td.dispatched, td.lsr_number;

-- ============================================================================
-- ROW LEVEL SECURITY (permissive — upgrade to JWT-based later)
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('shared_state', 'audit_log')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "anon_all" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
