# Universal Counter Agent (Pi + Windows) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Run the existing `kiosk/` agent on both the Raspberry Pi (unchanged, light) and a Windows counter PC (new scanner/printer adapters + setup window + `.exe`), from one codebase, with one-click setup on each.

**Architecture:** Shared core (HMAC API, receipt rendering, offline queue, audio, display, app orchestration). Two adapter seams selected by `sys.platform`: scanner (`evdev` on Linux | focus-capture on Windows) and printer transport (`escpos.Usb` on Linux | `escpos.Win32Raw` on Windows). All Windows-only libs imported conditionally + a separate `requirements-windows.txt`, so the Pi's footprint is unchanged. Spec: `docs/superpowers/specs/2026-06-21-universal-counter-agent-design.md`.

**Tech Stack:** Python 3.11, escpos (`python-escpos`), Pillow, Tkinter, evdev (Linux), pywin32 (Windows), PyInstaller (Windows packaging).

**Verification model:** No pytest harness in repo. Each task verifies with `python -m py_compile <files>` (must pass on this Windows dev box for all *cross-platform* modules) + a small `sys.platform`-monkeypatch check where logic branches. Modules that `import evdev`/`win32print` at top level can't compile on the wrong OS — so those imports MUST be lazy/conditional (the plan enforces this). Windows runtime behavior (real scanner/printer) is manual, on a Windows PC — noted per task. Do NOT use `git --no-verify`.

**Reference (read first):** `kiosk/main.py`, `kiosk/app.py` (construction of `self.api`/printer/scanner/display + how `self.config` is loaded), `kiosk/scanner.py`, `kiosk/printer.py`, `kiosk/config/kiosk.yaml.example`, `kiosk/scripts/setup.sh`.

---

## Task 1: `config.py` — OS-aware config loader

**Files:** Create `kiosk/config.py`.

- [ ] **Step 1: Read how config loads today.** Read `kiosk/main.py` + `kiosk/app.py` to see how `self.config` is currently built on the Pi (yaml + secrets.env). Note the exact keys the app reads (api_base_url, kiosk_id, api_key, audio, display, printer, etc.).

- [ ] **Step 2: Write `kiosk/config.py`.** It returns a normalized config dict, choosing the source by OS. The Linux branch delegates to the EXISTING loader (import and call it — do not duplicate); the Windows branch reads `%APPDATA%\MunchAdda\config.json`.

```python
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

def load_windows_config() -> dict | None:
    path = windows_config_path()
    if not os.path.exists(path):
        return None  # signals "needs setup"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_windows_config(cfg: dict) -> None:
    os.makedirs(windows_config_dir(), exist_ok=True)
    with open(windows_config_path(), "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

def load_config(base_dir: str) -> dict | None:
    """Return the normalized config dict, or None on Windows when setup is needed."""
    if is_windows():
        return load_windows_config()
    # Linux/Pi — reuse the existing loader so behavior is identical.
    from app import load_pi_config  # adjust to the real function/location found in Step 1
    return load_pi_config(base_dir)
```
*Integration note for the implementer:* in Step 1 you will find the real Pi-config function — wire `load_config`'s Linux branch to it exactly (rename `load_pi_config` to match). If the Pi config is built inline in `KioskApp.__init__` rather than a function, extract it into a small `load_pi_config(base_dir)` in `app.py` (Linux-only code path, behavior identical) and call that.

- [ ] **Step 3: Verify + commit.**
```bash
python -m py_compile kiosk/config.py
git add kiosk/config.py && git commit -m "feat(kiosk): OS-aware config loader (Linux yaml | Windows %APPDATA%)"
```

---

## Task 2: Printer transport selection

**Files:** Modify `kiosk/printer.py`.

- [ ] **Step 1: Read `kiosk/printer.py`** — find where it constructs the escpos device (currently `Usb(...)` via pyusb) and how the render methods (`print_receipt`, watermark image mode) use it.

