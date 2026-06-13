# MunchAdda Kiosk

Self-service QR collection kiosk for campus canteens.  
Students scan the QR code from the MunchAdda app; the kiosk prints a
numbered receipt that they present at the counter to collect their order.

---

## 1. Hardware Requirements (BOM)

| Component | Model | Approx. Price (INR) |
|-----------|-------|---------------------|
| SBC | Raspberry Pi 4 Model B (2 GB RAM) | ₹4,500 |
| Display | Official 7" Raspberry Pi Touchscreen | ₹4,000 |
| Enclosure | Kiosk-style 7" case with stand | ₹1,200 |
| Printer | Xprinter XP-58IIH (58mm USB thermal) | ₹2,800 |
| Paper roll | 58mm × 30m thermal roll (10-pack) | ₹350 |
| Scanner | Honeywell 1450g USB 2D barcode scanner | ₹5,500 |
| MicroSD | SanDisk 32 GB Class 10 | ₹350 |
| Power supply | Official Pi 4 USB-C PSU (5V/3A) | ₹800 |
| USB hub | Powered 4-port USB hub (for printer + scanner) | ₹600 |
| **Total** | | **~₹20,100** |

> Budget alternative scanner: Netum C750 (~₹1,800) also works.

---

## 2. OS Setup

1. Download **Raspberry Pi OS Lite 64-bit** (Bookworm) from
   [raspberrypi.com/software](https://www.raspberrypi.com/software/).
2. Flash to MicroSD using Raspberry Pi Imager.
   - In Imager "Advanced settings": enable SSH, set hostname `munchadda-kiosk`,
     set username `pi`, set WiFi credentials.
3. Boot the Pi, SSH in:
   ```bash
   ssh pi@munchadda-kiosk.local
   ```

---

## 3. Installation

```bash
# Clone repository
sudo mkdir -p /opt/munchadda-kiosk
sudo git clone https://github.com/munchadda/kiosk.git /opt/munchadda-kiosk
sudo chown -R pi:pi /opt/munchadda-kiosk

# Run setup script (installs deps, creates kiosk user, sets up service)
cd /opt/munchadda-kiosk
sudo bash scripts/setup.sh
```

---

## 4. Config: config/kiosk.yaml

```bash
cp /opt/munchadda-kiosk/config/kiosk.yaml.example \
   /opt/munchadda-kiosk/config/kiosk.yaml
nano /opt/munchadda-kiosk/config/kiosk.yaml
```

Fields to fill in (get from MunchAdda Admin Panel → Kiosks):

| Field | Where to find |
|-------|---------------|
| `server.base_url` | e.g. `https://api.munchadda.com` |
| `kiosk.id` | Admin Panel → Kiosks → New Kiosk → UUID |
| `kiosk.api_key` | Same page, copy the generated key |
| `kiosk.canteen_id` | Admin Panel → Canteens → your canteen UUID |
| `kiosk.name` | Friendly name shown in admin dashboard |
| `printer.vendor_id` | From `lsusb` output (see section 5) |
| `printer.product_id` | From `lsusb` output |

---

## 5. Printer Setup

### Find USB IDs
```bash
lsusb
# Look for a line like:
# Bus 001 Device 003: ID 0483:5743 STMicroelectronics ...
# vendor_id = 0x0483   product_id = 0x5743
```

Update `config/kiosk.yaml`:
```yaml
printer:
  vendor_id: "0x0483"
  product_id: "0x5743"
```

### CUPS (optional, for test print)
```bash
sudo apt-get install -y cups
sudo systemctl enable cups
sudo usermod -aG lp kiosk

# Open CUPS web UI from another machine:
# http://munchadda-kiosk.local:631
```

### Test print
```bash
cd /opt/munchadda-kiosk
python3 -c "
from printer import ThermalPrinter
import yaml
cfg = yaml.safe_load(open('config/kiosk.yaml'))
p = ThermalPrinter(cfg['printer'])
p.print_receipt({
    'token_number': 42,
    'order_number': 'CB-TEST-000001',
    'canteen_name': 'Test Canteen',
    'items': [{'name': 'Masala Dosa', 'quantity': 2, 'total_price_paise': 7000}],
    'subtotal_paise': 7000,
    'gst_paise': 350,
    'total_paise': 7350,
})
print('Print OK')
"
```

---

## 6. Scanner Configuration

The Honeywell 1450g ships in USB HID (keyboard emulation) mode — no driver
needed.  Plug in and it works.

To verify the kiosk detects it:
```bash
# List input devices
python3 -c "import evdev; [print(evdev.InputDevice(p).name) for p in evdev.list_devices()]"
# Should list: Honeywell 1450g, or similar
```

If the name contains "barcode", "scanner", "honeywell", or "zebra" it will be
auto-detected.  Otherwise the kiosk falls back to keyboard input.

### QR content format
All MunchAdda QR codes encode:
```
munchadda://qr/<uuid>
```
Example: `munchadda://qr/550e8400-e29b-41d4-a716-446655440000`

---

## 7. Testing Checklist

Before going live, run through:

- [ ] `systemctl status munchadda-kiosk.service` shows `active (running)`
- [ ] Display shows "SCAN YOUR QR CODE" on deep blue background
- [ ] Scan a valid QR → green success screen + receipt prints
- [ ] Scan same QR again → orange "Already Collected" screen
- [ ] Scan expired/invalid QR → red error screen
- [ ] Disconnect Ethernet → "OFFLINE SCAN" badge appears on success
- [ ] Reconnect → pending syncs upload (check logs)
- [ ] `tail -f /opt/munchadda-kiosk/logs/kiosk.log` shows heartbeat every 60s
- [ ] Printer runs out of paper → `get_status()` returns `"error"` (check admin dash)
- [ ] Reboot Pi → kiosk auto-starts within 20s

---

## 8. Troubleshooting

### Kiosk won't start
```bash
journalctl -u munchadda-kiosk.service -n 50
tail -50 /opt/munchadda-kiosk/logs/kiosk.log
```

### Display is blank / Tkinter crash
```bash
# Check DISPLAY env var
echo $DISPLAY           # should be :0

# Try running manually as kiosk user
sudo -u kiosk DISPLAY=:0 python3 /opt/munchadda-kiosk/main.py
```

### Printer not found
```bash
lsusb                  # confirm USB IDs
python3 -c "from escpos.printer import Usb; p = Usb(0x0483, 0x5743); print('OK')"
# If permission denied:
sudo chmod 666 /dev/bus/usb/<bus>/<device>
# Permanent fix: udev rule in scripts/setup.sh already does this
```

### Scanner not detected via evdev
```bash
# Run as root to bypass permissions temporarily
sudo python3 -c "
import evdev
for p in evdev.list_devices():
    d = evdev.InputDevice(p)
    print(d.path, d.name)
"
# Add kiosk user to input group (setup.sh does this)
sudo usermod -aG input kiosk
# Logout and back in, or restart service
```

### Offline mode not working
```bash
# Check DB
sqlite3 /opt/munchadda-kiosk/db/kiosk.db
sqlite> SELECT count(*) FROM token_cache;
sqlite> SELECT count(*) FROM sync_queue WHERE sync_status='pending';
```

### API 401 Unauthorized
- Check `kiosk.id` and `kiosk.api_key` in `config/kiosk.yaml`
- Ensure Pi clock is synced: `timedatectl status` → `System clock synchronized: yes`
- If clock is wrong: `sudo timedatectl set-ntp true`

---

## 9. Staff Training (5-minute version)

**What the kiosk does:**
When a student shows their phone with the MunchAdda order QR code, they hold
it in front of the scanner (about 5–20 cm away). The screen turns green with
a big number — that's the token number. Hand them the printed receipt and
tell them to wait for their number to be called.

**Normal screens:**
- **Deep blue "SCAN YOUR QR CODE"** — idle, ready for next customer
- **Blue "Processing…"** — reading the QR, takes under 2 seconds
- **Green + big number** — order confirmed, print receipt
- **Orange "Already Collected"** — this QR was used before; ask student to
  show the receipt or speak to the manager
- **Red error** — invalid/expired QR; ask student to re-open the app and
  ensure they have an active order

**Offline badge (amber "OFFLINE SCAN"):**  
The kiosk is temporarily offline but accepted the scan locally. The order
IS valid — give them their food. The data will sync automatically when
connectivity is restored.

**If the screen freezes:**  
Wait 10 seconds — the service auto-restarts. If it doesn't, call IT support.
Do NOT power-cycle the Pi without calling IT — pending syncs may be lost if
you do it while offline.

**Printer jams / out of paper:**  
Open the printer cover, remove jam or load new roll (thermal side out —
scratch the paper lightly to confirm which side is thermal), close, and press
the Feed button once. The next scan will print normally.

---

## Appendix: Log locations

| File | Purpose |
|------|---------|
| `/opt/munchadda-kiosk/logs/kiosk.log` | Main application log |
| `/opt/munchadda-kiosk/logs/update.log` | Auto-update cron log |
| `/opt/munchadda-kiosk/db/kiosk.db` | SQLite: token cache + sync queue |
