"""
HeadlessDisplay — a no-GUI stand-in for KioskDisplay.

Used when the kiosk runs without a monitor (scan + print only). It implements
the exact same public interface as KioskDisplay, but instead of drawing a
Tkinter window it writes feedback to the log. run() blocks the main thread
until stop() is called, so the scanner / sync / heartbeat daemon threads keep
running just as they would behind the real GUI's mainloop.

Select this by setting `display.headless: true` in kiosk.yaml.
"""

import logging
import threading

log = logging.getLogger("display")


class HeadlessDisplay:
    """Drop-in, screen-less replacement for KioskDisplay."""

    def __init__(self, config: dict, audio=None) -> None:
        self.config = config
        self.audio = audio
        self._stop = threading.Event()

    # ------------------------------------------------------------------
    # Public API — same signatures as KioskDisplay, but log-only
    # ------------------------------------------------------------------

    def show_idle(self) -> None:
        log.info("[idle] Ready — waiting for next scan.")

    def show_processing(self) -> None:
        log.info("[processing] Validating QR …")

    def show_success(
        self,
        token_number,
        order_number: str = "",
        items: list = None,
        offline: bool = False,
    ) -> None:
        items = items or []
        summary = ", ".join(
            f"{it.get('quantity', 1)}x {it.get('name', 'Item')}" for it in items
        ) or "—"
        tag = " (OFFLINE)" if offline else ""
        log.info(
            "[COLLECTED]%s Token #%s | Order %s | %s",
            tag, token_number, order_number or "—", summary,
        )

    def show_error(self, error_code: str, message: str = "") -> None:
        log.warning("[REJECTED] %s — %s", error_code, message or "")

    # ------------------------------------------------------------------
    # Entry point (call from main thread)
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Block the main thread until stop(), keeping daemon threads alive."""
        log.info("Headless display active (no monitor) — scan + print only.")
        self._stop.wait()
        log.info("Headless display stopped.")

    def stop(self) -> None:
        """Signal run() to return so the app can shut down cleanly."""
        self._stop.set()
