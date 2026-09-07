#!/usr/bin/env python3
"""Sentinel Pet — a static pixel-art guard that lives on your desktop.

A Comnyang-style desktop character that MIRRORS the Sentinel agent's state and
adds three interactive features:

  1. EXPRESSIONS — the face changes by state/risk: idle (smile) → thinking
     (… bubble, eyes up) → tool_running (focused) → confirm_needed (! bubble)
     → verdict (green happy hop / red alarm + shake). Extra expressions:
     talking (chat), sleepy, celebrate, confused.
  2. CHAT — click the pet, type a message, it answers via your LOCAL Ollama
     in a speech bubble. (No Ollama = it replies with a friendly fallback.)
  3. MAIL PANEL — a side window lists emails from a local mailbox and lets you
     click "Analyze" to run the full Sentinel forensics pipeline on one,
     showing the verdict + firing an OS notification.

STATIC by default: the pet stays pinned where you put it (default = Gmail
window corner). It never wanders; only its face animates in place. Drag is
opt-in via --draggable.

MAIL backends (--mail):
    mailpit  : self-hosted open-source SMTP catcher (recommended for demo).
               docker run -d -p 8025:8025 -p 1025:1025 axllent/mailpit
    screen   : OCR the currently-visible Gmail window (needs xdotool +
               ImageMagick `import` + tesseract). Fragile by nature.
    gmail-oauth : read-only Gmail API — STUB, to be implemented later.

PRIVACY: the pet never records keystrokes or reads the screen beyond the one
explicit OCR action you trigger. Chat + mail stay on your machine (Ollama is
local). Mail backends are read-only.

RUN:
    python -m overlay.sentinel_pet --mail mailpit        # static + mail panel
    python -m overlay.sentinel_pet --demo                # cycle expressions
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Optional, Tuple

# --- bootstrap: let both `python -m overlay.sentinel_pet` and direct script
#     runs find the `sentinel` package and sibling modules -------------------
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from PySide6.QtCore import QPoint, QPointF, QRectF, Qt, QTimer, Signal, QObject
from PySide6.QtGui import QColor, QFont, QImage, QPainter, QPen, QCursor
from PySide6.QtWidgets import (QApplication, QLabel, QLineEdit, QListWidget,
                               QPushButton, QTextEdit, QVBoxLayout, QWidget)

try:
    from . import sprites
except ImportError:  # direct script execution
    import sprites

from sentinel.llm import OllamaClient
from sentinel import statebus
import sentinel.mail as mailmod
import sentinel.analyze as analyze_mod

# ---------------------------------------------------------------------------
# Sprites / palette
# ---------------------------------------------------------------------------
_SCALE = 6
_PALETTE = sprites.PALETTE
_BODY = sprites.BODY
_SHIELD = sprites.SHIELD
_BANG = sprites.BANG
_DOTS = sprites.DOTS
_CHECK = sprites.CHECK
_ZZZ = sprites.ZZZ
_QMARK = sprites.QMARK
_STAR = sprites.STAR


def _draw_grid(grid, scale, color_map) -> QImage:
    h, w = len(grid), len(grid[0])
    img = QImage(w * scale, h * scale, QImage.Format_ARGB32)
    img.fill(Qt.transparent)
    p = QPainter(img)
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            color = color_map.get(ch)
            if color is None:
                continue
            p.fillRect(x * scale, y * scale, scale, scale, QColor(color))
    p.end()
    return img


# ---------------------------------------------------------------------------
# OS notification (works without a tray icon)
# ---------------------------------------------------------------------------
def notify(title: str, message: str) -> None:
    """Fire an OS-native notification; degrade gracefully to stdout."""
    if sys.platform.startswith("linux"):
        try:
            subprocess.run(["notify-send", title, message], timeout=3)
            return
        except Exception:
            pass
    elif sys.platform == "darwin":
        try:
            subprocess.run(
                ["osascript", "-e",
                 f'display notification "{message}" with title "{title}"'],
                timeout=3,
            )
            return
        except Exception:
            pass
    print(f"[notify] {title}: {message}")


# ---------------------------------------------------------------------------
# Gmail window geometry (Linux/X11)
# ---------------------------------------------------------------------------
def find_gmail_window_geometry() -> Optional[Tuple[int, int, int, int]]:
    import shutil

    if not shutil.which("xdotool"):
        return None
    try:
        out = subprocess.run(["xdotool", "search", "--name", "Gmail"],
                             capture_output=True, text=True, timeout=3).stdout.strip()
        if not out:
            return None
        wid = out.splitlines()[0]
        geo = subprocess.run(["xdotool", "getwindowgeometry", "--shell", wid],
                             capture_output=True, text=True, timeout=3).stdout
        d = {}
        for line in geo.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                d[k.strip()] = v.strip()
        if all(k in d for k in ("X", "Y", "WIDTH", "HEIGHT")):
            return int(d["X"]), int(d["Y"]), int(d["WIDTH"]), int(d["HEIGHT"])
    except Exception:
        return None
    return None


# ---------------------------------------------------------------------------
# State reader (polls /tmp/sentinel_state.json)
# ---------------------------------------------------------------------------
class StateReader(QObject):
    updated = Signal(dict)

    def __init__(self, path: str) -> None:
        super().__init__()
        self.path = path
        self._last = {}
        self.timer = QTimer(self)
        self.timer.timeout.connect(self._poll)
        self.timer.start(200)

    def _poll(self):
        try:
            data = json.loads(Path(self.path).read_text())
        except Exception:
            return
        if data != self._last:
            self._last = data
            self.updated.emit(data)


# ---------------------------------------------------------------------------
# Chat worker (background Ollama call, never blocks the UI)
# ---------------------------------------------------------------------------
class ChatWorker(QObject):
    reply = Signal(str)

    def __init__(self, client: OllamaClient, history: list) -> None:
        super().__init__()
        self.client = client
        self.history = history

    def run(self):
        try:
            resp = self.client.chat(
                messages=[{"role": "system",
                           "content": "You are Sentinel, a friendly cybersecurity "
                                      "guard pet. Answer briefly and helpfully (1-3 sentences)."}]
                + self.history[-8:],
            )
            text = OllamaClient.extract_text(resp).strip()
            self.reply.emit(text or "(no reply)")
        except Exception as exc:
            self.reply.emit(f"(chat unavailable: {type(exc).__name__})")


# ---------------------------------------------------------------------------
# The pet widget
# ---------------------------------------------------------------------------
class SentinelPet(QWidget):
    def __init__(self, state_path: Optional[str] = None, draggable: bool = False,
                 static_pos: Optional[Tuple[int, int]] = None):
        super().__init__()
        self.risk = 0
        self.state = "idle"
        self.verdict: Optional[str] = None
        self.current_tool = ""
        self._t = 0.0
        self._draggable = draggable
        self._dragging = False
        self._drag_offset = QPoint()
        self._wobble = 0.0
        self.talking = False
        self.chat_open = False
        self.chat_history: list = []
        self.bubble: Optional[str] = None  # current speech bubble text

        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.resize(240, 300)

        # Chat input (hidden until chat is toggled).
        self.chat_input = QLineEdit(self)
        self.chat_input.setPlaceholderText("Ask Sentinel… (Enter to send)")
        self.chat_input.setGeometry(10, 270, 220, 24)
        self.chat_input.returnPressed.connect(self._send_chat)
        self.chat_input.hide()

        # Local LLM client for chat (optional).
        self.chat_client = OllamaClient()

        self.reader = StateReader(state_path) if state_path else None
        if self.reader:
            self.reader.updated.connect(self._on_state)

        self.anim = QTimer(self)
        self.anim.timeout.connect(self._tick)
        self.anim.start(33)

        # Position: explicit (--x/--y) > Gmail corner > bottom-right.
        if static_pos:
            self.move(*static_pos)
        else:
            geo = find_gmail_window_geometry()
            if geo:
                x, y, w, h = geo
                self.move(x + w - self.width() + 20, y + h - self.height() + 30)
            else:
                screen = QApplication.primaryScreen().availableGeometry()
                self.move(screen.right() - self.width() - 20,
                          screen.bottom() - self.height() - 20)

    # --- state / chat -------------------------------------------------
    def _on_state(self, data: dict):
        self.risk = int(data.get("risk", 0))
        self.state = data.get("state", "idle")
        self.verdict = data.get("verdict")
        self.current_tool = data.get("current_tool", "")

    def toggle_chat(self):
        self.chat_open = not self.chat_open
        self.chat_input.setVisible(self.chat_open)
        if self.chat_open:
            self.chat_input.setFocus()
            self.bubble = "Hi! Ask me about emails or threats."
        self.update()

    def _send_chat(self):
        text = self.chat_input.text().strip()
        if not text:
            return
        self.chat_input.clear()
        self.chat_history.append({"role": "user", "content": text})
        self.talking = True
        self.bubble = text
        self.update()
        # Run Ollama in a background thread so the UI keeps animating.
        worker = ChatWorker(self.chat_client, self.chat_history)
        thread = threading.Thread(target=worker.run, daemon=True)
        worker.reply.connect(self._on_reply, Qt.QueuedConnection)
        thread.start()

    def _on_reply(self, text: str):
        self.chat_history.append({"role": "assistant", "content": text})
        self.talking = False
        self.bubble = text
        self.update()

    # --- expression ---------------------------------------------------
    def _expression(self) -> str:
        if self.talking:
            return "talking"
        if self.state == "verdict":
            if self.verdict == "SAFE":
                return "happy"
            if self.verdict == "MALICIOUS":
                return "alarmed"
            return "neutral"
        if self.state == "thinking":
            return "thinking"
        if self.state == "confirm_needed":
            return "alert"
        if self.state == "sleepy":
            return "sleepy"
        if self.state == "celebrate":
            return "celebrate"
        if self.state == "confused":
            return "confused"
        if self.risk >= 80:
            return "alarmed"
        if self.risk >= 60:
            return "frown"
        if self.risk >= 35:
            return "neutral"
        return "idle"

    def _body_char(self) -> str:
        if self.state == "verdict" and self.verdict == "SAFE":
            return "g"
        if self.risk < 35:
            return "g"
        if self.risk < 60:
            return "y"
        if self.risk < 80:
            return "o"
        return "r"

    # --- interaction --------------------------------------------------
    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            if self._draggable:
                self._dragging = True
                self._drag_offset = e.globalPosition().toPoint() - self.frameGeometry().topLeft()
            else:
                self.toggle_chat()  # static: click toggles chat

    def mouseMoveEvent(self, e):
        if self._dragging and self._draggable:
            self.move(e.globalPosition().toPoint() - self._drag_offset)

    def mouseReleaseEvent(self, e):
        if e.button() == Qt.LeftButton and self._dragging:
            self._dragging = False
            self._wobble = 1.0

    # --- animation ---------------------------------------------------
    def _tick(self):
        self._t += 0.03
        if self._wobble > 0:
            self._wobble = max(0.0, self._wobble - 0.05)
        self.update()

    # --- rendering ---------------------------------------------------
    def _sprite_cache_key(self) -> str:
        return self._body_char()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.SmoothPixmapTransform, False)

        w, h = self.width(), self.height()
        cx, cy = w / 2, h / 2 - 15

        expr = self._expression()

        # Shake for alarm / wobble on drop.
        wob = math.sin(self._t * 40) * 4 * self._wobble
        if expr == "alarmed" and self.state == "verdict":
            wob += math.sin(self._t * 30) * 5

        # Hop / breathe.
        bob = 0.0
        if expr == "idle":
            bob = math.sin(self._t * 2) * 2
        elif expr == "happy":
            bob = -abs(math.sin(self._t * 5)) * 7
        elif expr == "talking":
            bob = math.sin(self._t * 3) * 1.5

        # Body.
        cmap = dict(_PALETTE)
        body_char = self._body_char()
        cmap["g"] = cmap["y"] = cmap["o"] = cmap["r"] = _PALETTE[body_char]
        body = _draw_grid(_BODY, _SCALE, cmap)
        bw, bh = body.width(), body.height()
        bx = cx - bw / 2 + wob
        by = cy - bh / 2 + bob
        p.drawImage(int(bx), int(by), body)

        # Eyes + mouth.
        self._draw_eyes(p, bx, by, bw, bh, expr)
        self._draw_mouth(p, bx, by, bw, bh, expr)

        # Shield.
        if self.state in ("investigating", "tool_running", "confirm_needed") or self.risk >= 35:
            sh = _draw_grid(_SHIELD, _SCALE, _PALETTE)
            p.drawImage(int(bx + bw + 2), int(by - 4), sh)

        # Expression glyph bubble.
        self._draw_glyph(p, bx, by, bw, expr)

        # Speech bubble (chat).
        if self.bubble:
            self._draw_speech_bubble(p, cx, by, self.bubble)

        # Status label.
        p.setPen(QPen(QColor(255, 255, 255)))
        p.setFont(QFont("Monospace", 9, QFont.Bold))
        p.drawText(QRectF(0, h - 28, w, 22), Qt.AlignCenter, self._status_label())
        p.end()

    def _draw_eyes(self, p, bx, by, bw, bh, expr):
        ex = bx + bw / 2
        ey = by + bh * 0.38
        eye_r = _SCALE * 0.9
        gap = _SCALE * 3.4

        if expr in ("sleepy",):
            # Closed: horizontal lines.
            p.setPen(QPen(QColor("#1a1a2e"), 2))
            for s in (-1, 1):
                p.drawLine(int(ex + s * gap / 2 - eye_r), int(ey),
                           int(ex + s * gap / 2 + eye_r), int(ey))
            return
        if expr == "happy":
            # ^ ^ eyes.
            p.setPen(QPen(QColor("#1a1a2e"), 2))
            for s in (-1, 1):
                p.drawArc(QRectF(ex + s * gap / 2 - eye_r, ey - eye_r, eye_r * 2, eye_r * 2),
                          0, 180 * 16)
            return

        mdx, mdy = self._mouse_dir()
        if expr == "thinking":
            mdx, mdy, blink = 0, -3, 0.6
        elif expr in ("alarmed", "alert"):
            mdx, mdy, blink = 0, 0, 1.4  # wide eyes
        else:
            blink = 1.0 if (self._t % 3.5) > 0.15 else 0.1

        p.setPen(Qt.NoPen)
        p.setBrush(QColor("#ffffff"))
        p.drawEllipse(QPointF(ex - gap / 2 + mdx, ey + mdy), eye_r, eye_r * blink)
        p.drawEllipse(QPointF(ex + gap / 2 + mdx, ey + mdy), eye_r, eye_r * blink)
        p.setBrush(QColor("#1a1a2e"))
        p.drawEllipse(QPointF(ex - gap / 2 + mdx, ey + mdy), eye_r * 0.45, eye_r * 0.45 * blink)
        p.drawEllipse(QPointF(ex + gap / 2 + mdx, ey + mdy), eye_r * 0.45, eye_r * 0.45 * blink)

    def _draw_mouth(self, p, bx, by, bw, bh, expr):
        mx = bx + bw / 2
        my = by + bh * 0.68
        p.setPen(QPen(QColor("#1a1a2e"), 2))
        p.setBrush(Qt.NoBrush)

        if expr in ("alarmed", "talking"):
            # Open mouth (talking pulses open/closed).
            open_r = _SCALE * (0.7 + 0.3 * abs(math.sin(self._t * 8)))
            p.setBrush(QColor("#7a0000" if expr == "alarmed" else "#1a1a2e"))
            p.drawEllipse(QPointF(mx, my), open_r, open_r * 0.8)
        elif expr in ("happy", "idle"):
            p.drawArc(QRectF(mx - 10, my - 8, 20, 16), 0, 180 * 16)
        elif expr in ("frown", "confused", "sleepy", "alert"):
            p.drawArc(QRectF(mx - 10, my, 20, 14), 180 * 16, 180 * 16)
        else:  # neutral / thinking
            p.drawLine(int(mx - 9), int(my), int(mx + 9), int(my))

    def _draw_glyph(self, p, bx, by, bw, expr):
        glyph, color = None, None
        if expr == "thinking":
            glyph, color = _DOTS, "#ffffff"
        elif expr in ("alert", "alarmed"):
            glyph, color = _BANG, ("#f1c40f" if expr == "alert" else "#e74c3c")
        elif expr == "happy":
            glyph, color = _CHECK, "#2ecc71"
        elif expr == "sleepy":
            glyph, color = _ZZZ, "#ffffff"
        elif expr == "confused":
            glyph, color = _QMARK, "#ffffff"
        elif expr == "celebrate":
            glyph, color = _STAR, "#f1c40f"
        if glyph:
            cmap = {".": None, "k": color}
            g = _draw_grid(glyph, 6, cmap)
            p.drawImage(int(bx + bw + 2), int(by - 22), g)

    def _draw_speech_bubble(self, p, cx, top_y, text):
        p.setFont(QFont("Sans", 9))
        metrics = p.fontMetrics()
        # Wrap text.
        words = text.split()
        lines, cur = [], ""
        for wrd in words:
            trial = (cur + " " + wrd).strip()
            if metrics.horizontalAdvance(trial) > 200:
                lines.append(cur)
                cur = wrd
            else:
                cur = trial
        if cur:
            lines.append(cur)
        tw = max((metrics.horizontalAdvance(l) for l in lines), default=0) + 16
        th = len(lines) * (metrics.height() + 2) + 12
        x = cx - tw / 2
        y = top_y - th - 30
        p.setPen(QPen(QColor("#ffffff")))
        p.setBrush(QColor(30, 30, 50, 220))
        p.drawRoundedRect(QRectF(x, y, tw, th), 8, 8)
        p.setPen(QPen(QColor("#ffffff")))
        for i, l in enumerate(lines):
            p.drawText(QRectF(x + 8, y + 6 + i * (metrics.height() + 2), tw - 16, metrics.height()),
                       Qt.AlignLeft, l)

    def _mouse_dir(self) -> Tuple[float, float]:
        g = QCursor.pos()
        center = self.frameGeometry().center()
        dx, dy = g.x() - center.x(), g.y() - center.y()
        mag = math.hypot(dx, dy) or 1.0
        return (dx / mag) * 3.5, (dy / mag) * 2.5

    def _status_label(self) -> str:
        if self.talking:
            return "TALKING…"
        if self.state == "thinking":
            return "THINKING…"
        if self.state == "confirm_needed":
            return "CONFIRM NEEDED"
        if self.state == "tool_running":
            return f"RUN {self.current_tool or 'tool'}"
        if self.state == "verdict":
            return f"{self.verdict} — RISK {self.risk}"
        if self.state == "investigating":
            return "INVESTIGATING…"
        return f"RISK {self.risk}"


# ---------------------------------------------------------------------------
# Mail panel (separate frameless window)
# ---------------------------------------------------------------------------
class MailPanel(QWidget):
    def __init__(self, backend: mailmod.MailBackend, pet: SentinelPet):
        super().__init__()
        self.backend = backend
        self.pet = pet
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setWindowTitle("Sentinel Mail")
        self.resize(380, 420)

        lay = QVBoxLayout(self)
        self.title = QLabel(f"Inbox — {backend.name}")
        self.title.setStyleSheet("color:#fff; font-weight:bold;")
        lay.addWidget(self.title)

        self.listw = QListWidget()
        self.listw.setStyleSheet("background:#1a1a2e; color:#eee;")
        self.listw.itemClicked.connect(self._on_select)
        lay.addWidget(self.listw)

        self.detail = QTextEdit()
        self.detail.setReadOnly(True)
        self.detail.setStyleSheet("background:#14142a; color:#eee;")
        lay.addWidget(self.detail)

        self.analyze_btn = QPushButton("Analyze this email")
        self.analyze_btn.clicked.connect(self._on_analyze)
        lay.addWidget(self.analyze_btn)

        self.verdict_label = QLabel("")
        self.verdict_label.setWordWrap(True)
        self.verdict_label.setStyleSheet("color:#fff;")
        lay.addWidget(self.verdict_label)

        self._current_id = None
        self._current_raw = ""
        self._refresh_timer = QTimer(self)
        self._refresh_timer.timeout.connect(self.refresh)
        self._refresh_timer.start(3000)
        self.refresh()

    def refresh(self):
        try:
            msgs = self.backend.list_messages()
        except Exception as exc:
            self.title.setText(f"Inbox — {self.backend.name} (offline: {type(exc).__name__})")
            return
        self.title.setText(f"Inbox — {self.backend.name} ({len(msgs)} msg)")
        current = [self.listw.item(i).text() for i in range(self.listw.count())]
        new = [f"{m['from']}: {m['subject']}" for m in msgs]
        if new != current:
            self.listw.clear()
            for m in msgs:
                self.listw.addItem(f"{m['from']}: {m['subject']}")
            if msgs and len(msgs) != len(current):
                notify("Sentinel Pet", f"New mail: {msgs[0]['subject']}")

    def _on_select(self, item):
        idx = self.listw.currentRow()
        try:
            msgs = self.backend.list_messages()
            m = msgs[idx]
            self._current_id = m["id"]
            self._current_raw = self.backend.get_raw(m["id"])
            detail = self.backend.get_message(m["id"])
            body = detail.get("text", "")[:2000]
            self.detail.setPlainText(
                f"From: {detail.get('from')}\nSubject: {detail.get('subject')}\n\n{body}"
            )
        except Exception as exc:
            self.detail.setPlainText(f"(could not load: {exc})")

    def _on_analyze(self):
        if not self._current_raw:
            self.verdict_label.setText("Select an email first.")
            return
        self.analyze_btn.setEnabled(False)
        self.verdict_label.setText("Analyzing…")
        self.pet.state = "investigating"
        self.pet.update()

        def work():
            try:
                res = analyze_mod.analyze_raw(self._current_raw, use_llm=False)
            except Exception as exc:
                res = {"verdict": "ERROR", "confidence": 0, "risk_score": 0,
                       "evidence": [str(exc)]}
            # Update on the GUI thread.
            from PySide6.QtCore import QMetaObject, Q_ARG
            QMetaObject.invokeMethod(self, "_show_verdict", Qt.QueuedConnection,
                                     Q_ARG(str, json.dumps(res)))

        threading.Thread(target=work, daemon=True).start()

    def _show_verdict(self, res_json: str):
        import json as _json

        res = _json.loads(res_json)
        self.analyze_btn.setEnabled(True)
        verdict = res.get("verdict", "?")
        conf = res.get("confidence", 0)
        risk = res.get("risk_score", 0)
        self.verdict_label.setText(f"VERDICT: {verdict} ({conf}%) — risk {risk}/100")
        # Mirror on the pet + notify.
        self.pet.state = "verdict"
        self.pet.verdict = verdict
        self.pet.risk = risk
        self.pet.update()
        notify("Sentinel verdict", f"{verdict} ({conf}% confidence, risk {risk}/100)")


# ---------------------------------------------------------------------------
# Demo mode: cycle expressions without an agent or mail server
# ---------------------------------------------------------------------------
def run_demo(pet: SentinelPet):
    states = [("idle", 0), ("investigating", 5), ("thinking", 10),
              ("tool_running", 40), ("confirm_needed", 65),
              ("verdict", 95), ("celebrate", 0), ("sleepy", 0),
              ("confused", 0), ("talking", 20)]
    idx = [0]

    def next_state():
        s, r = states[idx[0] % len(states)]
        pet.state, pet.risk = s, r
        pet.verdict = "MALICIOUS" if (s == "verdict") else ("SAFE" if s == "celebrate" else None)
        pet.talking = (s == "talking")
        if s == "talking":
            pet.bubble = "Hi! I watch your inbox for threats."
        else:
            pet.bubble = None
        idx[0] += 1
        pet.update()

    timer = QTimer(pet)
    timer.timeout.connect(next_state)
    timer.start(1600)
    next_state()


def main() -> int:
    ap = argparse.ArgumentParser(description="Sentinel desktop pet (static)")
    ap.add_argument("--state", type=str, default="/tmp/sentinel_state.json",
                    help="state JSON published by the agent")
    ap.add_argument("--mail", type=str, default=None,
                    help="mail backend: mailpit | screen | gmail-oauth (none = no panel)")
    ap.add_argument("--mail-url", type=str, default="http://localhost:8025",
                    help="base URL for the mailpit backend")
    ap.add_argument("--x", type=int, default=None, help="fixed x position")
    ap.add_argument("--y", type=int, default=None, help="fixed y position")
    ap.add_argument("--draggable", action="store_true", help="allow dragging (default: static)")
    ap.add_argument("--demo", action="store_true", help="cycle expressions (no agent/mail)")
    args = ap.parse_args()

    app = QApplication(sys.argv)

    static_pos = (args.x, args.y) if (args.x is not None and args.y is not None) else None
    pet = SentinelPet(state_path=None if args.demo else args.state,
                      draggable=args.draggable, static_pos=static_pos)
    pet.show()

    panel = None
    if args.mail and not args.demo:
        backend = mailmod.get_backend(args.mail, base_url=args.mail_url)
        panel = MailPanel(backend, pet)
        panel.show()

    if args.demo:
        run_demo(pet)

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
