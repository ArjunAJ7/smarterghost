// src/ui/BuddyList.ts
var BuddyList = class {
  awayMessage = null;
  root = null;
  onOpenChat;
  constructor(onOpenChat) {
    this.onOpenChat = onOpenChat;
  }
  render() {
    const win = document.createElement("div");
    win.className = "aim-window";
    win.innerHTML = `
      <div class="aim-titlebar">
        <span>Buddy List</span>
        <span class="aim-titlebar-buttons"><button>_</button><button>X</button></span>
      </div>
      <div class="buddy-groups"></div>
    `;
    this.root = win;
    win.querySelector(".aim-titlebar")?.addEventListener(
      "click",
      () => this.toggleCollapse()
    );
    this.renderGroups();
    return win;
  }
  renderGroups() {
    if (!this.root) return;
    const groups = this.root.querySelector(".buddy-groups");
    const youAway = this.awayMessage !== null;
    groups.innerHTML = `
      <div class="buddy-group-header">Online (1)</div>
      <div class="buddy-row" data-bot="1">
        <img class="buddy-icon" src="assets/icons/buddy_online.png" alt="online" />
        <span>SmarterGhost</span>
      </div>
      <div class="buddy-group-header">Away (${youAway ? 1 : 0})</div>
      ${youAway ? `
      <div class="buddy-row">
        <img class="buddy-icon" src="assets/icons/buddy_away.png" alt="away" />
        <span>You (${this.awayMessage})</span>
      </div>` : ""}
      <div class="buddy-group-header">Offline (${youAway ? 0 : 1})</div>
      ${youAway ? "" : `
      <div class="buddy-row buddy-offline">
        <img class="buddy-icon" src="assets/icons/buddy_offline.png" alt="offline" />
        <span>You</span>
      </div>`}
    `;
    groups.querySelector('[data-bot="1"]')?.addEventListener("dblclick", this.onOpenChat);
    groups.querySelector('[data-bot="1"]')?.addEventListener("click", this.onOpenChat);
  }
  setAway(message) {
    this.awayMessage = message;
    this.renderGroups();
  }
  toggleCollapse() {
    document.getElementById("buddy-list-container")?.classList.toggle("expanded");
  }
};

// src/ui/ChatWindow.ts
function aimTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
var ChatWindow = class {
  transcript = null;
  typing = null;
  render() {
    const win = document.createElement("div");
    win.className = "aim-window";
    win.style.flex = "1";
    win.style.minHeight = "0";
    win.innerHTML = `
      <div class="aim-titlebar">
        <span>Instant Message \u2014 SmarterGhost</span>
        <span class="aim-titlebar-buttons"><button>_</button><button>X</button></span>
      </div>
      <div class="chat-transcript"></div>
      <div class="typing-indicator" hidden>SmarterGhost is typing\u2026</div>
    `;
    this.transcript = win.querySelector(".chat-transcript");
    this.typing = win.querySelector(".typing-indicator");
    return win;
  }
  appendMessage(msg) {
    if (!this.transcript) return;
    const div = document.createElement("div");
    div.className = `chat-message ${msg.isSelf ? "self" : "bot"}${msg.kind === "error" ? " error" : ""}`;
    div.dataset.messageId = msg.id;
    div.innerHTML = `
      <span class="meta">${aimTime(msg.timestamp)}</span>
      <span class="author"></span>
      <div class="text"></div>
    `;
    div.querySelector(".author").textContent = msg.author;
    div.querySelector(".text").textContent = msg.text;
    this.transcript.appendChild(div);
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }
  appendPartial(messageId, token) {
    if (!this.transcript) return;
    let div = this.transcript.querySelector(
      `[data-message-id="${messageId}"]`
    );
    if (!div) {
      this.appendMessage({
        id: messageId,
        author: "SmarterGhost",
        text: "",
        timestamp: /* @__PURE__ */ new Date(),
        isSelf: false,
        kind: "bot"
      });
      div = this.transcript.querySelector(
        `[data-message-id="${messageId}"]`
      );
    }
    const textEl = div.querySelector(".text");
    textEl.textContent = (textEl.textContent ?? "") + token;
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }
  setTyping(isTyping) {
    if (this.typing) this.typing.hidden = !isTyping;
  }
};

