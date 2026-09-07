"""hash_evidence — immutable evidence baseline.

Safely (non-executing) computes SHA-256 of the original .eml AND of every
attachment BEFORE any other analysis runs, then appends a timestamped entry
to a local audit log. This is the "hash before analysis" step required for
chain-of-custody: later tools can re-hash and prove nothing changed.
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import _emailutil


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _append_audit(entry: dict) -> str:
    """Append an audit entry to evidence/audit.jsonl (append-only intent)."""
    outdir = Path("evidence")
    outdir.mkdir(parents=True, exist_ok=True)
    log_path = outdir / "audit.jsonl"
    with open(log_path, "a") as fh:
        fh.write(json.dumps(entry) + "\n")
    return str(log_path)


def hash_evidence(email_path: str) -> dict:
    """Hash the .eml and all attachments; record an audit entry.

    Returns a dict with the email hash, per-attachment hashes, and the audit
    log path. This function reads bytes only — it never parses/executes the
    file beyond SHA-256, so it is safe to run directly on the host.
    """
    email_path = os.path.abspath(email_path)
    if not os.path.isfile(email_path):
        raise FileNotFoundError(f"email file not found: {email_path}")

    msg = _emailutil.parse_email(email_path)
    email_hash = _sha256_file(email_path)

    # Extract attachments to a quarantine dir purely so we can hash them.
    quarantine = Path("evidence") / "attachments" / email_hash[:12]
    attachment_paths = _emailutil.extract_attachments(msg, str(quarantine))
    attachment_hashes = {os.path.basename(p): _sha256_file(p) for p in attachment_paths}

    entry = {
        "event": "hash_evidence",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "email_path": email_path,
        "email_sha256": email_hash,
        "attachments": attachment_hashes,
    }
    audit_log = _append_audit(entry)

    return {
        "email_sha256": email_hash,
        "attachments": attachment_hashes,
        "quarantine_dir": str(quarantine),
        "audit_log": audit_log,
        "note": "original evidence hashed BEFORE analysis; attachments quarantined (never executed)",
    }
