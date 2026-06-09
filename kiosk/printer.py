"""
ThermalPrinter — wraps python-escpos for the Xprinter XP-58IIH (58mm).

Receipt layout (32 chars wide):
  Header: logo text, canteen name
  Token number in double-height/double-width
  Order number, timestamp
  Item lines
  Subtotal, GST, Total
  Footer instructions
"""

import logging
import textwrap
from datetime import datetime
from typing import Optional

log = logging.getLogger("printer")

# 58mm paper at the standard 8 dots/mm = 384 dots wide.
# At default font A (12×24 dots) → 32 characters per line.
CHARS = 32


def paise_to_rs(paise: int) -> str:
    """Convert integer paise to formatted rupee string: Rs.12 or Rs.12.50"""
    if paise % 100 == 0:
        return f"Rs.{paise // 100}"
    else:
        return f"Rs.{paise / 100:.2f}"


def _center(text: str, width: int = CHARS) -> str:
    return text.center(width)[:width]


def _left_right(left: str, right: str, width: int = CHARS) -> str:
    """Fit left and right strings with space between, total = width."""
    gap = width - len(left) - len(right)
    if gap < 1:
        gap = 1
        left = left[: width - len(right) - 1]
    return left + " " * gap + right


def _divider(char: str = "-", width: int = CHARS) -> str:
    return char * width


