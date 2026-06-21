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


def load_windows_config():
    path = windows_config_path()
    if not os.path.exists(path):
        return None  # signals "needs setup"
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
