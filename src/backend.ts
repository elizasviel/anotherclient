/**
 * Backend connection configuration
 *
 * This automatically detects whether the application is running locally or on a deployed server:
 * - When running locally: connects to ws://localhost:2567
 * - When deployed: uses the current domain with WebSocket protocol
 */

/*
export const BACKEND_URL =
  window.location.href.indexOf("localhost") === -1
    ? `${window.location.protocol.replace("http", "ws")}//${
        window.location.hostname
      }${window.location.port ? `:${window.location.port}` : ""}`
    : "ws://localhost:2567";
*/

// You can override the backend URL by uncommenting and modifying the line below
export const BACKEND_URL = "ws://platformer-bcdf5c8186fd.herokuapp.com/";
