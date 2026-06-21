"""
PrintWorker — drives staff-approved cash-bill printing on the kiosk.

Two independent daemon threads guarantee no bill is ever stranded:

  1. Safety poll  — every 45 s, call drain() unconditionally. This alone is
     correct: worst-case latency for a bill to print is 45 s. It needs no
     socket and survives any realtime failure.

  2. Realtime    — a Supabase Realtime (realtime-py / AsyncRealtimeClient)
     subscription on INSERT to public.print_jobs. On connect it drains once
     (connect-drain), and on ANY event it drains again. The scoped JWT from
     get_realtime_token() limits the subscription to our canteen via RLS.
     The realtime push only *wakes* the worker; the receipt DATA and the ack
     travel over the existing kiosk-HMAC REST API, never over the socket.

drain() itself is the single source of truth: it pulls the queue over the
HMAC REST API, prints each job, and acks "printed"/"failed". Both threads
funnel into it, so a dropped socket only costs latency (the poll covers it),
never a lost bill.
"""

import logging
import threading
import time

log = logging.getLogger("print_worker")

# Safety poll cadence — bills print within this many seconds even with the
# realtime socket completely down.
POLL_INTERVAL_SECONDS = 45

# Realtime reconnect backoff (seconds): grows on repeated failure, capped.
_RECONNECT_BACKOFF_START = 2
_RECONNECT_BACKOFF_MAX = 60


