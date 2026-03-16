-- ============================================================================
-- ML3K v2 — Data Migration from shared_state JSON blobs to proper tables
-- Run this AFTER 001_initial_schema.sql in Supabase SQL Editor
-- ============================================================================
-- This reads v1 data and populates v2 tables. Safe to run multiple times
-- (uses INSERT ... ON CONFLICT DO NOTHING or truncates first).
-- The shared_state table is NOT modified — v1 keeps working.
-- ============================================================================

-- ── Set datestyle to handle DD.MM.YYYY format from v1 ──
SET datestyle = 'ISO, DMY';

-- ── Helper to parse v1 JSON ──
CREATE OR REPLACE FUNCTION _v1(key_id text) RETURNS jsonb AS $$
  SELECT value::jsonb FROM shared_state WHERE id = key_id;
$$ LANGUAGE sql STABLE;

-- ── Helper to safely parse dates in various formats ──
CREATE OR REPLACE FUNCTION _safe_date(val text) RETURNS date AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN NULL; END IF;
  RETURN val::date;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- LP CONFIG
-- ============================================================================
DO $$
DECLARE cfg jsonb := _v1('lp-config');
BEGIN
  IF cfg IS NOT NULL THEN
    UPDATE lp_settings SET
      turnaround = COALESCE((cfg->>'turnaround')::int, 6),
      max_pallets = COALESCE((cfg->>'maxPallets')::int, 26),
      max_trucks = COALESCE((cfg->>'maxTrucks')::int, 4),
      max_dests = COALESCE((cfg->>'maxDests')::int, 3),
      ric_start_date = COALESCE((cfg->>'ricStartDate')::date, '2026-04-01'),
      plan_generated = COALESCE((cfg->>'planGenerated')::boolean, false)
    WHERE id = 1;
    RAISE NOTICE 'LP Config migrated';
  END IF;
END $$;

-- ============================================================================
-- LP NOMENCLATURE
-- ============================================================================
DO $$
DECLARE
  nom jsonb := _v1('lp-nom');
  k text; v jsonb;
BEGIN
  IF nom IS NULL THEN RAISE NOTICE 'No LP nomenclature data'; RETURN; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(nom) LOOP
    INSERT INTO lp_nomenclature (sku, name, source, pallet_qty, pallet_spc, hs_code, country, unit_price)
    VALUES (
      k,
      v->>'name',
      v->>'source',
      COALESCE((v->>'palletQty')::numeric, 0),
      COALESCE((v->>'palletSpc')::numeric, 0),
      v->>'hsCode',
      v->>'country',
      COALESCE((v->>'unitPrice')::numeric, 0)
    ) ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      source = EXCLUDED.source,
      pallet_qty = EXCLUDED.pallet_qty,
      pallet_spc = EXCLUDED.pallet_spc,
      hs_code = EXCLUDED.hs_code,
      country = EXCLUDED.country,
      unit_price = EXCLUDED.unit_price;
  END LOOP;
  RAISE NOTICE 'LP Nomenclature: % SKUs migrated', (SELECT count(*) FROM lp_nomenclature);
END $$;

-- ============================================================================
-- LP DEMAND (Material Plan)
-- ============================================================================
DO $$
DECLARE
  demand jsonb := _v1('lp-demand');
  item jsonb;
BEGIN
  IF demand IS NULL THEN RAISE NOTICE 'No LP demand data'; RETURN; END IF;
  DELETE FROM lp_demand; -- clean slate for re-migration
  FOR item IN SELECT * FROM jsonb_array_elements(demand) LOOP
    INSERT INTO lp_demand (sku, destination, required_qty, pallet_qty, pallet_spc)
    VALUES (
      item->>'sku',
      item->>'destination',
      COALESCE((item->>'requiredQty')::int, 0),
      COALESCE((item->>'palletQty')::numeric, 0),
      COALESCE((item->>'palletSpc')::numeric, 0)
    );
  END LOOP;
  RAISE NOTICE 'LP Demand: % rows migrated', (SELECT count(*) FROM lp_demand);
