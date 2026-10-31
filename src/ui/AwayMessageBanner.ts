// AwayMessageBanner — shows the user's away message (US-4.4, design §3.2).
// Authored by the agent (Kiro CLI throttled).

export class AwayMessageBanner {
  private el: HTMLElement | null = null;

  render(): HTMLElement {
    const banner = document.createElement("div");
    banner.className = "away-banner";
    banner.hidden = true;
    this.el = banner;
    return banner;
  }

  show(message: string): void {
    if (!this.el) return;
    this.el.textContent = `You are away: "${message}"`;
    this.el.hidden = false;
  }

  hide(): void {
    if (this.el) this.el.hidden = true;
  }
}
