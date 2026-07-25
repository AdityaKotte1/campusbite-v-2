"""
BarcodeScanner — reads from a Honeywell 1450g in HID/keyboard mode.

Primary:  evdev (Linux, Raspberry Pi) — grabs the raw input device so
          keystrokes do NOT pass through to the desktop.
Fallback: stdin readline (dev/testing on any OS).
"""

import logging
import string
import threading
import time
from typing import Callable, Optional

log = logging.getLogger("scanner")

# ---------------------------------------------------------------------------
# evdev keycode → character mapping
# Covers codes 2–57 (numbers + top-row symbols, letters, hyphen, period,
# slash — everything needed to read a UUID-style munchadda:// URI).
# ---------------------------------------------------------------------------
_KEYMAP_NORMAL: dict[int, str] = {
    # Number row (unshifted)
    2: "1",  3: "2",  4: "3",  5: "4",  6: "5",
    7: "6",  8: "7",  9: "8", 10: "9", 11: "0",
    12: "-", 13: "=",
    # QWERTY rows
    16: "q", 17: "w", 18: "e", 19: "r", 20: "t",
    21: "y", 22: "u", 23: "i", 24: "o", 25: "p",
    26: "[", 27: "]",
    30: "a", 31: "s", 32: "d", 33: "f", 34: "g",
    35: "h", 36: "j", 37: "k", 38: "l",
    39: ";", 40: "'", 41: "`",
    43: "\\",
    44: "z", 45: "x", 46: "c", 47: "v", 48: "b",
    49: "n", 50: "m",
    51: ",", 52: ".", 53: "/",
    57: " ",
}

_KEYMAP_SHIFTED: dict[int, str] = {
    2: "!",  3: "@",  4: "#",  5: "$",  6: "%",
    7: "^",  8: "&",  9: "*", 10: "(", 11: ")",
    12: "_", 13: "+",
    16: "Q", 17: "W", 18: "E", 19: "R", 20: "T",
    21: "Y", 22: "U", 23: "I", 24: "O", 25: "P",
    26: "{", 27: "}",
    30: "A", 31: "S", 32: "D", 33: "F", 34: "G",
    35: "H", 36: "J", 37: "K", 38: "L",
    39: ":", 40: '"', 41: "~",
    43: "|",
    44: "Z", 45: "X", 46: "C", 47: "V", 48: "B",
    49: "N", 50: "M",
    51: "<", 52: ">", 53: "?",
    57: " ",
}

# Keycode for Enter (fires on_scan)
_KEY_ENTER = 28
# Keycodes for left/right Shift
_KEY_SHIFT = {42, 54}
# Keycode for Backspace
_KEY_BACKSPACE = 14


