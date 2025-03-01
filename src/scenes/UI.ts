import Phaser from "phaser";

export class UI extends Phaser.Scene {
  private fpsText: Phaser.GameObjects.Text;
  private coinCountText: Phaser.GameObjects.Text;
  private coinCount: number = 0;

  constructor() {
    super({ key: "ui", active: true });
  }

  create() {
    // Create FPS counter
    this.fpsText = this.add.text(16, 16, "FPS: 0", {
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.5)",
      padding: { x: 5, y: 5 },
    });
    this.fpsText.setScrollFactor(0);
    this.fpsText.setDepth(1000);

    // Create coin counter
    this.coinCountText = this.add.text(16, 50, "Coins: 0", {
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.5)",
      padding: { x: 5, y: 5 },
    });
    this.coinCountText.setScrollFactor(0);
    this.coinCountText.setDepth(1000);

    // Listen for coin updates from other scenes
    this.game.events.on("updateCoins", (count) => {
      this.coinCount = count;
      this.coinCountText.setText(`Coins: ${this.coinCount}`);
    });
  }

  update() {
    // Update FPS counter
    const fps = Math.round(this.game.loop.actualFps);
    this.fpsText.setText(`FPS: ${fps}`);
  }
}
