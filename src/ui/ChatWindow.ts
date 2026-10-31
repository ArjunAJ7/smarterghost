// ChatWindow — transcript, typing indicator, streaming (US-1.1, US-1.3, US-2.4).
// Authored by the agent (Kiro CLI throttled).

export interface UiMessage {
  id: string;
  author: string;
  text: string;
  timestamp: Date;
  isSelf: boolean;
  kind: "user" | "bot" | "error";
}

function aimTime(d: Date): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export class ChatWindow {
  private transcript: HTMLElement | null = null;
  private typing: HTMLElement | null = null;

  render(): HTMLElement {
    const win = document.createElement("div");
    win.className = "aim-window";
    win.style.flex = "1";
    win.style.minHeight = "0";
    win.innerHTML = `
      <div class="aim-titlebar">
        <span>Instant Message — SmarterGhost</span>
        <span class="aim-titlebar-buttons"><button>_</button><button>X</button></span>
      </div>
      <div class="chat-transcript"></div>
      <div class="typing-indicator" hidden>SmarterGhost is typing…</div>
    `;
    this.transcript = win.querySelector(".chat-transcript");
    this.typing = win.querySelector(".typing-indicator");
    return win;
  }

  appendMessage(msg: UiMessage): void {
    if (!this.transcript) return;
    const div = document.createElement("div");
    div.className = `chat-message ${msg.isSelf ? "self" : "bot"}${msg.kind === "error" ? " error" : ""}`;
    div.dataset.messageId = msg.id;
    div.innerHTML = `
      <span class="meta">${aimTime(msg.timestamp)}</span>
      <span class="author"></span>
      <div class="text"></div>
    `;
    div.querySelector(".author")!.textContent = msg.author;
    div.querySelector(".text")!.textContent = msg.text;
    this.transcript.appendChild(div);
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }

  appendPartial(messageId: string, token: string): void {
    if (!this.transcript) return;
    let div = this.transcript.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`,
    );
    if (!div) {
      this.appendMessage({
        id: messageId,
        author: "SmarterGhost",
        text: "",
        timestamp: new Date(),
        isSelf: false,
        kind: "bot",
      });
      div = this.transcript.querySelector<HTMLElement>(
        `[data-message-id="${messageId}"]`,
      )!;
    }
    const textEl = div.querySelector(".text")!;
    textEl.textContent = (textEl.textContent ?? "") + token;
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }

  setTyping(isTyping: boolean): void {
    if (this.typing) this.typing.hidden = !isTyping;
  }
}
