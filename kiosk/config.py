"""config.py — OS-aware config. Linux/Pi: the existing yaml/secrets loader.
Windows: %APPDATA%\\MunchAdda\\config.json (written by the setup window)."""
import json
import os
import sys

APP_DIR_NAME = "MunchAdda"


def is_windows() -> bool:
    return sys.platform == "win32"


def windows_config_dir() -> str:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, APP_DIR_NAME)


def windows_config_path() -> str:
    return os.path.join(windows_config_dir(), "config.json")


def _normalize_windows(raw: dict) -> dict:
    """Map the flat Windows setup config (written by setup_window.run_setup)
    into the SAME nested shape the rest of the app consumes on Linux/Pi.

    Flat keys (from config.json):
      api_base_url, kiosk_id, api_key, canteen_id (optional), printer_name,
      fullscreen, institute_name (optional).

    Defaults for audio.* / offline.* / server.* are copied from
    config/kiosk.yaml.example so the app finds every key it reads regardless
    of OS. fullscreen/headless are forced false on Windows (windowed GUI).
    """
    return {
        "server": {
            "base_url": raw.get("api_base_url", "https://munchadda.com"),
            "timeout_seconds": 10,
            "retry_attempts": 3,
            "retry_delay_seconds": 1,
        },
        "kiosk": {
            "id": raw.get("kiosk_id", ""),
            "api_key": raw.get("api_key", ""),
            "canteen_id": raw.get("canteen_id", ""),
            "name": raw.get("name", "Windows Counter Kiosk"),
        },
        "printer": {
            "printer_name": raw.get("printer_name", ""),
            "institute_name": raw.get("institute_name", ""),
            "cut_after_print": True,
        },
        "display": {
            "headless": False,
            "fullscreen": bool(raw.get("fullscreen", False)),
            "width": 800,
            "height": 480,
            "font_size_large": 72,
            "font_size_medium": 28,
            "font_size_small": 14,
        },
        "audio": {
            "enabled": True,
            "volume": 0.8,
        },
        "offline": {
            "enabled": True,
            "cache_ttl_seconds": 300,
            "max_queue_size": 1000,
            "sync_interval_seconds": 30,
        },
    }


def load_windows_config():
    """Return the normalized (nested) config dict, or None when setup is
    needed. The on-disk file is the RAW flat shape written by the setup
    window; we normalize it here so callers get one shape on every OS."""
    path = windows_config_path()
    if not os.path.exists(path):
        return None  # signals "needs setup"
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return _normalize_windows(raw)


def load_windows_config_raw():
    """Return the RAW flat on-disk config (or None). Used by callers that need
    the un-normalized fields, e.g. main.py setting OS env vars from api_key."""
    path = windows_config_path()
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_windows_config(cfg: dict) -> None:
    os.makedirs(windows_config_dir(), exist_ok=True)
    with open(windows_config_path(), "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def load_config(base_dir: str):
    """Normalized config dict, or None on Windows when setup is needed."""
    if is_windows():
        return load_windows_config()
    # Linux/Pi — reuse the existing loader so behavior is identical.
    # load_pi_config lives in app.py (extracted, byte-for-byte, from the
    # former inline _load_config). Imported lazily so config.py stays pure
    # stdlib and importable on any OS without pulling in app.py's deps.
    from app import load_pi_config
    return load_pi_config(base_dir)
