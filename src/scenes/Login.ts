import Phaser from "phaser";
import { Client } from "colyseus.js";

export class Login extends Phaser.Scene {
  private client: Client;
  private form: HTMLFormElement;
  private usernameInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private loginButton: HTMLButtonElement;
  private registerButton: HTMLButtonElement;
  private errorText: HTMLDivElement;

  constructor() {
    super({ key: "login" });
  }

  create() {
    // Create HTML elements for login form
    this.createLoginForm();

    // Initialize Colyseus client
    this.client = new Client("ws://localhost:2567");
    this.registry.set("client", this.client);

    // Add event listeners
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleLogin();
    });
    this.registerButton.addEventListener("click", () => this.handleRegister());
  }

  private createLoginForm() {
    const container = document.createElement("div");
    container.id = "login-container";
    container.style.position = "absolute";
    container.style.top = "50%";
    container.style.left = "50%";
    container.style.transform = "translate(-50%, -50%)";
    container.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    container.style.padding = "20px";
    container.style.borderRadius = "10px";
    container.style.color = "white";
    container.style.zIndex = "1000";

    this.form = document.createElement("form");
    this.form.style.display = "flex";
    this.form.style.flexDirection = "column";
    this.form.style.alignItems = "center";

    this.usernameInput = document.createElement("input");
    this.usernameInput.type = "text";
    this.usernameInput.placeholder = "Username";
    this.usernameInput.style.marginBottom = "10px";
    this.usernameInput.style.width = "200px";
    this.usernameInput.style.padding = "5px";
    this.usernameInput.required = true;
    this.usernameInput.autocomplete = "username";

    this.passwordInput = document.createElement("input");
    this.passwordInput.type = "password";
    this.passwordInput.placeholder = "Password";
    this.passwordInput.style.marginBottom = "10px";
    this.passwordInput.style.width = "200px";
    this.passwordInput.style.padding = "5px";
    this.passwordInput.required = true;
    this.passwordInput.autocomplete = "current-password";

    this.loginButton = document.createElement("button");
    this.loginButton.type = "submit";
    this.loginButton.textContent = "Login";
    this.loginButton.style.marginRight = "10px";
    this.loginButton.style.padding = "5px 15px";

    this.registerButton = document.createElement("button");
    this.registerButton.type = "button";
    this.registerButton.textContent = "Register";
    this.registerButton.style.padding = "5px 15px";

    this.errorText = document.createElement("div");
    this.errorText.style.color = "red";
    this.errorText.style.marginTop = "10px";

    this.form.appendChild(this.usernameInput);
    this.form.appendChild(this.passwordInput);
    this.form.appendChild(this.loginButton);
    this.form.appendChild(this.registerButton);
    this.form.appendChild(this.errorText);

    container.appendChild(this.form);
    document.body.appendChild(container);
  }

  private async handleLogin() {
    const username = this.usernameInput.value;
    const password = this.passwordInput.value;

    try {
      console.log("Attempting login...");
      const response = await fetch("http://localhost:2567/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      console.log("Login response:", data);

      if (!response.ok) {
        this.errorText.textContent = data.error;
        return;
      }

      console.log("Storing player data in registry...");
      // Store player data and password in the game registry

      //so if I kill a monster and gain exp what happens?
      //that's fine because we put exp in state?
      //data in frontend registry to enable movement between rooms
      this.registry.set("playerData", data.playerData);
      this.registry.set("password", password);

      // Connect to the last room or default to village
      const lastRoom = data.playerData.lastRoom || "village";
      console.log("Connecting to room:", lastRoom);
      await this.connectToRoom(lastRoom);
    } catch (error) {
      console.error("Login error:", error);
      this.errorText.textContent = "Error connecting to server";
    }
  }

  private async handleRegister() {
    const username = this.usernameInput.value;
    const password = this.passwordInput.value;

    try {
      const response = await fetch("http://localhost:2567/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        this.errorText.textContent = data.error;
        return;
      }

      // After successful registration, attempt login
      await this.handleLogin();
    } catch (error) {
      this.errorText.textContent = "Error connecting to server";
      console.error(error);
    }
  }

  private async connectToRoom(roomName: string) {
    try {
      console.log("Getting player data from registry...");
      const playerData = this.registry.get("playerData");
      console.log("Joining room with data:", {
        username: playerData.username,
        roomName,
      });

      const room = await this.client.join(roomName, {
        username: playerData.username,
        password: this.registry.get("password"),
      });

      console.log("Successfully joined room:", roomName);
      // Store room reference in registry
      this.registry.set("room", room);

      console.log("Removing login form...");
      // Remove only the login container instead of clearing the entire body
      const loginContainer = document.getElementById("login-container");
      if (loginContainer) {
        loginContainer.remove();
      }

      console.log("Starting game scene:", roomName);
      // Start the game scene
      this.scene.start(roomName);
    } catch (error) {
      console.error("Room connection error:", error);
      this.errorText.textContent = "Error joining room";
    }
  }

  shutdown() {
    // Clean up only the login form if it exists
    const loginContainer = document.getElementById("login-container");
    if (loginContainer) {
      loginContainer.remove();
    }
  }
}
