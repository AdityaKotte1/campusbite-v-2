"""
MunchAddaAPI — HMAC-signed HTTP client for the MunchAdda backend.

Every request carries three authentication headers:
  X-Kiosk-ID          kiosk UUID from config
  X-Kiosk-Timestamp   Unix timestamp (seconds, string)
  X-Kiosk-Signature   HMAC-SHA256 over canonical payload

Canonical payload:
  {METHOD}\\n{path}\\n{timestamp}\\n{sha256_hex(body_bytes)}
"""

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger("api_client")


class MunchAddaAPI:
    """Authenticated API client.  Thread-safe (requests.Session is not by
    default, so each method builds its own per-call headers)."""

    def __init__(self, config: dict) -> None:
        self.base_url = config["server"]["base_url"].rstrip("/")
        self.timeout = config["server"].get("timeout_seconds", 10)
        self.retry_attempts = config["server"].get("retry_attempts", 3)
        self.retry_delay = config["server"].get("retry_delay_seconds", 1)

        self.kiosk_id = config["kiosk"]["id"]

        # Prefer environment variable over config file (more secure)
        self.api_key = os.environ.get('MUNCHADDA_API_KEY') or config.get('kiosk', {}).get('api_key', '')
        if not self.api_key:
            raise ValueError("MUNCHADDA_API_KEY env var or kiosk.api_key config required")
        if not os.environ.get('MUNCHADDA_API_KEY') and config.get('kiosk', {}).get('api_key'):
            log.warning(
                "API key loaded from kiosk.yaml — consider using MUNCHADDA_API_KEY env var instead"
            )

        # Session with retry on transient HTTP errors
        self._session = requests.Session()
        retry = Retry(
            total=self.retry_attempts,
            backoff_factor=self.retry_delay,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)

    # ------------------------------------------------------------------
    # HMAC signing
    # ------------------------------------------------------------------

    def _sign_request(self, method: str, path: str, body: bytes) -> dict:
        """Return auth headers for the given request."""
        timestamp = str(int(time.time()))
        body_hash = hashlib.sha256(body).hexdigest()
        payload = f"{method.upper()}\n{path}\n{timestamp}\n{body_hash}"
        signature = hmac.new(
            self.api_key.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return {
            "X-Kiosk-ID": self.kiosk_id,
            "X-Kiosk-Timestamp": timestamp,
            "X-Kiosk-Signature": signature,
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Low-level request helpers
    # ------------------------------------------------------------------

    def _post(self, path: str, data: dict) -> Optional[dict]:
        """JSON POST.  Returns parsed response dict or None on failure."""
        url = self.base_url + path
        body = json.dumps(data, separators=(",", ":")).encode("utf-8")
        headers = self._sign_request("POST", path, body)

        last_exc = None
        for attempt in range(1, self.retry_attempts + 1):
            try:
                resp = self._session.post(
                    url,
                    data=body,
                    headers=headers,
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.Timeout as exc:
                log.warning("POST %s timed out (attempt %d/%d)", path, attempt, self.retry_attempts)
                last_exc = exc
            except requests.exceptions.ConnectionError as exc:
                log.warning("POST %s connection error (attempt %d/%d): %s", path, attempt, self.retry_attempts, exc)
                last_exc = exc
            except requests.exceptions.HTTPError as exc:
                # 4xx errors are not retried — return response body if JSON
                log.warning("POST %s HTTP %s", path, exc.response.status_code if exc.response else "?")
                try:
                    return exc.response.json()
                except Exception:
                    return {"success": False, "error_code": "HTTP_ERROR", "message": str(exc)}
            except Exception as exc:
                log.exception("POST %s unexpected error: %s", path, exc)
                last_exc = exc

            if attempt < self.retry_attempts:
                time.sleep(self.retry_delay * attempt)

        log.error("POST %s failed after %d attempts: %s", path, self.retry_attempts, last_exc)
        return None

    def _get(self, path: str, params: Optional[dict] = None, timeout: Optional[int] = None) -> Optional[dict]:
        """Signed GET.  Returns parsed response dict or None on failure."""
        url = self.base_url + path
        body = b""
        headers = self._sign_request("GET", path, body)
        _timeout = timeout if timeout is not None else self.timeout

        try:
            resp = self._session.get(
                url,
                params=params,
                headers=headers,
                timeout=_timeout,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.Timeout:
            log.debug("GET %s timed out.", path)
            return None
        except requests.exceptions.ConnectionError:
            log.debug("GET %s connection error.", path)
            return None
        except Exception as exc:
            log.debug("GET %s error: %s", path, exc)
            return None

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    def is_online(self) -> bool:
        """Quick connectivity check.  Returns True if server is reachable."""
        result = self._get("/api/health", timeout=3)
        return result is not None

    def scan_token(self, token: str) -> Optional[dict]:
        """
        POST /api/v1/kiosk/scan
        Body: {"token": "<uuid>"}

        Expected success response:
          {
            "success": true,
            "token_number": 42,
            "order_number": "CB-241215-001234",
            "canteen_name": "Main Canteen",
            "items": [...],
            "subtotal_paise": 9000,
            "gst_paise": 450,
            "total_paise": 9450,
            "scanned_at": "2024-12-15T13:15:00Z"
          }

        Expected error response:
          {"success": false, "error_code": "ALREADY_USED", "message": "..."}
        """
        return self._post(
            "/api/v1/kiosk/scan",
            {"token": token},
        )

    def send_heartbeat(self, status: dict) -> None:
        """POST /api/v1/kiosk/heartbeat.  Never raises."""
        try:
            self._post("/api/v1/kiosk/heartbeat", status)
        except Exception as exc:
            log.debug("Heartbeat failed (suppressed): %s", exc)

    def sync_offline_scans(self, scans: list) -> Optional[dict]:
        """
        POST /api/v1/kiosk/sync-offline
        Body: {"scans": [...]}

        Expected response:
          {
            "results": [
              {"token": "...", "status": "synced" | "conflict" | "error"},
              ...
            ]
          }
        """
        return self._post("/api/v1/kiosk/sync-offline", {"scans": scans})

    def fetch_active_tokens(self, canteen_id: str) -> list:
        """
        POST /api/v1/kiosk/cache
        Body: {"canteen_id": "..."}

        Expected response:
          {
            "tokens": [
              {
                "token": "<uuid>",
                "order_data": {...},   // full order dict
                "expires_at": "2024-12-15T14:00:00Z"
              },
              ...
            ]
          }

        Returns list of token dicts (may be empty on error).
        """
        result = self._post("/api/v1/kiosk/cache", {"canteen_id": canteen_id})
        if result and isinstance(result.get("data", {}).get("tokens"), list):
            return result["data"]["tokens"]
        log.debug("fetch_active_tokens returned no tokens.")
        return []
