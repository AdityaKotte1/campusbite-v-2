BEGIN;
-- assumes at least one canteen + one menu_item exist; pick them
DO $$
DECLARE c uuid; m uuid; mname text; o uuid; d1 date := current_date - 7; d2 date := current_date - 14;
BEGIN
  SELECT id INTO c FROM canteens LIMIT 1;
  SELECT id, name INTO m, mname FROM menu_items WHERE canteen_id = c LIMIT 1;
  INSERT INTO orders(id, order_number, user_id, canteen_id, status, payment_status, subtotal_paise, tax_paise, discount_paise, total_paise, created_at)
    VALUES (gen_random_uuid(),'TST1',(SELECT id FROM users LIMIT 1),c,'collected','paid',1000,0,0,1000, d1) RETURNING id INTO o;
  INSERT INTO order_items(order_id, menu_item_id, menu_item_name, quantity, unit_price_paise, total_price_paise) VALUES (o,m,mname,10,1000,10000);
  INSERT INTO orders(id, order_number, user_id, canteen_id, status, payment_status, subtotal_paise, tax_paise, discount_paise, total_paise, created_at)
    VALUES (gen_random_uuid(),'TST2',(SELECT id FROM users LIMIT 1),c,'collected','paid',1000,0,0,1000, d2) RETURNING id INTO o;
  INSERT INTO order_items(order_id, menu_item_id, menu_item_name, quantity, unit_price_paise, total_price_paise) VALUES (o,m,mname,20,1000,20000);
  RAISE NOTICE 'Forecast for %: %', mname,
    (SELECT predicted FROM forecast_canteen_demand(c, current_date) WHERE menu_item_id = m);
END $$;
ROLLBACK;
