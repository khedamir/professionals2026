import express, { Request, Response } from 'express';
import { authMiddleware, register, login } from './auth';
import { store } from './store';
import { Board } from './types';

export const router = express.Router();

// Healthcheck
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Auth
router.post('/auth/register', register);
router.post('/auth/login', login);

// Boards (auth required)
router.use(authMiddleware);

router.get('/boards', async (req: Request, res: Response) => {
  const user = req.user!;
  const boards = await store.listBoardsForUser(user.id);
  res.json(
    boards.map((b) => ({
      id: b.id,
      title: b.title,
      ownerId: b.ownerId,
      isPublic: b.isPublic,
      publicHash: b.publicHash,
      likesCount: b.likes.length,
      updatedAt: b.updatedAt,
    })),
  );
});

router.post('/boards', async (req: Request, res: Response) => {
  const user = req.user!;
  const { title } = req.body as { title?: string };
  if (!title || !title.trim()) {
    return res.status(400).json({ errors: { title: 'Название обязательно' } });
  }
  const board = await store.createBoard(user.id, title.trim());
  res.status(201).json(board);
});

router.post('/boards/:id/share', async (req: Request, res: Response) => {
  const user = req.user!;
  const { email } = req.body as { email?: string };
  const boardId = req.params.id;

  const board = await store.findBoardById(boardId);
  if (!board) return res.status(404).json({ error: 'Доска не найдена' });
  if (board.ownerId !== user.id) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  if (!email) {
    return res
      .status(400)
      .json({ errors: { email: 'Email обязателен' } });
  }

  const targetUser = await store.findUserByEmail(email);
  if (!targetUser) {
    return res
      .status(400)
      .json({ errors: { email: 'Пользователь с таким email не найден' } });
  }

  const updated = await store.addBoardAccess(boardId, targetUser.id, true);
  res.json(updated);
});

router.post('/boards/:id/public', async (req: Request, res: Response) => {
  const user = req.user!;
  const boardId = req.params.id;
  const board = await store.findBoardById(boardId);
  if (!board) return res.status(404).json({ error: 'Доска не найдена' });
  if (board.ownerId !== user.id) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const updated = await store.makeBoardPublic(boardId);
  if (!updated) {
    return res.status(500).json({ error: 'Не удалось обновить доску' });
  }
  res.json({
    id: updated.id,
    isPublic: updated.isPublic,
    publicHash: updated.publicHash,
  });
});

router.post('/boards/:id/like', async (req: Request, res: Response) => {
  const user = req.user!;
  const boardId = req.params.id;
  const board = await store.findBoardById(boardId);
  if (!board) return res.status(404).json({ error: 'Доска не найдена' });
  if (!board.isPublic) {
    return res
      .status(400)
      .json({ error: 'Лайки доступны только для публичных досок' });
  }
  const updated = await store.likeBoard(boardId, user.id);
  if (!updated) {
    return res.status(500).json({ error: 'Не удалось сохранить лайк' });
  }
  res.json({ likesCount: updated.likes.length });
});

router.get('/boards/public', async (req: Request, res: Response) => {
  const { orderByLikes } = req.query as { orderByLikes?: string };
  const boards = await store.listPublicBoards(orderByLikes === 'desc');
  const result = boards.map((b: Board) => ({
    id: b.id,
    title: b.title,
    ownerId: b.ownerId,
    publicHash: b.publicHash,
    likesCount: b.likes.length,
    updatedAt: b.updatedAt,
  }));
  res.json(result);
});

router.get('/boards/:id/state', async (req: Request, res: Response) => {
  const user = req.user!;
  const boardId = req.params.id;
  const board = await store.findBoardById(boardId);
  if (!board) return res.status(404).json({ error: 'Доска не найдена' });
  const hasAccess = board.accessList.some(
    (a) => a.userId === user.id && a.canEdit,
  );
  if (!hasAccess) return res.status(403).json({ error: 'Нет доступа' });
  res.json({
    id: board.id,
    canvasWidth: board.canvasWidth,
    canvasHeight: board.canvasHeight,
    objects: board.objects,
    locks: board.locks,
  });
});

// Публичный доступ к доске по hash (без авторизации)
router.get('/board_hash/:hash', async (req: Request, res: Response) => {
  const hash = req.params.hash;
  const board = await store.findBoardByHash(hash);
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

