-- Aggregated LP demand by SKU — returns ~658 rows instead of 24k
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_lp_demand_by_sku()
RETURNS TABLE (
  sku text,
  name text,
  source text,
  total_qty bigint,
  pallet_qty numeric,
  pallet_spc numeric,
  hs_code text,
  country text,
  unit_price numeric,
  customs_name text,
  hs_confirmed boolean,
  destinations jsonb
) AS $$
  SELECT
    d.sku,
    n.name,
    n.source,
    SUM(d.required_qty)::bigint AS total_qty,
    COALESCE(po.pallet_qty, MAX(d.pallet_qty), n.pallet_qty) AS pallet_qty,
    COALESCE(po.pallet_spc, MAX(d.pallet_spc), n.pallet_spc) AS pallet_spc,
    COALESCE(co.hs_code, n.hs_code) AS hs_code,
    COALESCE(co.country, n.country) AS country,
    COALESCE(co.price, n.unit_price) AS unit_price,
    co.customs_name,
    COALESCE(co.hs_confirmed, false) AS hs_confirmed,
    jsonb_object_agg(d.destination, d.required_qty) AS destinations
  FROM lp_demand d
  LEFT JOIN lp_nomenclature n ON n.sku = d.sku
  LEFT JOIN lp_pallet_overrides po ON po.sku = d.sku
  LEFT JOIN lp_customs_overrides co ON co.sku = d.sku
  GROUP BY d.sku, n.name, n.source, n.pallet_qty, n.pallet_spc,
           n.hs_code, n.country, n.unit_price,
           po.pallet_qty, po.pallet_spc,
           co.hs_code, co.country, co.price, co.customs_name, co.hs_confirmed
  ORDER BY d.sku;
$$ LANGUAGE sql STABLE;