END $$;

-- ============================================================================
-- LP ARRIVALS
-- ============================================================================
DO $$
DECLARE
  arr jsonb := _v1('lp-arrivals');
  item jsonb;
BEGIN
  IF arr IS NULL THEN RAISE NOTICE 'No LP arrivals data'; RETURN; END IF;
  DELETE FROM lp_arrivals;
  FOR item IN SELECT * FROM jsonb_array_elements(arr) LOOP
    INSERT INTO lp_arrivals (sku, name, container, qty, arrival_date, ready_date, avail_pallets, is_manual, local_name, orig_arr_date)
    VALUES (
      item->>'sku',
      item->>'name',
      item->>'container',
      COALESCE((item->>'qty')::int, 0),
      _safe_date(item->>'arrivalDate'),
      _safe_date(item->>'readyDate'),
      COALESCE((item->>'availPallets')::numeric, 0),
      COALESCE((item->>'_manual')::boolean, false),
      item->>'_localName',
      _safe_date(item->>'_origArrDate')
    );
  END LOOP;
  RAISE NOTICE 'LP Arrivals: % rows migrated', (SELECT count(*) FROM lp_arrivals);
END $$;

-- ============================================================================
-- LP GENERATED PLAN
-- ============================================================================
DO $$
DECLARE
  plan jsonb := _v1('lp-plan');
  item jsonb;
BEGIN
  IF plan IS NULL THEN RAISE NOTICE 'No LP plan data'; RETURN; END IF;
  DELETE FROM lp_plan;
  FOR item IN SELECT * FROM jsonb_array_elements(plan) LOOP
    INSERT INTO lp_plan (truck_id, dispatch_date, destination, sku, name, qty, pallets)
    VALUES (
      COALESCE((item->>'truckId')::int, 0),
      _safe_date(item->>'date'),
      item->>'destination',
      item->>'sku',
      item->>'name',
      COALESCE((item->>'qty')::int, 0),
      COALESCE((item->>'pallets')::numeric, 0)
    );
  END LOOP;
  RAISE NOTICE 'LP Plan: % rows migrated', (SELECT count(*) FROM lp_plan);
END $$;

-- ============================================================================
-- LP TRUCK STATE (dispatched, LSR, holds, overrides, etc.)
-- ============================================================================
DO $$
DECLARE
  ts jsonb := _v1('lp-truck-state');
  item jsonb; k text; v jsonb;
  disp_arr jsonb; hold_arr jsonb; arrived_arr jsonb;
