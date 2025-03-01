/**
 * Backend connection configuration
 *
 * This automatically detects whether the application is running locally or on a deployed server:
 * - When running locally: connects to ws://localhost:2567
 * - When deployed: uses the current domain with secure WebSocket protocol
 */

export const BACKEND_URL =
  window.location.href.indexOf("localhost") === -1
    ? `https://platformer-bcdf5c8186fd.herokuapp.com`
    : "ws://localhost:2567";
