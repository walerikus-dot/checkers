import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (!socket) {
    // Empty string → connects to current origin (works in production behind nginx)
    // Set NEXT_PUBLIC_WS_URL=http://localhost:3000 for local dev
    const base = process.env.NEXT_PUBLIC_WS_URL || '';
    socket = io(`${base}/game`, {
      auth: { token },
      transports: ['polling', 'websocket'],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
