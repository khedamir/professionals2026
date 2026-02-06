import { v4 as uuidv4 } from 'uuid';
import { pool } from './db';
import {
  Board,
  BoardId,
  BoardObject,
  BoardObjectType,
  BoardHash,
  ObjectLock,
  ShapeObject,
  User,
  UserId,
} from './types';

export const CANVAS_WIDTH = 1600;
export const CANVAS_HEIGHT = 900;

class PgStore {
  /** ---------- Пользователи ---------- */

  async createUser(email: string, name: string, passwordHash: string): Promise<User> {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [id, email, name, passwordHash],
    );
    return { id, email, name, passwordHash };
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const result = await pool.query(
      `SELECT id, email, name, password_hash
       FROM users
       WHERE lower(email) = lower($1)`,
      [email],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
    };
  }

  async findUserById(id: UserId): Promise<User | undefined> {
    const result = await pool.query(
      `SELECT id, email, name, password_hash
       FROM users
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
    };
  }

  /** ---------- Доски ---------- */

  private async buildBoard(row: any): Promise<Board> {
    const boardId: BoardId = row.id;

    const [accessRes, likesRes, locksRes, objectsRes] = await Promise.all([
      pool.query(
        `SELECT board_id, user_id, can_edit
         FROM board_access
         WHERE board_id = $1`,
        [boardId],
      ),
      pool.query(
        `SELECT board_id, user_id, created_at
         FROM board_likes
         WHERE board_id = $1`,
        [boardId],
      ),
      pool.query(
        `SELECT board_id, object_id, user_id, user_name, locked_at
         FROM board_locks
         WHERE board_id = $1`,
        [boardId],
      ),
      pool.query(
        `SELECT id, board_id, type, x, y, rotation, width, height, text, url, color
         FROM board_objects
         WHERE board_id = $1`,
        [boardId],
      ),
    ]);

    const accessList = accessRes.rows.map((r: any) => ({
      userId: r.user_id as UserId,
      canEdit: !!r.can_edit,
    }));

    const likes = likesRes.rows.map((r: any) => ({
      userId: r.user_id as UserId,
      createdAt: new Date(r.created_at),
    }));

    const locks: ObjectLock[] = locksRes.rows.map((r: any) => ({
      objectId: r.object_id,
      userId: r.user_id,
      userName: r.user_name,
      lockedAt: new Date(r.locked_at),
    }));

    const objects: BoardObject[] = objectsRes.rows.map((r: any) => {
      const base = {
        id: r.id,
        type: r.type as BoardObjectType,
        x: Number(r.x),
        y: Number(r.y),
        rotation: Number(r.rotation),
        width: Number(r.width),
        height: Number(r.height),
      };

      if (r.type === 'text') {
        return {
          ...base,
          type: 'text',
          text: r.text || '',
        };
      }
      if (r.type === 'image') {
        return {
          ...base,
          type: 'image',
          url: r.url || '',
        };
      }
      return {
        ...base,
        type: r.type,
        color: r.color || '#000000',
      } as ShapeObject;
    });

    const board: Board = {
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      isPublic: !!row.is_public,
      publicHash: row.public_hash || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      canvasWidth: Number(row.canvas_width),
      canvasHeight: Number(row.canvas_height),
      objects,
      accessList,
      likes,
      locks,
    };

    return board;
  }

  async createBoard(ownerId: UserId, title: string): Promise<Board> {
    const id = uuidv4();
    const now = new Date();

    await pool.query(
      `INSERT INTO boards
         (id, title, owner_id, is_public, public_hash, created_at, updated_at, canvas_width, canvas_height)
       VALUES ($1, $2, $3, false, NULL, $4, $4, $5, $6)`,
      [id, title, ownerId, now.toISOString(), CANVAS_WIDTH, CANVAS_HEIGHT],
    );

    await pool.query(
      `INSERT INTO board_access (board_id, user_id, can_edit)
       VALUES ($1, $2, true)`,
      [id, ownerId],
    );

    const result = await pool.query(
      `SELECT *
       FROM boards
       WHERE id = $1`,
      [id],
    );
    return this.buildBoard(result.rows[0]);
  }

  async findBoardById(boardId: BoardId): Promise<Board | undefined> {
    const result = await pool.query(
      `SELECT *
       FROM boards
       WHERE id = $1`,
      [boardId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return this.buildBoard(row);
  }

  async findBoardByHash(hash: BoardHash): Promise<Board | undefined> {
    const result = await pool.query(
      `SELECT *
       FROM boards
       WHERE public_hash = $1 AND is_public = true`,
      [hash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return this.buildBoard(row);
  }

  async listBoardsForUser(userId: UserId): Promise<Board[]> {
    const result = await pool.query(
      `SELECT board_id
       FROM board_access
       WHERE user_id = $1 AND can_edit = true`,
      [userId],
    );

    const boards: Board[] = [];
    for (const r of result.rows as any[]) {
      const b = await this.findBoardById(r.board_id);
      if (b) boards.push(b);
    }
    return boards;
  }

  async makeBoardPublic(boardId: BoardId): Promise<Board | undefined> {
    const existing = await pool.query(
      `SELECT id, public_hash
       FROM boards
       WHERE id = $1`,
      [boardId],
    );
    const row = existing.rows[0];
    if (!row) return undefined;

    let hash: string = row.public_hash;
    if (!hash) {
      hash = uuidv4().replace(/-/g, '');
    }
    const now = new Date();

    await pool.query(
      `UPDATE boards
       SET is_public = true,
           public_hash = $1,
           updated_at = $2
       WHERE id = $3`,
      [hash, now.toISOString(), boardId],
    );

    return this.findBoardById(boardId);
  }

  async addBoardAccess(
    boardId: BoardId,
    userId: UserId,
    canEdit: boolean,
  ): Promise<Board | undefined> {
    const now = new Date();
    await pool.query(
      `INSERT INTO board_access (board_id, user_id, can_edit)
       VALUES ($1, $2, $3)
       ON CONFLICT (board_id, user_id)
       DO UPDATE SET can_edit = EXCLUDED.can_edit`,
      [boardId, userId, canEdit],
    );
    await pool.query(
      `UPDATE boards
       SET updated_at = $1
       WHERE id = $2`,
      [now.toISOString(), boardId],
    );
    return this.findBoardById(boardId);
  }

  async likeBoard(boardId: BoardId, userId: UserId): Promise<Board | undefined> {
    const now = new Date();
    await pool.query(
      `INSERT INTO board_likes (board_id, user_id, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (board_id, user_id) DO NOTHING`,
      [boardId, userId, now.toISOString()],
    );
    await pool.query(
      `UPDATE boards
       SET updated_at = $1
       WHERE id = $2`,
      [now.toISOString(), boardId],
    );
    return this.findBoardById(boardId);
  }

  async listPublicBoards(orderByLikesDesc: boolean): Promise<Board[]> {
    let query = `
      SELECT b.id
      FROM boards b
      WHERE b.is_public = true
    `;
    if (orderByLikesDesc) {
      query += `
        ORDER BY (
          SELECT COUNT(*) FROM board_likes bl WHERE bl.board_id = b.id
        ) DESC, b.updated_at DESC
      `;
    } else {
      query += 'ORDER BY b.updated_at DESC';
    }

    const result = await pool.query(query);
    const boards: Board[] = [];
    for (const r of result.rows) {
      const b = await this.findBoardById(r.id);
      if (b) boards.push(b);
    }
    return boards;
  }

  /** ---------- Объекты на холсте ---------- */

  async getBoardObjects(boardId: BoardId): Promise<BoardObject[]> {
    const res = await pool.query(
      `SELECT id, board_id, type, x, y, rotation, width, height, text, url, color
       FROM board_objects
       WHERE board_id = $1`,
      [boardId],
    );
    return res.rows.map((r) => {
      const base = {
        id: r.id,
        type: r.type as BoardObjectType,
        x: Number(r.x),
        y: Number(r.y),
        rotation: Number(r.rotation),
        width: Number(r.width),
        height: Number(r.height),
      };
      if (r.type === 'text') {
        return { ...base, type: 'text', text: r.text || '' };
      }
      if (r.type === 'image') {
        return { ...base, type: 'image', url: r.url || '' };
      }
      return {
        ...base,
        type: r.type,
        color: r.color || '#000000',
      } as ShapeObject;
    });
  }

  async upsertObject(
    boardId: BoardId,
    object: BoardObject,
  ): Promise<BoardObject | undefined> {
    const boardRes = await pool.query(
      `SELECT canvas_width, canvas_height
       FROM boards
       WHERE id = $1`,
      [boardId],
    );
    const boardRow = boardRes.rows[0];
    if (!boardRow) return undefined;

    const canvasWidth = Number(boardRow.canvas_width);
    const canvasHeight = Number(boardRow.canvas_height);

    // Clamp to canvas bounds
    object.x = Math.max(0, Math.min(canvasWidth, object.x));
    object.y = Math.max(0, Math.min(canvasHeight, object.y));

    if (object.type === 'image') {
      if (object.x + object.width > canvasWidth) {
        object.width = canvasWidth - object.x;
      }
      if (object.y + object.height > canvasHeight) {
        object.height = canvasHeight - object.y;
      }
    }

    const now = new Date();

    await pool.query(
      `INSERT INTO board_objects
         (id, board_id, type, x, y, rotation, width, height, text, url, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id)
       DO UPDATE SET
         type = EXCLUDED.type,
         x = EXCLUDED.x,
         y = EXCLUDED.y,
         rotation = EXCLUDED.rotation,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         text = EXCLUDED.text,
         url = EXCLUDED.url,
         color = EXCLUDED.color`,
      [
        object.id,
        boardId,
        object.type,
        object.x,
        object.y,
        object.rotation,
        object.width,
        object.height,
        (object as any).text || null,
        (object as any).url || null,
        (object as any).color || null,
      ],
    );

    await pool.query(
      `UPDATE boards
       SET updated_at = $1
       WHERE id = $2`,
      [now.toISOString(), boardId],
    );

    return object;
  }

  async deleteObject(boardId: BoardId, objectId: string): Promise<boolean> {
    const now = new Date();
    const res = await pool.query(
      `DELETE FROM board_objects
       WHERE board_id = $1 AND id = $2`,
      [boardId, objectId],
    );

    if ((res.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE boards
         SET updated_at = $1
         WHERE id = $2`,
        [now.toISOString(), boardId],
      );
      return true;
    }
    return false;
  }

  async lockObject(
    boardId: BoardId,
    objectId: string,
    user: User,
  ): Promise<ObjectLock | undefined> {
    const now = new Date();
    const res = await pool.query(
      `INSERT INTO board_locks (board_id, object_id, user_id, user_name, locked_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (board_id, object_id) DO NOTHING
       RETURNING board_id, object_id, user_id, user_name, locked_at`,
      [boardId, objectId, user.id, user.name, now.toISOString()],
    );

    const row = res.rows[0];
    if (!row) return undefined;

    await pool.query(
      `UPDATE boards
       SET updated_at = $1
       WHERE id = $2`,
      [now.toISOString(), boardId],
    );

    return {
      objectId: row.object_id,
      userId: row.user_id,
      userName: row.user_name,
      lockedAt: new Date(row.locked_at),
    };
  }

  async unlockObject(
    boardId: BoardId,
    objectId: string,
    userId: UserId,
  ): Promise<boolean> {
    const now = new Date();
    const res = await pool.query(
      `DELETE FROM board_locks
       WHERE board_id = $1 AND object_id = $2 AND user_id = $3`,
      [boardId, objectId, userId],
    );

    if ((res.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE boards
         SET updated_at = $1
         WHERE id = $2`,
        [now.toISOString(), boardId],
      );
      return true;
    }
    return false;
  }
}

export const store = new PgStore();

