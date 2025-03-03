import Phaser from "phaser";
import { Room, Client } from "colyseus.js";
import { SpawnedPlayer } from "../../../server/src/rooms/RoomState";

export class Village extends Phaser.Scene {
  private room: Room;
  private client: Client;
  private players: Map<string, Phaser.GameObjects.Sprite>;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private localPlayer: Phaser.GameObjects.Sprite;
  private map: Phaser.Tilemaps.Tilemap;
  private tileset: Phaser.Tilemaps.Tileset;
  private layer: Phaser.Tilemaps.TilemapLayer;

  constructor() {
    super({ key: "village" });
  }

  preload() {
    this.load.image("forest-bg", "assets/landscape.png");
    this.load.image("tileset", "assets/Map/VillageMap/_PNG/MainLevBuild.png");
    this.load.image(
      "buildings",
      "assets/Map/VillageBuildings/_PNG/VP2_Main.png"
    );
    this.load.tilemapTiledJSON("map", "assets/VillageMap.tmj");

    this.load.spritesheet(
      "character-idle",
      "assets/Character/Idle/Idle-Sheet.png",
      {
        frameWidth: 64, // Adjust these values based on your spritesheet
        frameHeight: 64,
      }
    );
  }

  async create() {
    const bg = this.add.image(0, 0, "forest-bg");
    bg.setOrigin(0, 0);

    // Make the background scroll with the camera but slower (parallax effect)
    bg.setScrollFactor(0.6);

    // Create tilemap
    this.map = this.make.tilemap({ key: "map" });
    this.tileset = this.map.addTilesetImage("MainLevBuild", "tileset");
    const buildingsTileset = this.map.addTilesetImage("VP2_Main", "buildings");

    // Create layer with both tilesets
    this.layer = this.map.createLayer(
      0,
      [this.tileset, buildingsTileset],
      0,
      0
    );

    // Set world bounds based on map dimensions
    const mapWidth = this.map.widthInPixels;
    const mapHeight = this.map.heightInPixels;
    bg.setDisplaySize(mapWidth, mapHeight);
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    // Get the room instance from the registry
    this.room = this.registry.get("room");
    this.client = this.registry.get("client");
    this.players = new Map();

    // Set up keyboard input
    this.cursors = this.input.keyboard.createCursorKeys();

    // Listen for state changes
    this.room.state.spawnedPlayers.onAdd = (player: SpawnedPlayer) => {
      this.addPlayer(player);
    };

    this.room.state.spawnedPlayers.onRemove = (player: SpawnedPlayer) => {
      this.removePlayer(player);
    };

    this.room.state.spawnedPlayers.onChange = (player: SpawnedPlayer) => {
      this.updatePlayer(player);
    };

    // Set up portal collision detection
    this.setupPortalCollisions();
  }

  private addPlayer(player: SpawnedPlayer) {
    const sprite = this.add.sprite(player.x, player.y, "character-idle");
    sprite.setScale(2); // Adjust scale as needed
    this.players.set(player.id, sprite);

    // If this is the local player, store reference
    if (player.id === this.room.sessionId) {
      this.localPlayer = sprite;
    }
  }

  private removePlayer(player: SpawnedPlayer) {
    const sprite = this.players.get(player.id);
    if (sprite) {
      sprite.destroy();
      this.players.delete(player.id);
    }
  }

  private updatePlayer(player: SpawnedPlayer) {
    const sprite = this.players.get(player.id);
    if (sprite) {
      sprite.x = player.x;
      sprite.y = player.y;
    }
  }

  private setupPortalCollisions() {
    // Add portal sprites and collision detection
    const portals = this.room.state.portals;
    portals.forEach((portal) => {
      const portalSprite = this.add.sprite(portal.x, portal.y, "portal");
      portalSprite.setScale(2); // Adjust scale as needed

      // Create a physics body for collision detection
      this.physics.add.existing(portalSprite, true);
    });
  }

  update(time: number, delta: number) {
    if (!this.localPlayer) return;

    // Handle player movement
    const input: any = {
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
      up: this.cursors.up.isDown,
      down: this.cursors.down.isDown,
      jump: this.cursors.space.isDown,
      attack: this.input.keyboard.addKey("X").isDown,
      loot: this.input.keyboard.addKey("Z").isDown,
      tick: time,
      username: this.registry.get("playerData").username,
    };

    // Send input to server
    this.room.send("input", input);

    // Check for portal collisions
    this.checkPortalCollisions();
  }

  private checkPortalCollisions() {
    const portals = this.room.state.portals;
    portals.forEach((portal) => {
      const portalSprite = this.players.get(portal.id);
      if (!portalSprite) return;

      const distance = Phaser.Math.Distance.Between(
        this.localPlayer.x,
        this.localPlayer.y,
        portalSprite.x,
        portalSprite.y
      );

      if (distance < 32) {
        // Adjust collision distance as needed
        this.handlePortalCollision(portal);
      }
    });
  }

  private async handlePortalCollision(portal: any) {
    try {
      // Leave current room
      await this.room.leave();

      // Get player data
      const playerData = this.registry.get("playerData");

      // Connect to new room
      const newRoom = await this.client.joinOrCreate(portal.targetRoom, {
        username: playerData.username,
        password: this.registry.get("password"), // You'll need to store this during login
      });

      // Update registry with new room
      this.registry.set("room", newRoom);

      // Start the new scene
      this.scene.start(portal.targetRoom);
    } catch (error) {
      console.error("Error handling portal collision:", error);
    }
  }

  shutdown() {
    // Clean up resources
    if (this.room) {
      this.room.leave();
    }
  }
}
