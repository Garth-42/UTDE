import sys
import os

ROOT = os.path.dirname(__file__)
UTDE_PATH = os.path.join(ROOT, "utde_v0.1.0")

for p in (ROOT, UTDE_PATH):
    if p not in sys.path:
        sys.path.insert(0, p)
