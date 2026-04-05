# PyInstaller spec for the UTDE backend sidecar.
# Produces a one-folder bundle that Tauri ships as `binaries/utde-server`.
#
# Build:
#   pyinstaller step_server.spec
#
# The output lands in dist/utde-server/.
# Tauri expects the binary named with a platform triple suffix, e.g.:
#   utde-server-x86_64-unknown-linux-gnu
#   utde-server-x86_64-pc-windows-msvc.exe
#   utde-server-x86_64-apple-darwin
#
# The CI rename step (see .github/workflows/release.yml) handles this.

import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Collect all toolpath_engine submodules (strategies, orient, kinematics, post, etc.)
utde_hidden = collect_submodules("toolpath_engine")

# OCC hidden imports — the full list needed for STEP parsing + tessellation.
# Only a subset of OCC is actually used; add more here if ImportErrors appear.
occ_hidden = [
    "OCC.Core.STEPControl",
    "OCC.Core.IFSelect",
    "OCC.Core.BRepMesh",
    "OCC.Core.TopExp",
    "OCC.Core.TopAbs",
    "OCC.Core.BRep",
    "OCC.Core.BRepAdaptor",
    "OCC.Core.GeomAbs",
    "OCC.Core.TopLoc",
    "OCC.Core.GCPnts",
    "OCC.Core.gp",
    "OCC.Core.TopoDS",
    "OCC.Core.BRepTools",
    "OCC.Core.Poly",
]

a = Analysis(
    ["step_server.py"],
    pathex=[".", "utde_v0.1.0"],
    binaries=[],
    datas=[
        # Bundle the entire toolpath_engine package
        ("utde_v0.1.0/toolpath_engine", "toolpath_engine"),
    ],
    hiddenimports=utde_hidden + occ_hidden + [
        "numpy",
        "scipy",
        "scipy.optimize",
        "pyyaml",
        "yaml",
        "flask",
        "werkzeug",
        "werkzeug.serving",
        "click",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "IPython", "jupyter"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="utde-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # Keep console=True so Tauri can read stdout
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="utde-server",
)
