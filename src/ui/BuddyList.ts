// BuddyList — classic AIM buddy list window (US-1.1, US-1.2, US-4.4, design §3.2).
// Authored by the agent (Kiro CLI throttled).

export class BuddyList {
  private awayMessage: string | null = null;
  private root: HTMLElement | null = null;
  private onOpenChat: () => void;

  constructor(onOpenChat: () => void) {
    this.onOpenChat = onOpenChat;
  }

  render(): HTMLElement {
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
    win.querySelector(".aim-titlebar")?.addEventListener("click", () =>
      this.toggleCollapse(),
    );
    this.renderGroups();
    return win;
  }

  private renderGroups(): void {
    if (!this.root) return;
    const groups = this.root.querySelector(".buddy-groups")!;
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
    groups
      .querySelector('[data-bot="1"]')
      ?.addEventListener("dblclick", this.onOpenChat);
    groups
      .querySelector('[data-bot="1"]')
      ?.addEventListener("click", this.onOpenChat);
  }

  setAway(message: string | null): void {
    this.awayMessage = message;
    this.renderGroups();
  }

  toggleCollapse(): void {
    document
      .getElementById("buddy-list-container")
      ?.classList.toggle("expanded");
  }
}
