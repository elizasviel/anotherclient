import Phaser from "phaser";
import { Room, Client } from "colyseus.js";
import { BACKEND_URL } from "../backend";
import { ChatUI } from "../ChatUI";

export class Village extends Phaser.Scene {
  room: Room;
  currentPlayer: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  playerEntities: {
    [sessionId: string]: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  } = {};

  localRef: Phaser.GameObjects.Rectangle;
  remoteRef: Phaser.GameObjects.Rectangle;

  cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;

  inputPayload = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    attack: false,
    tick: undefined,
  };

  elapsedTime = 0;
  fixedTimeStep = 1000 / 60;

  currentTick: number = 0;

  obstacles: (
    | Phaser.GameObjects.Rectangle
    | Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  )[] = [];

  private map: Phaser.Tilemaps.Tilemap;
  private tileset: Phaser.Tilemaps.Tileset;

  monsterEntities: {
    [index: number]: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  } = {};

  // does this belong here or on player somewhere?
  private isAttacking: boolean = false;

  // Add layer property declaration
  private layer: Phaser.Tilemaps.TilemapLayer;

  // Add property to store loot entities
  private lootEntities: {
    [index: number]: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  } = {};

  private collectKey: Phaser.Input.Keyboard.Key;

  // Add a property for the chat UI
  private chatUI: ChatUI;
  private playerName: string = "";
  private chatInputActive: boolean = false;

  // Add properties for player names and coins
  private playerNameTexts: { [sessionId: string]: Phaser.GameObjects.Text } =
    {};
  private coinCount: number = 0;

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
    this.load.spritesheet(
      "character-run",
      "assets/Character/Run/Run-Sheet.png",
      {
        frameWidth: 80, // 640/8 = 80
        frameHeight: 80,
      }
    );
    this.load.spritesheet(
      "character-jump",
      "assets/Character/Jump-All/Jump-All-Sheet.png",
      {
        frameWidth: 64, // 960/15 = 64
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

    //more complex movement logic
    this.load.spritesheet("boar-idle", "assets/Mob/Boar/Idle/Idle-Sheet.png", {
      frameWidth: 48,
      frameHeight: 32,
    });
    this.load.spritesheet("boar-run", "assets/Mob/Boar/Run/Run-Sheet.png", {
      frameWidth: 48,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "boar-walk",
      "assets/Mob/Boar/Walk/Walk-Base-Sheet.png",
      {
        frameWidth: 48,
        frameHeight: 32,
      }
    );
    this.load.spritesheet(
      "boar-vanish",
      "assets/Mob/Boar/Hit-Vanish/Hit-Sheet.png",
      {
        frameWidth: 48,
        frameHeight: 32,
      }
    );

    // Replace the static coin image with a spritesheet
    this.load.spritesheet("coin", "assets/Loot/coin.png", {
      frameWidth: 8, // Adjust these values based on your spritesheet
      frameHeight: 8,
    });
  }

  async create() {
    // Add these lines at the start of create() to set up the background
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

    this.cursorKeys = this.input.keyboard.createCursorKeys();

    // connect with the room
    await this.connect();

    // Initialize chat UI
    this.chatUI = new ChatUI(
      (message) => {
        this.room.send("chat", message);
      },
      (isFocused) => {
        this.chatInputActive = isFocused;
        if (isFocused) {
          this.input.keyboard.removeCapture(
            Phaser.Input.Keyboard.KeyCodes.SPACE
          );
        } else {
          this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }
      }
    );

    this.room.onMessage("chat", (message) => {
      const isSelf = message.sessionId === this.room.sessionId;
      this.chatUI.addMessage(message.sender, message.message, isSelf);
    });

    this.room.onMessage("system", (message) => {
      this.chatUI.addSystemMessage(message.message);
    });

    // Handle login success message
    this.room.onMessage("loginSuccess", (message) => {
      this.playerName = message.username;
      //save player name in registry for other scenes
      this.registry.set("playerName", this.playerName);
      this.coinCount = message.coins;
      this.game.events.emit("updateCoins", this.coinCount);

      // Update the player's name text
      if (this.playerNameTexts[this.room.sessionId]) {
        this.playerNameTexts[this.room.sessionId].setText(this.playerName);
      }

      this.chatUI.addSystemMessage(
        `Welcome back, ${this.playerName}! You have ${message.coins} coins.`
      );
    });

    // Add this in the create() method after other message handlers
    this.room.onMessage("playerNameUpdate", (message) => {
      // Update the player name text for the specific player
      if (this.playerNameTexts[message.sessionId]) {
        this.playerNameTexts[message.sessionId].setText(message.name);
        console.log(
          `Updated name for player ${message.sessionId} to ${message.name}`
        );
      } else {
        console.log(`Could not find name text for player ${message.sessionId}`);
      }
    });

    // Keep the existing setName handler for the current player
    this.room.onMessage("setName", (message) => {
      if (this.playerNameTexts[this.room.sessionId]) {
        this.playerNameTexts[this.room.sessionId].setText(message.name);
      }
    });

    // Use player name from previous scene or prompt for a new one
    if (this.registry.get("playerName")) {
      this.playerName = this.registry.get("playerName");
      // Login with existing username
      this.room.send("login", { username: this.playerName });
    } else {
      setTimeout(() => {
        const name = prompt(
          "Enter your username to login or create an account:",
          "Player"
        );
        if (name && name.trim() !== "") {
          this.playerName = name.trim();
          // Store player name in registry for other scenes
          this.registry.set("playerName", this.playerName);
          // Login with new username
          this.room.send("login", { username: this.playerName });
        }
      }, 1000);
    }

    // Create obstacles based on server state
    this.room.state.obstacles.onAdd((obstacle) => {
      const sprite = this.add.rectangle(
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height
      );

      // Set one-way platform property based on server data
      if (obstacle.isOneWayPlatform) {
        sprite.setData("isOneWayPlatform", true);
      }

      this.obstacles.push(sprite);
    });

    // Player setup
    this.room.state.players.onAdd((player, sessionId) => {
      const entity = this.physics.add.sprite(
        player.x,
        player.y,
        "character-idle"
      );
      entity.setDisplaySize(48, 48); // Adjust size as needed
      this.playerEntities[sessionId] = entity;

      // Add player name text above the player
      // Get the name from player data if available, otherwise use a placeholder
      let displayName = "";
      if (sessionId === this.room.sessionId) {
        displayName = this.playerName || "You";
      } else if (player.data && player.data.name) {
        displayName = player.data.name;
      } else {
        displayName = "Player " + sessionId.substring(0, 4);
      }

      console.log(`Creating name text for ${sessionId}: ${displayName}`);

      const nameText = this.add.text(player.x, player.y - 30, displayName, {
        fontSize: "14px",
        color: sessionId === this.room.sessionId ? "#00ff00" : "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      });
      nameText.setOrigin(0.5, 1);
      nameText.setDepth(100);
      this.playerNameTexts[sessionId] = nameText;

      if (sessionId === this.room.sessionId) {
        this.currentPlayer = entity;
        this.cameras.main.startFollow(this.currentPlayer, true, 0.1, 0.1);
        this.cameras.main.setZoom(2);

        this.localRef = this.add.rectangle(0, 0, entity.width, entity.height);
        this.localRef.setStrokeStyle(1, 0x00ff00);

        this.remoteRef = this.add.rectangle(0, 0, entity.width, entity.height);
        this.remoteRef.setStrokeStyle(1, 0xff0000);

        player.onChange(() => {
          this.remoteRef.x = player.x;
          this.remoteRef.y = player.y;

          // Update coin count if it changed
          if (player.coins !== undefined && player.coins !== this.coinCount) {
            this.coinCount = player.coins;
            this.game.events.emit("updateCoins", this.coinCount);
          }
        });
      } else {
        player.onChange((changes) => {
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

          // Update facing direction based on movement direction
          if (player.isFacingLeft) {
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

      // Add this after the player.onChange handler in the player creation section
      if (sessionId !== this.room.sessionId) {
        // Listen for changes to player data (including name)
        player.data.onChange(() => {
          if (player.data.name && this.playerNameTexts[sessionId]) {
            this.playerNameTexts[sessionId].setText(player.data.name);
            console.log(
              `Updated name for ${sessionId} to ${player.data.name} via data change`
            );
          }
        });
      }
    });

    this.room.state.players.onRemove((player, sessionId) => {
      const entity = this.playerEntities[sessionId];
      if (entity) {
        entity.destroy();
        delete this.playerEntities[sessionId];
      }

      // Remove player name text
      if (this.playerNameTexts[sessionId]) {
        this.playerNameTexts[sessionId].destroy();
        delete this.playerNameTexts[sessionId];
      }
    });

    this.anims.create({
      key: "boar-idle",
      frames: this.anims.generateFrameNumbers("boar-idle", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "boar-run",
      frames: this.anims.generateFrameNumbers("boar-run", { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1,
    });

    this.anims.create({
      key: "boar-walk",
      frames: this.anims.generateFrameNumbers("boar-walk", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "boar-vanish",
      frames: this.anims.generateFrameNumbers("boar-vanish", {
        start: 0,
        end: 3,
      }),
      frameRate: 12,
      repeat: 0,
    });

    // Create coin spinning animation
    if (!this.anims.exists("coin-spin")) {
      this.anims.create({
        key: "coin-spin",
        frames: this.anims.generateFrameNumbers("coin", {
          start: 0,
          end: 3, // Adjust based on your spritesheet frame count
        }),
        frameRate: 10,
        repeat: -1, // -1 means loop forever
      });
    }

    // Update monster creation to use the idle spritesheet initially
    this.room.state.monsters.onAdd((monster, index) => {
      const entity = this.physics.add.sprite(monster.x, monster.y, "boar-idle");
      entity.setDisplaySize(48, 32);
      this.monsterEntities[index] = entity;

      monster.onChange((changes) => {
        // Ensure entity still exists and has animations
        if (!entity || !entity.anims) {
          return;
        }

        entity.setData("serverX", monster.x);
        entity.setData("serverY", monster.y);

        // Handle hit state
        if (monster.isHit) {
          entity.play("boar-vanish", true);
          entity.once("animationcomplete", () => {
            if (!entity || !entity.anims) return;

            if (Math.abs(monster.velocityX) > 2) {
              entity.play("boar-run", true);
            } else if (Math.abs(monster.velocityX) > 0) {
              entity.play("boar-walk", true);
            } else {
              entity.play("boar-idle", true);
            }
          });
        } else if (
          !entity.anims.isPlaying ||
          entity.anims.currentAnim?.key !== "boar-vanish"
        ) {
          if (Math.abs(monster.velocityX) > 2) {
            entity.play("boar-run", true);
          } else if (Math.abs(monster.velocityX) > 0) {
            entity.play("boar-walk", true);
          } else {
            entity.play("boar-idle", true);
          }
        }

        entity.setFlipX(monster.velocityX > 0);
      });
    });

    // Handle monster removal
    this.room.state.monsters.onRemove((monster, index) => {
      const entity = this.monsterEntities[index];
      if (entity) {
        entity.destroy();
        delete this.monsterEntities[index];
      }
    });

    // Update mouse input handling
    this.input.on("pointerdown", (pointer) => {
      if (pointer.leftButtonDown() && !this.isAttacking) {
        this.isAttacking = true;
        this.inputPayload.attack = true;

        // Play attack animation
        this.currentPlayer.play("character-attack", true);

        // Listen for animation complete
        this.currentPlayer.on("animationcomplete", (animation) => {
          if (animation.key === "character-attack") {
            this.isAttacking = false;
            this.inputPayload.attack = false;
          }
        });
      }
    });

    // Update the loot handling to play the animation
    this.room.state.loot.onAdd((loot, index) => {
      const entity = this.physics.add.sprite(loot.x, loot.y, "coin");
      entity.setDisplaySize(16, 16);
      this.lootEntities[index] = entity;

      // Play the spinning animation for coins
      if (loot.type === "coin") {
        entity.play("coin-spin");
      }

      // Optional: Add a bounce animation or sparkle effect
      this.tweens.add({
        targets: entity,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 200,
        yoyo: true,
      });

      loot.onChange(() => {
        entity.setData("serverX", loot.x);
        entity.setData("serverY", loot.y);
      });
    });

    this.room.state.loot.onRemove((loot, index) => {
      const entity = this.lootEntities[index];
      if (entity) {
        // Optional: Add collection animation before destroying
        this.tweens.add({
          targets: entity,
          alpha: 0,
          y: entity.y - 20,
          duration: 200,
          onComplete: () => {
            entity.destroy();
            delete this.lootEntities[index];
          },
        });
      }
    });

    // Add Z key for collection
    this.collectKey = this.input.keyboard.addKey("Z");

    // Update the loot handling to show collection animation
    this.room.state.loot.onChange((loot, index) => {
      const entity = this.lootEntities[index];
      if (!entity) return; // Skip if entity doesn't exist

      // Update position data
      if (loot) {
        entity.setData("serverX", loot.x);
        entity.setData("serverY", loot.y);

        // Handle collection animation
        if (loot.isBeingCollected) {
          entity.setTint(0xffff00); // Yellow tint while being collected
        }
      }
    });

    // Update the loot removal handler
    this.room.state.loot.onRemove((loot, index) => {
      const entity = this.lootEntities[index];
      if (entity) {
        // Add collection animation before destroying
        this.tweens.add({
          targets: entity,
          alpha: 0,
          y: entity.y - 20,
          duration: 200,
          onComplete: () => {
            if (entity.destroy) {
              // Check if entity still exists
              entity.destroy();
            }
            delete this.lootEntities[index];
          },
        });
      }
    });
  }

  async connect() {
    // add connection status text
    const connectionStatusText = this.add
      .text(0, 0, "Trying to connect with the server...")
      .setStyle({ color: "#ff0000" })
      .setPadding(4);

    const client = new Client(BACKEND_URL);

    try {
      this.room = await client.joinOrCreate("village", {});

      // connection successful!
      connectionStatusText.destroy();
    } catch (e) {
      // couldn't connect
      connectionStatusText.text = "Could not connect with the server.";
    }
  }

  update(time: number, delta: number): void {
    // Update coin count in UI scene
    if (this.coinCount !== undefined) {
      this.game.events.emit("updateCoins", this.coinCount);
    }

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

    // Only process game input when chat is not focused
    if (!this.chatInputActive) {
      this.inputPayload.left = this.cursorKeys.left.isDown;
      this.inputPayload.right = this.cursorKeys.right.isDown;
      this.inputPayload.up = this.cursorKeys.up.isDown;
      this.inputPayload.down = this.cursorKeys.down.isDown;
      this.inputPayload.jump = this.cursorKeys.space.isDown;
      this.inputPayload.attack = this.isAttacking;
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
      if (!this.isAttacking) {
        // Handle horizontal movement
        if (this.inputPayload.left) {
          this.currentPlayer.x -= horizontalVelocity;
          // Add null checks before accessing player properties
          if (this.room && this.room.state && this.room.state.players) {
            const player = this.room.state.players.get(this.room.sessionId);
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
            const player = this.room.state.players.get(this.room.sessionId);
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
        if (
          this.inputPayload.jump &&
          this.currentPlayer.getData("isGrounded")
        ) {
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
      if (this.collectKey.isDown) {
        this.room.send("collectLoot");
      }
    }

    // Update the interpolation for other players
    for (let sessionId in this.playerEntities) {
      if (sessionId === this.room.sessionId) {
        continue;
      }

      const entity = this.playerEntities[sessionId];
      if (!entity || !entity.scene || !entity.data?.values) {
        delete this.playerEntities[sessionId];
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
      if (this.isAttacking) {
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

    // Update player name positions
    for (let sessionId in this.playerEntities) {
      const entity = this.playerEntities[sessionId];
      const nameText = this.playerNameTexts[sessionId];

      if (entity && nameText && entity.scene) {
        nameText.x = entity.x;
        nameText.y = entity.y - 30;
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

  // Add a shutdown method to clean up resources
  shutdown() {
    // Clean up the chat UI
    if (this.chatUI) {
      this.chatUI.destroy();
    }

    // Clean up player name texts
    for (const sessionId in this.playerNameTexts) {
      if (this.playerNameTexts[sessionId]) {
        this.playerNameTexts[sessionId].destroy();
      }
    }
    this.playerNameTexts = {};

    // Clean up other resources
    if (this.room) {
      this.room.leave();
    }
  }
}