class BarcodeScanner:
    """Reads barcodes from a USB HID scanner (keyboard-emulation mode)."""

    def __init__(self) -> None:
        self.on_scan: Optional[Callable[[str], None]] = None
        self._buffer: str = ""
        self._running: bool = False

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Blocking — call in a daemon thread.  Tries evdev then stdin.

        The evdev path runs inside a reconnect loop: if the scanner drops off
        USB (Errno 19 — common on the Pi when the printer browns out the bus),
        the read loop ends and we re-find + re-grab the device instead of dying,
        so scanning self-heals without a reboot.
        """
        self._running = True

        try:
            import evdev  # type: ignore  # Linux only
        except Exception as exc:  # pylint: disable=broad-except
            log.info("evdev not available (%s) — falling back to stdin scanner.", exc)
            self._start_stdin()
            return

        backoff = 1
        while self._running:
            try:
                self._start_evdev(evdev)  # returns on disconnect or stop()
                backoff = 1  # a session ran; reset the backoff
            except Exception as exc:  # pylint: disable=broad-except
                # Usually "no scanner found" right after a disconnect.
                log.warning("Scanner unavailable (%s)", exc)
            if not self._running:
                break
            log.info("Re-acquiring scanner in %ds …", backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, 10)

    def stop(self) -> None:
        self._running = False

    # ------------------------------------------------------------------
    # evdev path (Raspberry Pi / Linux)
    # ------------------------------------------------------------------

    def _start_evdev(self, evdev) -> None:
        self._buffer = ""  # drop any partial read left over from a disconnect
        device = self._find_device(evdev)
        if device is None:
            raise RuntimeError("No compatible barcode scanner found via evdev.")

        log.info("Scanner found: %s (%s)", device.name, device.path)

        # Grab the device so the OS doesn't also see the keystrokes
        try:
            device.grab()
            log.info("evdev device grabbed exclusively.")
        except Exception as exc:
            log.warning("Could not grab device: %s", exc)

        shift_held = False

        try:
            for event in device.read_loop():
                if not self._running:
                    break

                # We only care about EV_KEY events
                if event.type != evdev.ecodes.EV_KEY:
                    continue

                key_event = evdev.categorize(event)

                if key_event.keystate == evdev.events.KeyEvent.key_down:
                    code = key_event.scancode

                    if code in _KEY_SHIFT:
                        shift_held = True
                        continue

                    if code == _KEY_ENTER:
                        data = self._buffer.strip()
                        self._buffer = ""
                        if data:
                            log.debug("evdev scan: %s", data[:60])
                            self._fire(data)
                        continue

                    if code == _KEY_BACKSPACE:
                        self._buffer = self._buffer[:-1]
                        continue

                    keymap = _KEYMAP_SHIFTED if shift_held else _KEYMAP_NORMAL
                    char = keymap.get(code)
                    if char is not None:
                        self._buffer += char

                elif key_event.keystate == evdev.events.KeyEvent.key_up:
                    if key_event.scancode in _KEY_SHIFT:
                        shift_held = False

        except OSError as exc:
            log.error("evdev read error: %s — scanner disconnected?", exc)
        finally:
            try:
                device.ungrab()
            except Exception:
                pass

    @staticmethod
    def _find_device(evdev):
        """Return the first input device that looks like a barcode scanner."""
        keywords = ("barcode", "scanner", "honeywell", "zebra", "netum", "1450")
        devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
        log.debug("evdev devices found: %s", [d.name for d in devices])

        for dev in devices:
            name_lower = dev.name.lower()
            if any(kw in name_lower for kw in keywords):
                return dev

        # Second pass: look for any device that has all letter keys
        # (a generic HID keyboard emulator)
        for dev in devices:
            caps = dev.capabilities()
            key_codes = caps.get(evdev.ecodes.EV_KEY, [])
            # Check for presence of A–Z keys (codes 30–55)
            letter_codes = set(range(30, 56))
            if letter_codes.issubset(set(key_codes)):
                log.info(
                    "Using generic keyboard device as scanner: %s", dev.name
                )
                return dev

        return None

    # ------------------------------------------------------------------
    # stdin fallback (development / Windows testing)
    # ------------------------------------------------------------------

    def _start_stdin(self) -> None:
        import sys

        log.info("Scanner running in stdin fallback mode — type barcodes + Enter.")
        while self._running:
            try:
                line = sys.stdin.readline()
                if not line:  # EOF
                    break
                data = line.strip()
                if data:
                    log.debug("stdin scan: %s", data[:60])
                    self._fire(data)
            except (KeyboardInterrupt, EOFError):
                break
            except Exception as exc:
                log.exception("stdin scanner error: %s", exc)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _fire(self, data: str) -> None:
        if callable(self.on_scan):
            try:
                self.on_scan(data)
            except Exception as exc:  # pylint: disable=broad-except
                log.exception("on_scan callback raised: %s", exc)
        else:
            log.warning("on_scan callback not set — dropping scan: %s", data[:40])


def get_scanner(tk_root=None):
    """Return the OS-appropriate scanner. Linux/Pi: evdev (BarcodeScanner).
    Windows: focus-based WindowsScanner (needs the Tk root window)."""
    import sys
    if sys.platform == "win32":
        from scanner_windows import WindowsScanner
        if tk_root is None:
            raise RuntimeError("Windows scanner requires the Tk root window")
        return WindowsScanner(tk_root)
    return BarcodeScanner()
