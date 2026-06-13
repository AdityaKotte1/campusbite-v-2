"""
KioskDisplay — Tkinter-based full-screen UI for the 7" HDMI kiosk display.

Screens:
  idle        → deep blue, "SCAN YOUR QR CODE"
  processing  → medium blue, spinner text
  success     → dark green, token number + items
  error       → dark red / orange, error message

Thread safety: all rendering is scheduled via root.after(0, fn) so Tkinter
widgets are always created/destroyed on the main thread.
"""

import logging
import threading
import tkinter as tk
from tkinter import font as tkfont
from typing import Optional

log = logging.getLogger("display")

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
COLOURS = {
    "idle_bg": "#1A237E",       # deep blue
    "idle_fg": "#FFFFFF",
    "processing_bg": "#1565C0", # medium blue
    "success_bg": "#1B5E20",    # dark green
    "success_fg": "#FFFFFF",
    "error_used_bg": "#E65100", # orange (already collected)
    "error_bg": "#B71C1C",      # dark red
    "error_fg": "#FFFFFF",
    "offline_badge": "#FF6F00", # amber
    "text_muted": "#B0BEC5",
    "token_hero": "#A5D6A7",    # light green for token number
    "item_text": "#C8E6C9",     # soft green for item list
}

# ---------------------------------------------------------------------------
# Error-code → (icon, title, subtitle) mapping
# ---------------------------------------------------------------------------
ERROR_MESSAGES: dict[str, tuple[str, str, str]] = {
    "ALREADY_USED": (
        "⚠",
        "Already Collected",
        "This order has already been picked up.\nContact canteen staff if needed.",
    ),
    "EXPIRED": (
        "⏰",
        "QR Code Expired",
        "Your QR code has expired.\nPlease place a new order.",
    ),
    "NOT_FOUND": (
        "✗",
        "QR Code Not Found",
        "Unrecognised QR code.\nPlease try again or contact staff.",
    ),
    "WRONG_CANTEEN": (
        "📍",
        "Wrong Counter",
        "This order is for a different counter.\nPlease go to the correct kiosk.",
    ),
    "ORDER_CANCELLED": (
        "✗",
        "Order Cancelled",
        "This order has been cancelled.\nPlease contact canteen staff.",
    ),
    "SERVER_ERROR": (
        "⚡",
        "System Error",
        "A server error occurred.\nPlease try again in a moment.",
    ),
    "INVALID_QR": (
        "✗",
        "Invalid QR Code",
        "This QR code is not valid.\nPlease use the MunchAdda app.",
    ),
}

_DEFAULT_ERROR = ("✗", "Error", "Something went wrong.\nPlease try again.")


