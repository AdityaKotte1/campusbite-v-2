-- History-only demand forecast (Option A). Weekday average over the last 6 weeks
-- × a recent-trend factor clamped to [0.5, 2.0]. SECURITY DEFINER; the calling
-- route authorizes the canteen, so the function does no auth itself.
CREATE OR REPLACE FUNCTION public.forecast_canteen_demand(
  p_canteen_id uuid,
  p_target_date date
)
RETURNS TABLE(menu_item_id uuid, name text, predicted integer, basis text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow integer := extract(dow from p_target_date);
BEGIN
  RETURN QUERY
  WITH paid_items AS (
    SELECT oi.menu_item_id,
           oi.menu_item_name,
           oi.quantity,
           o.created_at::date AS order_date
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.canteen_id = p_canteen_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND o.created_at::date >= p_target_date - 42
      AND o.created_at::date <  p_target_date
  ),
  weekday AS (
    SELECT menu_item_id, menu_item_name,
           sum(quantity)::numeric AS qty,
           count(DISTINCT order_date) AS day_count
    FROM paid_items
    WHERE extract(dow from order_date) = v_dow
    GROUP BY menu_item_id, menu_item_name
  ),
  recent AS (
    SELECT menu_item_id, sum(quantity)::numeric / 14.0 AS daily
    FROM paid_items
    WHERE order_date >= p_target_date - 14
    GROUP BY menu_item_id
  ),
  prior AS (
    SELECT menu_item_id, sum(quantity)::numeric / 28.0 AS daily
    FROM paid_items
    WHERE order_date < p_target_date - 14
    GROUP BY menu_item_id
  )
  SELECT
    w.menu_item_id,
    w.menu_item_name,
    CASE WHEN w.day_count < 2 THEN NULL
         ELSE round(
           (w.qty / w.day_count) *
           CASE WHEN p.daily IS NULL OR p.daily = 0 THEN 1.0
                ELSE least(2.0, greatest(0.5, COALESCE(r.daily, 0) / p.daily))
           END
         )::int
    END AS predicted,
    CASE WHEN w.day_count < 2 THEN 'insufficient_data' ELSE 'history' END AS basis
  FROM weekday w
  LEFT JOIN recent r ON r.menu_item_id = w.menu_item_id
  LEFT JOIN prior  p ON p.menu_item_id = w.menu_item_id
  ORDER BY predicted DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.forecast_canteen_demand(uuid, date) TO service_role;
