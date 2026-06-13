#!/bin/bash
# X session entry point for the MunchAdda kiosk.
# Launched by startx (see munchadda-kiosk.service). Disables screen blanking /
# power management, then runs the kiosk app as the sole X client. When the app
# exits, X exits and systemd restarts the service.
xset s off
xset -dpms
xset s noblank
exec /opt/munchadda-kiosk/venv/bin/python /opt/munchadda-kiosk/main.py
