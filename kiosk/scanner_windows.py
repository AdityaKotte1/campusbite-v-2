"""scanner_windows.py — Windows HID-scanner capture via the focused Tk window.
A USB QR scanner types the payload fast and ends with Enter; we accumulate key
presses on the Tk root and fire on Return. Focus the agent window to scan."""
import logging
from typing import Callable, Optional

log = logging.getLogger("scanner")

class WindowsScanner:
    def __init__(self, tk_root) -> None:
        self.on_scan: Optional[Callable[[str], None]] = None
        self._root = tk_root
        self._buffer = ""

    def start(self) -> None:
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