class PrintWorker:
    """Owns the cash-bill print loop. Construct with the shared API client and
    printer, then call start(); call stop() on shutdown."""

    def __init__(self, api, printer) -> None:
        self.api = api
        self.printer = printer
        self._running = False
        self._threads: list[threading.Thread] = []
        # Serialise drain() so the poll thread and the realtime thread can't
        # print/ack the same job concurrently.
        self._drain_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._running:
            return
        self._running = True

        t_poll = threading.Thread(
            target=self._safety_loop, name="print_safety_poll", daemon=True
        )
        t_poll.start()
        self._threads.append(t_poll)

        t_rt = threading.Thread(
            target=self._realtime_loop, name="print_realtime", daemon=True
        )
        t_rt.start()
        self._threads.append(t_rt)

        log.info(
            "PrintWorker started (safety poll every %ds + realtime).",
            POLL_INTERVAL_SECONDS,
        )

    def stop(self) -> None:
        self._running = False
        log.info("PrintWorker stopping.")

    # ------------------------------------------------------------------
    # Core: drain the print queue (single source of truth)
    # ------------------------------------------------------------------

    def drain(self) -> None:
        """Fetch the print queue and print + ack each job. Each job is wrapped
        so one failure never stops the rest. Safe to call from any thread."""
        with self._drain_lock:
            try:
                jobs = self.api.get_print_queue()
            except Exception as exc:  # pylint: disable=broad-except
                log.warning("get_print_queue failed: %s", exc)
                return

            if not jobs:
                return

            log.info("Draining %d print job(s).", len(jobs))
            for job in jobs:
                self._print_one(job)

    def _print_one(self, job: dict) -> None:
        """Print a single job and ack the result. Never raises."""
        job_id = job.get("id")
        if not job_id:
            log.warning("Skipping print job with no id: %r", job)
            return

        try:
            ok = self.printer.print_cash_bill(job)
        except Exception as exc:  # pylint: disable=broad-except
            log.exception("print_cash_bill raised for job %s: %s", job_id, exc)
            ok = False

        result = "printed" if ok else "failed"
        if not ok:
            log.warning("Cash bill print FAILED for job %s — acking failed.", job_id)

        try:
            self.api.ack_print_job(job_id, result)
        except Exception as exc:  # pylint: disable=broad-except
            # Ack failed: the safety poll will re-fetch this job and retry,
            # so nothing is stranded — just log it.
            log.warning("ack_print_job(%s, %s) failed: %s", job_id, result, exc)

    # ------------------------------------------------------------------
    # Thread 1: safety poll
    # ------------------------------------------------------------------

    def _safety_loop(self) -> None:
        log.info("Print safety poll started (interval=%ds).", POLL_INTERVAL_SECONDS)
        # Drain immediately on startup so a bill queued while the kiosk was off
        # prints without waiting a full interval.
        if self._running:
            self.drain()
        while self._running:
            time.sleep(POLL_INTERVAL_SECONDS)
            if not self._running:
                break
            try:
                self.drain()
            except Exception as exc:  # pylint: disable=broad-except
                log.exception("Error in print safety loop: %s", exc)

    # ------------------------------------------------------------------
    # Thread 2: realtime (Supabase Realtime / realtime-py, async)
    # ------------------------------------------------------------------

    def _realtime_loop(self) -> None:
        """Run an asyncio event loop in this thread that maintains a Supabase
        Realtime subscription to INSERTs on public.print_jobs. realtime-py
        (>=2.0) is async-only, so we own a private event loop here. On any
        error we reconnect with capped backoff, refreshing the scoped token
        each time."""
        try:
            import asyncio  # noqa: F401  (verify asyncio available)
        except Exception as exc:  # pragma: no cover
            log.warning("asyncio unavailable — realtime disabled: %s", exc)
            return

        backoff = _RECONNECT_BACKOFF_START
        while self._running:
            try:
                # asyncio.run gives each connection attempt a fresh loop, so a
                # crashed connection can't leave a wedged loop behind.
                import asyncio

                asyncio.run(self._realtime_connect_once())
                # Clean return means the socket closed without raising — loop
                # round and reconnect (after refreshing the token).
                backoff = _RECONNECT_BACKOFF_START
            except Exception as exc:  # pylint: disable=broad-except
                log.warning(
                    "Realtime connection error (%s) — reconnecting in %ds.",
                    exc,
                    backoff,
                )

            if not self._running:
                break
            # Sleep in short slices so stop() takes effect quickly.
            slept = 0
            while self._running and slept < backoff:
                time.sleep(1)
                slept += 1
            backoff = min(backoff * 2, _RECONNECT_BACKOFF_MAX)

    async def _realtime_connect_once(self) -> None:
        """Open one realtime connection and serve it until it drops or stop()
        is requested. Raises on connection failure (caller handles backoff)."""
        from realtime import AsyncRealtimeClient

        creds = self.api.get_realtime_token()
        if not creds or not creds.get("supabase_url") or not creds.get("token"):
            raise RuntimeError("realtime token unavailable")

        supabase_url = creds["supabase_url"].rstrip("/")
        anon_key = creds.get("anon_key", "")
        token = creds["token"]

        # Build the realtime websocket URL from the project URL.
        # https://xxx.supabase.co -> wss://xxx.supabase.co/realtime/v1
        ws_url = supabase_url.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/realtime/v1"

        socket = AsyncRealtimeClient(ws_url, anon_key)
        await socket.connect()
        # Scope to our canteen: the JWT carries canteen_id, RLS filters rows.
        await socket.set_auth(token)

        def _on_change(payload) -> None:
            # ANY insert to our canteen's print_jobs → drain. We don't trust
            # the payload contents; it's only a wake signal. drain() pulls the
            # real data over the HMAC REST API.
            log.info("Realtime print_jobs event — draining.")
            try:
                self.drain()
            except Exception as exc:  # pylint: disable=broad-except
                log.exception("drain() from realtime callback failed: %s", exc)

        channel = socket.channel("kiosk-print-jobs")
        channel.on_postgres_changes(
            "INSERT",
            schema="public",
            table="print_jobs",
            callback=_on_change,
        )
        await channel.subscribe()
        log.info("Realtime subscribed to public.print_jobs INSERTs.")

        # Connect-drain: catch anything queued before/while we connected.
        self.drain()

        # Serve the connection. realtime-py listens on the event loop; we just
        # keep this coroutine alive until stop() or the socket dies.
        while self._running and getattr(socket, "is_connected", True):
            import asyncio

            await asyncio.sleep(1)

        try:
            await socket.close()
        except Exception:  # pylint: disable=broad-except
            pass
