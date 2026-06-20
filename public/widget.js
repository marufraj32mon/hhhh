/**
 * MotherSMM AI Chatbot Widget
 * Usage: <script src="https://YOUR-VERCEL-URL/widget.js"></script>
 * Optional: data-api="https://YOUR-VERCEL-URL" to override API base
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var API_BASE = (script && script.dataset.api) || script.src.replace(/\/widget\.js.*$/, '');
  var STORAGE_KEY = 'smm_chat_history_v2';

  // ── State ────────────────────────────────────────────────
  var cfg = null;          // loaded from /api/settings
  var messages = [];       // [{role, content}]
  var isOpen = false;
  var isTyping = false;

  // Restore chat history from sessionStorage
  try {
    var saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) messages = JSON.parse(saved);
  } catch (e) { messages = []; }

  function saveHistory() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch (e) {}
  }

  // ── Styles ────────────────────────────────────────────────
  function injectStyles(color) {
    var c = color || '#7C3AED';
    var style = document.createElement('style');
    style.textContent = `
      #smm-widget-btn {
        position:fixed; bottom:24px; right:24px; z-index:99998;
        width:58px; height:58px; border-radius:50%; border:none; cursor:pointer;
        background:linear-gradient(135deg,${c},${c}bb);
        color:#fff; display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 20px ${c}55; transition:transform .25s,box-shadow .25s;
        font-size:24px;
      }
      #smm-widget-btn:hover { transform:scale(1.1); box-shadow:0 6px 28px ${c}77; }
      #smm-widget-btn .smm-badge {
        position:absolute; top:-4px; right:-4px;
        background:#ef4444; color:#fff; border-radius:50%;
        width:18px; height:18px; font-size:10px; font-weight:700;
        display:none; align-items:center; justify-content:center;
        border:2px solid #fff;
      }
      #smm-widget-btn .smm-badge.show { display:flex; }

      #smm-widget-box {
        position:fixed; bottom:92px; right:24px; z-index:99999;
        width:370px; max-width:calc(100vw - 32px);
        height:550px; max-height:calc(100vh - 110px);
        background:#fff; border-radius:20px;
        box-shadow:0 20px 60px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);
        display:none; flex-direction:column; overflow:hidden;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        animation:smmSlideUp .25s ease-out;
      }
      #smm-widget-box.open { display:flex; }
      @keyframes smmSlideUp {
        from { opacity:0; transform:translateY(14px); }
        to   { opacity:1; transform:translateY(0); }
      }

      .smm-header {
        background:linear-gradient(135deg,${c},${c}cc);
        color:#fff; padding:16px 18px;
        display:flex; align-items:center; gap:12px; flex-shrink:0;
      }
      .smm-avatar {
        width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.2);
        display:flex; align-items:center; justify-content:center;
        font-size:20px; flex-shrink:0;
      }
      .smm-header-info { flex:1; min-width:0; }
      .smm-header-name { font-weight:700; font-size:15px; }
      .smm-header-status { font-size:11px; opacity:.85; margin-top:1px;
        display:flex; align-items:center; gap:5px; }
      .smm-header-status::before {
        content:''; width:7px; height:7px; border-radius:50%;
        background:#4ade80; display:inline-block;
      }
      .smm-close-btn {
        background:rgba(255,255,255,.2); border:none; color:#fff; cursor:pointer;
        width:30px; height:30px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-size:18px; transition:background .2s; flex-shrink:0;
      }
      .smm-close-btn:hover { background:rgba(255,255,255,.35); }
      .smm-new-btn {
        background:rgba(255,255,255,.2); border:none; color:#fff; cursor:pointer;
        width:30px; height:30px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-size:14px; transition:background .2s; flex-shrink:0;
        margin-right:4px; title:'New Chat';
      }
      .smm-new-btn:hover { background:rgba(255,255,255,.35); }

      .smm-messages {
        flex:1; overflow-y:auto; padding:16px; display:flex;
        flex-direction:column; gap:10px; scroll-behavior:smooth;
      }
      .smm-messages::-webkit-scrollbar { width:4px; }
      .smm-messages::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:2px; }

      .smm-msg { display:flex; gap:8px; align-items:flex-end; max-width:86%; }
      .smm-msg.user { align-self:flex-end; flex-direction:row-reverse; }
      .smm-msg.bot  { align-self:flex-start; }

      .smm-msg-avatar {
        width:28px; height:28px; border-radius:50%; flex-shrink:0;
        background:linear-gradient(135deg,${c},${c}aa);
        display:flex; align-items:center; justify-content:center;
        font-size:13px; color:#fff;
      }
      .smm-msg.user .smm-msg-avatar { background:#e2e8f0; }

      .smm-bubble {
        padding:10px 14px; border-radius:18px; font-size:13.5px;
        line-height:1.55; word-break:break-word;
      }
      .smm-msg.bot  .smm-bubble {
        background:#f1f5f9; color:#1e293b;
        border-bottom-left-radius:4px;
      }
      .smm-msg.user .smm-bubble {
        background:linear-gradient(135deg,${c},${c}dd);
        color:#fff; border-bottom-right-radius:4px;
      }
      .smm-bubble p  { margin:0 0 8px; }
      .smm-bubble p:last-child { margin-bottom:0; }
      .smm-bubble strong { font-weight:600; }
      .smm-bubble code {
        background:rgba(0,0,0,.07); padding:1px 5px; border-radius:4px;
        font-size:12px; font-family:monospace;
      }
      .smm-bubble ul,.smm-bubble ol { margin:6px 0 6px 18px; }
      .smm-bubble li { margin-bottom:3px; }
      .smm-bubble h3,.smm-bubble h4 { margin:8px 0 4px; font-size:14px; }
      .smm-bubble a { color:${c}; }
      .smm-msg.user .smm-bubble a { color:#e0d7ff; }

      .smm-typing { align-self:flex-start; display:flex; gap:8px; align-items:flex-end; }
      .smm-typing-dots {
        background:#f1f5f9; padding:12px 16px; border-radius:18px;
        border-bottom-left-radius:4px; display:flex; gap:5px; align-items:center;
      }
      .smm-typing-dots span {
        width:7px; height:7px; border-radius:50%; background:#94a3b8;
        animation:smmDot 1.2s ease-in-out infinite;
      }
      .smm-typing-dots span:nth-child(2) { animation-delay:.2s; }
      .smm-typing-dots span:nth-child(3) { animation-delay:.4s; }
      @keyframes smmDot {
        0%,80%,100% { transform:scale(.75); opacity:.5; }
        40%         { transform:scale(1);    opacity:1; }
      }

      .smm-suggestions {
        padding:0 14px 10px; display:flex; flex-wrap:wrap; gap:6px; flex-shrink:0;
      }
      .smm-suggestion-btn {
        background:#f8fafc; border:1.5px solid #e2e8f0; color:#475569;
        padding:5px 12px; border-radius:20px; font-size:12px; cursor:pointer;
        transition:all .2s; white-space:nowrap; max-width:200px;
        overflow:hidden; text-overflow:ellipsis;
      }
      .smm-suggestion-btn:hover { background:${c}11; border-color:${c}66; color:${c}; }

      .smm-input-row {
        padding:12px 14px; border-top:1px solid #f1f5f9;
        display:flex; gap:8px; align-items:center; flex-shrink:0;
        background:#fff;
      }
      .smm-input {
        flex:1; border:1.5px solid #e2e8f0; border-radius:22px;
        padding:10px 16px; font-size:13.5px; resize:none; outline:none;
        font-family:inherit; line-height:1.4; max-height:100px; min-height:42px;
        transition:border-color .2s; background:#f8fafc; color:#1e293b;
        overflow-y:auto;
      }
      .smm-input:focus { border-color:${c}; background:#fff; }
      .smm-input::placeholder { color:#94a3b8; }
      .smm-send-btn {
        width:40px; height:40px; border-radius:50%; border:none; cursor:pointer;
        background:linear-gradient(135deg,${c},${c}cc);
        color:#fff; display:flex; align-items:center; justify-content:center;
        transition:opacity .2s,transform .2s; flex-shrink:0;
      }
      .smm-send-btn:hover { opacity:.9; transform:scale(1.05); }
      .smm-send-btn:disabled { opacity:.4; cursor:not-allowed; transform:none; }

      .smm-powered {
        text-align:center; font-size:10px; color:#cbd5e1; padding:6px 0;
        flex-shrink:0; letter-spacing:.3px;
      }

      /* Welcome card */
      .smm-welcome {
        background:linear-gradient(135deg,${c}11,${c}08);
        border:1px solid ${c}22; border-radius:14px; padding:14px 16px;
        margin:4px 0;
      }
      .smm-welcome-title { font-weight:700; font-size:14px; color:#1e293b; margin-bottom:6px; }
      .smm-welcome-body  { font-size:13px; color:#475569; line-height:1.55; }
    `;
    document.head.appendChild(style);
  }

  // ── Markdown → HTML (simple) ──────────────────────────────
  function mdToHtml(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(?!<[hul])(.+)/, '<p>$1</p>');
  }

  // ── Build DOM ────────────────────────────────────────────
  function buildWidget() {
    var color = cfg.widgetColor || '#7C3AED';
    var emoji = cfg.avatarEmoji || '🤖';

    // Toggle button
    var btn = document.createElement('button');
    btn.id = 'smm-widget-btn';
    btn.innerHTML = '<span style="font-size:24px">' + emoji + '</span><span class="smm-badge" id="smm-badge">1</span>';
    btn.title = 'Chat with us';
    btn.onclick = toggleWidget;
    document.body.appendChild(btn);

    // Chat window
    var box = document.createElement('div');
    box.id = 'smm-widget-box';
    box.innerHTML = `
      <div class="smm-header">
        <div class="smm-avatar">${emoji}</div>
        <div class="smm-header-info">
          <div class="smm-header-name">${esc(cfg.botName || 'AI Assistant')}</div>
          <div class="smm-header-status">Online — replies instantly</div>
        </div>
        <button class="smm-new-btn" title="New chat" onclick="window._smmNewChat()">↺</button>
        <button class="smm-close-btn" onclick="window._smmClose()">×</button>
      </div>
      <div class="smm-messages" id="smm-msgs"></div>
      <div class="smm-suggestions" id="smm-suggestions"></div>
      <div class="smm-input-row">
        <textarea class="smm-input" id="smm-input" placeholder="Type a message..." rows="1"></textarea>
        <button class="smm-send-btn" id="smm-send" onclick="window._smmSend()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div class="smm-powered">Powered by MotherSMM AI</div>
    `;
    document.body.appendChild(box);

    // Input auto-grow + enter key
    var input = document.getElementById('smm-input');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._smmSend(); }
    });
    input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    // Global handlers
    window._smmClose = function () { toggleWidget(false); };
    window._smmNewChat = function () { newChat(); };
    window._smmSend = sendMessage;
    window._smmSuggestion = function (text) {
      document.getElementById('smm-input').value = text;
      sendMessage();
    };

    // Render history or welcome
    if (messages.length > 0) {
      messages.forEach(function (m) { renderMessage(m.role, m.content); });
    } else {
      showWelcome();
    }
    renderSuggestions();
    scrollBottom();
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Widget toggle ────────────────────────────────────────
  function toggleWidget(forceOpen) {
    var box = document.getElementById('smm-widget-box');
    var badge = document.getElementById('smm-badge');
    isOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
    if (isOpen) {
      box.classList.add('open');
      if (badge) badge.classList.remove('show');
      setTimeout(function () { document.getElementById('smm-input') && document.getElementById('smm-input').focus(); }, 100);
    } else {
      box.classList.remove('open');
    }
  }

  // ── Welcome screen ────────────────────────────────────────
  function showWelcome() {
    var welcomeMsg = cfg.welcomeMessage || 'Hi! How can I help you today?';
    renderMessage('bot', welcomeMsg);
    messages.push({ role: 'assistant', content: welcomeMsg });
    saveHistory();
  }

  // ── Suggestions ───────────────────────────────────────────
  function renderSuggestions() {
    var el = document.getElementById('smm-suggestions');
    if (!el) return;
    var sugg = cfg.suggestions || [];
    el.innerHTML = sugg.map(function (s) {
      return '<button class="smm-suggestion-btn" onclick="window._smmSuggestion(' + JSON.stringify(esc(s)) + ')">' + esc(s) + '</button>';
    }).join('');
  }

  function hideSuggestions() {
    var el = document.getElementById('smm-suggestions');
    if (el) el.style.display = 'none';
  }

  // ── Render message bubble ─────────────────────────────────
  function renderMessage(role, content) {
    var msgs = document.getElementById('smm-msgs');
    if (!msgs) return;

    var wrap = document.createElement('div');
    wrap.className = 'smm-msg ' + (role === 'user' ? 'user' : 'bot');

    var avatarHtml = role !== 'user'
      ? '<div class="smm-msg-avatar">' + (cfg && cfg.avatarEmoji || '🤖') + '</div>'
      : '';

    var html;
    if (role === 'bot' || role === 'assistant') {
      // Detect if plain text or has markdown markers
      var hasMarkdown = /[*`#\-]/.test(content);
      html = hasMarkdown ? mdToHtml(content) : '<p>' + esc(content).replace(/\n/g, '<br>') + '</p>';
    } else {
      html = '<p>' + esc(content).replace(/\n/g, '<br>') + '</p>';
    }

    wrap.innerHTML = avatarHtml + '<div class="smm-bubble">' + html + '</div>';
    msgs.appendChild(wrap);
    scrollBottom();
  }

  // ── Typing indicator ──────────────────────────────────────
  function showTyping(show) {
    var msgs = document.getElementById('smm-msgs');
    var existing = document.getElementById('smm-typing-indicator');
    if (!show) { if (existing) existing.remove(); return; }
    if (existing) return;
    var el = document.createElement('div');
    el.id = 'smm-typing-indicator';
    el.className = 'smm-typing';
    el.innerHTML = '<div class="smm-msg-avatar">' + (cfg && cfg.avatarEmoji || '🤖') + '</div>'
      + '<div class="smm-typing-dots"><span></span><span></span><span></span></div>';
    msgs.appendChild(el);
    scrollBottom();
  }

  // ── Scroll to bottom ─────────────────────────────────────
  function scrollBottom() {
    var msgs = document.getElementById('smm-msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // ── New chat ──────────────────────────────────────────────
  function newChat() {
    messages = [];
    saveHistory();
    var msgs = document.getElementById('smm-msgs');
    if (msgs) msgs.innerHTML = '';
    var sugg = document.getElementById('smm-suggestions');
    if (sugg) sugg.style.display = '';
    showWelcome();
    renderSuggestions();
  }

  // ── Send message ──────────────────────────────────────────
  function sendMessage() {
    var input = document.getElementById('smm-input');
    var sendBtn = document.getElementById('smm-send');
    if (!input) return;
    var text = input.value.trim();
    if (!text || isTyping) return;

    hideSuggestions();
    input.value = '';
    input.style.height = 'auto';

    // Add user message
    messages.push({ role: 'user', content: text });
    renderMessage('user', text);
    saveHistory();

    // Show typing
    isTyping = true;
    if (sendBtn) sendBtn.disabled = true;
    showTyping(true);

    // Build API messages (exclude the welcome bot message that's just UI)
    var apiMessages = messages.filter(function (m) {
      return !(m.role === 'assistant' && m.content === (cfg && cfg.welcomeMessage));
    });

    fetch(API_BASE + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        showTyping(false);
        isTyping = false;
        if (sendBtn) sendBtn.disabled = false;

        var reply = data.reply || data.error || 'Sorry, something went wrong. Please try again.';
        messages.push({ role: 'assistant', content: reply });
        renderMessage('bot', reply);
        saveHistory();

        // Show badge if window is closed
        if (!isOpen) {
          var badge = document.getElementById('smm-badge');
          if (badge) badge.classList.add('show');
        }
      })
      .catch(function (err) {
        showTyping(false);
        isTyping = false;
        if (sendBtn) sendBtn.disabled = false;
        renderMessage('bot', '⚠️ Connection error. Please check your internet and try again.');
      });
  }

  // ── Init: load config then build widget ───────────────────
  function init() {
    fetch(API_BASE + '/api/settings')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        cfg = data;
        injectStyles(cfg.widgetColor);
        buildWidget();
      })
      .catch(function () {
        // Fallback with defaults if API is down
        cfg = {
          botName: 'AI Assistant',
          welcomeMessage: '👋 Hi! How can I help you?',
          widgetColor: '#7C3AED',
          avatarEmoji: '🤖',
          suggestions: ['Check order', 'Payment history', 'Contact support'],
        };
        injectStyles(cfg.widgetColor);
        buildWidget();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
