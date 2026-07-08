
# Raspberry Pi Kiosk Setup (pin-to-point)

Fresh Raspberry Pi → running MunchAdda kiosk. This assumes **zero Linux knowledge** —
follow each step in order and copy-paste the commands exactly.

> **The most important setting:** the **API URL** the kiosk talks to is the
> **admin app's deployment URL** (the admin Vercel domain, e.g.
> `https://admin.munchadda.com`), **NOT** the student app URL. The kiosk calls the
> admin app's scan endpoint (`/api/v1/kiosk/scan`). If you point it at the student
> app, every scan will fail. **Get the exact admin app URL from whoever deployed the
> admin app.**

---

## 1. Flash the OS (on your computer)

1. On a laptop/desktop, install **Raspberry Pi Imager** from
   <https://www.raspberrypi.com/software/> and insert the microSD card.
2. Open Imager:
   - **Choose OS** → *Raspberry Pi OS (64-bit)*.
   - **Choose Storage** → your microSD card.
3. Click the **⚙ (gear / Edit Settings)** button before flashing and set:
   - **Hostname:** `munchadda-kiosk` (so you can reach it at `munchadda-kiosk.local`)
   - **Enable SSH** → "Use password authentication"
   - **Username & password** (write these down — e.g. user `pi`)
   - **Wi-Fi SSID + password** (and your Wi-Fi country)
4. Click **Save**, then **Write / Flash**. Wait for it to finish and verify.

## 2. Boot the Pi

1. Put the microSD card into the Pi.
2. Connect: **HDMI** to a screen, the **USB QR scanner**, and the **USB thermal printer**.
3. Plug in power. The Pi boots (first boot takes a minute or two).

## 3. Open a terminal

You have two options:

- **On the Pi:** if you flashed the Desktop image, open the Terminal app on the desktop.
- **From your computer (SSH — recommended):**
  ```bash
  ssh pi@munchadda-kiosk.local
  ```
  Replace `pi` with the username you set in step 1.

**Finding the Pi's IP** if `.local` doesn't resolve:
- Open your Wi-Fi router's admin page (usually `http://192.168.0.1` or `http://192.168.1.1`)
  and look in the device/DHCP client list for `munchadda-kiosk`.
- Then connect with the IP directly:
  ```bash
  ssh pi@192.168.1.42
  ```

## 4. Get your kiosk credentials

In the MunchAdda **admin app → Kiosks → Register Kiosk**, create a kiosk for this canteen, then copy:

| Value | Where |
|-------|-------|
| **Kiosk ID** | shown after registering |
| **API Key** | **shown once** — copy it now, you cannot see it again |
| **Canteen ID** | the canteen this kiosk serves |
| **API URL** | the **admin app deployment URL** (e.g. `https://admin.munchadda.com`) — ask whoever deployed the admin app |

## 5. Install — one command

Clone the repo and run the **one-shot bootstrap** from the `kiosk/` folder. It installs everything (packages, kiosk user, Python venv + deps, the auto-start service), **asks you for the credentials**, and writes the config for you — no hand-editing.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <your-repo-url> ~/munchadda
cd ~/munchadda/kiosk
sudo bash scripts/bootstrap-pi.sh
```

When it prompts, paste the values from **step 4**:
- **Kiosk ID**
- **API Key**
- **Canteen ID**
- **API URL** → the **admin app URL** (e.g. `https://admin.munchadda.com`)

It finishes with the kiosk service **enabled and running**.

> **Printer not the default model?** The bootstrap uses default thermal-printer USB IDs. If your scans don't print, find your printer's IDs and set them once:
> ```bash
> lsusb        # e.g. "ID 0483:5743 ..."  ->  vendor_id "0x0483", product_id "0x5743"
> sudo nano /opt/munchadda-kiosk/config/kiosk.yaml    # set printer.vendor_id / product_id
> sudo systemctl restart munchadda-kiosk
> ```

## 6. Reboot

```bash
sudo reboot
```

The Pi comes back up and **auto-starts the kiosk**. Scan an order QR (from the
MunchAdda student app) and confirm a receipt **prints**.

## 7. Troubleshooting

**Is the service running?**
```bash
sudo systemctl status munchadda-kiosk
journalctl -u munchadda-kiosk -n 50 --no-pager
```

**Printer not detected** — confirm it shows up on USB:
```bash
lsusb
```
Then check `printer.vendor_id` / `printer.product_id` in `kiosk.yaml` match the IDs from `lsusb`.

**Scanner types nothing** — the scanner must be in **USB-HID keyboard mode** (default for
Honeywell 1450g / Netum). Reconfigure it via its manual's "USB HID Keyboard" barcode if needed.

**No display / blank screen** — check the HDMI cable, then the `display.headless` flag in
`kiosk.yaml`:
- `headless: true` → no monitor needed; scan + print only.
- `headless: false` → full-screen UI on the attached HDMI display (needs the screen connected).

**API 401 / scans rejected** — the API URL is wrong (must be the **admin app URL**), the
API Key is wrong, or the Pi clock is off:
```bash
timedatectl status      # "System clock synchronized: yes"
sudo timedatectl set-ntp true
```
