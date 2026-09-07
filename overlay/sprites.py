"""Pixel-art sprite data for the Sentinel pet (NO Qt dependency).

Each sprite is a list of equal-length strings; each character maps to a
color via PALETTE. Keeping the data here means it can be validated and unit-
tested without importing Qt (and without a display/GL stack).
"""

PALETTE = {
    ".": None,          # transparent
    "k": "#1a1a2e",     # outline (near-black navy)
    "w": "#ffffff",     # white
    "p": "#2b2b45",     # pupil
    "g": "#2ecc71",     # green (calm body)
    "y": "#f1c40f",     # yellow (alert body)
    "o": "#e67e22",     # orange (high body)
    "r": "#e74c3c",     # red (critical body)
    "b": "#3498db",     # shield blue
    "s": "#bdc3c7",     # silver/steel
    "a": "#7f8c8d",     # gray accent
}

# Head/body (14 wide x 12 tall). Eyes + mouth are drawn on top at runtime.
BODY = [
    "......kk......",
    "....kkkkkk....",
    "...kkkkkkkk...",
    "..kkkkkkkkkk..",
    ".kkk......kkk.",
    ".kk........kk.",
    ".kk........kk.",
    ".kk........kk.",
    ".kk........kk.",
    "..kk......kk..",
    "...kkkkkkkk...",
    ".....kkkk.....",
]

# Shield (raised when investigating / alert / tool running).
SHIELD = [
    "kkkkkk",
    "kbbbkk",
    "kbbbbk",
    "kbbbbk",
    "kbbbkk",
    "kkbkkk",
    ".kkk..",
]

# Alert glyphs.
BANG = [
    "kkk",
    "kkk",
    "kkk",
    "...",
    "kkk",
]
DOTS = ["k..k..k"]
CHECK = ["k..k", ".kk."]
# "zzz" sleepy.
ZZZ = [
    "k..k..",
    ".k..k.",
    "..k..k",
]
# Question mark (confused).
QMARK = [
    "kk.",
    ".kk",
    ".k.",
    "...",
    ".k.",
]
# Star (celebration).
STAR = [
    ".k.",
    "kkk",
    ".k.",
]


def validate() -> None:
    """Raise AssertionError if any sprite is malformed."""
    for name, grid in [("BODY", BODY), ("SHIELD", SHIELD), ("BANG", BANG),
                       ("DOTS", DOTS), ("CHECK", CHECK), ("ZZZ", ZZZ),
                       ("QMARK", QMARK), ("STAR", STAR)]:
        w = len(grid[0])
        for i, row in enumerate(grid):
            assert len(row) == w, f"{name} row {i}: len {len(row)} != {w}"
            unknown = set(row) - set(PALETTE)
            assert not unknown, f"{name} row {i}: unknown chars {unknown}"
