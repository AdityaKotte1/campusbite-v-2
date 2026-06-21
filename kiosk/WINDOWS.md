# MunchAdda Kiosk on Windows

Run the kiosk agent as a Windows `.exe` — no Raspberry Pi required. The PC just needs
the thermal printer attached.

> **The most important setting:** the **API URL** the kiosk talks to is the
> **admin app's deployment URL** (the admin Vercel domain, e.g.
> `https://admin.munchadda.com`), **NOT** the student app URL. The kiosk calls the
> admin app's scan endpoint (`/api/v1/kiosk/scan`). **Get the exact admin app URL from
> whoever deployed the admin app.**

---

## Build the `.exe` (you, the developer)

On a Windows PC with **Python 3.11** installed:

```powershell
cd kiosk
python -m venv venv
venv\Scripts\pip install -r requirements-windows.txt
venv\Scripts\pyinstaller build\munchadda-kiosk.spec
```

The built app is in **`dist\MunchAddaKiosk\`**. Zip that whole folder
(`MunchAddaKiosk`) and send it to the client.

---

## Install on a client PC

1. **Install the printer driver.** Install the thermal printer's **Windows driver**
   from the manufacturer, then **Print a Windows test page** (Settings → Printers →
   your printer → Manage → Print test page) to confirm it works before going further.

2. **Run the app.** Unzip the folder and double-click **`MunchAddaKiosk.exe`**.

3. **First-run setup window.** Fill it in:
   - **Kiosk ID** and **API Key** — from the admin app → **Kiosks → Register Kiosk**
     (the API Key is shown **once**, copy it then).
   - **API URL** — set this to the **admin app deployment URL**
     (e.g. `https://admin.munchadda.com`), **not** the student app URL.
   - **Receipt printer** — pick your printer from the dropdown.
   - Click **Test print** (a test receipt should come out), then **Save & start**.

4. **Scanning.** Click the kiosk window to give it **focus**, then scan an order QR with
   the USB scanner — it prints the receipt. You can **minimize** the agent window and use
   the **admin dashboard in a browser** alongside it (e.g. to approve cash orders); just
   click back onto the kiosk window before scanning again.

5. **Optional — auto-start at login.** Press `Win+R`, type `shell:startup`, press Enter,
   and drop a **shortcut to `MunchAddaKiosk.exe`** into that folder. It will launch
   automatically every time the user logs in.
