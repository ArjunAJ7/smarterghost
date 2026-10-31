// ChatInputBar — yellow AIM input bar (US-1.3, US-6.2, US-6.3, design §3.2).
// Authored by the agent (Kiro CLI throttled).

export class ChatInputBar {
  private onSend: (text: string) => void;

  constructor(onSend: (text: string) => void) {
    this.onSend = onSend;
  }

  render(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "chat-input-bar";
    bar.innerHTML = `
      <input type="text" placeholder="Type a message or /command…" aria-label="Message" />
      <button type="button">Send</button>
    `;
    const input = bar.querySelector("input")!;
    const send = () => {
      const text = input.value.trim();
      if (text.length === 0) return;
      input.value = "";
      this.onSend(text);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
    bar.querySelector("button")!.addEventListener("click", send);
    // Keep the bar above the mobile keyboard (design §3.4).
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        bar.style.bottom = `${Math.max(
          0,
          window.innerHeight - window.visualViewport!.height,
        )}px`;
      });
    }
    return bar;
  }
}
