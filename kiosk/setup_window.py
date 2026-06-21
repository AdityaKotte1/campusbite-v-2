"""setup_window.py — Windows first-run setup. Collects kiosk_id/api_key/API URL,
lets the user pick an installed printer, optional test print, saves config."""
import tkinter as tk
from tkinter import messagebox, ttk

DEFAULT_API_URL = "https://munchadda.com"

def list_windows_printers() -> list:
    import win32print  # imported only when called (Windows)
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    return [p[2] for p in win32print.EnumPrinters(flags)]

def run_setup(existing=None):
    """Show the modal setup window; return the saved config dict, or None if cancelled."""
    from config import save_windows_config
    existing = existing or {}
    root = tk.Tk()
    root.title("MunchAdda Kiosk - Setup")
    root.geometry("460x420")
    result = {}

    fields = {}
    def row(label, key, default=""):
        tk.Label(root, text=label).pack(anchor="w", padx=16, pady=(8, 0))
        var = tk.StringVar(value=existing.get(key, default))
        tk.Entry(root, textvariable=var, width=54).pack(padx=16)
        fields[key] = var

    row("Kiosk ID", "kiosk_id")
    row("API Key", "api_key")
    row("Canteen ID", "canteen_id")
    row("API URL", "api_base_url", DEFAULT_API_URL)

    tk.Label(root, text="Receipt printer").pack(anchor="w", padx=16, pady=(8, 0))
    try:
        printers = list_windows_printers()
    except Exception:
        printers = []
    printer_var = tk.StringVar(value=existing.get("printer_name", printers[0] if printers else ""))
    ttk.Combobox(root, textvariable=printer_var, values=printers, width=52, state="readonly").pack(padx=16)

    def collect():
        return {
            "kiosk_id": fields["kiosk_id"].get().strip(),
            "api_key": fields["api_key"].get().strip(),
            "canteen_id": fields["canteen_id"].get().strip(),
            "api_base_url": fields["api_base_url"].get().strip().rstrip("/"),
            "printer_name": printer_var.get(),
            "fullscreen": False,
        }

    def on_test():
        cfg = collect()
        try:
            from printer import connect_printer
            p = connect_printer(cfg)
            p.text("MunchAdda test print\n\n")
            p.cut()
            messagebox.showinfo("Test print", "Sent a test receipt.")
        except Exception as exc:  # pylint: disable=broad-except
            messagebox.showerror("Test print failed", str(exc))

    def on_save():
        cfg = collect()
        if not cfg["kiosk_id"] or not cfg["api_key"] or not cfg["printer_name"]:
            messagebox.showerror("Missing", "Kiosk ID, API Key and Printer are required.")
            return
        save_windows_config(cfg)
        result.update(cfg)
        root.destroy()

    btns = tk.Frame(root)
    btns.pack(pady=14)
    tk.Button(btns, text="Test print", command=on_test).pack(side="left", padx=6)
    tk.Button(btns, text="Save & start", command=on_save).pack(side="left", padx=6)
    root.mainloop()
    return result or None