class ThermalPrinter:
    """Manages connection to the 58mm thermal printer over USB."""

    def __init__(self, config: dict) -> None:
        self.config = config
        self._printer = None
        self._init_printer()

    # ------------------------------------------------------------------
    # Initialisation / reconnection
    # ------------------------------------------------------------------

    def _init_printer(self) -> None:
        """Attempt to open the USB printer.  Silently stores None on failure."""
        try:
            from escpos.printer import Usb  # type: ignore

            vid_str = self.config.get("vendor_id", "0x0483")
            pid_str = self.config.get("product_id", "0x5743")
            vendor_id = int(vid_str, 16) if isinstance(vid_str, str) else int(vid_str)
            product_id = int(pid_str, 16) if isinstance(pid_str, str) else int(pid_str)

            self._printer = Usb(vendor_id, product_id, timeout=0, in_ep=0x81, out_ep=0x01)
            log.info(
                "Thermal printer connected: VID=%s PID=%s", hex(vendor_id), hex(product_id)
            )
        except Exception as exc:
            log.warning("Printer not available: %s", exc)
            self._printer = None

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> str:
        """Return 'ok', 'disconnected', or 'error'."""
        if self._printer is None:
            return "disconnected"
        try:
            # python-escpos doesn't have a universal status call;
            # we attempt a no-op write to check the connection.
            self._printer.query_status(mode=0)
            return "ok"
        except AttributeError:
            # Some versions lack query_status — assume ok if connected
            return "ok"
        except Exception as exc:
            log.debug("Printer status check failed: %s", exc)
            return "error"

    # ------------------------------------------------------------------
    # Receipt printing
    # ------------------------------------------------------------------

    def print_receipt(self, order_data: dict) -> bool:
        """
        Print a 58mm receipt.

        order_data keys (all optional except where noted):
          order_number   str   e.g. "CB-241215-001234"
          token_number   int   e.g. 42  (displayed large)
          display_number str   alternative to token_number
          canteen_name   str
          items          list  of {name, quantity, unit_price_paise, total_price_paise}
          subtotal_paise int
          gst_paise      int
          total_paise    int
          gst_percent    float default 5
          special_instructions str
          scanned_at     str   ISO timestamp (optional, default = now)
          _offline_scan  bool  show OFFLINE badge if True
        """
        if self._printer is None:
            log.warning("print_receipt: printer not initialised — attempting reconnect.")
            self._init_printer()
            if self._printer is None:
                log.error("print_receipt: printer unavailable — skipping.")
                return False

        try:
            self._do_print(order_data)
            return True
        except Exception as exc:
            log.exception("print_receipt failed: %s", exc)
            # Try to reconnect for next time
            try:
                self._init_printer()
            except Exception:
                pass
            return False

    def _do_print(self, d: dict) -> None:
        p = self._printer

        # ------ Header ------
        p.set(align="center", bold=True, double_height=False, double_width=False)
        p.text("CAMPUSBITE\n")
        p.set(align="center", bold=False)
        canteen_name = d.get("canteen_name", "Campus Canteen")
        # Wrap long canteen names
        for line in textwrap.wrap(canteen_name, CHARS):
            p.text(_center(line) + "\n")

        # Offline badge (printed before divider)
        if d.get("_offline_scan"):
            p.set(align="center", bold=True)
            p.text(_center("** OFFLINE SCAN **") + "\n")
            p.set(bold=False)

        p.text(_divider("=") + "\n")

        # ------ Token number (large) ------
        token_raw = d.get("token_number") or d.get("display_number", "")
        token_str = f"#{int(token_raw):03d}" if str(token_raw).isdigit() else f"#{token_raw}"

        p.set(align="center", double_height=True, double_width=True, bold=True)
        p.text(token_str + "\n")
        p.set(double_height=False, double_width=False, bold=False, align="left")

        p.text(_divider("=") + "\n")

        # ------ Order meta ------
        order_num = d.get("order_number", "")
        if order_num:
            p.text("Order: " + order_num + "\n")

        scanned_at = d.get("scanned_at", "")
        if scanned_at:
            try:
                dt = datetime.fromisoformat(scanned_at.replace("Z", "+00:00"))
                time_str = dt.strftime("%-d %b %Y, %I:%M %p")
            except Exception:
                time_str = scanned_at
        else:
            time_str = datetime.now().strftime("%-d %b %Y, %I:%M %p")
        p.text("Time:  " + time_str + "\n")

        p.text(_divider() + "\n")

        # ------ Items ------
        p.set(bold=True)
        p.text("ITEMS\n")
        p.set(bold=False)

        items = d.get("items", [])
        for item in items:
            name = item.get("name", "Item")
            qty = item.get("quantity", 1)
            total_paise = item.get("total_price_paise", 0)
            price_str = paise_to_rs(total_paise)
            label = f"{qty}x {name}"
            line = _left_right(label, price_str)
            # Wrap if name is very long
            if len(label) > CHARS - len(price_str) - 1:
                # Print name on first line, price right-aligned on second
                p.text(label[:CHARS] + "\n")
                p.text(_left_right("", price_str) + "\n")
            else:
                p.text(line + "\n")

        # Special instructions
        special = d.get("special_instructions", "").strip()
        if special:
            p.text(_divider() + "\n")
            p.set(bold=False)
            p.text("Note: ")
            for line in textwrap.wrap(special, CHARS - 6):
                p.text(line + "\n")

        p.text(_divider() + "\n")

        # ------ Totals ------
        subtotal_paise = d.get("subtotal_paise", 0)
        gst_paise = d.get("gst_paise", 0)
        total_paise = d.get("total_paise", subtotal_paise + gst_paise)
        gst_pct = d.get("gst_percent", 5)

        if subtotal_paise:
            p.text(_left_right("Subtotal", paise_to_rs(subtotal_paise)) + "\n")
        if gst_paise:
            p.text(
                _left_right(f"GST ({gst_pct:.0f}%)", paise_to_rs(gst_paise)) + "\n"
            )

        p.text(_divider("=") + "\n")
        p.set(bold=True)
        p.text(_left_right("TOTAL", paise_to_rs(total_paise)) + "\n")
        p.set(bold=False)
        p.text(_divider("=") + "\n")

        # ------ Footer ------
        p.set(align="center")
        p.text("\n")
        p.text(_center("Present this at counter") + "\n")
        p.text(_center("to collect your order") + "\n")
        p.text("\n\n")

        # Cut paper
        if self.config.get("cut_after_print", True):
            p.cut()

        p.set(align="left")