- [ ] **Step 2: Add a transport factory.** Add a module-level `connect_printer(config)` that returns an escpos printer object by OS, and route the existing construction through it. Keep ALL rendering unchanged.
```python
def connect_printer(config: dict):
    """Return an escpos printer device chosen by OS. Linux: USB (pyusb).
    Windows: Win32Raw → prints raw ESC/POS via the installed Windows driver."""
    import sys
    if sys.platform == "win32":
        from escpos.printer import Win32Raw  # imported only on Windows
        printer_name = config.get("printer_name")
        if not printer_name:
            raise RuntimeError("No Windows printer configured (printer_name missing)")
        return Win32Raw(printer_name)
    # Linux/Pi — keep the existing USB construction (copy the current Usb(...) args here)
    from escpos.printer import Usb
    usb = config.get("printer", {})
    return Usb(int(usb["vendor_id"], 16), int(usb["product_id"], 16), timeout=0,
               in_ep=usb.get("in_ep", 0x81), out_ep=usb.get("out_ep", 0x03))
```
*Integration note:* replace the placeholder `Usb(...)` args with the EXACT args the current `printer.py` uses (read them in Step 1 — vendor/product/endpoints). The Linux branch must be byte-for-byte equivalent to today. Have the printer class call `connect_printer(config)` instead of constructing `Usb` directly.

- [ ] **Step 3: Verify + commit.** `python -m py_compile kiosk/printer.py` (must pass on Windows — confirm `Usb`/`Win32Raw` are imported lazily INSIDE the function, never at module top). Commit:
```bash
git add kiosk/printer.py && git commit -m "feat(kiosk): printer transport factory (USB | Win32Raw) — rendering unchanged"
```

---

## Task 3: Scanner adapter — factory + Windows capture

**Files:** Create `kiosk/scanner_windows.py`; modify `kiosk/scanner.py` (add a factory; keep evdev path).

- [ ] **Step 1: Read `kiosk/scanner.py`** — note the `BarcodeScanner` interface (`on_scan` callback, `start()`, `stop()`, the `_fire` method) so the Windows adapter matches it.

- [ ] **Step 2: Create `kiosk/scanner_windows.py`** — focus-based capture bound to the Tk root.
```python
"""scanner_windows.py — Windows HID-scanner capture via the focused Tk window.
A USB QR scanner types the payload fast and ends with Enter; we accumulate
key presses on the Tk root and fire on Return."""
import logging
from typing import Callable, Optional

log = logging.getLogger("scanner")

class WindowsScanner:
    def __init__(self, tk_root) -> None:
        self.on_scan: Optional[Callable[[str], None]] = None
        self._root = tk_root
        self._buffer = ""

    def start(self) -> None:
        # Capture printable keys + Enter on the root window (and its children).
        self._root.bind_all("<Key>", self._on_key)
        self._root.bind_all("<Return>", self._on_enter)
        log.info("Windows scanner active — focus the window and scan.")

    def stop(self) -> None:
        try:
            self._root.unbind_all("<Key>")
            self._root.unbind_all("<Return>")
        except Exception:
            pass

    def _on_key(self, event) -> None:
        if event.char and event.char.isprintable():
            self._buffer += event.char

    def _on_enter(self, _event) -> None:
        data = self._buffer.strip()
        self._buffer = ""
        if data and callable(self.on_scan):
            try:
                self.on_scan(data)
            except Exception as exc:  # pylint: disable=broad-except
                log.exception("on_scan raised: %s", exc)
```

- [ ] **Step 3: Add a factory to `kiosk/scanner.py`.** At the bottom, add:
```python
def get_scanner(tk_root=None):
    """Return the OS-appropriate scanner. Linux/Pi: evdev (BarcodeScanner).
    Windows: focus-based WindowsScanner (needs the Tk root)."""
    import sys
    if sys.platform == "win32":
        from scanner_windows import WindowsScanner
        if tk_root is None:
            raise RuntimeError("Windows scanner requires the Tk root window")
        return WindowsScanner(tk_root)
    return BarcodeScanner()  # existing evdev/stdin class
```
Ensure `import evdev` stays INSIDE `BarcodeScanner.start()` (it already is) so `scanner.py` compiles on Windows.

- [ ] **Step 4: Verify + commit.** `python -m py_compile kiosk/scanner.py kiosk/scanner_windows.py` (must pass on Windows). Commit:
```bash
git add kiosk/scanner.py kiosk/scanner_windows.py
git commit -m "feat(kiosk): scanner factory + Windows focus-capture adapter"
```

---

## Task 4: Wire adapters + windowed display into the app

**Files:** Modify `kiosk/app.py` and `kiosk/main.py`.

- [ ] **Step 1: Read `kiosk/app.py` + `kiosk/main.py`** to see exactly how the printer, scanner, display, and config are constructed and started.

