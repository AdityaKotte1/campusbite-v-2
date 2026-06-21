#!/usr/bin/env bash
# MunchAdda Kiosk — one-shot Raspberry Pi installer.
# Fresh-Pi → running, auto-starting kiosk in a single run.
#
#   Run from inside the kiosk/ source dir:  sudo bash scripts/bootstrap-pi.sh
#
# Idempotent: safe to re-run. Reuses the proven steps from scripts/setup.sh
# (kiosk user, udev rules, venv, dirs, openbox autostart, systemd unit) and
# additionally prompts for credentials and writes the two files the running
# app actually reads:
#   1. /opt/munchadda-kiosk/config/kiosk.yaml  — kiosk.id, kiosk.canteen_id,
#      kiosk.api_key (fallback), server.base_url
#   2. /etc/munchadda-kiosk/secrets.env        — MUNCHADDA_API_KEY (preferred),
#      DB_ENCRYPTION_KEY (auto-generated, stable across reboots)
# Tested on Raspberry Pi OS Lite 64-bit (Debian Bookworm).
set -euo pipefail

APP_DIR=/opt/munchadda-kiosk
SECRETS_DIR=/etc/munchadda-kiosk
SECRETS_FILE="$SECRETS_DIR/secrets.env"
SERVICE=munchadda-kiosk.service
KIOSK_USER=kiosk

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run with sudo:  sudo bash scripts/bootstrap-pi.sh" >&2
  exit 1
fi

# Source dir = parent of this script's dir (so it works regardless of cwd).
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=============================="
echo "  MunchAdda Kiosk — Bootstrap"
echo "=============================="

echo "==> System packages…"
apt-get update
apt-get install -y \
    python3 python3-pip python3-venv python3-tk \
    git cups libcups2-dev alsa-utils espeak-ng ufw \
    libusb-1.0-0 libusb-1.0-0-dev fonts-dejavu-core libjpeg-dev zlib1g-dev \
    xserver-xorg xinit openbox x11-xserver-utils

echo "==> Kiosk user + device groups…"
useradd -m -s /bin/bash "$KIOSK_USER" 2>/dev/null || true
usermod -aG lp,dialout,tty,plugdev,input,audio,video "$KIOSK_USER"

echo "==> udev rules (printer + scanner)…"
cat > /etc/udev/rules.d/99-munchadda-printer.rules << 'EOF'
# Xprinter XP-58IIH
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5743", MODE="0666", GROUP="lp"
# Generic ESC/POS fallback
SUBSYSTEM=="usb", ATTRS{bInterfaceClass}=="07", MODE="0666", GROUP="lp"
EOF
cat > /etc/udev/rules.d/99-munchadda-scanner.rules << 'EOF'
# Honeywell 1450g
SUBSYSTEM=="input", ATTRS{idVendor}=="0c2e", MODE="0660", GROUP="input"
# Generic HID keyboard scanner
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{bInterfaceClass}=="03", MODE="0660", GROUP="input"
EOF
udevadm control --reload-rules
udevadm trigger

echo "==> Copy app → $APP_DIR…"
mkdir -p "$APP_DIR"
# -a preserves structure; trailing /. copies contents of the source dir.
cp -a "$SRC_DIR/." "$APP_DIR/"
cd "$APP_DIR"

echo "==> Directory structure…"
mkdir -p "$APP_DIR/logs" "$APP_DIR/db" "$APP_DIR/assets/sounds" "$APP_DIR/config"

echo "==> Python venv + deps…"
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip setuptools wheel
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

