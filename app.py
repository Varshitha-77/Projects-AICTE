"""
Library AI Agent — Streamlit Frontend
AICTE Problem Statement No.21 | Powered by IBM Granite (watsonx.ai)

Run:  streamlit run app.py
      (make sure the Node.js backend is running: npm start)
"""

import streamlit as st
import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

API_BASE = os.getenv("API_BASE_URL", "http://localhost:3000")

st.set_page_config(
    page_title="Library AI Agent",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS ────────────────────────────────────────────────────────────────

st.markdown("""
<style>
/* ── Global ── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, sans-serif;
}

/* Hide Streamlit default chrome */
#MainMenu, footer, header { visibility: hidden; }
.block-container { padding-top: 1rem; padding-bottom: 0; }

/* ── Top banner ── */
.top-banner {
    background: linear-gradient(90deg, #0f62fe 0%, #7c5cd8 100%);
    border-radius: 12px;
    padding: 18px 24px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.banner-title { color: #fff; font-size: 1.4rem; font-weight: 700; margin: 0; }
.banner-sub   { color: rgba(255,255,255,0.75); font-size: 0.8rem; margin-top: 2px; }
.banner-badge {
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    color: #fff;
    font-size: 0.75rem;
    padding: 5px 14px;
    border-radius: 20px;
    font-weight: 600;
}

/* ── Chat messages ── */
.chat-user {
    background: #e8f0fe;
    border: 1px solid #c5d8fd;
    border-radius: 14px 14px 4px 14px;
    padding: 12px 16px;
    margin: 6px 0 6px 60px;
    font-size: 0.9rem;
    color: #1a1d27;
    line-height: 1.6;
}
.chat-bot {
    background: #f7f8fa;
    border: 1px solid #e5e7eb;
    border-radius: 14px 14px 14px 4px;
    padding: 14px 18px;
    margin: 6px 60px 6px 0;
    font-size: 0.9rem;
    color: #1f2328;
    line-height: 1.65;
}
.chat-bot strong { color: #0f62fe; }

.msg-meta {
    font-size: 0.7rem;
    color: #8b949e;
    margin-top: 4px;
    margin-bottom: 8px;
}
.intent-chip {
    display: inline-block;
    background: #e8f0fe;
    color: #1a56db;
    font-size: 0.68rem;
    padding: 2px 8px;
    border-radius: 20px;
    font-weight: 600;
    margin-bottom: 6px;
}
.blocked-msg {
    background: #fff8e1;
    border: 1px solid #f5a623;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.85rem;
    color: #7a4f00;
    margin: 6px 0;
}
.scope-msg {
    background: #fff0f0;
    border: 1px solid #e84b4b;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.85rem;
    color: #7a0000;
    margin: 6px 0;
}
.success-msg {
    background: #e6f9f0;
    border: 1px solid #3ecf8e;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.85rem;
    color: #0a5c39;
    margin: 6px 0;
}

/* ── Book cards ── */
.book-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px 16px;
    margin: 8px 0;
    border-left: 4px solid #0f62fe;
}
.book-title  { font-size: 0.95rem; font-weight: 700; color: #1f2328; margin-bottom: 3px; }
.book-author { font-size: 0.8rem; color: #57606a; margin-bottom: 8px; }
.avail-yes   { color: #1a7f37; font-weight: 600; font-size: 0.8rem; }
.avail-no    { color: #cf222e; font-weight: 600; font-size: 0.8rem; }
.book-loc    { font-size: 0.75rem; color: #57606a; }
.book-subj   { font-size: 0.72rem; background: #f0f4ff; color: #1a56db;
               padding: 2px 7px; border-radius: 10px; margin-right: 4px;
               display: inline-block; margin-top: 4px; }

/* ── Auth card ── */
.auth-ok {
    background: #e6f9f0;
    border: 1px solid #3ecf8e;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 0.85rem;
    color: #0a5c39;
    margin-bottom: 12px;
}
.auth-no {
    background: #fff8e1;
    border: 1px solid #f5a623;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 0.85rem;
    color: #7a4f00;
    margin-bottom: 12px;
}

/* ── Sidebar section label ── */
.section-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #57606a;
    margin-bottom: 8px;
    margin-top: 4px;
}

/* ── Quick chip buttons ── */
.stButton > button {
    width: 100%;
    text-align: left;
    background: #f7f8fa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    color: #1f2328;
    font-size: 0.8rem;
    padding: 8px 12px;
    transition: border-color 0.2s;
}
.stButton > button:hover {
    border-color: #0f62fe;
    background: #e8f0fe;
    color: #0f62fe;
}
</style>
""", unsafe_allow_html=True)

# ── Session state ─────────────────────────────────────────────────────────────

def init_state():
    defaults = {
        "messages"   : [],
        "session_id" : None,
        "conv_id"    : None,
        "student"    : None,
        "server_ok"  : None,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

init_state()

# ── API helpers ───────────────────────────────────────────────────────────────

def api(method, path, **kwargs):
    """Make an API call to the Node.js backend."""
    headers = kwargs.pop("headers", {})
    if st.session_state.session_id:
        headers["x-session-id"] = st.session_state.session_id
    try:
        r = requests.request(
            method,
            f"{API_BASE}{path}",
            headers=headers,
            timeout=30,
            **kwargs,
        )
        return r
    except requests.exceptions.ConnectionError:
        return None

def check_server():
    r = api("GET", "/api/health")
    if r and r.status_code == 200:
        st.session_state.server_ok = True
        return True
    st.session_state.server_ok = False
    return False

# ── Render helpers ────────────────────────────────────────────────────────────

INTENT_LABELS = {
    "SEARCH_BOOKS"       : "🔍 Search",
    "CHECK_AVAILABILITY" : "✅ Availability",
    "GET_RECOMMENDATIONS": "🎯 Recommendations",
    "RESERVE_BOOK"       : "🔖 Reservation",
    "BORROW_HISTORY"     : "📋 My History",
    "GENERAL_QUERY"      : "💬 General",
}

def render_book_card(book):
    avail   = book.get("available_copies", 0)
    total   = book.get("total_copies", 0)
    authors = ", ".join(book.get("authors", []))
    loc     = book.get("location", "")
    subjs   = " ".join(f'<span class="book-subj">{s}</span>'
                       for s in book.get("subjects", [])[:3])
    avail_html = (
        f'<span class="avail-yes">✓ {avail}/{total} copies available</span>'
        if avail > 0 else
        f'<span class="avail-no">✗ Unavailable (0/{total})</span>'
    )
    return f"""
    <div class="book-card">
        <div class="book-title">{book.get("title","")}</div>
        <div class="book-author">{authors} · {book.get("year","")}</div>
        {avail_html}
        {'<br><span class="book-loc">📍 ' + loc + '</span>' if loc else ''}
        <div style="margin-top:6px">{subjs}</div>
    </div>"""

def render_message(msg):
    role  = msg["role"]
    text  = msg["content"]
    ts    = msg.get("time", "")
    mtype = msg.get("type", "SUCCESS")
    books = msg.get("books", [])
    intent= msg.get("intent", "")

    if role == "user":
        st.markdown(
            f'<div class="chat-user">{text}</div>'
            f'<div class="msg-meta" style="text-align:right">{ts}</div>',
            unsafe_allow_html=True,
        )
    else:
        intent_html = ""
        if intent and intent in INTENT_LABELS:
            intent_html = f'<div class="intent-chip">{INTENT_LABELS[intent]}</div><br>'

        if mtype in ("BLOCKED", "PRIVACY_BLOCKED"):
            st.markdown(f'<div class="blocked-msg">⚠️ {text}</div>', unsafe_allow_html=True)
        elif mtype == "OUT_OF_SCOPE":
            st.markdown(f'<div class="scope-msg">🚫 {text}</div>', unsafe_allow_html=True)
        elif mtype == "AUTH_REQUIRED":
            st.markdown(f'<div class="blocked-msg">🔒 {text}</div>', unsafe_allow_html=True)
        else:
            # Format markdown-like bold
            formatted = text.replace("**", "<strong>", 1)
            while "**" in formatted:
                formatted = formatted.replace("**", "</strong>", 1)
                if "**" in formatted:
                    formatted = formatted.replace("**", "<strong>", 1)
            formatted = formatted.replace("\n", "<br>")

            st.markdown(
                f'<div class="chat-bot">{intent_html}{formatted}</div>'
                f'<div class="msg-meta">{ts}</div>',
                unsafe_allow_html=True,
            )

        # Render book cards below the message
        if books:
            cards_html = "".join(render_book_card(b) for b in books[:5])
            st.markdown(cards_html, unsafe_allow_html=True)

# ── Send a chat message ───────────────────────────────────────────────────────

def send_message(query: str):
    """Append user message, call backend, append assistant reply to session state."""
    if not query.strip():
        return

    now = datetime.now().strftime("%H:%M")
    # Add user turn immediately so it renders on rerun
    st.session_state.messages.append({
        "role"   : "user",
        "content": query,
        "time"   : now,
    })

    payload = {"query": query}
    if st.session_state.conv_id:
        payload["convId"] = st.session_state.conv_id

    r = api("POST", "/api/chat", json=payload)

    if r is None:
        st.session_state.messages.append({
            "role"   : "assistant",
            "content": "⚠️ Cannot reach the backend server. Make sure `npm start` is running on port 3000.",
            "type"   : "ERROR",
            "time"   : now,
        })
        return

    data = r.json()
    st.session_state.conv_id = data.get("convId", st.session_state.conv_id)

    st.session_state.messages.append({
        "role"   : "assistant",
        "content": data.get("message", "No response received."),
        "type"   : data.get("type", "SUCCESS"),
        "intent" : data.get("intent", ""),
        "books"  : data.get("books", []),
        "time"   : now,
    })

# ── Login / Logout ────────────────────────────────────────────────────────────

def do_login(roll, pin):
    r = api("POST", "/api/auth/login", json={"rollNumber": roll, "pin": pin})
    if r is None:
        return False, "Server not reachable."
    if r.status_code != 200:
        return False, r.json().get("error", "Login failed.")
    data = r.json()
    st.session_state.session_id = data["sessionId"]
    st.session_state.student    = data["student"]
    return True, data["message"]

def do_logout():
    api("POST", "/api/auth/logout")
    st.session_state.session_id = None
    st.session_state.student    = None

def do_reserve(book_id, title):
    r = api("POST", "/api/reservations", json={"bookId": book_id})
    if r is None:
        return False, "Server not reachable."
    if r.status_code == 201:
        return True, r.json().get("message", "Reserved successfully.")
    return False, r.json().get("error", "Reservation failed.")

# ═════════════════════════════════════════════════════════════════════════════
# Page layout
# ═════════════════════════════════════════════════════════════════════════════

# ── Top banner ────────────────────────────────────────────────────────────────

st.markdown("""
<div class="top-banner">
  <div>
    <div class="banner-title">📚 Library AI Agent</div>
    <div class="banner-sub">AICTE Problem Statement No.21 · IBM Granite · watsonx.ai</div>
  </div>
  <div class="banner-badge">🤖 Powered by IBM Granite</div>
</div>
""", unsafe_allow_html=True)

# ── Layout: sidebar + main ────────────────────────────────────────────────────

sidebar, main_col = st.columns([1, 2.8], gap="large")

# ══════════════════════════════════════════════════════════════════════════════
# SIDEBAR
# ══════════════════════════════════════════════════════════════════════════════

with sidebar:

    # Server status
    server_ok = check_server()
    if server_ok:
        st.success("🟢 Backend connected (port 3000)", icon=None)
    else:
        st.error("🔴 Backend offline — run `npm start` first")

    st.divider()

    # ── Auth section ──────────────────────────────────────────────────────────
    st.markdown('<div class="section-label">Student Login</div>', unsafe_allow_html=True)

    if st.session_state.student:
        s = st.session_state.student
        st.markdown(
            f'<div class="auth-ok">'
            f'✅ <strong>{s["name"]}</strong><br>'
            f'{s["department"]} · Year {s["year"]}<br>'
            f'<small>Courses: {", ".join(s.get("courses", []))}</small>'
            f'</div>',
            unsafe_allow_html=True,
        )
        if st.button("🚪 Logout", use_container_width=True):
            do_logout()
            st.rerun()
    else:
        st.markdown(
            '<div class="auth-no">🔒 Not authenticated<br>'
            '<small>Log in to get personalised recommendations and manage reservations.</small></div>',
            unsafe_allow_html=True,
        )
        with st.form("login_form", clear_on_submit=True):
            roll = st.text_input("Roll Number", placeholder="e.g. CS2021001")
            pin  = st.text_input("PIN", type="password", placeholder="••••")
            submitted = st.form_submit_button("Login", use_container_width=True)
            if submitted:
                if roll and pin:
                    ok, msg = do_login(roll, pin)
                    if ok:
                        st.success(msg)
                        st.rerun()
                    else:
                        st.error(msg)
                else:
                    st.warning("Enter roll number and PIN.")

        st.caption("Demo: CS2021001 / 1234 · DS2022045 / 5678")

    st.divider()

    # ── Quick prompts ─────────────────────────────────────────────────────────
    st.markdown('<div class="section-label">Quick Prompts</div>', unsafe_allow_html=True)

    quick_prompts = [
        ("🤖", "Machine Learning books",      "Find books on machine learning"),
        ("⚡", "Algorithm books available",   "What books are available for algorithms?"),
        ("💾", "Database recommendations",    "Recommend books for database systems"),
        ("🔍", "Check Deep Learning book",    "Check availability of Deep Learning book"),
        ("📋", "My borrow history",           "Show my borrow history"),
        ("🐍", "Python beginner books",       "Books for Python programming beginners"),
        ("🧮", "Discrete mathematics books",  "Find books on discrete mathematics"),
        ("🏗️", "Software engineering books",  "Recommend books for software engineering"),
    ]

    for icon, label, prompt_text in quick_prompts:
        if st.button(f"{icon} {label}", key=f"qp_{label}", use_container_width=True):
            with st.spinner("⏳ IBM Granite is thinking…"):
                send_message(prompt_text)
            st.rerun()

    st.divider()

    # ── New conversation ──────────────────────────────────────────────────────
    if st.button("🔄 New Conversation", use_container_width=True):
        if st.session_state.conv_id:
            api("DELETE", f"/api/chat/{st.session_state.conv_id}")
        st.session_state.messages = []
        st.session_state.conv_id  = None
        st.rerun()

    # ── Book search widget ────────────────────────────────────────────────────
    st.divider()
    st.markdown('<div class="section-label">Quick Book Search</div>', unsafe_allow_html=True)

    search_q = st.text_input("Search library", placeholder="title, author, subject…", label_visibility="collapsed")
    if st.button("🔎 Search", use_container_width=True) and search_q:
        r = api("GET", "/api/books", params={"q": search_q})
        if r and r.status_code == 200:
            results = r.json().get("books", [])
            if results:
                with st.expander(f"Found {len(results)} book(s)", expanded=True):
                    for b in results[:6]:
                        avail = b.get("available_copies", 0)
                        color = "🟢" if avail > 0 else "🔴"
                        st.markdown(
                            f"**{b['title']}**  \n"
                            f"*{', '.join(b.get('authors', []))}*  \n"
                            f"{color} {avail}/{b.get('total_copies',0)} copies · {b.get('location','')}",
                        )
                        if avail == 0 and st.session_state.student:
                            if st.button(f"Reserve '{b['title'][:25]}…'", key=f"res_{b['id']}"):
                                ok, msg = do_reserve(b["id"], b["title"])
                                if ok:
                                    st.success(msg)
                                else:
                                    st.error(msg)
                        st.divider()
            else:
                st.info("No books found for that query.")

# ══════════════════════════════════════════════════════════════════════════════
# MAIN — Chat
# ══════════════════════════════════════════════════════════════════════════════

with main_col:

    # Welcome placeholder
    if not st.session_state.messages:
        st.markdown("""
        <div style="text-align:center; padding: 40px 20px; color:#57606a;">
            <div style="font-size:3rem; margin-bottom:12px">📖</div>
            <h3 style="color:#1f2328; margin-bottom:8px">Welcome to Library AI Agent</h3>
            <p style="max-width:500px; margin:0 auto; font-size:0.9rem; line-height:1.6">
                Ask me to find books, check availability, get personalised recommendations
                based on your courses, or manage your reservations.
            </p>
            <div style="display:flex; gap:12px; justify-content:center; margin-top:20px; flex-wrap:wrap">
                <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:0.8rem;text-align:left;min-width:150px">
                    <div style="font-size:1.1rem">🔍</div>
                    <strong>Smart Search</strong><br>
                    <span style="font-size:0.72rem;color:#57606a">By title, author, subject</span>
                </div>
                <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:0.8rem;text-align:left;min-width:150px">
                    <div style="font-size:1.1rem">✅</div>
                    <strong>Live Availability</strong><br>
                    <span style="font-size:0.72rem;color:#57606a">Real-time copy count</span>
                </div>
                <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:0.8rem;text-align:left;min-width:150px">
                    <div style="font-size:1.1rem">🎯</div>
                    <strong>Personalised Picks</strong><br>
                    <span style="font-size:0.72rem;color:#57606a">Aligned with your courses</span>
                </div>
                <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:0.8rem;text-align:left;min-width:150px">
                    <div style="font-size:1.1rem">🔒</div>
                    <strong>10 Guardrails</strong><br>
                    <span style="font-size:0.72rem;color:#57606a">Safe &amp; verified responses</span>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)

    # ── Native chat input (always rendered OUTSIDE containers for correct rerun) ──
    user_input = st.chat_input(
        "Ask about books, availability, recommendations, reservations…",
        key="chat_input",
    )

    # Process input BEFORE rendering history so spinner shows immediately
    if user_input and user_input.strip():
        with st.spinner("⏳ IBM Granite is thinking…"):
            send_message(user_input.strip())

    # Chat history
    chat_container = st.container()
    with chat_container:
        for msg in st.session_state.messages:
            render_message(msg)

    st.caption("📚 Library queries only · Powered by IBM Granite (watsonx.ai)")
