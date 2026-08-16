"""Run the Maison Hygia backend server."""

import uvicorn
import sys
from pathlib import Path

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=["backend"],
    )