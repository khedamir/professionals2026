import express from 'express';
import http from 'http';
import cors from 'cors';
import { router } from './routes';
import { createBoardWebSocketServer } from './websocket';

const app = express();

app.use(cors());
app.use(express.json());

// простой middleware для ClientId, чтобы соответствовать заданию
app.use((req, _res, next) => {
  const clientId = req.header('ClientId') || req.header('ClientID');
  if (clientId) {
    (req as any).clientId = clientId;
  }
  next();
});

app.use('/api', router);

const port = process.env.PORT || 3000;
const server = http.createServer(app);

createBoardWebSocketServer(server);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});

