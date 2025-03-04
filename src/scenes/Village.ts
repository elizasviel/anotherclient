import Phaser from "phaser";
import { Room, Client } from "colyseus.js";

export class Village extends Phaser.Scene {
  private room: Room;
  private client: Client;
  private currentPlayer: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private map: Phaser.Tilemaps.Tilemap;
  private tileset: Phaser.Tilemaps.Tileset;
  private layer: Phaser.Tilemaps.TilemapLayer;
  private localRef: Phaser.GameObjects.Rectangle;
  private remoteRef: Phaser.GameObjects.Rectangle;
  private cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  private collectKey: Phaser.Input.Keyboard.Key;
  private elapsedTime = 0;
  private fixedTimeStep = 1000 / 60;
  private currentTick = 0;
  private obstacles: Phaser.GameObjects.Rectangle[] = [];
  private playerEntities: {
    [username: string]: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  } = {};
  private monsterEntities: {
    [index: number]: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  } = {};
  private lootEntities: {
    [index: number]: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  } = {};
  private inputPayload = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    attack: false,
    loot: false,
    tick: undefined,
    username: "",
  };

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
        frameWidth: 64,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      "character-run",
      "assets/Character/Run/Run-Sheet.png",
      {
        frameWidth: 80,
        frameHeight: 80,
      }
    );
    this.load.spritesheet(
      "character-jump",
      "assets/Character/Jump-All/Jump-All-Sheet.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      "character-attack",
      "assets/Character/Attack-01/Attack-01-Sheet.png",
      {
        frameWidth: 96,
        frameHeight: 80,
      }
    );
    this.load.spritesheet(
      "character-dead",
      "assets/Character/Dead/Dead-Sheet.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
  }

  async connect() {
    // add connection status text
    const connectionStatusText = this.add
      .text(0, 0, "Trying to connect with the server...")
      .setStyle({ color: "#ff0000" })
      .setPadding(4);

    const client = new Client("ws://localhost:2567");

    try {
      // Get credentials from registry
      const playerData = this.registry.get("playerData");
      const password = this.registry.get("password");

      if (!playerData?.username || !password) {
        throw new Error("Missing credentials");
      }

      this.room = await client.joinOrCreate("village", {
        username: playerData.username,
        password: password,
      });

      console.log("VILLAGE: Connected to server", this.room);

      // connection successful!
      connectionStatusText.destroy();
    } catch (e) {
      // couldn't connect
      connectionStatusText.text = "Could not connect with the server.";
      console.error("Connection error:", e);

      // Redirect to login on error
      this.scene.start("login");
    }
  }

  async create() {
    await this.connect();
    console.log("CREATING VILLAGE");
    const bg = this.add.image(0, 0, "forest-bg");
    bg.setOrigin(0, 0);
    bg.setScrollFactor(0.6);

    this.map = this.make.tilemap({ key: "map" });
    this.tileset = this.map.addTilesetImage("MainLevBuild", "tileset");
    const buildingsTileset = this.map.addTilesetImage("VP2_Main", "buildings");
    this.layer = this.map.createLayer(
      0,
      [this.tileset, buildingsTileset],
      0,
      0
    );

    const mapWidth = this.map.widthInPixels;
    const mapHeight = this.map.heightInPixels;
    bg.setDisplaySize(mapWidth, mapHeight);
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    //would this support movement between maps?
    this.room = this.registry.get("room");
    this.client = this.registry.get("client");
    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.collectKey = this.input.keyboard.addKey("Z");
    this.setupPortalCollisions();

    this.room.state.obstacles.onAdd((obstacle) => {
      const sprite = this.add.rectangle(
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height
      );

      if (obstacle.isOneWayPlatform) {
        sprite.setData("isOneWayPlatform", true);
      }

      this.obstacles.push(sprite);
    });

    this.room.state.spawnedPlayers.onAdd((player) => {
      const entity = this.physics.add.sprite(
        player.x,
        player.y,
        "character-idle"
      );
      entity.setDisplaySize(48, 48);
      this.playerEntities[player.username] = entity;

      if (player.username === this.registry.get("playerData").username) {
        console.log("VILLAGE: Setting current player", player);
        this.currentPlayer = entity;
        this.cameras.main.startFollow(this.currentPlayer, true, 0.1, 0.1);
        this.cameras.main.setZoom(2);
        this.inputPayload.username = player.username;
        this.localRef = this.add.rectangle(0, 0, entity.width, entity.height);
        this.localRef.setStrokeStyle(1, 0x00ff00);

        this.remoteRef = this.add.rectangle(0, 0, entity.width, entity.height);
        this.remoteRef.setStrokeStyle(1, 0xff0000);

        player.onChange(() => {
          this.remoteRef.x = player.x;
          this.remoteRef.y = player.y;
        });
      } else {
        console.log("VILLAGE: Setting remote player", player);
        player.onChange(() => {
          const prevX = entity.x; // Store previous position
          entity.setData("serverX", player.x);
          entity.setData("serverY", player.y);

          // Update animations based on server state
          if (player.isAttacking) {
            entity.play("character-attack", true);
          } else if (!player.isGrounded) {
            entity.play("character-jump", true);
          } else {
            // Check if moving by comparing with actual previous position
            const isMoving = Math.abs(player.x - prevX) > 0.1; // Small threshold to detect actual movement
            if (isMoving) {
              entity.play("character-run", true);
            } else {
              entity.play("character-idle", true);
            }
          }

          if (player.velocityX < 0) {
            entity.setFlipX(true);
          } else {
            entity.setFlipX(false);
          }
        });
      }

      // Create character animations
      if (!this.anims.exists("character-idle")) {
        this.anims.create({
          key: "character-idle",
          frames: this.anims.generateFrameNumbers("character-idle", {
            start: 0,
            end: 3,
          }), // Adjust frame count
          frameRate: 8,
          repeat: -1,
        });
        this.anims.create({
          key: "character-run",
          frames: this.anims.generateFrameNumbers("character-run", {
            start: 0,
            end: 7,
          }), // Adjust frame count
          frameRate: 12,
          repeat: -1,
        });
        this.anims.create({
          key: "character-jump",
          frames: this.anims.generateFrameNumbers("character-jump", {
            start: 0,
            end: 14, // Changed to 14 for 15 frames (0-14)
          }),
          frameRate: 15, // Adjusted frameRate to match number of frames
          repeat: 0,
        });
        this.anims.create({
          key: "character-attack",
          frames: this.anims.generateFrameNumbers("character-attack", {
            start: 0,
            end: 5,
          }), // Adjust frame count
          frameRate: 12,
          repeat: 0,
        });
        this.anims.create({
          key: "character-dead",
          frames: this.anims.generateFrameNumbers("character-dead", {
            start: 0,
            end: 5,
          }), // Adjust frame count
          frameRate: 10,
          repeat: 0,
        });
      }
    });

    this.room.state.spawnedPlayers.onRemove((player) => {
      const entity = this.playerEntities[player.username];
      if (entity) {
        entity.destroy();
        delete this.playerEntities[player.username];
      }
    });
  }

  //was causing black box
  private setupPortalCollisions() {
    const portals = this.room.state.portals;
    portals.forEach((portal) => {
      //const portalSprite = this.add.sprite(portal.x, portal.y, "portal");
      //portalSprite.setScale(2);
      //this.physics.add.existing(portalSprite, true);
    });
  }

  update(time: number, delta: number): void {
    // skip remaining loop if not connected yet.
    if (!this.currentPlayer) {
      return;
    }

    this.elapsedTime += delta;
    while (this.elapsedTime >= this.fixedTimeStep) {
      this.elapsedTime -= this.fixedTimeStep;
      this.fixedTick(time, this.fixedTimeStep);
    }
  }

  fixedTick(time, delta) {
    if (!this.currentPlayer || !this.room) {
      return;
    }

    this.currentTick++;

    // Match server constants
    const horizontalVelocity = 2;
    const gravity = 0.5;
    const jumpVelocity = -12;

    this.inputPayload.left = this.cursorKeys.left.isDown;
    this.inputPayload.right = this.cursorKeys.right.isDown;
    this.inputPayload.up = this.cursorKeys.up.isDown;
    this.inputPayload.down = this.cursorKeys.down.isDown;
    this.inputPayload.jump = this.cursorKeys.space.isDown;
    this.inputPayload.attack = this.currentPlayer.getData("isAttacking");
    this.inputPayload.tick = this.currentTick;

    // Only send messages if the room is still connected
    if (this.room && this.room.connection.isOpen) {
      this.room.send(0, this.inputPayload);
    }

    // Store previous position for collision checking
    const prevX = this.currentPlayer.x;
    const prevY = this.currentPlayer.y;

    // Store previous Y position for one-way platform collision
    this.currentPlayer.setData("prevY", this.currentPlayer.y);

    // Only allow movement if not attacking and chat is not focused
    if (!this.currentPlayer.getData("isAttacking")) {
      // Handle horizontal movement
      if (this.inputPayload.left) {
        this.currentPlayer.x -= horizontalVelocity;
        // Add null checks before accessing player properties
        if (this.room && this.room.state && this.room.state.players) {
          const player = this.room.state.players.get(
            this.registry.get("playerName")
          );
          if (player) {
            player.isFacingLeft = true;
          }
        }
        // Check horizontal collision
        for (const obstacle of this.obstacles) {
          if (this.checkCollision(this.currentPlayer, obstacle)) {
            this.currentPlayer.x = prevX;
            break;
          }
        }
      } else if (this.inputPayload.right) {
        this.currentPlayer.x += horizontalVelocity;
        // Add null checks before accessing player properties
        if (this.room && this.room.state && this.room.state.players) {
          const player = this.room.state.players.get(
            this.registry.get("playerName")
          );
          if (player) {
            player.isFacingLeft = false;
          }
        }
        // Check horizontal collision
        for (const obstacle of this.obstacles) {
          if (this.checkCollision(this.currentPlayer, obstacle)) {
            this.currentPlayer.x = prevX;
            break;
          }
        }
      }

      // Apply jump if grounded
      if (this.inputPayload.jump && this.currentPlayer.getData("isGrounded")) {
        this.currentPlayer.setData("velocityY", jumpVelocity);
        this.currentPlayer.setData("isGrounded", false);
      }
    }

    // Apply gravity
    let velocityY = this.currentPlayer.getData("velocityY") || 0;
    velocityY += gravity;
    this.currentPlayer.y += velocityY;
    this.currentPlayer.setData("velocityY", velocityY);

    // Check vertical collisions
    let isGrounded = false;
    for (const obstacle of this.obstacles) {
      if (this.checkCollision(this.currentPlayer, obstacle)) {
        const playerBottom = prevY + 16; // half player height
        const obstacleTop = obstacle.y - obstacle.height / 2;

        if (playerBottom <= obstacleTop) {
          // Landing on top of platform
          this.currentPlayer.y = obstacleTop - 16;
          this.currentPlayer.setData("velocityY", 0);
          isGrounded = true;
        } else {
          // Other vertical collisions
          this.currentPlayer.y = prevY;
          this.currentPlayer.setData("velocityY", 0);
        }
        break;
      }
    }
    this.currentPlayer.setData("isGrounded", isGrounded);

    this.localRef.x = this.currentPlayer.x;
    this.localRef.y = this.currentPlayer.y;

    // Handle collect key
    if (this.collectKey && this.collectKey.isDown) {
      this.room.send("collectLoot");
    }

    // Update the interpolation for other players
    for (let username in this.playerEntities) {
      if (username === this.registry.get("playerName")) {
        continue;
      }

      const entity = this.playerEntities[username];
      if (!entity || !entity.scene || !entity.data?.values) {
        delete this.playerEntities[username];
        continue;
      }

      const { serverX, serverY } = entity.data.values;
      if (serverX !== undefined && serverY !== undefined) {
        entity.x = Phaser.Math.Linear(entity.x, serverX, 0.4);
        entity.y = Phaser.Math.Linear(entity.y, serverY, 0.6);
      }
    }

    // Update monster positions with interpolation
    Object.values(this.monsterEntities).forEach((entity) => {
      if (!entity || !entity.scene || !entity.data?.values) {
        return;
      }

      const { serverX, serverY } = entity.data.values;
      if (serverX !== undefined && serverY !== undefined) {
        entity.x = Phaser.Math.Linear(entity.x, serverX, 0.4);
        entity.y = Phaser.Math.Linear(entity.y, serverY, 0.6);
      }
    });

    // Update loot positions with interpolation
    Object.entries(this.lootEntities).forEach(([index, entity]) => {
      if (!entity || !entity.scene || !entity.data?.values) {
        delete this.lootEntities[index];
        return;
      }

      const { serverX, serverY } = entity.data.values;
      if (serverX !== undefined && serverY !== undefined) {
        entity.x = Phaser.Math.Linear(entity.x, serverX, 0.4);
        entity.y = Phaser.Math.Linear(entity.y, serverY, 0.6);
      }
    });

    // Update animations
    if (this.currentPlayer && this.currentPlayer.scene) {
      if (this.currentPlayer.getData("isAttacking")) {
        this.currentPlayer.play("character-attack", true);
      } else if (!this.currentPlayer.getData("isGrounded")) {
        this.currentPlayer.play("character-jump", true);
      } else if (this.inputPayload.left || this.inputPayload.right) {
        this.currentPlayer.play("character-run", true);
        this.currentPlayer.setFlipX(this.inputPayload.left);
      } else {
        this.currentPlayer.play("character-idle", true);
      }
    }
  }

  private checkCollision(
    player: Phaser.Types.Physics.Arcade.ImageWithDynamicBody,
    obstacle:
      | Phaser.GameObjects.Rectangle
      | Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  ): boolean {
    const playerSize = 16; // half of 32
    const obstacleHalfWidth = obstacle.width / 2;
    const obstacleHalfHeight = obstacle.height / 2;

    // Calculate boundaries using actual obstacle dimensions
    const playerLeft = player.x - playerSize;
    const playerRight = player.x + playerSize;
    const playerTop = player.y - playerSize;
    const playerBottom = player.y + playerSize;

    const obstacleLeft = obstacle.x - obstacleHalfWidth;
    const obstacleRight = obstacle.x + obstacleHalfWidth;
    const obstacleTop = obstacle.y - obstacleHalfHeight;
    const obstacleBottom = obstacle.y + obstacleHalfHeight;

    // Check if this is a one-way platform
    const isOneWayPlatform = obstacle.getData("isOneWayPlatform");

    if (isOneWayPlatform) {
      // For one-way platforms, only collide when:
      // 1. Player is moving downward (positive velocityY)
      // 2. Player's bottom is above or at the platform's top
      // 3. Player's previous position was above the platform
      const velocityY = player.getData("velocityY") || 0;
      const prevY = player.getData("prevY") || player.y;
      const prevPlayerBottom = prevY + playerSize;

      if (velocityY >= 0 && prevPlayerBottom <= obstacleTop) {
        return (
          playerRight > obstacleLeft &&
          playerLeft < obstacleRight &&
          playerBottom > obstacleTop &&
          playerTop < obstacleBottom
        );
      }
      return false;
    }

    // Regular collision check for non-one-way platforms
    return (
      playerRight > obstacleLeft &&
      playerLeft < obstacleRight &&
      playerBottom > obstacleTop &&
      playerTop < obstacleBottom
    );
  }

  private async handlePortalCollision(portal: any) {
    try {
      await this.room.leave();
      const playerData = this.registry.get("playerData");
      const password = this.registry.get("password");

      // Check if credentials exist
      if (!playerData?.username || !password) {
        console.error("Missing credentials for room transition");
        // Redirect back to login scene if credentials are missing
        this.scene.start("login");
        return;
      }

      const newRoom = await this.client.join(portal.targetRoom, {
        username: playerData.username,
        password: password,
      });
      this.registry.set("room", newRoom);
      this.scene.start(portal.targetRoom);
      console.log("Village: handlePortalCollision", portal);
    } catch (error) {
      console.error("Error handling portal collision:", error);
      // Redirect to login scene on error
      this.scene.start("login");
    }
  }

  shutdown() {
    if (this.room) {
      this.room.leave();
    }
  }
}
