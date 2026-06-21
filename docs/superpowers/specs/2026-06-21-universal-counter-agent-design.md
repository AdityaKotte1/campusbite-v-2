# Universal Counter Agent (Pi + Windows) — Design

- **Date:** 2026-06-21
- **Component:** `kiosk/` (the counter agent)
- **Status:** Approved design — pending spec review

## 1. Overview

Run the **same counter agent** on two targets from **one codebase**:
1. **Raspberry Pi kiosk** — the dedicated counter device (Pi + USB scanner + thermal printer), **1 GB RAM, must stay light**. Runs exactly as today.
2. **Windows counter PC** — a staff PC with the USB scanner + printer plugged in. New target: gets platform adapters, a first-run setup window, a normal (minimizable) window, and a packaged `.exe`.

The agent's job is unchanged on both: **scan a pickup QR → call the scan API (HMAC) → print the receipt → audio/visual feedback → offline queue when the network drops.** Cash orders need no special handling — an approved cash order already carries a pickup QR (it's confirmed + paid), so it's scanned and printed exactly like an online order.

## 2. Goals

- One shared codebase; **Pi behavior and footprint unchanged** (no new weight, no new shared dependency).
- A Windows `.exe` a client installs on a counter PC, configures once, and runs in a **normal window** they can minimize while they use the admin dashboard in a browser on the same PC.
- Windows printing through the printer's **installed Windows driver** (no Zadig/libusb).

## 3. Non-goals

- No Linux-desktop-specific target (the Pi covers the Linux path; a counter is either a Pi or a Windows PC).
- No auto-update (manual: ship a new `.exe`).
- No change to the backend/scan API, the receipt layout, the offline-queue logic, or the QR scheme.
- No global keyboard hook on Windows for v1 (focus-based capture; a global hook is a noted future upgrade).

## 4. Architecture — shared core, OS-selected adapters

**Shared (unchanged) modules:** `api_client.py` (HMAC), receipt rendering in `printer.py` (header + watermark via Pillow), `offline/` queue, `audio.py`, `display.py`, `app.py` orchestration, QR validation in `app.py`.

**Two adapter seams, selected at runtime by `sys.platform`:**

### 4a. Scanner adapter
- **Pi/Linux** (`sys.platform != 'win32'`): the existing `evdev` path in `scanner.py` (exclusive `device.grab()`), unchanged.
- **Windows**: a new `scanner_windows.py` that captures the scan in the **focused agent window** — a USB HID scanner types the QR fast and ends with Enter; we bind key events on the Tk root, assemble the buffer, and fire `on_scan` on Enter. Staff focus the agent window to scan (then alt-tab to the browser to approve). *Future upgrade (out of scope): a global low-level keyboard hook so scans are captured even when unfocused.*
- **Selection:** a `get_scanner(on_scan, tk_root=None)` factory returns the right adapter. Both expose the same interface: `start()`, `stop()`, and an `on_scan(data: str)` callback. The Windows adapter needs the Tk root; the evdev adapter ignores it.

### 4b. Printer transport
- `printer.py` keeps **all rendering** (the ESC/POS + Pillow watermark/image code) shared. Only the **transport** (how bytes reach the printer) is OS-specific:
  - **Pi/Linux:** the existing `escpos.printer.Usb(...)` (pyusb/libusb).
  - **Windows:** `escpos.printer.Win32Raw(printer_name)` — sends raw ESC/POS through the named **Windows printer driver** (via `pywin32`). The client installs the printer's normal Windows driver; the printer name is chosen in the setup screen.
- **Selection:** a `connect_printer(config)` helper returns the right escpos device; the render methods (`print_receipt`, watermark) are unchanged and call into it.

## 5. Keeping the Pi light (1 GB RAM)

- **Conditional imports:** `pywin32` and any keyboard-capture lib are imported **only** inside the Windows branches (`if sys.platform == 'win32': import win32print …`). They are never imported on the Pi.
- **Separate `requirements-windows.txt`** for the Windows-only deps (`pywin32`, `pyinstaller`). The Pi's `requirements.txt` is unchanged — no new packages installed on the Pi.
- **No new shared dependency.** The Pi's import graph, memory, and startup are identical to today.

## 6. Config — one loader, two locations

A small `config.py` resolves config by OS:
- **Pi/Linux:** read the existing `kiosk.yaml` + `secrets.env` (unchanged).
- **Windows:** read `%APPDATA%\MunchAdda\config.json` (written by the setup screen). Fields: `api_base_url`, `kiosk_id`, `api_key`, `printer_name`, plus audio/display toggles with sane defaults.
- The rest of the app consumes a normalized config dict regardless of source.

## 7. Windows first-run setup window

A Tkinter dialog shown when no valid `%APPDATA%\MunchAdda\config.json` exists (and re-openable via a "Settings" button):
- Text fields: **Kiosk ID** + **API Key** (copied from the admin "Register Kiosk" dialog), **API URL** (pre-filled with the production URL, editable).
- **Printer dropdown:** populated from `win32print.EnumPrinters(...)` — the staff pick the receipt printer.
- A **"Test print"** button (prints a sample receipt) and **Save**. On save → writes the config, closes the dialog, starts the agent.

## 8. Display

Same Tkinter UI on both. The only difference: the Pi calls fullscreen (existing); on Windows the root window is a **normal, resizable, minimizable** window (skip the fullscreen attributes when `sys.platform == 'win32'`). Selected via a `fullscreen` flag in config (default: true on Pi, false on Windows).

## 9. Packaging

- **Windows:** PyInstaller (`munchadda-kiosk.spec`) → a `.exe` (one-dir or one-file), bundling `assets/sounds/*` and the watermark font. `pywin32` and the keyboard-capture lib are bundled. Output handed to clients; manual updates.
- **Pi/Linux:** unchanged — runs from source via the existing systemd service. No packaging step.

