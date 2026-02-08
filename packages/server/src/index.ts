import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createWSS } from './websocket.js';
import taskRoutes from './routes/tasks.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

app.use('/api/tasks', taskRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const server = createServer(app);
createWSS(server);

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] WebSocket at ws://localhost:${PORT}/ws`);
});
