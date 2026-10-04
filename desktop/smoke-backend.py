"""Read-only smoke test; use a separate port and stop only our child process."""
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

root = Path(__file__).resolve().parent.parent
environment = {**os.environ, "ARB_DESKTOP_PORT": "18080", "ARB_EXCHANGES": "kraken", "ARB_SYMBOLS": "ETH/USD"}
# The packaged service must work without copying account credentials.
for key in list(environment):
    if any(word in key.upper() for word in ("SECRET", "PRIVATE_KEY", "API_KEY")):
        environment.pop(key)
log_path = root / ".desktop-build" / "smoke.log"
with log_path.open("w") as log:
    process = subprocess.Popen([str(root / ".desktop-build/dist/shaggy-arb/shaggy-arb.exe")],
        cwd=root / ".desktop-build", env=environment, stdout=log, stderr=log,
        creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        for _ in range(40):
            if process.poll() is not None:
                raise RuntimeError(f"Packaged backend exited: see {log_path}")
            try:
                with urllib.request.urlopen("http://127.0.0.1:18080/api/snapshot", timeout=1) as response:
                    snapshot = json.load(response)
                    assert snapshot["type"] == "snapshot"
                    print("Packaged backend: real snapshot endpoint returned HTTP 200")
                    break
            except OSError:
                time.sleep(0.5)
        else:
            raise TimeoutError("Packaged backend did not start")
    finally:
        process.terminate()
        process.wait(timeout=10)
