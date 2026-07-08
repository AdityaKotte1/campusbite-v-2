"""
KioskApp — top-level orchestrator.

Wires together: config, API client, offline queue, sync manager,
audio, printer, display, and scanner into a single runnable object.
"""

import collections
import logging
import os
import re
import threading
import time
from typing import Optional

import yaml

log = logging.getLogger("app")

# Debounce window: ignore identical scans within this many seconds
_SCAN_DEBOUNCE = 3.0

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


def _redact(token: str) -> str:
    """Show first 8 + last 4 chars only."""
    if not token or len(token) <= 12:
        return "****"
    return f"{token[:8]}...{token[-4:]}"


class _ScanRateLimiter:
    """Allow at most max_per_window scans in the last window_seconds."""
    def __init__(self, max_per_window: int = 60, window_seconds: float = 60.0):
        self._max = max_per_window
        self._window = window_seconds
        self._times: collections.deque = collections.deque()

    def allow(self) -> bool:
        now = time.monotonic()
        # Evict old entries
        while self._times and self._times[0] < now - self._window:
            self._times.popleft()
        if len(self._times) >= self._max:
            return False
        self._times.append(now)
        return True


def load_pi_config(base_dir: str) -> dict:
    """Load kiosk.yaml; fall back to kiosk.yaml.example with a warning.

    Linux/Pi-only config path. Extracted from KioskApp.__init__ so that the
    OS-aware loader in config.py can reuse it unchanged. Behavior is identical
    to the previous inline _load_config — only the name moved.
    """
    primary = os.path.join(base_dir, "config", "kiosk.yaml")
    example = os.path.join(base_dir, "config", "kiosk.yaml.example")

    if os.path.exists(primary):
        path = primary
    elif os.path.exists(example):
        log.warning(
            "kiosk.yaml not found — using example config. "
            "Copy config/kiosk.yaml.example to config/kiosk.yaml and edit it."
        )
        path = example
    else:
        raise FileNotFoundError(
            "No kiosk.yaml or kiosk.yaml.example found in config/"
        )

    with open(path, "r", encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)

    log.info("Config loaded from %s", path)
    return cfg


