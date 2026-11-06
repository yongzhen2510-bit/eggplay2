import { WebSocketServer } from 'ws';

export const validRoom = room => /^[a-z0-9_-]{1,40}$/.test(room || '');

const rooms = new Map();
// Sockets opened without a room hear every room, for the in-app message popup.
const ALL = '*';
const HEARTBEAT_MS = 30000;

// Live delivery only. Chat history is always read over HTTP, so a dropped socket loses nothing.
export function attachChat(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    const all = !url.searchParams.has('room');
    const room = all ? ALL : url.searchParams.get('room');
    if (url.pathname !== '/api/ws' || (!all && !validRoom(room))) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      ws.alive = true;
      ws.on('pong', () => { ws.alive = true; });
      ws.on('error', () => {});
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      ws.on('close', () => {
        rooms.get(room)?.delete(ws);
        if (!rooms.get(room)?.size) rooms.delete(room);
      });
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.alive) { ws.terminate(); return; }
      ws.alive = false;
      ws.ping();
    });
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return wss;
}

export function broadcast(room, message) {
  const data = JSON.stringify({ ...message, room });
  [rooms.get(room), rooms.get(ALL)].forEach(set => set?.forEach(ws => { if (ws.readyState === ws.OPEN) ws.send(data); }));
}