- [ ] **Step 2: Use `config.load_config` in `main.py`.** Replace the current Pi-only config load with `from config import load_config` + `cfg = load_config(BASE_DIR)`. If `cfg is None` (Windows, unconfigured) → import and run the setup window (Task 5), then reload; loop until configured. (On Linux `cfg` is never None.)

- [ ] **Step 3: Use the factories in `app.py`.**
  - Printer: construct via `connect_printer(self.config)` (Task 2) — already wired if you routed the printer class through it; otherwise pass config through.
  - Scanner: `from scanner import get_scanner; self.scanner = get_scanner(tk_root=self.display.root if sys.platform=='win32' else None)`; set `self.scanner.on_scan = self.handle_scan` and `self.scanner.start()` as today.
  - Display: add a `fullscreen` flag — `cfg.get("fullscreen", sys.platform != 'win32')`. When False (Windows), do NOT apply the fullscreen Tk attributes; create a normal resizable window. Read how `display.py` sets fullscreen and gate it on this flag (pass the flag into the display constructor).

- [ ] **Step 4: Verify + commit.** `python -m py_compile kiosk/app.py kiosk/main.py`. Commit:
```bash
git add kiosk/app.py kiosk/main.py
git commit -m "feat(kiosk): wire OS config + scanner/printer factories + windowed mode"
```

---

## Task 5: Windows first-run setup window

**Files:** Create `kiosk/setup_window.py`.

- [ ] **Step 1: Create `kiosk/setup_window.py`** — a Tkinter dialog that collects config and saves it via `config.save_windows_config`.
```python
"""setup_window.py — Windows first-run setup. Collects kiosk_id/api_key/API URL,
lets the user pick an installed printer, optional test print, saves config."""
import tkinter as tk
from tkinter import messagebox, ttk

DEFAULT_API_URL = "https://campusbite.innvera.online"  # adjust to the real prod URL

def list_windows_printers() -> list[str]:
    import win32print
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    return [p[2] for p in win32print.EnumPrinters(flags)]

def run_setup(existing: dict | None = None) -> dict | None:
    """Show the modal setup window; return the saved config dict, or None if cancelled."""
    from config import save_windows_config
    existing = existing or {}
    root = tk.Tk()
    root.title("MunchAdda Kiosk — Setup")
    root.geometry("440x340")
    result: dict = {}

    fields = {}
    def row(label, key, default=""):
        tk.Label(root, text=label).pack(anchor="w", padx=16, pady=(8, 0))
        var = tk.StringVar(value=existing.get(key, default))
        tk.Entry(root, textvariable=var, width=52).pack(padx=16)
        fields[key] = var

    row("Kiosk ID", "kiosk_id")
    row("API Key", "api_key")
    row("API URL", "api_base_url", DEFAULT_API_URL)

    tk.Label(root, text="Receipt printer").pack(anchor="w", padx=16, pady=(8, 0))
    printers = list_windows_printers()
    printer_var = tk.StringVar(value=existing.get("printer_name", printers[0] if printers else ""))
    ttk.Combobox(root, textvariable=printer_var, values=printers, width=50, state="readonly").pack(padx=16)

    def collect() -> dict:
        return {
            "kiosk_id": fields["kiosk_id"].get().strip(),
            "api_key": fields["api_key"].get().strip(),
            "api_base_url": fields["api_base_url"].get().strip().rstrip("/"),
            "printer_name": printer_var.get(),
            "fullscreen": False,
        }

    def on_test():
        cfg = collect()
        try:
            from printer import connect_printer
            p = connect_printer(cfg)
            p.text("MunchAdda test print\n\n"); p.cut()
            messagebox.showinfo("Test print", "Sent a test receipt.")
        except Exception as exc:  # pylint: disable=broad-except
            messagebox.showerror("Test print failed", str(exc))

    def on_save():
        cfg = collect()
        if not cfg["kiosk_id"] or not cfg["api_key"] or not cfg["printer_name"]:
            messagebox.showerror("Missing", "Kiosk ID, API Key and Printer are required.")
            return
        save_windows_config(cfg)
        result.update(cfg)
        root.destroy()

    btns = tk.Frame(root); btns.pack(pady=14)
    tk.Button(btns, text="Test print", command=on_test).pack(side="left", padx=6)
    tk.Button(btns, text="Save & start", command=on_save).pack(side="left", padx=6)
    root.mainloop()
    return result or None
```

