#!/bin/bash
# CampusBite Kiosk — Auto-update script
# Cron example: */5 * * * * /opt/campusbite-kiosk/scripts/update.sh >> /opt/campusbite-kiosk/logs/update.log 2>&1
set -e

cd /opt/campusbite-kiosk

git fetch origin

CURRENT=$(git rev-parse HEAD)
LATEST=$(git rev-parse origin/main)

if [ "$CURRENT" != "$LATEST" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update available: $CURRENT -> $LATEST"
    git pull origin main
    pip3 install -r requirements.txt --break-system-packages --quiet
    systemctl restart campusbite-kiosk.service
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Updated successfully to $(git rev-parse HEAD)"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Already up to date ($CURRENT)"
fi
