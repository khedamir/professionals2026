"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = require("./routes");
const websocket_1 = require("./websocket");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// простой middleware для ClientId, чтобы соответствовать заданию
app.use((req, _res, next) => {
    const clientId = req.header('ClientId') || req.header('ClientID');
    if (clientId) {
        req.clientId = clientId;
    }
    next();
});
app.use('/api', routes_1.router);
const port = process.env.PORT || 3000;
const server = http_1.default.createServer(app);
(0, websocket_1.createBoardWebSocketServer)(server);
server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${port}`);
});
