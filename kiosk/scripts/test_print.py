#!/usr/bin/env python3
"""
Print a mock receipt for testing — no scan/order needed.

Usage on the Pi (stop the service first so it isn't holding the USB printer):
    sudo systemctl stop munchadda-kiosk.service
    sudo /opt/munchadda-kiosk/venv/bin/python /opt/munchadda-kiosk/scripts/test_print.py
    sudo systemctl start munchadda-kiosk.service
"""

import os
import sys

BASE = "/opt/munchadda-kiosk"
sys.path.insert(0, BASE)

import yaml  # noqa: E402
from printer import ThermalPrinter  # noqa: E402

# Load the printer config from kiosk.yaml (falls back to the example).
cfg_path = os.path.join(BASE, "config", "kiosk.yaml")
if not os.path.exists(cfg_path):
    cfg_path = os.path.join(BASE, "config", "kiosk.yaml.example")
with open(cfg_path, "r", encoding="utf-8") as fh:
    cfg = yaml.safe_load(fh) or {}

printer_cfg = cfg.get("printer", {})
print(f"Using printer config: {printer_cfg}")

printer = ThermalPrinter(printer_cfg)

mock_order = {
    "order_number": "CB-TEST-000001",
    "token_number": 7,
    "canteen_name": cfg.get("kiosk", {}).get("name", "Main Canteen"),
    "student_name": "Test Student",
    "items": [
        {"name": "Vada Pav", "quantity": 2, "unit_price_paise": 1500, "total_price_paise": 3000},
        {"name": "Masala Chai", "quantity": 1, "unit_price_paise": 1000, "total_price_paise": 1000},
        {"name": "Samosa", "quantity": 3, "unit_price_paise": 1200, "total_price_paise": 3600},
    ],
    "subtotal_paise": 7600,
    "tax_paise": 380,
    "total_paise": 7980,
    "gst_percent": 5,
}

ok = printer.print_receipt(mock_order)
print("Print result:", "SUCCESS" if ok else "FAILED (check log above)")
