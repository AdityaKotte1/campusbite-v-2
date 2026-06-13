#!/usr/bin/env python3
"""
MunchAdda Kiosk — Entry Point
Runs on Raspberry Pi 4 with 7" HDMI display, Honeywell 1450g scanner,
and Xprinter XP-58IIH 58mm thermal printer.
"""

import os
import sys
import logging
import logging.handlers

# ---------------------------------------------------------------------------
# Path setup — ensure repo root is importable from any working directory
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# ---------------------------------------------------------------------------
# Logging — rotating file (10 MB × 5 backups) + stdout
# ---------------------------------------------------------------------------
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "kiosk.log")

_fmt = logging.Formatter(
    fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_file_handler = logging.handlers.RotatingFileHandler(
    LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
)
_file_handler.setFormatter(_fmt)

_stdout_handler = logging.StreamHandler(sys.stdout)
_stdout_handler.setFormatter(_fmt)

logging.basicConfig(
    level=logging.INFO,
    handlers=[_file_handler, _stdout_handler],
)

log = logging.getLogger("main")


def _print_banner() -> None:
    banner = """
╔══════════════════════════════════════╗
║         MUNCHADDA KIOSK v1.0        ║
║   Campus Food Ordering Platform      ║
║   github.com/munchadda/kiosk        ║
╚══════════════════════════════════════╝
"""
    for line in banner.strip().splitlines():
        log.info(line)


def main() -> None:
    _print_banner()
    log.info("Python %s on %s", sys.version.split()[0], sys.platform)
    log.info("Base directory: %s", BASE_DIR)

    from app import KioskApp  # noqa: import after path setup

    app = KioskApp(BASE_DIR)
    try:
        app.run()
    except KeyboardInterrupt:
        log.info("Keyboard interrupt received — shutting down cleanly.")
    except Exception as exc:  # pylint: disable=broad-except
        log.exception("Fatal error in KioskApp.run(): %s", exc)
        sys.exit(1)
    finally:
        log.info("MunchAdda kiosk process exiting.")


if __name__ == "__main__":
    main()