## 10. File structure

```
kiosk/
  app.py                # + windowed-vs-fullscreen flag; uses the scanner/printer factories
  config.py             # NEW: OS-aware config loader (kiosk.yaml/secrets.env  |  %APPDATA% json)
  scanner.py            # Linux/evdev path (unchanged) + exposes the adapter interface
  scanner_windows.py    # NEW: Windows focus-based capture (imported only on Windows)
  printer.py            # rendering unchanged; transport via connect_printer(config)
  setup_window.py       # NEW: Windows first-run setup GUI (imported only on Windows)
  requirements.txt      # Pi deps (unchanged)
  requirements-windows.txt  # NEW: pywin32, pyinstaller (Windows only)
  build/
    munchadda-kiosk.spec   # NEW: PyInstaller spec
```

## 11. Workflows

**Pi (unchanged):** boots → systemd starts the agent → fullscreen → evdev scanner + USB printer → scan QR → print → collected.

**Windows — first run:** launch `.exe` → no config found → **setup window** → staff paste kiosk_id/api_key, pick printer, Test print, Save → agent starts in a normal window.

**Windows — normal run:** launch `.exe` → config loaded → normal window → focus the window, scan a QR → print on the Windows-driver printer → feedback. Staff alt-tab to the browser for cash approvals; minimize the agent when not scanning.

**Cash order (both):** student pays cash → staff approve in the admin dashboard (browser) → order confirmed + paid → student's QR unlocks → student scans at the agent (Pi or Windows) → prints + collected. No agent-side cash logic.

## 12. Deliverables

- `config.py`, `scanner_windows.py`, `setup_window.py`, `requirements-windows.txt`, `build/munchadda-kiosk.spec` (new).
- `scanner.py` (scanner factory), `printer.py` (transport selection), `app.py` (windowed flag + factories), `main.py` (config via `config.py`) — modified, **Linux path behavior identical**.
- **One-click setup + pin-to-point guides (see §15):** `kiosk/scripts/bootstrap-pi.sh` (fresh-Pi installer), `kiosk/PI_SETUP.md` (fresh-Pi, assume-zero-knowledge walkthrough), `kiosk/WINDOWS.md` (build the `.exe` + install on a client PC).

## 15. Setup & onboarding — "one click, ready to go"

Both targets must be trivial to stand up. **Pi = one command; Windows = one double-click.**

### 15a. Raspberry Pi — fresh device to running kiosk
A single bootstrap script does everything; a markdown guide covers the steps before/around it for someone with zero Linux knowledge.

- **`kiosk/scripts/bootstrap-pi.sh`** (idempotent, run once on a fresh Pi):
  1. `apt-get install` system deps: `python3`, `python3-venv`, `python3-pip`, `libusb-1.0-0`, `libjpeg`/`zlib` (Pillow), the watermark TTF font, `x11`/openbox bits for the fullscreen Tk UI (if a screen is attached).
  2. Copy/clone the app to `/opt/munchadda-kiosk`, create a venv, `pip install -r requirements.txt`.
  3. Install + `systemctl enable` the `munchadda-kiosk.service` (autostart on boot) and the X autostart (`xsession.sh`) if running with a display.
  4. **Prompt** for `Kiosk ID`, `API Key`, `API URL` (and printer device if needed) → write `/etc/munchadda-kiosk/secrets.env`.
  5. Start the service. Done — reboots straight into the kiosk.
- **`kiosk/PI_SETUP.md`** — assume-nothing walkthrough: (1) flash **Raspberry Pi OS** with Raspberry Pi Imager (set Wi-Fi + enable SSH in the imager), (2) boot + find the Pi / open a terminal, (3) plug in the scanner + printer, (4) run **one command** (`curl -fsSL <raw bootstrap URL> | bash` — or `cd /opt/munchadda-kiosk && sudo bash scripts/bootstrap-pi.sh`), (5) paste the kiosk credentials when prompted, (6) reboot. Includes the exact printer-driver/USB notes and a "how to get Kiosk ID + API Key from the admin → Register Kiosk dialog" step.

### 15b. Windows — one double-click
- The PyInstaller **`.exe` IS the installer/runtime**: double-click → if unconfigured, the **setup window** opens (kiosk_id, api_key, API URL, printer dropdown, Test print, Save) → it runs. No separate installer needed for v1.
- **`kiosk/WINDOWS.md`** — for you (the builder): how to produce the `.exe` (`pyinstaller build/munchadda-kiosk.spec`); for the client: install the thermal printer's Windows driver, double-click the `.exe`, enter the credentials, pick the printer, optionally tick "start with Windows" (drop a shortcut in `shell:startup`).

## 13. Testing

- **Pi regression:** the Linux path imports and runs exactly as before; no Windows module is imported (verify `import app` on Linux pulls in no `win32`/keyboard libs). `python -m py_compile` all modules.
- **Adapter selection:** `get_scanner`/`connect_printer` return the evdev/Usb pair on Linux and the Windows pair on `win32` (unit-checkable by monkeypatching `sys.platform`).
- **Windows (manual, on a Windows PC):** setup window saves config; Test print works through the installed driver; a real QR scan prints and acks; minimitable window; offline queue still works when the network is pulled.
- **Build:** PyInstaller produces a runnable `.exe` that finds its bundled assets.

## 14. Open notes
- Scanner on Windows is **focus-based** for v1 (simplest, safe). If staff find focusing fiddly, the future upgrade is a global hotkey/HID-pattern capture.
- The `.exe` is unsigned for v1 (Windows SmartScreen may warn; clients click "More info → Run anyway"). Code-signing is a later option.
