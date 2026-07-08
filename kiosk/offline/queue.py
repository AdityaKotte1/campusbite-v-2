"""
OfflineQueue — SQLite-backed store for:
  1. token_cache   : active QR tokens pre-fetched from the server
  2. sync_queue    : scans that happened offline and need server confirmation

Thread-safe: sqlite3 connection opened with check_same_thread=False;
all mutations use a threading.Lock so concurrent writes are serialised.
"""

import json
import logging
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("offline.queue")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS token_cache (
  token      TEXT PRIMARY KEY,
  order_data TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  is_used    INTEGER DEFAULT 0,
  cached_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT NOT NULL,
  scanned_at  TEXT NOT NULL,
  order_data  TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at  TEXT DEFAULT (datetime('now'))
);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class OfflineQueue:
    """Thread-safe SQLite queue for offline kiosk operations."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(
            db_path,
            check_same_thread=False,
            detect_types=sqlite3.PARSE_DECLTYPES,
        )
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")  # better concurrent reads
        self._create_schema()
        log.info("OfflineQueue initialised: %s", db_path)

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _create_schema(self) -> None:
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # ------------------------------------------------------------------
    # token_cache operations
    # ------------------------------------------------------------------

    def upsert_token(self, token: str, order_data: dict, expires_at: str) -> None:
        """Insert or refresh a cached token, PRESERVING is_used.

        The sync loop calls this every ~30s for every server-active token.
        An INSERT OR REPLACE would reset is_used=0, so a token redeemed
        offline (is_used=1) but not yet synced would become re-redeemable.
        This upsert only refreshes order_data/expires_at and never downgrades
        is_used. (Requires token to be a PRIMARY KEY / UNIQUE column.)
        """
        order_json = json.dumps(order_data, ensure_ascii=False)
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO token_cache
                  (token, order_data, expires_at, is_used)
                VALUES (?, ?, ?, 0)
                ON CONFLICT(token) DO UPDATE SET
                  order_data = excluded.order_data,
                  expires_at = excluded.expires_at
                """,
                (token, order_json, expires_at),
            )
            self._conn.commit()

    def get_cached_token(self, token: str) -> Optional[dict]:
        """
        Return cached token row as dict, or None if not found / expired.
        The 'order_data' field is the raw JSON string (caller must parse).
        """
        row = self._conn.execute(
            "SELECT * FROM token_cache WHERE token = ?", (token,)
        ).fetchone()

        if row is None:
            return None

        # Check expiry
        expires_at = row["expires_at"]
        try:
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                log.info("Cached token expired: %s", token)
                return None
        except Exception:
            pass  # unparseable expiry → treat as still valid

        return dict(row)

    def mark_used_offline(self, token: str, order_data_json: str) -> None:
        """Mark a token as used in the local cache."""
        with self._lock:
            self._conn.execute(
                "UPDATE token_cache SET is_used = 1 WHERE token = ?",
                (token,),
            )
            self._conn.commit()
        log.debug("Marked used offline: %s", token)

    def is_token_used(self, token: str) -> bool:
        """Return True if the token is marked is_used=1 in the local cache."""
        row = self._conn.execute(
            "SELECT is_used FROM token_cache WHERE token = ?", (token,)
        ).fetchone()
        return bool(row and row["is_used"])

    def is_token_queued(self, token: str) -> bool:
        """Return True if the token has a pending row in the sync queue."""
        row = self._conn.execute(
            "SELECT 1 FROM sync_queue "
            "WHERE token = ? AND sync_status = 'pending' LIMIT 1",
            (token,),
        ).fetchone()
        return row is not None

    def redeem_offline(self, token: str, order_data_json: str) -> None:
        """Atomically redeem a token offline.

        Marks the cached token is_used=1 AND enqueues it for server sync in a
        SINGLE transaction, so a crash can never leave the token used locally
        but unqueued (which would mean the server is never told).
        """
        with self._lock:
            self._conn.execute(
                "UPDATE token_cache SET is_used = 1 WHERE token = ?",
                (token,),
            )
            self._conn.execute(
                """
                INSERT INTO sync_queue (token, scanned_at, order_data, sync_status)
                VALUES (?, ?, ?, 'pending')
                """,
                (token, _now_iso(), order_data_json),
            )
            self._conn.commit()
        log.info("Redeemed offline (marked used + queued): %s", token)

    # ------------------------------------------------------------------
    # sync_queue operations
    # ------------------------------------------------------------------

    def add_to_sync_queue(self, token: str, order_data_json: str) -> None:
        """Queue an offline scan for later server confirmation."""
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO sync_queue (token, scanned_at, order_data, sync_status)
                VALUES (?, ?, ?, 'pending')
                """,
                (token, _now_iso(), order_data_json),
            )
            self._conn.commit()
        log.info("Queued offline scan: %s", token)

    def get_pending_syncs(self) -> list[dict]:
        """Return all rows with sync_status = 'pending'."""
        rows = self._conn.execute(
            "SELECT * FROM sync_queue WHERE sync_status = 'pending' ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]

    def mark_synced(self, scan_id: int, status: str = "synced") -> None:
        """Update a sync_queue row's status."""
        with self._lock:
            self._conn.execute(
                "UPDATE sync_queue SET sync_status = ? WHERE id = ?",
                (status, scan_id),
            )
            self._conn.commit()

    def pending_count(self) -> int:
        row = self._conn.execute(
            "SELECT COUNT(*) FROM sync_queue WHERE sync_status = 'pending'"
        ).fetchone()
        return row[0] if row else 0

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    def clean_expired_cache(self) -> int:
        """Delete tokens whose expires_at is in the past.  Returns count."""
        with self._lock:
            cursor = self._conn.execute(
                "DELETE FROM token_cache WHERE expires_at < datetime('now')"
            )
            self._conn.commit()
        n = cursor.rowcount
        if n:
            log.info("Cleaned %d expired token(s) from cache.", n)
        return n

    def refresh_active_tokens(self, api, canteen_id: str) -> None:
        """
        Fetch the current active-token list from the server and upsert each
        into the local cache.  Silently skips on API failure.
        """
        try:
            tokens = api.fetch_active_tokens(canteen_id)
        except Exception as exc:
            log.warning("refresh_active_tokens fetch failed: %s", exc)
            return

        if not tokens:
            log.debug("No active tokens returned from server.")
            return

        for entry in tokens:
            try:
                token = entry["token"]
                order_data = entry.get("order_data", {})
                expires_at = entry.get("expires_at", "")
                self.upsert_token(token, order_data, expires_at)
            except Exception as exc:
                log.warning("Failed to upsert token entry: %s — %s", entry, exc)

        log.info("Refreshed %d active token(s) in local cache.", len(tokens))
