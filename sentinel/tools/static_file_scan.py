"""static_file_scan — SAFE, NON-EXECUTING attachment analysis.

This tool NEVER opens/executes the file. It only:
  * reads metadata (exiftool),
  * detects macros (oleid/oletools),
  * computes file entropy (high entropy => likely packed/encrypted malware),
  * detects file-type/extension mismatch (.exe renamed to .pdf).

All byte-level work happens inside the Docker sandbox (see sentinel/sandbox.py),
with a read-only evidence mount and no network. This tool is flagged
`requires_confirmation` + `file_touching` in the registry, so the agent MUST
obtain human approval before calling it.
"""
from __future__ import annotations

from .. import sandbox


def static_file_scan(attachment_path: str) -> dict:
    # Delegate entirely to the sandbox layer. This is the only tool that
    # interacts with actual file bytes, and only inside the isolation boundary.
    result = sandbox.run_static_scan(attachment_path)
    result["attachment"] = attachment_path
    result["analysis_type"] = "static-only (no execution)"
    return result
