import { createServer } from 'node:http';
import { app } from './app.js';
import { attachChat } from './chat.js';
import { migrate, sql } from './db.js';

await migrate();

const server = createServer(app);
const wss = attachChat(server);
const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`API listening on ${port}`));

async function shutdown() {
  wss.clients.forEach(ws => ws.close(1001));
  server.close(async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
