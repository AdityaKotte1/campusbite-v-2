-- Per-canteen GST toggle.
-- gst_enabled = false  -> no GST charged on student orders at this canteen.
-- Rate itself comes from the existing canteens.tax_percentage column.
-- Default true + existing tax_percentage=5.00 means every current canteen keeps 5% GST.
ALTER TABLE canteens
  ADD COLUMN IF NOT EXISTS gst_enabled BOOLEAN NOT NULL DEFAULT true;
