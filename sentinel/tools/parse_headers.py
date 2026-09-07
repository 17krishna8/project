"""parse_headers — extract and normalize every header, especially ALL
Received: hops (not just the top one), plus SPF / Authentication-Results /
Message-ID / Date. Pure parsing — no network, no execution.
"""
from __future__ import annotations

import os
import re

from . import _emailutil


def parse_headers(email_path: str) -> dict:
    email_path = os.path.abspath(email_path)
    msg = _emailutil.parse_email(email_path)
    headers = _emailutil.get_headers(msg)

    # get_all preserves on-the-wire order (topmost/first Received = closest
    # hop to the recipient). We keep it as-is; resolve_origin walks it.
    received = msg.get_all("Received") or []

    # Normalize auth results into a simple summary for risk scoring.
    auth_lines = headers.get("Authentication-Results", [])
    spf_lines = headers.get("Received-SPF", [])
    if isinstance(auth_lines, str):
        auth_lines = [auth_lines]
    if isinstance(spf_lines, str):
        spf_lines = [spf_lines]
    spf_result = "none"
    dkim_result = "none"
    for line in spf_lines:
        m = re.search(r"\b(pass|fail|softfail|neutral|none)\b", line)
        if m:
            spf_result = m.group(1)
            break
    for line in auth_lines:
        m = re.search(r"spf=(\w+)", line)
        if m:
            spf_result = m.group(1)
        m2 = re.search(r"dkim=(\w+)", line)
        if m2:
            dkim_result = m2.group(1)
        if "spf=" in line and "dkim=" in line:
            break

    return {
        "auth": {"spf": spf_result, "dkim": dkim_result},
        "From": headers.get("From", ""),
        "Reply-To": headers.get("Reply-To", ""),
        "Return-Path": headers.get("Return-Path", ""),
        "To": headers.get("To", ""),
        "Subject": headers.get("Subject", ""),
        "Date": headers.get("Date", ""),
        "Message-ID": headers.get("Message-ID", ""),
        "Authentication-Results": headers.get("Authentication-Results", []),
        "Received-SPF": headers.get("Received-SPF", []),
        "DKIM-Signature": headers.get("DKIM-Signature", ""),
        "Received": received,
        "received_count": len(received),
    }
