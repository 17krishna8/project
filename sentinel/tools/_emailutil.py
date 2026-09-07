"""Shared email-parsing helpers (stdlib `email` only — no execution of payloads).

Centralizing body/attachment extraction here means every tool treats the .eml
identically, and none of them ever *executes* content — they only decode it
into in-memory bytes / text for analysis.
"""
from __future__ import annotations

import email
import email.policy
from pathlib import Path
from typing import Iterator, List, Tuple


def parse_email(path: str) -> email.message.Message:
    """Parse an .eml file using the default (lenient) policy."""
    with open(path, "rb") as fh:
        return email.message_from_binary_file(fh, policy=email.policy.default)


def get_headers(msg: email.message.Message) -> dict:
    """Extract all headers into a dict, preserving multi-value headers as lists."""
    out: dict = {}
    for key in msg.keys():
        vals = msg.get_all(key)
        if vals is None:
            continue
        out[key] = vals if len(vals) > 1 else vals[0]
    return out


def _decode_part(part) -> str:
    """Decode a MIME part's payload to text (best-effort, never errors out)."""
    try:
        payload = part.get_payload(decode=True)
        if payload is None:
            return str(part.get_payload())
        charset = part.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace")
    except Exception:
        return ""


def get_body(msg: email.message.Message) -> str:
    """Return the concatenated text (plain + HTML) of the message body."""
    parts: List[str] = []

    def walk(m):
        if m.is_multipart():
            for sub in m.get_payload():
                walk(sub)
            return
        ctype = m.get_content_type()
        if ctype in ("text/plain", "text/html"):
            parts.append(_decode_part(m))

    walk(msg)
    return "\n".join(p for p in parts if p.strip())


def iter_attachments(msg: email.message.Message) -> Iterator[Tuple[str, bytes]]:
    """Yield (filename, raw_bytes) for every attachment part."""
    def walk(m):
        if m.is_multipart():
            for sub in m.get_payload():
                yield from walk(sub)  # recurse (must consume the sub-generator)
            return
        disp = (m.get_content_disposition() or "").lower()
        if disp == "attachment" or (m.get_filename() is not None):
            payload = m.get_payload(decode=True)
            if payload is not None:
                yield m.get_filename() or "unnamed.bin", payload

    yield from walk(msg)


def extract_attachments(msg: email.message.Message, outdir: str) -> List[str]:
    """Write attachments to `outdir` (safe filenames) and return their paths.

    NOTE: filenames are attacker-controlled, so we sanitize them aggressively
    (strip path separators, resolve traversal) before writing. Files are
    written ONLY for hashing / sandboxed static analysis — never executed.
    """
    Path(outdir).mkdir(parents=True, exist_ok=True)
    paths: List[str] = []
    for fname, data in iter_attachments(msg):
        safe = Path(fname).name or "unnamed.bin"
        safe = "".join(c for c in safe if c.isalnum() or c in "._-")
        if not safe:
            safe = "unnamed.bin"
        dest = Path(outdir) / safe
        dest.write_bytes(data)
        paths.append(str(dest))
    return paths
