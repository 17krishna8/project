"""StateBus — one-way, file-based channel from the agent to the desktop pet.

The agent publishes a small JSON blob describing its live state; the desktop
pet polls it and animates accordingly. This is intentionally the SIMPLEST
possible IPC (a JSON file) — no sockets, no web server, no cloud, no shared
memory. It is strictly one-way (agent -> pet), so the pet can never influence
or interrupt an investigation.

State schema:
    {
      "state":       "idle|investigating|thinking|tool_running|confirm_needed|verdict",
      "risk":        0-100,
      "verdict":     "SAFE|SUSPICIOUS|MALICIOUS|ABORTED|null",
      "current_tool": "parse_headers",      # last tool being run
      "message":     "...",                  # human-readable last event
      "updated":     1725634522.0            # epoch seconds
    }
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional


def state_file() -> Path:
    return Path(os.environ.get("SENTINEL_STATE_FILE", "/tmp/sentinel_state.json"))


def publish(
    state: Optional[str] = None,
    risk: Optional[int] = None,
    verdict: Optional[str] = None,
    current_tool: Optional[str] = None,
    message: Optional[str] = None,
) -> Dict[str, Any]:
    """Merge the given fields into the state file and stamp `updated`.

    Unset fields (None) are left as-is so callers can update one thing at a
    time without racing. Returns the merged dict. All failures are swallowed —
    the pet is a cosmetic overlay and must never affect the investigation.
    """
    path = state_file()
    data: Dict[str, Any] = {}
    if path.exists():
        try:
            data = json.loads(path.read_text())
        except Exception:
            data = {}

    updates = {
        "state": state,
        "risk": risk,
        "verdict": verdict,
        "current_tool": current_tool,
        "message": message,
    }
    data.update({k: v for k, v in updates.items() if v is not None})
    data["updated"] = time.time()

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))
    except Exception:
        pass
    return data


def read() -> Dict[str, Any]:
    """Read the current state ({} if missing/corrupt)."""
    path = state_file()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def clear() -> None:
    try:
        state_file().unlink(missing_ok=True)
    except Exception:
        pass
