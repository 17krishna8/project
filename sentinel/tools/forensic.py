"""forensic — host-side wrappers for the sandbox forensic binaries.

Each function maps to ONE whitelisted binary in overlay/forensic_tool.py and
delegates execution to the sandbox (network-none, read-only, destroyed per
run). These are `file_touching` tools, so the agent gate-keeps them with a
human confirmation.

The binaries (binwalk, pdfid, capa, strings, yara, pecheck) are the same
class of tools you'd run on Parrot OS / REMnux — here pinned to a sandbox so
no malicious attachment is ever touched by the host.
"""
from __future__ import annotations

from .. import sandbox

# Which sandbox tool each function maps to.
_TOOL = {
    "binwalk": "binwalk",
    "pdfid": "pdfid",
    "capa": "capa",
    "strings": "strings",
    "yara": "yara",
    "pecheck": "pecheck",
}


def _run(tool: str, attachment_path: str) -> dict:
    result = sandbox.run_forensic_tool(tool, attachment_path)
    result.setdefault("attachment", attachment_path)
    result["analysis_type"] = "static-only (no execution)"
    return result


def binwalk_scan(attachment_path: str) -> dict:
    """Detect embedded/concatenated files inside an attachment (file carving)."""
    return _run("binwalk", attachment_path)


def pdfid_scan(attachment_path: str) -> dict:
    """PDF exploit/anomaly detection (JS, OpenAction, Launch, EmbeddedFile...)."""
    return _run("pdfid", attachment_path)


def capa_scan(attachment_path: str) -> dict:
    """Mandiant FLARE capability detection — what the binary can DO."""
    return _run("capa", attachment_path)


def strings_scan(attachment_path: str) -> dict:
    """Extract ASCII strings and flag URLs/IPs/shell commands (no execution)."""
    return _run("strings", attachment_path)


def yara_scan(attachment_path: str) -> dict:
    """Signature matching against the rules in sandbox/yara_rules/."""
    return _run("yara", attachment_path)


def pecheck_scan(attachment_path: str) -> dict:
    """PE (Windows executable) structural anomaly analysis."""
    return _run("pecheck", attachment_path)
