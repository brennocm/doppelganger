"""Make the standalone scripts in scripts/ and scripts/hooks/ importable from tests."""

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
for folder in (SCRIPTS, SCRIPTS / "hooks"):
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))