BEGIN
  IF ts IS NULL THEN RAISE NOTICE 'No LP truck state data'; RETURN; END IF;

  -- Dispatched trucks + LSR numbers
  disp_arr := ts->'dispatched';
  IF disp_arr IS NOT NULL THEN
    FOR item IN SELECT * FROM jsonb_array_elements(disp_arr) LOOP
      INSERT INTO lp_truck_dispatch (truck_id, dispatched)
      VALUES (item::int, true)
      ON CONFLICT (truck_id) DO UPDATE SET dispatched = true;
    END LOOP;
  END IF;

  -- LSR numbers
  IF ts->'lsrNumbers' IS NOT NULL THEN
    FOR k, v IN SELECT * FROM jsonb_each(ts->'lsrNumbers') LOOP
      INSERT INTO lp_truck_dispatch (truck_id, lsr_number)
      VALUES (k::int, v#>>'{}')
      ON CONFLICT (truck_id) DO UPDATE SET lsr_number = EXCLUDED.lsr_number;
    END LOOP;
  END IF;
  RAISE NOTICE 'LP Truck Dispatch: % rows', (SELECT count(*) FROM lp_truck_dispatch);

  -- Container date overrides
  IF ts->'contDateOverrides' IS NOT NULL THEN
    FOR k, v IN SELECT * FROM jsonb_each(ts->'contDateOverrides') LOOP
      INSERT INTO lp_container_overrides (container, override_date)
      VALUES (k, _safe_date(v#>>'{}'))
      ON CONFLICT (container) DO UPDATE SET override_date = EXCLUDED.override_date;
    END LOOP;
  END IF;

  -- Arrived containers
  arrived_arr := ts->'arrivedConts';
  IF arrived_arr IS NOT NULL THEN
    FOR item IN SELECT * FROM jsonb_array_elements(arrived_arr) LOOP
      INSERT INTO lp_arrived_containers (container_key)
      VALUES (item#>>'{}')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Pallet overrides
  IF ts->'palletOverrides' IS NOT NULL THEN
    FOR k, v IN SELECT * FROM jsonb_each(ts->'palletOverrides') LOOP
      INSERT INTO lp_pallet_overrides (sku, pallet_qty, pallet_spc)
      VALUES (k, (v->>'palletQty')::numeric, (v->>'palletSpc')::numeric)
      ON CONFLICT (sku) DO UPDATE SET
        pallet_qty = EXCLUDED.pallet_qty, pallet_spc = EXCLUDED.pallet_spc;
    END LOOP;
  END IF;
  RAISE NOTICE 'LP Pallet Overrides: % rows', (SELECT count(*) FROM lp_pallet_overrides);

  -- Customs overrides
  IF ts->'customsOverrides' IS NOT NULL THEN
    FOR k, v IN SELECT * FROM jsonb_each(ts->'customsOverrides') LOOP
      INSERT INTO lp_customs_overrides (sku, hs_code, country, price, customs_name, hs_confirmed)
      VALUES (
        k,
        v->>'hsCode',
        v->>'country',
        NULLIF(v->>'price', '')::numeric,
        v->>'customsName',
        COALESCE((v->>'hsConfirmed')::boolean, false)
      ) ON CONFLICT (sku) DO UPDATE SET
        hs_code = EXCLUDED.hs_code, country = EXCLUDED.country,
        price = EXCLUDED.price, customs_name = EXCLUDED.customs_name,
        hs_confirmed = EXCLUDED.hs_confirmed;
    END LOOP;
  END IF;
  RAISE NOTICE 'LP Customs Overrides: % rows', (SELECT count(*) FROM lp_customs_overrides);

  -- Holds
  hold_arr := ts->'holds';
  IF hold_arr IS NOT NULL THEN
    FOR item IN SELECT * FROM jsonb_array_elements(hold_arr) LOOP
      DECLARE
        parts text[] := string_to_array(item#>>'{}', '|');
      BEGIN
        IF array_length(parts, 1) = 2 THEN
          INSERT INTO lp_holds (destination, sku, hold_type)
          VALUES (parts[1], parts[2], 'manual')
          ON CONFLICT DO NOTHING;
        END IF;
      END;
    END LOOP;
  END IF;
  RAISE NOTICE 'LP Holds: % rows', (SELECT count(*) FROM lp_holds);

  -- Transit days (update lp_destinations)
  IF ts->'transitDays' IS NOT NULL THEN
    FOR k, v IN SELECT * FROM jsonb_each(ts->'transitDays') LOOP
      UPDATE lp_destinations SET transit_days = (v#>>'{}')::int WHERE abbr = k;
    END LOOP;
  END IF;

  -- Dest WHS days
  IF ts->'destWhsDays' IS NOT NULL THEN
    FOR k, v IN SELECT * FROM jsonb_each(ts->'destWhsDays') LOOP
      UPDATE lp_destinations SET whs_days = (v#>>'{}')::int WHERE abbr = k;
    END LOOP;
  END IF;

  -- Exclude staples
  UPDATE lp_settings SET exclude_staples = COALESCE((ts->>'excludeStaples')::boolean, true) WHERE id = 1;

  RAISE NOTICE 'LP Truck State fully migrated';
END $$;

-- ============================================================================
-- STOCK REPORT
-- ============================================================================
DO $$
DECLARE
  stock jsonb := _v1('fm-stock');
  sku_arr jsonb; qtys jsonb; rname text;
  s text;
BEGIN
  IF stock IS NULL THEN RAISE NOTICE 'No stock data'; RETURN; END IF;
  sku_arr := stock->'skus';
  qtys := stock->'qtys';
  rname := stock->>'name';
  IF sku_arr IS NULL THEN RETURN; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements_text(sku_arr) LOOP
    INSERT INTO stock_report (sku, qty, report_name)
    VALUES (s, NULLIF(qtys->>s, '')::numeric, rname)
    ON CONFLICT (sku) DO UPDATE SET
      qty = EXCLUDED.qty, report_name = EXCLUDED.report_name;
  END LOOP;
  RAISE NOTICE 'Stock Report: % SKUs migrated', (SELECT count(*) FROM stock_report);
END $$;

-- ============================================================================
-- AI CONFIG
-- ============================================================================
DO $$
DECLARE cfg jsonb := _v1('hs-ai-config');
BEGIN
  IF cfg IS NOT NULL THEN
    UPDATE app_settings SET value = cfg WHERE key = 'ai_config';
    RAISE NOTICE 'AI Config migrated';
  END IF;
END $$;

-- ============================================================================
-- LM NOMENCLATURE
-- ============================================================================
DO $$
DECLARE
  nom jsonb := _v1('fm-nom');
  k text; v jsonb;
BEGIN
  IF nom IS NULL THEN RAISE NOTICE 'No LM nomenclature data'; RETURN; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(nom) LOOP
    INSERT INTO lm_nomenclature (sku, name, source, uom, pcs_per_unit, pallet_qty, pallet_spc, pallet_qty_asm, pallet_spc_asm)
    VALUES (
      k,
      v->>'nm',
      v->>'src',
      COALESCE(v->>'uom', 'pc'),
      COALESCE((v->>'ppu')::int, 1),
      COALESCE((v->>'pq')::numeric, 0),
      COALESCE((v->>'ps')::numeric, 0),
      COALESCE((v->>'pqA')::numeric, 0),
      COALESCE((v->>'psA')::numeric, 0)
    ) ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name, source = EXCLUDED.source,
      pallet_qty = EXCLUDED.pallet_qty, pallet_spc = EXCLUDED.pallet_spc,
      pallet_qty_asm = EXCLUDED.pallet_qty_asm, pallet_spc_asm = EXCLUDED.pallet_spc_asm;
  END LOOP;
  RAISE NOTICE 'LM Nomenclature: % SKUs migrated', (SELECT count(*) FROM lm_nomenclature);
END $$;

-- ============================================================================
-- LM MATERIAL PLAN (Raw Data)
-- ============================================================================
DO $$
DECLARE
  rw jsonb := _v1('fm-rw');
  item jsonb;
BEGIN
  IF rw IS NULL THEN RAISE NOTICE 'No LM material plan data'; RETURN; END IF;
  DELETE FROM lm_demand WHERE NOT is_manual;
  FOR item IN SELECT * FROM jsonb_array_elements(rw) LOOP
    INSERT INTO lm_demand (venue, venue_code, venue_type, venue_cluster, sku, required_qty, bump_in_date, is_manual, is_kit)
    VALUES (
      item->>'Venue',
      item->>'Venue code',
      item->>'Venue type',
      item->>'Venue cluster',
      item->>'Nomenclature',
      COALESCE((item->>'Required')::int, 0),
      _safe_date(item->>'Estimated bump-in date'),
      COALESCE((item->>'_manual')::boolean, false),
      COALESCE((item->>'_kit')::boolean, false)
    );
  END LOOP;
  RAISE NOTICE 'LM Demand: % rows migrated', (SELECT count(*) FROM lm_demand);
END $$;

-- ============================================================================
-- LM VENUE SETTINGS
-- ============================================================================
DO $$
DECLARE
  vs jsonb := _v1('fm-vs');
  k text; v jsonb;
BEGIN
  IF vs IS NULL THEN RAISE NOTICE 'No LM venue settings'; RETURN; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(vs) LOOP
    INSERT INTO lm_venue_settings (venue, truck_capacity, max_trucks, lead_time, settings_json)
    VALUES (
      k,
      COALESCE((v->>'tc')::int, 26),
      COALESCE((v->>'mt')::int, 2),
      COALESCE((v->>'lt')::int, 3),
      v
    ) ON CONFLICT (venue) DO UPDATE SET
      truck_capacity = EXCLUDED.truck_capacity,
      max_trucks = EXCLUDED.max_trucks,
      lead_time = EXCLUDED.lead_time,
      settings_json = EXCLUDED.settings_json;
  END LOOP;
  RAISE NOTICE 'LM Venue Settings: % venues migrated', (SELECT count(*) FROM lm_venue_settings);
END $$;

-- ============================================================================
-- LM DISPATCH STATE
-- ============================================================================
DO $$
DECLARE
  disp jsonb := _v1('fm-lm-dispatch');
  dispatched_set jsonb; date_ovr jsonb;
  item jsonb; k text; v jsonb;
BEGIN
  IF disp IS NULL THEN RAISE NOTICE 'No LM dispatch data'; RETURN; END IF;
  dispatched_set := disp->'dispatched';
  date_ovr := disp->'dateOverrides';
  IF dispatched_set IS NOT NULL THEN
    FOR item IN SELECT * FROM jsonb_array_elements(dispatched_set) LOOP
      INSERT INTO lm_dispatch (fingerprint, dispatched)
      VALUES (item#>>'{}', true)
      ON CONFLICT (fingerprint) DO UPDATE SET dispatched = true;
    END LOOP;
  END IF;
  IF date_ovr IS NOT NULL THEN
    FOR k, v IN SELECT * FROM jsonb_each(date_ovr) LOOP
      INSERT INTO lm_dispatch (fingerprint, date_override)
      VALUES (k, _safe_date(v#>>'{}'))
      ON CONFLICT (fingerprint) DO UPDATE SET date_override = EXCLUDED.date_override;
    END LOOP;
  END IF;
  RAISE NOTICE 'LM Dispatch: % entries migrated', (SELECT count(*) FROM lm_dispatch);
END $$;

-- ============================================================================
-- LM DEMAND ADJUSTMENTS
-- ============================================================================
DO $$
DECLARE
  adj jsonb := _v1('fm-lm-demand-adj');
  k text; v jsonb;
BEGIN
  IF adj IS NULL THEN RAISE NOTICE 'No LM demand adjustments'; RETURN; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(adj) LOOP
    INSERT INTO lm_demand_adj (venue_sku, adjusted_qty)
    VALUES (k, (v#>>'{}')::int)
    ON CONFLICT (venue_sku) DO UPDATE SET adjusted_qty = EXCLUDED.adjusted_qty;
  END LOOP;
  RAISE NOTICE 'LM Demand Adjustments: % entries', (SELECT count(*) FROM lm_demand_adj);
END $$;

-- ============================================================================
-- LM NOM OVERRIDES
-- ============================================================================
DO $$
DECLARE
  ovr jsonb := _v1('fm-lm-nom-ovr');
  k text; v jsonb;
BEGIN
  IF ovr IS NULL THEN RAISE NOTICE 'No LM nom overrides'; RETURN; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(ovr) LOOP
    INSERT INTO lm_nom_overrides (sku, pallet_qty, pallet_spc, pallet_qty_asm, pallet_spc_asm)
    VALUES (
      k,
      (v->>'pq')::numeric,
      (v->>'ps')::numeric,
      (v->>'pqA')::numeric,
      (v->>'psA')::numeric
    ) ON CONFLICT (sku) DO UPDATE SET
      pallet_qty = EXCLUDED.pallet_qty, pallet_spc = EXCLUDED.pallet_spc,
      pallet_qty_asm = EXCLUDED.pallet_qty_asm, pallet_spc_asm = EXCLUDED.pallet_spc_asm;
  END LOOP;
  RAISE NOTICE 'LM Nom Overrides: % entries', (SELECT count(*) FROM lm_nom_overrides);
END $$;

-- ============================================================================
-- LM CLUSTER TURNAROUND
-- ============================================================================
DO $$
DECLARE ta jsonb := _v1('fm-cluster-ta');
BEGIN
  IF ta IS NOT NULL THEN
    UPDATE app_settings SET value = ta WHERE key = 'lm_cluster_turnaround';
    RAISE NOTICE 'LM Cluster Turnaround migrated';
  END IF;
END $$;

-- ============================================================================
-- DIST OVERRIDES
-- ============================================================================
DO $$
DECLARE
  ovr jsonb := _v1('fm-dist-overrides');
  k text; v jsonb;
BEGIN
  IF ovr IS NULL THEN RAISE NOTICE 'No dist overrides'; RETURN; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(ovr) LOOP
    INSERT INTO lm_dist_overrides (route_key, rate)
    VALUES (k, (v#>>'{}')::numeric)
    ON CONFLICT (route_key) DO UPDATE SET rate = EXCLUDED.rate;
  END LOOP;
  RAISE NOTICE 'Dist Overrides: % entries', (SELECT count(*) FROM lm_dist_overrides);
END $$;

-- ============================================================================
-- LM PALLET CONFIG
-- ============================================================================
DO $$
DECLARE
  cfg jsonb := _v1('fm-pallet-cfg');
  k text; v jsonb;
BEGIN
  IF cfg IS NULL THEN RAISE NOTICE 'No pallet config'; RETURN; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(cfg) LOOP
    INSERT INTO lm_pallet_config (venue_type, mode, override_skus)
    VALUES (
      k,
      COALESCE(v->>'mode', 'dis'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v->'overrides')), '{}')
    ) ON CONFLICT (venue_type) DO UPDATE SET
      mode = EXCLUDED.mode, override_skus = EXCLUDED.override_skus;
  END LOOP;
  RAISE NOTICE 'Pallet Config: % entries', (SELECT count(*) FROM lm_pallet_config);
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION COMPLETE';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'LP Nomenclature: % SKUs', (SELECT count(*) FROM lp_nomenclature);
  RAISE NOTICE 'LP Demand: % rows', (SELECT count(*) FROM lp_demand);
  RAISE NOTICE 'LP Arrivals: % items', (SELECT count(*) FROM lp_arrivals);
  RAISE NOTICE 'LP Plan: % rows', (SELECT count(*) FROM lp_plan);
  RAISE NOTICE 'LP Truck Dispatch: % trucks', (SELECT count(*) FROM lp_truck_dispatch);
  RAISE NOTICE 'LP Customs Overrides: % SKUs', (SELECT count(*) FROM lp_customs_overrides);
  RAISE NOTICE 'LP Holds: % entries', (SELECT count(*) FROM lp_holds);
  RAISE NOTICE 'LP Pallet Overrides: % entries', (SELECT count(*) FROM lp_pallet_overrides);
  RAISE NOTICE 'Stock Report: % SKUs', (SELECT count(*) FROM stock_report);
  RAISE NOTICE 'LM Nomenclature: % SKUs', (SELECT count(*) FROM lm_nomenclature);
  RAISE NOTICE 'LM Demand: % rows', (SELECT count(*) FROM lm_demand);
  RAISE NOTICE 'LM Venue Settings: % venues', (SELECT count(*) FROM lm_venue_settings);
  RAISE NOTICE 'LM Dispatch: % entries', (SELECT count(*) FROM lm_dispatch);
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'shared_state table UNTOUCHED — v1 still works';
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- Clean up helpers
DROP FUNCTION IF EXISTS _v1(text);
DROP FUNCTION IF EXISTS _safe_date(text);
RESET datestyle;
