// App — root component: session management, streaming chat, reminder polling,
// away sync (design §3.1, §5.4–5.6; US-2.1, US-2.3, US-4.x, US-5.x).
// Authored by the agent (Kiro CLI throttled).

import { BuddyList } from "./BuddyList";
import { ChatWindow, type UiMessage } from "./ChatWindow";
import { ChatInputBar } from "./ChatInputBar";
import { AwayMessageBanner } from "./AwayMessageBanner";
import { SoundToggle } from "./SoundToggle";

const HISTORY_KEY = "smarterghost:history";
const SESSION_KEY = "smarterghost:session";
const MAX_HISTORY = 10;

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

function loadSessionId(): string {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
}

class App {
  private sessionId = loadSessionId();
  private history = loadHistory();
  private chat = new ChatWindow();
  private buddy = new BuddyList(() => this.focusInput());
  private banner = new AwayMessageBanner();
  private sounds = new SoundToggle();
  private awayMessage: string | null = null;

  start(): void {
    document.getElementById("buddy-list-container")!.appendChild(this.buddy.render());
    document.getElementById("away-banner-container")!.appendChild(this.banner.render());
    document.getElementById("chat-window-container")!.appendChild(this.chat.render());
    document.getElementById("chat-input-container")!.appendChild(
      new ChatInputBar((text) => void this.onSend(text)).render(),
    );
    document.getElementById("sound-toggle-container")!.appendChild(this.sounds.render());

    this.chat.appendMessage({
      id: crypto.randomUUID(),
      author: "SmarterGhost",
      text: 'Hey! I\'m SmarterGhost — your buddy from 1999, back online. Type /help to see what I can do, or just chat!',
      timestamp: new Date(),
      isSelf: false,
      kind: "bot",
    });

    this.pollReminders();
  }

  private focusInput(): void {
    document.querySelector<HTMLInputElement>(".chat-input-bar input")?.focus();
  }

  private appendUser(text: string): void {
    this.chat.appendMessage({
      id: crypto.randomUUID(),
      author: "You",
      text,
      timestamp: new Date(),
      isSelf: true,
      kind: "user",
    });
  }

  private lastUserText = "";

  private async onSend(text: string): Promise<void> {
    this.lastUserText = text;
    this.appendUser(text);
    this.history.push({ role: "user", content: text });
    saveHistory(this.history);

    // US-4.2: any sent message clears away locally too.
    if (this.awayMessage !== null && !text.startsWith("/back")) {
      this.setAway(null);
    }

    this.chat.setTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Session-Id": this.sessionId,
        },
        body: JSON.stringify({ input: text, history: this.history.slice(-MAX_HISTORY) }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await this.consumeSSE(res.body);
    } catch {
      this.chat.appendMessage({
        id: crypto.randomUUID(),
        author: "SmarterGhost",
        text: "ZzZzZz... sorry, dozed off there (old bot, low battery). Say that again?",
        timestamp: new Date(),
        isSelf: false,
        kind: "error",
      });
    } finally {
      this.chat.setTyping(false);
    }
  }

  private async consumeSSE(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let botText = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
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
              timestamp: new Date(),
              isSelf: false,
              kind: "bot",
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
              timestamp: new Date(),
              isSelf: false,
              kind: "error",
            });
            // US-7.2 / design §7.3: manual "Try again", no auto-retry.
            if (/everyone is talking to me at once/.test(parsed.message)) {
              const errEl = document.querySelector(
                `[data-message-id="${errId}"] .text`,
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
            // stream finalized
          }
        } catch {
          // skip malformed event
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
  private syncAwayFromCommand(text: string): void {
    const setMatch = /^Away message set: "(.*)"/.exec(text);
    if (setMatch) {
      this.setAway(setMatch[1]);
      return;
    }
    if (text.startsWith("Welcome back!")) {
      this.setAway(null);
    }
  }

  private setAway(message: string | null): void {
    this.awayMessage = message;
    this.buddy.setAway(message);
    if (message === null) this.banner.hide();
    else this.banner.show(message);
  }

  /** SSE reminder polling with reconnect (US-5.2, US-5.5). */
  private pollReminders(): void {
    const connect = () => {
      const es = new EventSource(
        `/api/poll-reminders?sid=${encodeURIComponent(this.sessionId)}`,
      );
      // EventSource can't set headers; the worker also accepts ?sid= (see worker).
      es.addEventListener("reminder", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          this.chat.appendMessage({
            id: crypto.randomUUID(),
            author: "SmarterGhost",
            text: `⏰ Reminder: ${data.message}`,
            timestamp: new Date(),
            isSelf: false,
            kind: "bot",
          });
          this.sounds.play("door");
        } catch {
          // ignore malformed reminder event
        }
      });
      es.onerror = () => {
        es.close();
        setTimeout(connect, 10_000); // reconnect on drop (US-5.5)
      };
    };
    connect();
  }
}

new App().start();
