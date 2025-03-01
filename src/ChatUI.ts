export class ChatUI {
  private container: HTMLDivElement;
  private messagesContainer: HTMLDivElement;
  public input: HTMLInputElement;
  private isVisible: boolean = true;
  private onMessageSend: (message: string) => void;
  private maxMessages: number = 50;
  private isFocused: boolean = false;
  private onFocusChange: (isFocused: boolean) => void;

  constructor(
    onMessageSend: (message: string) => void,
    onFocusChange?: (isFocused: boolean) => void
  ) {
    this.onMessageSend = onMessageSend;
    this.onFocusChange = onFocusChange || (() => {});
    this.createUI();
  }

  private createUI() {
    // Create main container
    this.container = document.createElement("div");
    this.container.style.position = "absolute";
    this.container.style.bottom = "10px";
    this.container.style.left = "10px";
    this.container.style.width = "300px";
    this.container.style.zIndex = "1000";
    this.container.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    this.container.style.borderRadius = "5px";
    this.container.style.padding = "10px";
    this.container.style.color = "white";
    this.container.style.fontFamily = "Arial, sans-serif";
    this.container.style.cursor = "pointer";

    // Create messages container
    this.messagesContainer = document.createElement("div");
    this.messagesContainer.style.height = "150px";
    this.messagesContainer.style.overflowY = "auto";
    this.messagesContainer.style.marginBottom = "10px";
    this.messagesContainer.style.fontSize = "14px";

    // Create input container
    const inputContainer = document.createElement("div");
    inputContainer.style.display = "flex";

    // Create input field
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.placeholder = "Click here to chat...";
    this.input.style.flex = "1";
    this.input.style.padding = "5px";
    this.input.style.border = "none";
    this.input.style.borderRadius = "3px";
    this.input.style.backgroundColor = "rgba(255, 255, 255, 0.8)";

    // Add a specific keypress handler for spacebar
    this.input.addEventListener("keypress", (e) => {
      if (e.key === " " || e.code === "Space") {
        // This ensures the space is added to the input field
        e.stopPropagation();
      }
    });

    // Handle enter key press
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const message = this.input.value.trim();
        if (message) {
          this.onMessageSend(message);
          this.input.value = "";
        }
      }

      // Allow arrow keys for text editing without affecting game movement
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.stopPropagation();
      }

      // Special handling for spacebar
      if (e.key === " " || e.code === "Space") {
        e.stopPropagation();
      }
    });

    // Handle focus events
    this.input.addEventListener("focus", () => {
      this.isFocused = true;
      this.container.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      this.input.style.backgroundColor = "rgba(255, 255, 255, 1)";
      this.onFocusChange(true);
    });

    this.input.addEventListener("blur", () => {
      this.isFocused = false;
      this.container.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
      this.input.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
      this.onFocusChange(false);
    });

    // Make the entire chat container clickable to focus
    this.container.addEventListener("click", (e) => {
      // Only focus if clicking on the container itself or the messages area
      // (not when clicking on a button or other interactive element)
      if (e.target === this.container || e.target === this.messagesContainer) {
        this.focus();
      }
    });

    // Create toggle button
    const toggleButton = document.createElement("button");
    toggleButton.textContent = "▼";
    toggleButton.style.marginLeft = "5px";
    toggleButton.style.border = "none";
    toggleButton.style.borderRadius = "3px";
    toggleButton.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    toggleButton.style.cursor = "pointer";

    toggleButton.addEventListener("click", () => {
      this.toggle();
    });

    // Assemble the UI
    inputContainer.appendChild(this.input);
    inputContainer.appendChild(toggleButton);
    this.container.appendChild(this.messagesContainer);
    this.container.appendChild(inputContainer);

    // Add to document
    document.body.appendChild(this.container);

    // Add a global click listener to detect clicks outside the chat
    document.addEventListener("click", (e) => {
      if (this.isFocused && !this.container.contains(e.target as Node)) {
        this.blur();
      }
    });
  }

  public addMessage(sender: string, message: string, isSelf: boolean = false) {
    const messageElement = document.createElement("div");
    messageElement.style.marginBottom = "5px";
    messageElement.style.wordBreak = "break-word";

    if (isSelf) {
      messageElement.style.color = "#7FFF7F"; // Light green for own messages
    }

    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    this.messagesContainer.appendChild(messageElement);

    // Auto-scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    // Limit number of messages
    while (this.messagesContainer.children.length > this.maxMessages) {
      this.messagesContainer.removeChild(this.messagesContainer.firstChild);
    }
  }

  public addSystemMessage(message: string) {
    const messageElement = document.createElement("div");
    messageElement.style.marginBottom = "5px";
    messageElement.style.color = "#FFFF7F"; // Light yellow for system messages
    messageElement.style.fontStyle = "italic";
    messageElement.textContent = message;

    this.messagesContainer.appendChild(messageElement);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  public toggle() {
    this.isVisible = !this.isVisible;

    if (this.isVisible) {
      this.messagesContainer.style.display = "block";
      this.container.style.backgroundColor = this.isFocused
        ? "rgba(0, 0, 0, 0.7)"
        : "rgba(0, 0, 0, 0.5)";
    } else {
      this.messagesContainer.style.display = "none";
      this.container.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
    }
  }

  public focus() {
    this.input.focus();
  }

  public blur() {
    this.input.blur();
  }

  public isChatFocused(): boolean {
    return this.isFocused;
  }

  public destroy() {
    document.body.removeChild(this.container);
  }
}
