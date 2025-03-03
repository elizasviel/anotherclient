import Phaser from "phaser";
import { Village } from "./scenes/Village";
import { Login } from "./scenes/Login";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  fps: {
    target: 60,
    forceSetTimeOut: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
  },
  pixelArt: true,
  scene: [Login, Village],
};

new Phaser.Game(config);
