# munchadda-kiosk.spec — build (run from kiosk/):  pyinstaller build/munchadda-kiosk.spec
# -*- mode: python ; coding: utf-8 -*-
block_cipher = None
a = Analysis(
    ['..\\main.py'],
    pathex=['..'],
    binaries=[],
    datas=[('..\\assets', 'assets')],
    hiddenimports=['win32print', 'win32ui', 'escpos.printer'],
    hookspath=[],
    runtime_hooks=[],
    excludes=['evdev'],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name='MunchAddaKiosk',
    console=False,
    icon=None,
)
