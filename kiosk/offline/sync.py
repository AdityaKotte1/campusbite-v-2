"""
SyncManager — uploads queued offline scans to the MunchAdda server
in batches of 50 and marks each as synced or conflicted.
"""

import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from api_client import MunchAddaAPI
    from offline.queue import OfflineQueue

log = logging.getLogger("offline.sync")

_BATCH_SIZE = 50


class SyncManager:
    """Pushes pending offline scans to the server."""

    def __init__(self, api: "MunchAddaAPI", queue: "OfflineQueue") -> None:
        self.api = api
        self.queue = queue

    def sync_pending(self) -> int:
        """
        Upload all pending offline scans in batches.

        Returns the number of records successfully synced.
        """
        pending = self.queue.get_pending_syncs()
        if not pending:
            log.debug("sync_pending: nothing to sync.")
            return 0

        log.info("sync_pending: %d record(s) to sync.", len(pending))
        total_synced = 0

        # Process in batches
        for batch_start in range(0, len(pending), _BATCH_SIZE):
            batch = pending[batch_start : batch_start + _BATCH_SIZE]
            synced = self._sync_batch(batch)
            total_synced += synced

        log.info("sync_pending complete: %d/%d synced.", total_synced, len(pending))
        return total_synced

    def _sync_batch(self, batch: list[dict]) -> int:
        """Upload a single batch; update statuses.  Returns count synced."""
        payload = []
        for row in batch:
            entry: dict = {
                "token": row["token"],
                "scanned_at": row["scanned_at"],
            }
            # Include order_data if available
            if row.get("order_data"):
                try:
                    entry["order_data"] = json.loads(row["order_data"])
                except (ValueError, TypeError):
                    entry["order_data"] = {}
            payload.append(entry)

        try:
            result = self.api.sync_offline_scans(payload)
        except Exception as exc:
            log.error("sync_batch API call failed: %s", exc)
            return 0

        if result is None:
            log.warning("sync_batch: API returned None (network failure?).")
            return 0

        # The response envelope may be flat ({"results": [...]}) or wrapped
        # under "data" ({"data": {"results": [...]}}) — support both, matching
        # api_client.fetch_active_tokens which reads result["data"][...].
        results_list = result.get("results")
        if results_list is None:
            results_list = result.get("data", {}).get("results")
        if not isinstance(results_list, list):
            log.warning("sync_batch: response missing/invalid results list — keeping batch pending.")
            results_list = []

        # Build token→status map from response (only explicit per-token acks).
        status_map: dict[str, str] = {}
        for item in results_list:
            tok = item.get("token")
            status = item.get("status")
            if tok and status:
                status_map[tok] = status

        synced_count = 0
        for row in batch:
            token = row["token"]
            scan_id = row["id"]
            # Only act on an EXPLICIT per-token acknowledgement. Any token the
            # server did not explicitly answer stays 'pending' so it retries on
            # the next sync — never silently dropped on partial/truncated/
            # misparsed responses (which would lose the offline redemption).
            server_status = status_map.get(token)

            if server_status == "synced":
                self.queue.mark_synced(scan_id, "synced")
                synced_count += 1
            elif server_status == "conflict":
                # Permanent: token was already scanned online before sync ran.
                self.queue.mark_synced(scan_id, "conflict")
                log.warning(
                    "Sync conflict for token %s (scan_id=%d) — likely already "
                    "scanned online before sync ran.",
                    token, scan_id,
                )
            elif server_status in ("invalid", "rejected"):
                # Server explicitly rejected this scan as invalid — drop it so
                # it does not retry forever.
                self.queue.mark_synced(scan_id, server_status)
                log.error(
                    "Server rejected token %s as %s (scan_id=%d) — dropping.",
                    token, server_status, scan_id,
                )
            else:
                # Missing ack or transient 'error' → keep pending for retry.
                log.warning(
                    "No definitive ack for token %s (scan_id=%d, status=%r) — "
                    "keeping pending for retry.",
                    token, scan_id, server_status,
                )

        return synced_count
