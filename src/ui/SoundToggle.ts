// SoundToggle — opt-in retro AIM sounds, default OFF (US-1.4, design §3.3).
// Authored by the agent (Kiro CLI throttled).

export class SoundToggle {
  private enabled = false;
  private button: HTMLButtonElement | null = null;

  render(): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "sound-toggle";
    btn.textContent = "🔇 Sounds: off";
    btn.addEventListener("click", () => {
      this.enabled = !this.enabled;
      btn.textContent = this.enabled ? "🔊 Sounds: on" : "🔇 Sounds: off";
    });
    this.button = btn;
    return btn;
  }

  play(kind: "receive" | "door"): void {
    if (!this.enabled) return;
    const src =
      kind === "receive"
        ? "assets/sounds/im_receive.wav"
        : "assets/sounds/door_open.wav";
    void new Audio(src).play().catch(() => {});
  }
}
