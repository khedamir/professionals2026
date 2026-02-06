"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const store_1 = require("./store");
exports.router = express_1.default.Router();
// Healthcheck
exports.router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// Auth
exports.router.post('/auth/register', auth_1.register);
exports.router.post('/auth/login', auth_1.login);
// Boards (auth required)
exports.router.use(auth_1.authMiddleware);
exports.router.get('/boards', async (req, res) => {
    const user = req.user;
    const boards = await store_1.store.listBoardsForUser(user.id);
    res.json(boards.map((b) => ({
        id: b.id,
        title: b.title,
        ownerId: b.ownerId,
        isPublic: b.isPublic,
        publicHash: b.publicHash,
        likesCount: b.likes.length,
        updatedAt: b.updatedAt,
    })));
});
exports.router.post('/boards', async (req, res) => {
    const user = req.user;
    const { title } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ errors: { title: 'Название обязательно' } });
    }
    const board = await store_1.store.createBoard(user.id, title.trim());
    res.status(201).json(board);
});
exports.router.post('/boards/:id/share', async (req, res) => {
    const user = req.user;
    const { email } = req.body;
    const boardId = req.params.id;
    const board = await store_1.store.findBoardById(boardId);
    if (!board)
        return res.status(404).json({ error: 'Доска не найдена' });
    if (board.ownerId !== user.id) {
        return res.status(403).json({ error: 'Недостаточно прав' });
    }
    if (!email) {
        return res
            .status(400)
            .json({ errors: { email: 'Email обязателен' } });
    }
    const targetUser = await store_1.store.findUserByEmail(email);
    if (!targetUser) {
        return res
            .status(400)
            .json({ errors: { email: 'Пользователь с таким email не найден' } });
    }
    const updated = await store_1.store.addBoardAccess(boardId, targetUser.id, true);
    res.json(updated);
});
exports.router.post('/boards/:id/public', async (req, res) => {
    const user = req.user;
    const boardId = req.params.id;
    const board = await store_1.store.findBoardById(boardId);
    if (!board)
        return res.status(404).json({ error: 'Доска не найдена' });
    if (board.ownerId !== user.id) {
        return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const updated = await store_1.store.makeBoardPublic(boardId);
    if (!updated) {
        return res.status(500).json({ error: 'Не удалось обновить доску' });
    }
    res.json({
        id: updated.id,
        isPublic: updated.isPublic,
        publicHash: updated.publicHash,
    });
});
exports.router.post('/boards/:id/like', async (req, res) => {
    const user = req.user;
    const boardId = req.params.id;
    const board = await store_1.store.findBoardById(boardId);
    if (!board)
        return res.status(404).json({ error: 'Доска не найдена' });
    if (!board.isPublic) {
        return res
            .status(400)
            .json({ error: 'Лайки доступны только для публичных досок' });
    }
    const updated = await store_1.store.likeBoard(boardId, user.id);
    if (!updated) {
        return res.status(500).json({ error: 'Не удалось сохранить лайк' });
    }
    res.json({ likesCount: updated.likes.length });
});
exports.router.get('/boards/public', async (req, res) => {
    const { orderByLikes } = req.query;
    const boards = await store_1.store.listPublicBoards(orderByLikes === 'desc');
    const result = boards.map((b) => ({
        id: b.id,
        title: b.title,
        ownerId: b.ownerId,
        publicHash: b.publicHash,
        likesCount: b.likes.length,
        updatedAt: b.updatedAt,
    }));
    res.json(result);
});
exports.router.get('/boards/:id/state', async (req, res) => {
    const user = req.user;
    const boardId = req.params.id;
    const board = await store_1.store.findBoardById(boardId);
    if (!board)
        return res.status(404).json({ error: 'Доска не найдена' });
    const hasAccess = board.accessList.some((a) => a.userId === user.id && a.canEdit);
    if (!hasAccess)
        return res.status(403).json({ error: 'Нет доступа' });
    res.json({
        id: board.id,
        canvasWidth: board.canvasWidth,
        canvasHeight: board.canvasHeight,
        objects: board.objects,
        locks: board.locks,
    });
});
// Публичный доступ к доске по hash (без авторизации)
exports.router.get('/board_hash/:hash', async (req, res) => {
    const hash = req.params.hash;
    const board = await store_1.store.findBoardByHash(hash);
    if (!board || !board.isPublic) {
        return res.status(404).json({ error: 'Публичная доска не найдена' });
    }
    res.json({
        id: board.id,
        hash: board.publicHash,
        title: board.title,
        canvasWidth: board.canvasWidth,
        canvasHeight: board.canvasHeight,
        objects: board.objects,
        locks: board.locks,
    });
});