- [ ] **Step 2: Verify + commit.** `python -m py_compile kiosk/setup_window.py` (note: `win32print` is imported INSIDE `list_windows_printers`, so it compiles on any OS). Commit:
```bash
git add kiosk/setup_window.py
git commit -m "feat(kiosk): Windows first-run setup window"
```

---

## Task 6: Windows packaging — requirements + PyInstaller spec

**Files:** Create `kiosk/requirements-windows.txt`, `kiosk/build/munchadda-kiosk.spec`.

- [ ] **Step 1: `kiosk/requirements-windows.txt`:**
```
-r requirements.txt
pywin32==306
pyinstaller==6.6.0
```
(Note: `evdev` is in `requirements.txt` and is Linux-only — it won't install on Windows. So instead, create `requirements-windows.txt` listing the SHARED deps explicitly WITHOUT evdev: `requests`, `python-escpos`, `pyyaml`, `cryptography`, `Pillow`, `pygame`, `schedule`, plus `pywin32`, `pyinstaller`. Read `kiosk/requirements.txt` and copy all non-evdev lines.)

- [ ] **Step 2: `kiosk/build/munchadda-kiosk.spec`** — a PyInstaller spec bundling assets:
```python
# munchadda-kiosk.spec — build: pyinstaller build/munchadda-kiosk.spec  (run from kiosk/)
# -*- mode: python ; coding: utf-8 -*-
block_cipher = None
a = Analysis(
    ['..\\main.py'],
    pathex=['..'],
    binaries=[],
    datas=[('..\\assets', 'assets')],   # sounds + watermark font
    hiddenimports=['win32print', 'win32ui', 'escpos.printer'],
    hookspath=[], runtime_hooks=[], excludes=['evdev'],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name='MunchAddaKiosk', console=False, icon=None)
```
*Note:* `excludes=['evdev']` keeps the Linux-only lib out of the Windows build. Verify the assets path matches the real `kiosk/assets/` layout (sounds + font).

- [ ] **Step 3: Commit** (build is run manually on Windows; nothing to compile here):
```bash
git add kiosk/requirements-windows.txt kiosk/build/munchadda-kiosk.spec
git commit -m "feat(kiosk): Windows packaging — requirements-windows + PyInstaller spec"
```

---

## Task 7: Pi one-click bootstrap

**Files:** Create `kiosk/scripts/bootstrap-pi.sh`.

- [ ] **Step 1: Read `kiosk/scripts/setup.sh`** (the existing installer) to reuse its proven steps and the systemd unit name (`munchadda-kiosk.service`).

- [ ] **Step 2: Write `kiosk/scripts/bootstrap-pi.sh`** — idempotent fresh-Pi installer that ends with a running, auto-starting kiosk:
```bash
#!/usr/bin/env bash
# MunchAdda Kiosk — one-shot Raspberry Pi installer (run on a fresh Pi).
#   sudo bash scripts/bootstrap-pi.sh
set -euo pipefail
APP_DIR=/opt/munchadda-kiosk
ETC_DIR=/etc/munchadda-kiosk
SERVICE=munchadda-kiosk.service

echo "==> Installing system packages…"
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip libusb-1.0-0 \
  libjpeg-dev zlib1g-dev fonts-dejavu-core git

echo "==> Placing app at $APP_DIR…"
sudo mkdir -p "$APP_DIR"
sudo cp -r "$(pwd)/." "$APP_DIR/"   # if running from a clone; else git clone here
cd "$APP_DIR"

echo "==> Python venv + deps…"
sudo python3 -m venv venv
sudo ./venv/bin/pip install --upgrade pip
sudo ./venv/bin/pip install -r requirements.txt

echo "==> Credentials → $ETC_DIR/secrets.env"
sudo mkdir -p "$ETC_DIR"
read -rp "Kiosk ID: " KID
read -rp "API Key: " KEY
read -rp "API URL [https://campusbite.innvera.online]: " URL
URL=${URL:-https://campusbite.innvera.online}
printf 'KIOSK_ID=%s\nKIOSK_API_KEY=%s\nAPI_BASE_URL=%s\n' "$KID" "$KEY" "$URL" | sudo tee "$ETC_DIR/secrets.env" >/dev/null
sudo chmod 600 "$ETC_DIR/secrets.env"

echo "==> systemd service (autostart on boot)…"
sudo cp systemd/$SERVICE /etc/systemd/system/$SERVICE
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE"
sudo systemctl restart "$SERVICE"
echo "==> Done. Status: sudo systemctl status $SERVICE"
```
*Note:* match the env-var names + secrets.env path to what the app/systemd unit actually read (verify against `setup.sh` + the unit's `EnvironmentFile`). Adjust the X/openbox autostart bits only if the existing setup.sh did them.

- [ ] **Step 3: Commit.**
```bash
git add kiosk/scripts/bootstrap-pi.sh
git commit -m "feat(kiosk): one-shot Pi bootstrap installer"
```

---

## Task 8: Setup guides — PI_SETUP.md + WINDOWS.md

**Files:** Create `kiosk/PI_SETUP.md`, `kiosk/WINDOWS.md`.

- [ ] **Step 1: `kiosk/PI_SETUP.md`** — assume-zero-knowledge, fresh-Pi → running kiosk:
  1. **Flash the OS** — install Raspberry Pi Imager on your computer; pick *Raspberry Pi OS (64-bit)*; in the gear/⚙ settings set the **Wi-Fi** + **enable SSH** + set a username/password; flash the SD card.
  2. **Boot** — insert the SD card, connect the **screen** (HDMI), **USB scanner**, and **USB thermal printer**, power on.
  3. **Open a terminal** — either on the Pi's desktop, or SSH from your computer (`ssh <user>@<pi-ip>`; find the IP from your router or `ping <hostname>.local`).
  4. **Get your kiosk credentials** — in the MunchAdda **admin app → Kiosks → Register Kiosk**, create a kiosk for the canteen; copy the **Kiosk ID** and the **API Key** (shown once).
  5. **Install** — `git clone <repo> munchadda && cd munchadda/kiosk && sudo bash scripts/bootstrap-pi.sh`; paste the Kiosk ID / API Key when prompted.
  6. **Reboot** — `sudo reboot`. The Pi boots straight into the kiosk; scan an order QR to confirm it prints.
  7. **Troubleshooting** — `sudo systemctl status munchadda-kiosk`, `journalctl -u munchadda-kiosk -n 50`; printer not found → check `lsusb`; scanner not typing → it must be in USB-HID keyboard mode.

- [ ] **Step 2: `kiosk/WINDOWS.md`** — two parts:
  - **Build (you):** on a Windows PC with Python 3.11 → `cd kiosk && python -m venv venv && venv\Scripts\pip install -r requirements-windows.txt && venv\Scripts\pyinstaller build\munchadda-kiosk.spec`; the `.exe` lands in `dist\MunchAddaKiosk\`.
  - **Install (client):** install the thermal printer's **Windows driver** (from the manufacturer) and print a Windows test page to confirm it works; double-click **MunchAddaKiosk.exe**; in the setup window paste the **Kiosk ID** + **API Key** (from admin → Register Kiosk), confirm the API URL, pick the printer, click **Test print**, then **Save & start**; to auto-start at login, put a shortcut to the `.exe` in `shell:startup`.

- [ ] **Step 3: Commit.**
```bash
git add kiosk/PI_SETUP.md kiosk/WINDOWS.md
git commit -m "docs(kiosk): pin-to-point Pi + Windows setup guides"
```

---

## Task 9: Final verification

- [ ] **Step 1: Compile-check everything cross-platform** (on this Windows dev box):
`python -m py_compile kiosk/config.py kiosk/printer.py kiosk/scanner.py kiosk/scanner_windows.py kiosk/setup_window.py kiosk/app.py kiosk/main.py` → all pass (proves no Windows-only or Linux-only import leaked to module top level).
- [ ] **Step 2: Pi-regression sanity** — confirm `kiosk/requirements.txt` is unchanged (no new shared deps) and that `evdev`/`pyusb` are only imported inside Linux branches.
- [ ] **Step 3: Manual (deferred to real hardware):** Pi — run `bootstrap-pi.sh` on a spare Pi, scan a QR, confirm print. Windows — build the `.exe`, run setup, Test print, scan a QR, confirm print + that the window minimizes and the offline queue still works.

---

## Notes / follow-ups (out of scope)
- Windows scanner is focus-based for v1; global-hotkey capture is a future upgrade.
- `.exe` is unsigned (clients get a one-time SmartScreen prompt); code-signing later.
- Auto-update is manual (ship a new `.exe` / `git pull` on the Pi).