echo ""
echo "==> Credentials (from admin panel → Kiosks → Register)…"
read -rp "Kiosk ID (UUID): " KID
read -rp "API Key: " KEY
read -rp "Canteen ID (UUID): " CID
read -rp "API URL [https://munchadda.com]: " URL
URL=${URL:-https://munchadda.com}

# --- Write config/kiosk.yaml from the example, substituting real values. ---
# Python + yaml gives a guaranteed-valid file and only touches the four keys
# the app reads (server.base_url, kiosk.id, kiosk.canteen_id, kiosk.api_key).
echo "==> Writing $APP_DIR/config/kiosk.yaml…"
EXAMPLE="$APP_DIR/config/kiosk.yaml.example"
TARGET="$APP_DIR/config/kiosk.yaml"
KIOSK_ID="$KID" KIOSK_API_KEY="$KEY" KIOSK_CANTEEN_ID="$CID" KIOSK_BASE_URL="$URL" \
EXAMPLE="$EXAMPLE" TARGET="$TARGET" "$APP_DIR/venv/bin/python" - << 'PY'
import os
import yaml

with open(os.environ["EXAMPLE"], "r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

cfg.setdefault("server", {})["base_url"] = os.environ["KIOSK_BASE_URL"]
kiosk = cfg.setdefault("kiosk", {})
kiosk["id"] = os.environ["KIOSK_ID"]
kiosk["canteen_id"] = os.environ["KIOSK_CANTEEN_ID"]
# api_key in yaml is only a fallback; MUNCHADDA_API_KEY env (secrets.env) wins.
kiosk["api_key"] = os.environ["KIOSK_API_KEY"]

with open(os.environ["TARGET"], "w", encoding="utf-8") as f:
    yaml.safe_dump(cfg, f, default_flow_style=False, sort_keys=False)
print("  kiosk.yaml written.")
PY

# --- Write the secrets.env the systemd unit reads (MUNCHADDA_API_KEY wins). ---
echo "==> Writing $SECRETS_FILE…"
mkdir -p "$SECRETS_DIR"
chmod 0700 "$SECRETS_DIR"
chown root:root "$SECRETS_DIR"

# Preserve an existing DB_ENCRYPTION_KEY across re-runs (must be stable per
# kiosk); otherwise generate a fresh 32-byte hex key.
DB_KEY=""
if [[ -f "$SECRETS_FILE" ]]; then
  DB_KEY="$(grep -E '^DB_ENCRYPTION_KEY=' "$SECRETS_FILE" | head -n1 | cut -d= -f2- || true)"
fi
if [[ -z "$DB_KEY" || "$DB_KEY" == replace-with-* ]]; then
  DB_KEY="$(openssl rand -hex 32)"
fi

cat > "$SECRETS_FILE" << EOF
# MunchAdda Kiosk Secrets — written by bootstrap-pi.sh
# Read by systemd unit: EnvironmentFile=-$SECRETS_FILE
MUNCHADDA_API_KEY=$KEY
DB_ENCRYPTION_KEY=$DB_KEY
EOF
chmod 600 "$SECRETS_FILE"
chown root:root "$SECRETS_FILE"

echo "==> Permissions…"
chown -R "$KIOSK_USER:$KIOSK_USER" "$APP_DIR"
chmod 0700 "$APP_DIR/logs" "$APP_DIR/db" "$APP_DIR/config"

echo "==> openbox autostart (holds X open; service runs the app)…"
mkdir -p "/home/$KIOSK_USER/.config/openbox"
cat > "/home/$KIOSK_USER/.config/openbox/autostart" << 'EOF'
# Disable screensaver and power management
xset s off
xset -dpms
xset s noblank
# The kiosk service starts the Python app; openbox just holds X open
EOF
cat > "/home/$KIOSK_USER/.xinitrc" << 'EOF'
exec openbox-session
EOF
chown -R "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/.config" "/home/$KIOSK_USER/.xinitrc"

echo "==> systemd autostart…"
cp "$APP_DIR/systemd/$SERVICE" "/etc/systemd/system/$SERVICE"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

echo ""
echo "=============================="
echo "  Done."
echo "=============================="
echo "  Status:  sudo systemctl status $SERVICE"
echo "  Logs:    journalctl -u $SERVICE -n 50 -f"
echo "  Printer: lsusb   (update printer VID/PID in $APP_DIR/config/kiosk.yaml if needed)"