// src/ui/ChatInputBar.ts
var ChatInputBar = class {
  onSend;
  constructor(onSend) {
    this.onSend = onSend;
  }
  render() {
    const bar = document.createElement("div");
    bar.className = "chat-input-bar";
    bar.innerHTML = `
      <input type="text" placeholder="Type a message or /command\u2026" aria-label="Message" />
      <button type="button">Send</button>
    `;
    const input = bar.querySelector("input");
    const send = () => {
      const text = input.value.trim();
      if (text.length === 0) return;
      input.value = "";
      this.onSend(text);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
    bar.querySelector("button").addEventListener("click", send);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        bar.style.bottom = `${Math.max(
          0,
          window.innerHeight - window.visualViewport.height
        )}px`;
      });
    }
    return bar;
  }
};

// src/ui/AwayMessageBanner.ts
var AwayMessageBanner = class {
  el = null;
  render() {
    const banner = document.createElement("div");
    banner.className = "away-banner";
    banner.hidden = true;
    this.el = banner;
    return banner;
  }
  show(message) {
    if (!this.el) return;
    this.el.textContent = `You are away: "${message}"`;
    this.el.hidden = false;
  }
  hide() {
    if (this.el) this.el.hidden = true;
  }
};

// src/ui/SoundToggle.ts
var SoundToggle = class {
  enabled = false;
  button = null;
  render() {
    const btn = document.createElement("button");
    btn.className = "sound-toggle";
    btn.textContent = "\u{1F507} Sounds: off";
    btn.addEventListener("click", () => {
      this.enabled = !this.enabled;
      btn.textContent = this.enabled ? "\u{1F50A} Sounds: on" : "\u{1F507} Sounds: off";
    });
    this.button = btn;
    return btn;
  }
  play(kind) {
    if (!this.enabled) return;
    const src = kind === "receive" ? "assets/sounds/im_receive.wav" : "assets/sounds/door_open.wav";
    void new Audio(src).play().catch(() => {
    });
  }
};

