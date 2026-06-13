#!/bin/bash
# MunchAdda Kiosk — Auto-update script
# Cron example: */5 * * * * /opt/munchadda-kiosk/scripts/update.sh >> /opt/munchadda-kiosk/logs/update.log 2>&1
set -e

cd /opt/munchadda-kiosk

git fetch origin

CURRENT=$(git rev-parse HEAD)
LATEST=$(git rev-parse origin/main)

if [ "$CURRENT" != "$LATEST" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update available: $CURRENT -> $LATEST"
    git pull origin main
    pip3 install -r requirements.txt --break-system-packages --quiet
    systemctl restart munchadda-kiosk.service
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Updated successfully to $(git rev-parse HEAD)"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Already up to date ($CURRENT)"
fi
