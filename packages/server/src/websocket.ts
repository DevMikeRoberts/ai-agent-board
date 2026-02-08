import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WSMessage } from './types.js';

let wss: WebSocketServer;

export function createWSS(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] client connected');
    ws.on('close', () => console.log('[WS] client disconnected'));
    ws.on('error', (err) => console.error('[WS] error:', err.message));
  });

  // Heartbeat to detect stale connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('connection', (ws: any) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  wss.on('close', () => clearInterval(interval));

  return wss;
}

export function broadcast(message: WSMessage): void {
  if (!wss) return;
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
