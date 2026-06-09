#!/bin/bash
# CampusBite Kiosk — One-shot setup script for new Raspberry Pi
# Run as: sudo bash scripts/setup.sh
# Tested on Raspberry Pi OS Lite 64-bit (Debian Bookworm)
set -e

echo "=============================="
echo "  CampusBite Kiosk Setup"
echo "=============================="

# --- System packages ---
apt-get update && apt-get upgrade -y
apt-get install -y \
    python3-pip \
    python3-venv \
    python3-tk \
    git \
    cups \
    libcups2-dev \
    alsa-utils \
    espeak-ng \
    ufw \
    libusb-1.0-0 \
    libusb-1.0-0-dev \
    fonts-dejavu-core \
    xserver-xorg \
    xinit \
    openbox \
    x11-xserver-utils

# --- Create kiosk user (non-interactive, ignore if exists) ---
useradd -m -s /bin/bash kiosk 2>/dev/null || true
usermod -aG lp,dialout,tty,plugdev,input,audio,video kiosk

# --- udev rule: allow kiosk user to access USB printer without root ---
cat > /etc/udev/rules.d/99-campusbite-printer.rules << 'EOF'
# Xprinter XP-58IIH
SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5743", MODE="0666", GROUP="lp"
# Generic ESC/POS fallback
SUBSYSTEM=="usb", ATTRS{bInterfaceClass}=="07", MODE="0666", GROUP="lp"
EOF
udevadm control --reload-rules
udevadm trigger

# --- udev rule: barcode scanner ---
cat > /etc/udev/rules.d/99-campusbite-scanner.rules << 'EOF'
# Honeywell 1450g
SUBSYSTEM=="input", ATTRS{idVendor}=="0c2e", MODE="0660", GROUP="input"
# Generic HID keyboard scanner
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{bInterfaceClass}=="03", MODE="0660", GROUP="input"
EOF
udevadm control --reload-rules

# --- Python packages ---
pip3 install -r /opt/campusbite-kiosk/requirements.txt --break-system-packages

# --- Directory structure ---
mkdir -p /opt/campusbite-kiosk/logs
mkdir -p /opt/campusbite-kiosk/db
mkdir -p /opt/campusbite-kiosk/assets/sounds
chown -R kiosk:kiosk /opt/campusbite-kiosk

# Secure sensitive directories (not world-readable)
chmod 0700 /opt/campusbite-kiosk/logs
chmod 0700 /opt/campusbite-kiosk/db
chmod 0700 /opt/campusbite-kiosk/config

# Create secrets directory outside the app folder
mkdir -p /etc/campusbite-kiosk
chmod 0700 /etc/campusbite-kiosk
chown root:root /etc/campusbite-kiosk

echo "IMPORTANT: Copy kiosk/config/secrets.env.example to /etc/campusbite-kiosk/secrets.env"
echo "           Then fill in your API key and DB encryption key"
echo "           Run: chmod 600 /etc/campusbite-kiosk/secrets.env"

# --- Autostart: openbox for minimal X session ---
mkdir -p /home/kiosk/.config/openbox
cat > /home/kiosk/.config/openbox/autostart << 'EOF'
# Disable screensaver and power management
xset s off
xset -dpms
xset s noblank
# The kiosk service starts the Python app; openbox just holds X open
EOF
chown -R kiosk:kiosk /home/kiosk/.config

# --- .xinitrc for startx ---
cat > /home/kiosk/.xinitrc << 'EOF'
exec openbox-session
EOF
chown kiosk:kiosk /home/kiosk/.xinitrc

# --- systemd service ---
cp /opt/campusbite-kiosk/systemd/campusbite-kiosk.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable campusbite-kiosk.service

# --- Auto-update cron (daily at 3 AM) ---
crontab -u kiosk - << 'EOF'
0 3 * * * /opt/campusbite-kiosk/scripts/update.sh >> /opt/campusbite-kiosk/logs/update.log 2>&1
EOF

# --- UFW firewall ---
ufw default deny outgoing
ufw default deny incoming
# HTTPS to CampusBite server
ufw allow out to any port 443 proto tcp
# DNS
ufw allow out to any port 53 proto udp
# NTP (time sync)
ufw allow out to any port 123 proto udp
# SSH from local network only
ufw allow in from 192.168.0.0/16 to any port 22 proto tcp
ufw --force enable

echo ""
echo "=============================="
echo "  Setup complete!"
echo "=============================="
echo ""
echo "Next steps:"
echo "  1. Copy config:  cp /opt/campusbite-kiosk/config/kiosk.yaml.example /opt/campusbite-kiosk/config/kiosk.yaml"
echo "  2. Edit config:  nano /opt/campusbite-kiosk/config/kiosk.yaml"
echo "     (set server URL, kiosk ID, API key, canteen ID)"
echo "  3. Find printer: lsusb   (note VID:PID and update printer section)"
echo "  4. Start:        systemctl start campusbite-kiosk.service"
echo "  5. Check logs:   tail -f /opt/campusbite-kiosk/logs/kiosk.log"
