"""extract_urls — pull hyperlinks + detect brand/domain mismatch.

Signals produced:
  * visible-text/domain mismatch ("PayPal" text -> paypa1.com link),
  * punycode / IDN homograph domains (xn--...),
  * suspicious TLDs (.tk/.ml/.ga/.cf/.gq, .zip, .mov, long-numbered domains),
  * IP-address or `@`-trick links (http://paypal.com@evil.com).

Pure string analysis — we do NOT fetch the links here (that happens only
inside the sandbox if/when enabled, and even then is a manual step).
"""
from __future__ import annotations

import re
from html import unescape
from urllib.parse import urlparse

_URL_RE = re.compile(r"""https?://[^\s"'<>)\]]+""", re.IGNORECASE)

_SUSPICIOUS_TLDS = {"tk", "ml", "ga", "cf", "gq", "zip", "mov", "xyz", "top", "click", "link"}

# Known brand -> canonical domain, for mismatch detection.
_BRAND_DOMAINS = {
    "paypal": "paypal.com",
    "apple": "apple.com",
    "icloud": "icloud.com",
    "google": "google.com",
    "gmail": "gmail.com",
    "microsoft": "microsoft.com",
    "outlook": "outlook.com",
    "amazon": "amazon.com",
    "facebook": "facebook.com",
    "netflix": "netflix.com",
    "bank": None,  # generic keyword, not brand-specific
}


def _domain(url: str) -> str:
    try:
        p = urlparse(url if "://" in url else f"http://{url}")
        return (p.hostname or "").lower()
    except Exception:
        return ""


def _edit_distance(a: str, b: str) -> int:
    """Levenshtein distance between two short strings (dependency-free)."""
    if abs(len(a) - len(b)) > 1:
        return 99  # pre-prune: only near-equal-length labels are typosquats
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _safe_tld(domain: str) -> str:
    """Get the effective TLD safely, using only the stdlib.

    We approximate the public suffix (e.g. 'co.uk' -> 'uk') with a small,
    dependency-free suffix list. This is only a signal, not a hard verdict.
    """
    if not domain:
        return ""
    for suffix in ("co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "co.in", "co.jp"):
        if domain.endswith("." + suffix):
            return suffix.split(".")[-1]
    return domain.rsplit(".", 1)[-1] if "." in domain else ""


def _extract_links(body: str) -> list[dict]:
    text = unescape(body)
    seen = set()
    links = []
    # href="..." links first (HTML)
    for m in re.finditer(r'href\s*=\s*["\']([^"\']+)["\']', text, re.IGNORECASE):
        url = m.group(1).strip()
        if url.lower().startswith(("http://", "https://")) and url not in seen:
            seen.add(url)
            links.append(url)
    # bare URLs in plain text
    for m in _URL_RE.finditer(text):
        url = m.group(0).rstrip(".,;:!?")
        if url not in seen:
            seen.add(url)
            links.append(url)
    return links


def _analyze(url: str) -> dict:
    domain = _domain(url)
    tld = _safe_tld(domain)
    flags = []
    risk = 0

    if not domain:
        flags.append("unparseable URL")
        risk += 10

    # IP-address host (often credential-harvesting infra).
    if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", domain):
        flags.append("raw-IP host")
        risk += 20

    # `@`-trick: http://trusted.com@evil.com
    if "@" in urlparse(url).netloc:
        flags.append("userinfo/@-trick in URL")
        risk += 25

    # Punycode / IDN homograph.
    if "xn--" in domain:
        flags.append("punycode/IDN homograph domain")
        risk += 25

    # Suspicious TLD.
    if tld and tld.lower() in _SUSPICIOUS_TLDS:
        flags.append(f"suspicious TLD .{tld}")
        risk += 15

    # Brand/domain mismatch + typosquat + subdomain-trick detection.
    labels = domain.split(".")
    # Effective registrable domain ~ last two labels (approx; no public-suffix list).
    apex = ".".join(labels[-2:]) if len(labels) >= 2 else domain
    for brand, canonical in _BRAND_DOMAINS.items():
        if not canonical:
            continue
        # (a) exact brand string in the domain but not at the canonical host.
        if brand in domain and canonical not in domain:
            flags.append(f"possible {brand} impersonation ({domain} != {canonical})")
            risk += 30
        # (b) typosquat: brand label with a small edit distance.
        for lbl in labels:
            if _edit_distance(brand, lbl) <= 1 and lbl != brand:
                flags.append(f"{brand} typosquat: '{lbl}' in {domain}")
                risk += 30
        # (c) subdomain trick: brand appears in a subdomain label but the
        #     apex domain is NOT the canonical domain.
        if any(_edit_distance(brand, l) <= 1 for l in labels[:-2]) and canonical not in apex:
            flags.append(f"brand-in-subdomain trick: '{brand}' used, real host {apex}")
            risk += 30

    # Numeric / hyphen-stuffed long domain heuristic.
    if re.match(r"^\d{5,}", domain.replace(".", "")):
        flags.append("numeric/high-entropy domain")
        risk += 10

    return {
        "url": url,
        "domain": domain,
        "tld": tld,
        "flags": flags,
        "risk_contribution": risk,
    }


def extract_urls(body: str) -> dict:
    links = _extract_links(body)
    analyzed = [_analyze(u) for u in links]
    return {
        "total_links": len(analyzed),
        "links": analyzed,
        "brand_mismatches": [a for a in analyzed if any("impersonation" in f for f in a["flags"])],
        "suspicious_links": [a for a in analyzed if a["risk_contribution"] > 0],
    }