class KioskApp:
    """Main application class.  Instantiate once; call run() to start."""

    def __init__(self, base_dir: str, config: Optional[dict] = None) -> None:
        self.base_dir = base_dir
        if config is not None:
            # Pre-loaded by main.py (already normalized + Windows env set).
            self.config = config
        else:
            from config import load_config
            self.config = load_config(base_dir)
        if self.config is None:
            raise RuntimeError(
                "Kiosk is not configured. Run the Windows setup window to "
                "create %APPDATA%\\MunchAdda\\config.json."
            )

        # --- State for scan deduplication ---
        self._processing = False
        self._last_token: Optional[str] = None
        self._last_scan_time: float = 0.0
        self._lock = threading.Lock()
        self._rate_limiter = _ScanRateLimiter(max_per_window=60, window_seconds=60.0)

        # --- Sub-systems (constructed in order of dependency) ---
        log.info("Initialising API client …")
        from api_client import MunchAddaAPI
        self.api = MunchAddaAPI(self.config)

        log.info("Initialising offline queue …")
        from offline.queue import OfflineQueue
        db_path = os.path.join(base_dir, "db", "kiosk.db")
        self.queue = OfflineQueue(db_path)

        log.info("Initialising sync manager …")
        from offline.sync import SyncManager
        self.syncer = SyncManager(self.api, self.queue)

        log.info("Initialising audio …")
        from audio import AudioManager
        sounds_dir = os.path.join(base_dir, "assets", "sounds")
        self.audio = AudioManager(sounds_dir, self.config.get("audio", {}))

        log.info("Initialising printer …")
        from printer import ThermalPrinter
        self.printer = ThermalPrinter(self.config.get("printer", {}))

        log.info("Initialising display …")
        display_cfg = self.config.get("display", {})
        if display_cfg.get("headless", False):
            from headless_display import HeadlessDisplay
            self.display = HeadlessDisplay(display_cfg, audio=self.audio)
            log.info("Display mode: headless (no monitor) — scan + print only.")
        else:
            from display import KioskDisplay
            self.display = KioskDisplay(display_cfg, audio=self.audio)

        log.info("Initialising scanner …")
        import sys
        from scanner import get_scanner
        if sys.platform == "win32":
            # The Windows scanner binds keys on the Tk root, which only exists
            # after the display window is set up. Defer its creation to run(),
            # after self.display.root is live. (None here; built later.)
            self.scanner = None
        else:
            self.scanner = get_scanner(tk_root=None)  # Linux/Pi: evdev
            self.scanner.on_scan = self.handle_scan

        # Daemon threads (started in run())
        self._threads: list[threading.Thread] = []
        self._running = False

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Start all background threads and the Tkinter main loop (blocking)."""
        self._running = True

        self.audio.play("startup")

        # Background threads (all daemon so they die when main thread exits)
        if self.scanner is not None:
            # Linux/Pi: evdev scanner runs its own blocking read loop.
            self._start_daemon("scanner", self.scanner.start)
        self._start_daemon("sync_loop", self._sync_loop)
        self._start_daemon("heartbeat_loop", self._heartbeat_loop)

        # Windows: the scanner binds keys on the Tk root, which only exists
        # once the display has been set up (display.run() creates it on the
        # main thread). A tiny waiter thread blocks on the display's
        # _setup_done event, then schedules the bind on the Tk main thread.
        if self.scanner is None:
            self._start_daemon("win_scanner_boot", self._boot_windows_scanner)

        log.info("Starting display main loop …")
        self.display.run()  # Blocks until window is closed

        # If display exits, stop background threads
        self._running = False
        log.info("Display closed — application shutting down.")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _start_daemon(self, name: str, target) -> None:
        t = threading.Thread(target=target, name=name, daemon=True)
        t.start()
        self._threads.append(t)
        log.debug("Daemon thread started: %s", name)

    def _boot_windows_scanner(self) -> None:
        """Windows only: wait until the Tk root exists, then build + start the
        focus-based scanner on the Tk main thread. KioskDisplay sets
        _setup_done once its root is live; we schedule the key-bind via the
        display's thread-safe _schedule helper."""
        from scanner import get_scanner

        # Wait for the display's Tk root to be created (set in _setup()).
        if not self.display._setup_done.wait(timeout=30):
            log.error("Display did not initialise in time — Windows scanner not started.")
            return

        def _bind():
            self.scanner = get_scanner(tk_root=self.display.root)
            self.scanner.on_scan = self.handle_scan
            self.scanner.start()
            log.info("Windows scanner bound to Tk root.")

        self.display._schedule(_bind)

    # ------------------------------------------------------------------
    # Scan handling
    # ------------------------------------------------------------------

    def handle_scan(self, raw_data: str) -> None:
        """Called by the scanner thread whenever a complete barcode is read."""
        if not self._rate_limiter.allow():
            log.warning("Scan rate limit exceeded — ignoring scan")
            return

        raw_data = (raw_data or "").strip()
        if not raw_data:
            return

        now = time.monotonic()

        with self._lock:
            # Debounce: same token within 3 seconds → ignore
            if (
                raw_data == self._last_token
                and (now - self._last_scan_time) < _SCAN_DEBOUNCE
            ):
                log.debug("Debounced duplicate scan: %s", _redact(raw_data) if raw_data else "")
                return

            if self._processing:
                log.debug("Scan ignored — already processing.")
                return

            self._processing = True
            self._last_token = raw_data
            self._last_scan_time = now

        log.debug("Scan received raw_data: %s", _redact(raw_data) if raw_data else "")

        # Parse QR token
        prefix = "munchadda://qr/"
        if raw_data.startswith(prefix):
            token = raw_data[len(prefix):]
        else:
            # Treat the whole string as a raw token (testing convenience)
            token = raw_data

        if not token:
            log.warning("Empty token after stripping prefix.")
            self._finish_processing()
            return

        # Validate token is a proper UUID before sending to API
        if not _UUID_RE.match(token):
            log.warning("Rejected invalid token format (len=%d, preview=%.20r)", len(token), token)
            # show error to user and return
            self.display.show_error("INVALID_QR", "QR code not recognised")
            self.audio.play("error")
            time.sleep(3)
            self.display.show_idle()
            self._finish_processing()
            return

        log.info("Scan accepted: %s", _redact(token))

        # Run scan handling in a new thread so scanner thread doesn't block
        threading.Thread(
            target=self._process_token,
            args=(token,),
            name="scan_worker",
            daemon=True,
        ).start()

    def _process_token(self, token: str) -> None:
        """Background worker: show processing, try online then offline."""
        try:
            self.display.show_processing()

            if self.api.is_online():
                self._handle_online_scan(token)
            else:
                log.info("Offline — attempting local cache lookup for %s", _redact(token))
                self._handle_offline_scan(token)
        except Exception as exc:  # pylint: disable=broad-except
            log.exception("Unhandled error in _process_token: %s", exc)
            self.display.show_error("SERVER_ERROR", str(exc))
            self.audio.play("error")
            time.sleep(4)
            self.display.show_idle()
        finally:
            self._finish_processing()

    def _finish_processing(self) -> None:
        with self._lock:
            self._processing = False

    def _handle_online_scan(self, token: str) -> None:
        """POST to server, handle response codes."""
        # Idempotency guard: if this token was already redeemed offline
        # (marked used locally, or still pending in the sync queue), the
        # server may not know yet. Reject locally as already-collected
        # instead of asking the server, which could green-light a re-scan.
        if self.queue.is_token_used(token) or self.queue.is_token_queued(token):
            log.info(
                "Token already redeemed offline (used/queued) — rejecting online scan: %s",
                _redact(token),
            )
            self.display.show_error("ALREADY_USED", "Order already collected.")
            self.audio.play("error")
            time.sleep(4)
            self.display.show_idle()
            return

        result = self.api.scan_token(token)

        if result is None:
            # Network error even though is_online() returned True (race)
            log.warning("scan_token returned None for %s — trying offline", _redact(token))
            self._handle_offline_scan(token)
            return

        success = result.get("success", False)
        error_code = result.get("error_code", "")

        if success:
            self._handle_success(result, offline=False)
        else:
            log.info(
                "Scan rejected online: error_code=%s token=%s", error_code, _redact(token)
            )
            self.display.show_error(error_code, result.get("message", ""))
            self.audio.play("error")
            time.sleep(4)
            self.display.show_idle()

    def _handle_offline_scan(self, token: str) -> None:
        """Check local SQLite cache; queue for later sync."""
        cached = self.queue.get_cached_token(token)

        if cached is None:
            log.info("Token not in local cache: %s", _redact(token))
            self.display.show_error("NOT_FOUND", "QR code not recognised (offline).")
            self.audio.play("error")
            time.sleep(4)
            self.display.show_idle()
            return

        if cached.get("is_used"):
            log.info("Token already marked used in local cache: %s", _redact(token))
            self.display.show_error("ALREADY_USED", "Order already collected.")
            self.audio.play("error")
            time.sleep(4)
            self.display.show_idle()
            return

        import json
        order_data = json.loads(cached["order_data"])
        # Atomic: mark used + enqueue for sync in a single transaction so a
        # crash can't leave the token used locally but never queued.
        self.queue.redeem_offline(token, cached["order_data"])
        log.info("Offline scan accepted for token %s — queued for sync.", _redact(token))
        self._handle_success(order_data, offline=True)

    def _handle_success(self, result: dict, offline: bool = False) -> None:
        """Show success screen, print receipt, play sound, wait, go idle."""
        token_number = result.get("token_number") or result.get("display_number", "—")
        order_number = result.get("order_number", "")
        items = result.get("items", [])

        self.display.show_success(
            token_number=token_number,
            order_number=order_number,
            items=items,
            offline=offline,
        )
        self.audio.play("success")

        # Print receipt in background so UI isn't blocked
        threading.Thread(
            target=self._print_receipt_safe,
            args=(result, offline),
            name="print_worker",
            daemon=True,
        ).start()

        time.sleep(4)
        self.display.show_idle()

    def _print_receipt_safe(self, order_data: dict, offline: bool) -> None:
        try:
            if offline:
                order_data = dict(order_data)
                order_data["_offline_scan"] = True
            ok = self.printer.print_receipt(order_data)
            if not ok:
                log.warning("Receipt print failed for order %s", order_data.get("order_number"))
        except Exception as exc:  # pylint: disable=broad-except
            log.exception("Exception during receipt printing: %s", exc)

    # ------------------------------------------------------------------
    # Background loops
    # ------------------------------------------------------------------

    def _sync_loop(self) -> None:
        """Every 30 s: sync pending offline scans + refresh token cache."""
        interval = self.config.get("offline", {}).get("sync_interval_seconds", 30)
        log.info("Sync loop started (interval=%ds).", interval)

        while self._running:
            time.sleep(interval)
            if not self._running:
                break
            try:
                if self.api.is_online():
                    pending = self.queue.pending_count()
                    if pending:
                        log.info("Syncing %d pending offline scans …", pending)
                        self.syncer.sync_pending()
                    canteen_id = self.config["kiosk"]["canteen_id"]
                    self.queue.refresh_active_tokens(self.api, canteen_id)
                    self.queue.clean_expired_cache()
            except Exception as exc:  # pylint: disable=broad-except
                log.exception("Error in sync loop: %s", exc)

    def _heartbeat_loop(self) -> None:
        """Every 60 s: POST heartbeat with printer status."""
        log.info("Heartbeat loop started.")
        while self._running:
            time.sleep(60)
            if not self._running:
                break
            try:
                printer_status = self.printer.get_status()
                self.api.send_heartbeat(
                    {
                        "printer_status": printer_status,
                        "pending_syncs": self.queue.pending_count(),
                        "online": True,
                    }
                )
            except Exception as exc:  # pylint: disable=broad-except
                log.exception("Error in heartbeat loop: %s", exc)
