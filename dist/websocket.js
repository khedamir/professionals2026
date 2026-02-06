"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBoardWebSocketServer = createBoardWebSocketServer;
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const store_1 = require("./store");
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
function createBoardWebSocketServer(server) {
    const wss = new ws_1.WebSocketServer({ server, path: '/ws/board' });
    wss.on('connection', async (ws, req) => {
        const params = new URLSearchParams((req.url?.split('?')[1] || '').toString());
        const token = params.get('token') || undefined;
        const boardId = params.get('boardId') || undefined;
        const hash = params.get('hash') || undefined;
        const ctx = {
            canEdit: false,
        };
        if (token) {
            try {
                const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                ctx.userId = decoded.userId;
                ctx.userName = decoded.name;
            }
            catch (e) {
                ws.close(4001, 'Invalid token');
                return;
            }
        }
        if (boardId) {
            const board = await store_1.store.findBoardById(boardId);
            if (!board) {
                ws.close(4004, 'Board not found');
                return;
            }
            if (!ctx.userId) {
                ws.close(4003, 'Auth required');
                return;
            }
            const hasAccess = board.accessList.some((a) => a.userId === ctx.userId && a.canEdit);
            if (!hasAccess) {
                ws.close(4003, 'No access');
                return;
            }
            ctx.boardId = boardId;
            ctx.canEdit = true;
            const initial = {
                type: 'full_state',
                boardId: board.id,
                canvasWidth: board.canvasWidth,
                canvasHeight: board.canvasHeight,
                objects: board.objects,
                locks: board.locks,
            };
            ws.send(JSON.stringify(initial));
        }
        else if (hash) {
            const board = await store_1.store.findBoardByHash(hash);
            if (!board || !board.isPublic) {
                ws.close(4004, 'Public board not found');
                return;
            }
            ctx.boardHash = hash;
            ctx.canEdit = false;
            const initial = {
                type: 'full_state',
                boardId: board.id,
                canvasWidth: board.canvasWidth,
                canvasHeight: board.canvasHeight,
                objects: board.objects,
                locks: board.locks,
            };
            ws.send(JSON.stringify(initial));
        }
        else {
            ws.close(4000, 'boardId or hash required');
            return;
        }
        ws.context = ctx;
        ws.on('message', async (data) => {
            if (!ws.context)
                return;
            const ctx = ws.context;
            let event;
            try {
                event = JSON.parse(data.toString());
            }
            catch (e) {
                return;
            }
            const board = (ctx.boardId && (await store_1.store.findBoardById(ctx.boardId))) ||
                (ctx.boardHash && (await store_1.store.findBoardByHash(ctx.boardHash))) ||
                undefined;
            if (!board)
                return;
            if (!ctx.canEdit) {
                // гости и пользователи без прав редактирования только слушают
                return;
            }
            let outgoing = null;
            switch (event.type) {
                case 'focus_object': {
                    if (!ctx.userId || !ctx.userName)
                        return;
                    const lock = await store_1.store.lockObject(board.id, event.objectId, {
                        id: ctx.userId,
                        email: '',
                        name: ctx.userName,
                        passwordHash: '',
                    });
                    if (!lock)
                        return;
                    outgoing = {
                        type: 'focus_object',
                        objectId: lock.objectId,
                    };
                    break;
                }
                case 'blur_object': {
                    if (!ctx.userId)
                        return;
                    const ok = await store_1.store.unlockObject(board.id, event.objectId, ctx.userId);
                    if (!ok)
                        return;
                    outgoing = {
                        type: 'blur_object',
                        objectId: event.objectId,
                    };
                    break;
                }
                case 'update_object':
                case 'add_object': {
                    if (!ctx.userId)
                        return;
                    await store_1.store.upsertObject(board.id, event.object);
                    outgoing = {
                        type: event.type,
                        object: event.object,
                    };
                    break;
                }
                case 'delete_object': {
                    if (!ctx.userId)
                        return;
                    await store_1.store.deleteObject(board.id, event.objectId);
                    outgoing = {
                        type: 'delete_object',
                        objectId: event.objectId,
                    };
                    break;
                }
                default:
                    break;
            }
            if (outgoing) {
                // рассылаем всем клиентам, подключенным к этой доске (по id или hash)
                wss.clients.forEach((client) => {
                    const c = client;
                    if (c.readyState === ws_1.WebSocket.OPEN &&
                        c.context &&
                        ((ctx.boardId && c.context.boardId === ctx.boardId) ||
                            (ctx.boardHash && c.context.boardHash === ctx.boardHash))) {
                        c.send(JSON.stringify(outgoing));
                    }
                });
            }
        });
    });
    return wss;
}
