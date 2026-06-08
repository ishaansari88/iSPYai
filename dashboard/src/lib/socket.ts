import { io, type Socket } from "socket.io-client";
import { REALTIME_NAMESPACE } from "@ispyai/shared";

// Single shared Socket.IO client for the dashboard. The Vite dev proxy
// upgrades /socket.io requests to the backend, so we can connect with a
// relative origin and let the proxy route both polling and ws frames.
let cached: Socket | null = null;

export function getSocket(): Socket {
  if (cached) return cached;
  cached = io(REALTIME_NAMESPACE, {
    transports: ["websocket"],
    autoConnect: true,
  });
  return cached;
}
