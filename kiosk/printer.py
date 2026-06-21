"""
ThermalPrinter — wraps python-escpos for ESC/POS USB printers (e.g. Retsol RTP82,
80mm). Line width comes from config `chars_per_line` (default below).

Compact receipt layout:
  Header (Font A): MUNCHADDA, canteen name
  Token number (Font A, double size) — the pickup number
  Body (Font B, small): order no, time, items, subtotal/GST/total, footer
"""

import logging
import textwrap
from datetime import datetime
from typing import Optional

log = logging.getLogger("printer")

# Fallback character width for helper defaults.
CHARS = 32

# Receipt width in characters. Font B (forced via ESC ! 1 in _do_print) fits
# ~42 columns across a 58mm printer. Hardcoded so a stale config can't change it.
# If text fills only part of the paper, raise this; if any line wraps, lower it.
RECEIPT_COLS = 42

# Pixel width of the receipt image (image/watermark mode). Must match the
# printer's real dot width or the bill won't fill the paper (too small → blank
# on the right) — but must NOT exceed it, or the right edge gets cut off.
# Measured for this printer at ~512. If a gap remains on the right, raise toward
# 576; if the right edge is clipped, lower it.
RECEIPT_IMG_WIDTH = 512


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
            # Preferred: render the whole receipt as an image so we can draw the
            # MUNCHADDA security watermark behind the text. Falls back to plain
            # text mode if the printer can't do raster image printing.
            try:
                self._do_print_image(order_data)
                return True
            except Exception as img_exc:
                log.warning("Image receipt failed (%s) — falling back to text mode.", img_exc)
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

    def print_cash_bill(self, job: dict) -> bool:
        """
        Print a cash bill for a staff-approved order.

        `job` is a print-queue item shaped like:
          {
            "id": "<job uuid>",
            "order_id": "<order uuid>",
            "order": {
              "order_number": "CB-...",
              "total_paise": 9450,
              "subtotal_paise": 9000,
              "tax_paise": 450,
              "discount_paise": 0,
              "order_items": [
                {"menu_item_name": "...", "quantity": 2,
                 "unit_price_paise": 4500, "total_price_paise": 9000}
              ]
            }
          }

        Reuses the exact same receipt renderer as scans (`print_receipt`) by
        adapting `job["order"]` into the dict shape that renderer expects
        (`order_items`→`items`, `menu_item_name`→`name`). Returns True on
        success, False on failure.
        """
        order = job.get("order") or {}

        items = []
        for it in order.get("order_items", []):
            items.append(
                {
                    "name": it.get("menu_item_name", "Item"),
                    "quantity": it.get("quantity", 1),
                    "unit_price_paise": it.get("unit_price_paise", 0),
                    "total_price_paise": it.get("total_price_paise", 0),
                }
            )

        order_data = {
            "order_number": order.get("order_number", ""),
            "items": items,
            "subtotal_paise": order.get("subtotal_paise", 0),
            "tax_paise": order.get("tax_paise", 0),
            "discount_paise": order.get("discount_paise", 0),
            "total_paise": order.get("total_paise", 0),
        }

        return self.print_receipt(order_data)

    def _do_print_image(self, d: dict) -> None:
        """Render the receipt as a bitmap with a faint diagonal MUNCHADDA
        watermark, then print it as a raster image. Makes the bill look official
        and hard to forge on plain paper."""
        from PIL import Image, ImageDraw, ImageFont, ImageChops

        width = RECEIPT_IMG_WIDTH
        pad = 12   # horizontal (left/right) margin
        vpad = 4   # top/bottom margin — kept tiny to minimise blank paper

        def load(size: int, bold: bool = False):
            base = "/usr/share/fonts/truetype/dejavu/"
            name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
            try:
                return ImageFont.truetype(base + name, size)
            except Exception:
                return ImageFont.load_default()

        f_title = load(34, bold=True)
        f_head = load(22)
        f_body = load(20)
        f_bold = load(20, bold=True)
        f_token = load(34, bold=True)
        f_wm = load(46, bold=True)

        # ── Build element list ─────────────────────────────────────────────
        # ('center'|'left', text, font) | ('lr', left, right, font) | ('div',) | ('gap', px)
        els: list = [("center", "MUNCHADDA", f_title)]
        inst = self.config.get("institute_name", "")
        if inst:
            els.append(("center", str(inst), f_head))
        canteen = d.get("canteen_name") or self.config.get("canteen_name", "Campus Canteen")
        els.append(("center", str(canteen), f_head))
        els.append(("div",))

        name = d.get("student_name")
        if name:
            els.append(("left", "Name : " + str(name), f_body))
        order_num = d.get("order_number", "")
        if order_num:
            els.append(("left", "Order: " + str(order_num), f_body))

        scanned_at = d.get("scanned_at", "")
        if scanned_at:
            try:
                dt = datetime.fromisoformat(str(scanned_at).replace("Z", "+00:00"))
                time_str = dt.strftime("%-d %b %Y, %I:%M %p")
            except Exception:
                time_str = str(scanned_at)
        else:
            time_str = datetime.now().strftime("%-d %b %Y, %I:%M %p")
        els.append(("left", "Time : " + time_str, f_body))
        els.append(("div",))

        for item in d.get("items", []):
            label = f"{item.get('quantity', 1)}x {item.get('name', 'Item')}"
            els.append(("lr", label, paise_to_rs(item.get("total_price_paise", 0)), f_body))
        els.append(("div",))

        subtotal = d.get("subtotal_paise", 0)
        gst = d.get("tax_paise", d.get("gst_paise", 0))
        total = d.get("total_paise", subtotal + gst)
        pct = d.get("gst_percent", 5)
        if subtotal:
            els.append(("lr", "Subtotal", paise_to_rs(subtotal), f_body))
        if gst:
            els.append(("lr", f"GST ({pct:.0f}%)", paise_to_rs(gst), f_body))
        els.append(("lr", "TOTAL", paise_to_rs(total), f_bold))
        els.append(("div",))

        if d.get("_offline_scan"):
            els.append(("center", "** OFFLINE SCAN **", f_bold))
        tok_raw = d.get("token_number") or d.get("display_number", "")
        tok = f"#{int(tok_raw):03d}" if str(tok_raw).isdigit() else f"#{tok_raw}"
        els.append(("gap", 6))
        els.append(("center", "TOKEN " + tok, f_token))
        els.append(("center", "Collect at counter", f_body))

        # ── Measure height ─────────────────────────────────────────────────
        def line_h(font) -> int:
            b = font.getbbox("Ay")
            return (b[3] - b[1]) + 8

        height = vpad
        for e in els:
            if e[0] == "div":
                height += 14
            elif e[0] == "gap":
                height += e[1]
            else:
                height += line_h(e[-1])
        height += vpad

        # ── Watermark layer (faint, diagonal, repeated) ────────────────────
        img = Image.new("L", (width, height), 255)
        wm = Image.new("L", (width, height), 255)
        wd = ImageDraw.Draw(wm)
        for i, yy in enumerate(range(-30, height, 110)):
            xoff = (i % 2) * 130
            for xx in range(-40 + xoff, width, 300):
                wd.text((xx, yy), "MUNCHADDA", font=f_wm, fill=185)
        wm = wm.rotate(18, expand=0, fillcolor=255)
        img = ImageChops.darker(img, wm)

        # ── Draw the receipt text on top ───────────────────────────────────
        dr = ImageDraw.Draw(img)
        y = vpad
        for e in els:
            if e[0] == "div":
                dy = y + 6
                x = pad
                while x < width - pad:
                    dr.line([(x, dy), (min(x + 6, width - pad), dy)], fill=0, width=1)
                    x += 11
                y += 14
            elif e[0] == "gap":
                y += e[1]
            elif e[0] == "center":
                _, text, font = e
                tw = dr.textlength(text, font=font)
                dr.text(((width - tw) // 2, y), text, font=font, fill=0)
                y += line_h(font)
            elif e[0] == "left":
                _, text, font = e
                dr.text((pad, y), text, font=font, fill=0)
                y += line_h(font)
            elif e[0] == "lr":
                _, left, right, font = e
                rw = dr.textlength(right, font=font)
                dr.text((pad, y), left, font=font, fill=0)
                dr.text((width - pad - rw, y), right, font=font, fill=0)
                y += line_h(font)

        # ── Print as 1-bit bitmap (dithering keeps the watermark faint) ─────
        bw = img.convert("1")
        self._printer.image(bw)
        # No extra feed before the cut — cut() feeds only enough to clear the
        # blade. This trims the trailing blank to the mechanical minimum.
        if self.config.get("cut_after_print", True):
            self._printer.cut()

    def _do_print(self, d: dict) -> None:
        p = self._printer
        w = RECEIPT_COLS  # hardcoded full width; not from config (see constant above)

        # Force the small Font B. python-escpos' set(font='b') sends ESC M, which
        # this printer ignores; ESC ! 1 selects Font B on printers that honour it.
        # python-escpos doesn't use ESC ! for bold/align, so this selection sticks.
        try:
            p._raw(b"\x1b\x21\x01")  # ESC ! 1 = Font B (condensed)
        except Exception:
            pass

        # Whole receipt uses the small Font B. set() resets unspecified params
        # (incl. font='a'), so every set() call re-asserts font='b'.
        def line(text="", *, bold=False):
            p.set(align="left", font="b", bold=bold)
            p.text(text + "\n")

        def centered(text, *, bold=False):
            line(_center(text, w), bold=bold)

        dash = _divider("-", w)

        # ------ Header (all Font B, centred on the column grid) ------
        centered("MUNCHADDA", bold=True)
        institute = self.config.get("institute_name", "")
        if institute:
            for ln in textwrap.wrap(institute, w):
                centered(ln)
        canteen = d.get("canteen_name") or self.config.get("canteen_name", "Campus Canteen")
        for ln in textwrap.wrap(canteen, w):
            centered(ln)

        if d.get("_offline_scan"):
            centered("** OFFLINE SCAN **", bold=True)

        line(dash)

        # ------ Order meta ------
        name = d.get("student_name")
        if name:
            line("Name : " + str(name))
        order_num = d.get("order_number", "")
        if order_num:
            line("Order: " + order_num)

        scanned_at = d.get("scanned_at", "")
        if scanned_at:
            try:
                dt = datetime.fromisoformat(scanned_at.replace("Z", "+00:00"))
                time_str = dt.strftime("%-d %b %Y, %I:%M %p")
            except Exception:
                time_str = scanned_at
        else:
            time_str = datetime.now().strftime("%-d %b %Y, %I:%M %p")
        line("Time:  " + time_str)

        line(dash)

        # ------ Items ------
        for item in d.get("items", []):
            name = item.get("name", "Item")
            qty = item.get("quantity", 1)
            price_str = paise_to_rs(item.get("total_price_paise", 0))
            label = f"{qty}x {name}"
            if len(label) > w - len(price_str) - 1:
                line(label[:w])
                line(_left_right("", price_str, w))
            else:
                line(_left_right(label, price_str, w))

        special = d.get("special_instructions", "").strip()
        if special:
            line("Note: " + special[: w - 6])

        line(dash)

        # ------ Totals ------
        subtotal_paise = d.get("subtotal_paise", 0)
        gst_paise = d.get("tax_paise", d.get("gst_paise", 0))
        total_paise = d.get("total_paise", subtotal_paise + gst_paise)
        gst_pct = d.get("gst_percent", 5)

        if subtotal_paise:
            line(_left_right("Subtotal", paise_to_rs(subtotal_paise), w))
        if gst_paise:
            line(_left_right(f"GST ({gst_pct:.0f}%)", paise_to_rs(gst_paise), w))
        line(_left_right("TOTAL", paise_to_rs(total_paise), w), bold=True)

        # ------ Token number (at the BOTTOM) ------
        token_raw = d.get("token_number") or d.get("display_number", "")
        token_str = f"#{int(token_raw):03d}" if str(token_raw).isdigit() else f"#{token_raw}"
        line(dash)
        centered("TOKEN  " + token_str, bold=True)
        centered("Collect at counter")

        # Small feed so the cutter clears the last line, then cut.
        p.text("\n")
        if self.config.get("cut_after_print", True):
            p.cut()
        p.set(align="left", font="a")