class KioskDisplay:
    """Full-screen Tkinter display.  Call run() on the main thread."""

    def __init__(self, config: dict, audio=None) -> None:
        self.config = config
        self.audio = audio
        self.root: Optional[tk.Tk] = None
        self._frame: Optional[tk.Frame] = None
        self._fonts: dict = {}
        self._setup_done = threading.Event()

    # ------------------------------------------------------------------
    # Public API (thread-safe — schedule on Tk main thread)
    # ------------------------------------------------------------------

    def show_idle(self) -> None:
        self._schedule(self._render_idle)

    def show_processing(self) -> None:
        self._schedule(self._render_processing)

    def show_success(
        self,
        token_number,
        order_number: str = "",
        items: list = None,
        offline: bool = False,
    ) -> None:
        self._schedule(
            lambda: self._render_success(token_number, order_number, items or [], offline)
        )

    def show_error(self, error_code: str, message: str = "") -> None:
        self._schedule(lambda: self._render_error(error_code, message))

    # ------------------------------------------------------------------
    # Entry point (call from main thread)
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Blocking — creates the Tk window and enters mainloop."""
        self._setup()
        self._render_idle()
        self.root.mainloop()

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _setup(self) -> None:
        self.root = tk.Tk()
        self.root.title("MunchAdda Kiosk")

        w = self.config.get("width", 800)
        h = self.config.get("height", 480)

        if self.config.get("fullscreen", True):
            self.root.attributes("-fullscreen", True)
        else:
            self.root.geometry(f"{w}x{h}")

        self.root.configure(bg=COLOURS["idle_bg"])
        self.root.resizable(False, False)

        # Hide cursor on kiosk display
        self.root.config(cursor="none")

        # Build font cache
        self._fonts = self._load_fonts()

        # Outer frame fills the window
        self._frame = tk.Frame(self.root, bg=COLOURS["idle_bg"])
        self._frame.pack(fill=tk.BOTH, expand=True)

        # Bind Escape and Enter globally
        self.root.bind("<Escape>", lambda e: self._on_key_idle())
        self.root.bind("<Return>", lambda e: self._on_key_idle())

        self._setup_done.set()
        log.info("Tkinter display set up (%dx%d, fullscreen=%s).", w, h, self.config.get("fullscreen", True))

    def _load_fonts(self) -> dict:
        """Load font objects; fall back gracefully if DejaVu not installed."""
        available = tkfont.families()
        if "DejaVu Sans" in available:
            base = "DejaVu Sans"
        elif "Liberation Sans" in available:
            base = "Liberation Sans"
        else:
            base = "Helvetica"
            log.warning("DejaVu/Liberation Sans not found; using %s.", base)

        fs_large  = self.config.get("font_size_large", 72)
        fs_medium = self.config.get("font_size_medium", 28)
        fs_small  = self.config.get("font_size_small", 14)

        return {
            "hero":      tkfont.Font(family=base, size=fs_large,      weight="bold"),
            "token":     tkfont.Font(family=base, size=fs_large + 20, weight="bold"),
            "medium":    tkfont.Font(family=base, size=fs_medium,      weight="bold"),
            "medium_r":  tkfont.Font(family=base, size=fs_medium,      weight="normal"),
            "small":     tkfont.Font(family=base, size=fs_small,       weight="normal"),
            "small_b":   tkfont.Font(family=base, size=fs_small,       weight="bold"),
            "badge":     tkfont.Font(family=base, size=fs_small + 2,   weight="bold"),
            "emoji":     tkfont.Font(family="Segoe UI Emoji" if "Segoe UI Emoji" in available else base,
                                     size=fs_large, weight="normal"),
            "item":      tkfont.Font(family=base, size=fs_small + 2,   weight="normal"),
        }

    # ------------------------------------------------------------------
    # Frame management
    # ------------------------------------------------------------------

    def _clear(self) -> None:
        """Destroy all widgets inside the frame and reset bg."""
        if self._frame:
            for widget in self._frame.winfo_children():
                widget.destroy()

    def _set_bg(self, colour: str) -> None:
        self.root.configure(bg=colour)
        self._frame.configure(bg=colour)

    def _schedule(self, fn) -> None:
        """Schedule fn on the Tk main thread.  Safe to call from any thread."""
        if self.root:
            self.root.after(0, fn)
        else:
            log.warning("_schedule called before root exists — queueing is not supported yet.")

    # ------------------------------------------------------------------
    # Screen renderers (must be called on Tk main thread)
    # ------------------------------------------------------------------

    def _render_idle(self) -> None:
        self._clear()
        bg = COLOURS["idle_bg"]
        fg = COLOURS["idle_fg"]
        self._set_bg(bg)

        outer = self._frame
        outer.columnconfigure(0, weight=1)
        outer.rowconfigure(0, weight=1)
        outer.rowconfigure(1, weight=0)
        outer.rowconfigure(2, weight=0)
        outer.rowconfigure(3, weight=1)

        # Phone / QR emoji
        tk.Label(
            outer, text="📱", bg=bg, fg=fg,
            font=self._fonts["emoji"],
        ).grid(row=0, column=0, sticky="s", pady=(0, 10))

        # Main call to action
        tk.Label(
            outer,
            text="SCAN YOUR QR CODE",
            bg=bg, fg=fg,
            font=self._fonts["hero"],
        ).grid(row=1, column=0)

        # Subtitle
        tk.Label(
            outer,
            text="Open MunchAdda app → My Orders → Show QR",
            bg=bg, fg=COLOURS["text_muted"],
            font=self._fonts["medium_r"],
        ).grid(row=2, column=0, pady=(12, 0))

        # Bottom label
        tk.Label(
            outer,
            text="munchadda.com",
            bg=bg, fg=COLOURS["text_muted"],
            font=self._fonts["small"],
        ).grid(row=3, column=0, sticky="n", pady=(20, 0))

    def _render_processing(self) -> None:
        self._clear()
        bg = COLOURS["processing_bg"]
        fg = COLOURS["idle_fg"]
        self._set_bg(bg)

        outer = self._frame
        outer.columnconfigure(0, weight=1)
        outer.rowconfigure(0, weight=1)
        outer.rowconfigure(1, weight=0)
        outer.rowconfigure(2, weight=1)

        tk.Label(
            outer, text="⏳", bg=bg, fg=fg,
            font=self._fonts["emoji"],
        ).grid(row=0, column=0, sticky="s", pady=(0, 16))

        tk.Label(
            outer,
            text="Processing…",
            bg=bg, fg=fg,
            font=self._fonts["hero"],
        ).grid(row=1, column=0)

        tk.Label(
            outer,
            text="Please wait",
            bg=bg, fg=COLOURS["text_muted"],
            font=self._fonts["medium_r"],
        ).grid(row=2, column=0, sticky="n", pady=(12, 0))

    def _render_success(
        self,
        token_number,
        order_number: str,
        items: list,
        offline: bool,
    ) -> None:
        self._clear()
        bg = COLOURS["success_bg"]
        fg = COLOURS["success_fg"]
        self._set_bg(bg)

        outer = self._frame
        outer.columnconfigure(0, weight=1)

        row = 0

        # Offline badge (top)
        if offline:
            tk.Label(
                outer,
                text="  OFFLINE SCAN  ",
                bg=COLOURS["offline_badge"],
                fg="#FFFFFF",
                font=self._fonts["badge"],
                padx=10, pady=4,
            ).grid(row=row, column=0, pady=(12, 0))
            row += 1

        # Tick + COLLECTED
        tk.Label(
            outer,
            text="✓  COLLECTED!",
            bg=bg, fg=fg,
            font=self._fonts["medium"],
        ).grid(row=row, column=0, pady=(20 if not offline else 8, 0))
        row += 1

        # Token number — hero size, green tinted
        token_str = f"#{int(token_number):03d}" if str(token_number).isdigit() else f"#{token_number}"
        tk.Label(
            outer,
            text=token_str,
            bg=bg,
            fg=COLOURS["token_hero"],
            font=self._fonts["token"],
        ).grid(row=row, column=0, pady=(0, 8))
        row += 1

        # Order number
        if order_number:
            tk.Label(
                outer,
                text=f"Order: {order_number}",
                bg=bg, fg=COLOURS["text_muted"],
                font=self._fonts["small"],
            ).grid(row=row, column=0)
            row += 1

        # Items summary (first 4, then "+N more")
        if items:
            frame_items = tk.Frame(outer, bg=bg)
            frame_items.grid(row=row, column=0, pady=(8, 0))
            row += 1

            display_items = items[:4]
            for item in display_items:
                name = item.get("name", "Item")
                qty = item.get("quantity", 1)
                tk.Label(
                    frame_items,
                    text=f"{qty}× {name}",
                    bg=bg,
                    fg=COLOURS["item_text"],
                    font=self._fonts["item"],
                ).pack()

            extra = len(items) - len(display_items)
            if extra > 0:
                tk.Label(
                    frame_items,
                    text=f"+ {extra} more item{'s' if extra > 1 else ''}",
                    bg=bg,
                    fg=COLOURS["text_muted"],
                    font=self._fonts["small"],
                ).pack()

        # Receipt printing note
        tk.Label(
            outer,
            text="🖨  Receipt printing…",
            bg=bg,
            fg=COLOURS["text_muted"],
            font=self._fonts["small"],
        ).grid(row=row, column=0, pady=(12, 0))

    def _render_error(self, error_code: str, override_message: str = "") -> None:
        icon, title, subtitle = ERROR_MESSAGES.get(error_code, _DEFAULT_ERROR)

        if error_code == "ALREADY_USED":
            bg = COLOURS["error_used_bg"]
        else:
            bg = COLOURS["error_bg"]
        fg = COLOURS["error_fg"]

        self._clear()
        self._set_bg(bg)

        outer = self._frame
        outer.columnconfigure(0, weight=1)
        outer.rowconfigure(0, weight=1)
        outer.rowconfigure(1, weight=0)
        outer.rowconfigure(2, weight=0)
        outer.rowconfigure(3, weight=0)
        outer.rowconfigure(4, weight=1)

        # Icon
        tk.Label(
            outer, text=icon, bg=bg, fg=fg,
            font=self._fonts["hero"],
        ).grid(row=0, column=0, sticky="s", pady=(0, 8))

        # Title
        tk.Label(
            outer,
            text=title,
            bg=bg, fg=fg,
            font=self._fonts["medium"],
        ).grid(row=1, column=0)

        # Subtitle (or override_message if provided and not redundant)
        display_sub = override_message.strip() if override_message.strip() else subtitle
        tk.Label(
            outer,
            text=display_sub,
            bg=bg,
            fg=COLOURS["text_muted"],
            font=self._fonts["medium_r"],
            justify=tk.CENTER,
            wraplength=700,
        ).grid(row=2, column=0, pady=(8, 0))

        # Hint
        tk.Label(
            outer,
            text="Press Enter or scan again to continue",
            bg=bg,
            fg=COLOURS["text_muted"],
            font=self._fonts["small"],
        ).grid(row=3, column=0, pady=(16, 0))

        # Spacer
        tk.Label(outer, text="", bg=bg).grid(row=4, column=0)

    # ------------------------------------------------------------------
    # Key bindings
    # ------------------------------------------------------------------

    def _on_key_idle(self) -> None:
        """Return to idle when Enter/Escape is pressed on an error screen."""
        self._render_idle()