// src/ui/App.ts
var HISTORY_KEY = "smarterghost:history";
var SESSION_KEY = "smarterghost:session";
var MAX_HISTORY = 10;
function loadSessionId() {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
}
var App = class {
  sessionId = loadSessionId();
  history = loadHistory();
  chat = new ChatWindow();
  buddy = new BuddyList(() => this.focusInput());
  banner = new AwayMessageBanner();
  sounds = new SoundToggle();
  awayMessage = null;
  start() {
    document.getElementById("buddy-list-container").appendChild(this.buddy.render());
    document.getElementById("away-banner-container").appendChild(this.banner.render());
    document.getElementById("chat-window-container").appendChild(this.chat.render());
    document.getElementById("chat-input-container").appendChild(
      new ChatInputBar((text) => void this.onSend(text)).render()
    );
    document.getElementById("sound-toggle-container").appendChild(this.sounds.render());
    this.chat.appendMessage({
      id: crypto.randomUUID(),
      author: "SmarterGhost",
      text: "Hey! I'm SmarterGhost \u2014 your buddy from 1999, back online. Type /help to see what I can do, or just chat!",
      timestamp: /* @__PURE__ */ new Date(),
      isSelf: false,
      kind: "bot"
    });
    this.pollReminders();
  }
  focusInput() {
    document.querySelector(".chat-input-bar input")?.focus();
  }
  appendUser(text) {
    this.chat.appendMessage({
      id: crypto.randomUUID(),
      author: "You",
      text,
      timestamp: /* @__PURE__ */ new Date(),
      isSelf: true,
      kind: "user"
    });
  }
  lastUserText = "";
  async onSend(text) {
    this.lastUserText = text;
    this.appendUser(text);
    this.history.push({ role: "user", content: text });
    saveHistory(this.history);
    if (this.awayMessage !== null && !text.startsWith("/back")) {
      this.setAway(null);
    }
    this.chat.setTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Session-Id": this.sessionId
        },
        body: JSON.stringify({ input: text, history: this.history.slice(-MAX_HISTORY) })
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await this.consumeSSE(res.body);
    } catch {
      this.chat.appendMessage({
        id: crypto.randomUUID(),
        author: "SmarterGhost",
        text: "ZzZzZz... sorry, dozed off there (old bot, low battery). Say that again?",
        timestamp: /* @__PURE__ */ new Date(),
        isSelf: false,
        kind: "error"
      });
    } finally {
      this.chat.setTyping(false);
    }
  }
  async consumeSSE(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let botText = "";
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = "message";
        let data = "";
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data = line.slice(5).trim();
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === "token") {
            const messageId = "stream-current";
            this.chat.setTyping(false);
            this.chat.appendPartial(messageId, parsed.text);
            botText += parsed.text;
          } else if (event === "command") {
            this.chat.setTyping(false);
            this.chat.appendMessage({
              id: crypto.randomUUID(),
              author: "SmarterGhost",
              text: parsed.text,
              timestamp: /* @__PURE__ */ new Date(),
              isSelf: false,
              kind: "bot"
            });
            botText += parsed.text;
            this.syncAwayFromCommand(parsed.text);
          } else if (event === "error") {
            this.chat.setTyping(false);
            const errId = crypto.randomUUID();
            this.chat.appendMessage({
              id: errId,
              author: "SmarterGhost",
              text: parsed.message,
              timestamp: /* @__PURE__ */ new Date(),
              isSelf: false,
              kind: "error"
            });
            if (/everyone is talking to me at once/.test(parsed.message)) {
              const errEl = document.querySelector(
                `[data-message-id="${errId}"] .text`
              );
              const btn = document.createElement("button");
              btn.textContent = "Try again";
              btn.style.marginLeft = "8px";
              btn.addEventListener("click", () => {
                btn.remove();
                void this.onSend(this.lastUserText);
              });
              errEl?.appendChild(btn);
            }
          } else if (event === "done") {
          }
        } catch {
        }
      }
    }
    if (botText.length > 0) {
      this.history.push({ role: "assistant", content: botText });
      saveHistory(this.history);
      this.sounds.play("receive");
    }
  }
  /** Keep BuddyList/banner in sync with /away and /back results (US-4.1–4.4). */
  syncAwayFromCommand(text) {
    const setMatch = /^Away message set: "(.*)"/.exec(text);
    if (setMatch) {
      this.setAway(setMatch[1]);
      return;
    }
    if (text.startsWith("Welcome back!")) {
      this.setAway(null);
    }
  }
  setAway(message) {
    this.awayMessage = message;
    this.buddy.setAway(message);
    if (message === null) this.banner.hide();
    else this.banner.show(message);
  }
  /** SSE reminder polling with reconnect (US-5.2, US-5.5). */
  pollReminders() {
    const connect = () => {
      const es = new EventSource(
        `/api/poll-reminders?sid=${encodeURIComponent(this.sessionId)}`
      );
      es.addEventListener("reminder", (e) => {
        try {
          const data = JSON.parse(e.data);
          this.chat.appendMessage({
            id: crypto.randomUUID(),
            author: "SmarterGhost",
            text: `\u23F0 Reminder: ${data.message}`,
            timestamp: /* @__PURE__ */ new Date(),
            isSelf: false,
            kind: "bot"
          });
          this.sounds.play("door");
        } catch {
        }
      });
      es.onerror = () => {
        es.close();
        setTimeout(connect, 1e4);
      };
    };
    connect();
  }
};
new App().start();
