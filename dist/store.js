"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = exports.CANVAS_HEIGHT = exports.CANVAS_WIDTH = void 0;
const uuid_1 = require("uuid");
const db_1 = require("./db");
exports.CANVAS_WIDTH = 1600;
exports.CANVAS_HEIGHT = 900;
class PgStore {
    /** ---------- Пользователи ---------- */
    async createUser(email, name, passwordHash) {
        const id = (0, uuid_1.v4)();
        await db_1.pool.query(`INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)`, [id, email, name, passwordHash]);
        return { id, email, name, passwordHash };
    }
    async findUserByEmail(email) {
        const result = await db_1.pool.query(`SELECT id, email, name, password_hash
       FROM users
       WHERE lower(email) = lower($1)`, [email]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            passwordHash: row.password_hash,
        };
    }
    async findUserById(id) {
        const result = await db_1.pool.query(`SELECT id, email, name, password_hash
       FROM users
       WHERE id = $1`, [id]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            passwordHash: row.password_hash,
        };
    }
    /** ---------- Доски ---------- */
    async buildBoard(row) {
        const boardId = row.id;
        const [accessRes, likesRes, locksRes, objectsRes] = await Promise.all([
            db_1.pool.query(`SELECT board_id, user_id, can_edit
         FROM board_access
         WHERE board_id = $1`, [boardId]),
            db_1.pool.query(`SELECT board_id, user_id, created_at
         FROM board_likes
         WHERE board_id = $1`, [boardId]),
            db_1.pool.query(`SELECT board_id, object_id, user_id, user_name, locked_at
         FROM board_locks
         WHERE board_id = $1`, [boardId]),
            db_1.pool.query(`SELECT id, board_id, type, x, y, rotation, width, height, text, url, color
         FROM board_objects
         WHERE board_id = $1`, [boardId]),
        ]);
        const accessList = accessRes.rows.map((r) => ({
            userId: r.user_id,
            canEdit: !!r.can_edit,
        }));
        const likes = likesRes.rows.map((r) => ({
            userId: r.user_id,
            createdAt: new Date(r.created_at),
        }));
        const locks = locksRes.rows.map((r) => ({
            objectId: r.object_id,
            userId: r.user_id,
            userName: r.user_name,
            lockedAt: new Date(r.locked_at),
        }));
        const objects = objectsRes.rows.map((r) => {
            const base = {
                id: r.id,
                type: r.type,
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
            };
        });
        const board = {
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
    async createBoard(ownerId, title) {
        const id = (0, uuid_1.v4)();
        const now = new Date();
        await db_1.pool.query(`INSERT INTO boards
         (id, title, owner_id, is_public, public_hash, created_at, updated_at, canvas_width, canvas_height)
       VALUES ($1, $2, $3, false, NULL, $4, $4, $5, $6)`, [id, title, ownerId, now.toISOString(), exports.CANVAS_WIDTH, exports.CANVAS_HEIGHT]);
        await db_1.pool.query(`INSERT INTO board_access (board_id, user_id, can_edit)
       VALUES ($1, $2, true)`, [id, ownerId]);
        const result = await db_1.pool.query(`SELECT *
       FROM boards
       WHERE id = $1`, [id]);
        return this.buildBoard(result.rows[0]);
    }
    async findBoardById(boardId) {
        const result = await db_1.pool.query(`SELECT *
       FROM boards
       WHERE id = $1`, [boardId]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return this.buildBoard(row);
    }
    async findBoardByHash(hash) {
        const result = await db_1.pool.query(`SELECT *
       FROM boards
       WHERE public_hash = $1 AND is_public = true`, [hash]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return this.buildBoard(row);
    }
    async listBoardsForUser(userId) {
        const result = await db_1.pool.query(`SELECT board_id
       FROM board_access
       WHERE user_id = $1 AND can_edit = true`, [userId]);
        const boards = [];
        for (const r of result.rows) {
            const b = await this.findBoardById(r.board_id);
            if (b)
                boards.push(b);
        }
        return boards;
    }
    async makeBoardPublic(boardId) {
        const existing = await db_1.pool.query(`SELECT id, public_hash
       FROM boards
       WHERE id = $1`, [boardId]);
        const row = existing.rows[0];
        if (!row)
            return undefined;
        let hash = row.public_hash;
        if (!hash) {
            hash = (0, uuid_1.v4)().replace(/-/g, '');
        }
        const now = new Date();
        await db_1.pool.query(`UPDATE boards
       SET is_public = true,
           public_hash = $1,
           updated_at = $2
       WHERE id = $3`, [hash, now.toISOString(), boardId]);
        return this.findBoardById(boardId);
    }
    async addBoardAccess(boardId, userId, canEdit) {
        const now = new Date();
        await db_1.pool.query(`INSERT INTO board_access (board_id, user_id, can_edit)
       VALUES ($1, $2, $3)
       ON CONFLICT (board_id, user_id)
       DO UPDATE SET can_edit = EXCLUDED.can_edit`, [boardId, userId, canEdit]);
        await db_1.pool.query(`UPDATE boards
       SET updated_at = $1
       WHERE id = $2`, [now.toISOString(), boardId]);
        return this.findBoardById(boardId);
    }
    async likeBoard(boardId, userId) {
        const now = new Date();
        await db_1.pool.query(`INSERT INTO board_likes (board_id, user_id, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (board_id, user_id) DO NOTHING`, [boardId, userId, now.toISOString()]);
        await db_1.pool.query(`UPDATE boards
       SET updated_at = $1
       WHERE id = $2`, [now.toISOString(), boardId]);
        return this.findBoardById(boardId);
    }
    async listPublicBoards(orderByLikesDesc) {
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
        }
        else {
            query += 'ORDER BY b.updated_at DESC';
        }
        const result = await db_1.pool.query(query);
        const boards = [];
        for (const r of result.rows) {
            const b = await this.findBoardById(r.id);
            if (b)
                boards.push(b);
        }
        return boards;
    }
    /** ---------- Объекты на холсте ---------- */
    async getBoardObjects(boardId) {
        const res = await db_1.pool.query(`SELECT id, board_id, type, x, y, rotation, width, height, text, url, color
       FROM board_objects
       WHERE board_id = $1`, [boardId]);
        return res.rows.map((r) => {
            const base = {
                id: r.id,
                type: r.type,
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
            };
        });
    }
    async upsertObject(boardId, object) {
        const boardRes = await db_1.pool.query(`SELECT canvas_width, canvas_height
       FROM boards
       WHERE id = $1`, [boardId]);
        const boardRow = boardRes.rows[0];
        if (!boardRow)
            return undefined;
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
        await db_1.pool.query(`INSERT INTO board_objects
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
         color = EXCLUDED.color`, [
            object.id,
            boardId,
            object.type,
            object.x,
            object.y,
            object.rotation,
            object.width,
            object.height,
            object.text || null,
            object.url || null,
            object.color || null,
        ]);
        await db_1.pool.query(`UPDATE boards
       SET updated_at = $1
       WHERE id = $2`, [now.toISOString(), boardId]);
        return object;
    }
    async deleteObject(boardId, objectId) {
        const now = new Date();
        const res = await db_1.pool.query(`DELETE FROM board_objects
       WHERE board_id = $1 AND id = $2`, [boardId, objectId]);
        if ((res.rowCount ?? 0) > 0) {
            await db_1.pool.query(`UPDATE boards
         SET updated_at = $1
         WHERE id = $2`, [now.toISOString(), boardId]);
            return true;
        }
        return false;
    }
    async lockObject(boardId, objectId, user) {
        const now = new Date();
        const res = await db_1.pool.query(`INSERT INTO board_locks (board_id, object_id, user_id, user_name, locked_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (board_id, object_id) DO NOTHING
       RETURNING board_id, object_id, user_id, user_name, locked_at`, [boardId, objectId, user.id, user.name, now.toISOString()]);
        const row = res.rows[0];
        if (!row)
            return undefined;
        await db_1.pool.query(`UPDATE boards
       SET updated_at = $1
       WHERE id = $2`, [now.toISOString(), boardId]);
        return {
            objectId: row.object_id,
            userId: row.user_id,
            userName: row.user_name,
            lockedAt: new Date(row.locked_at),
        };
    }
    async unlockObject(boardId, objectId, userId) {
        const now = new Date();
        const res = await db_1.pool.query(`DELETE FROM board_locks
       WHERE board_id = $1 AND object_id = $2 AND user_id = $3`, [boardId, objectId, userId]);
        if ((res.rowCount ?? 0) > 0) {
            await db_1.pool.query(`UPDATE boards
         SET updated_at = $1
         WHERE id = $2`, [now.toISOString(), boardId]);
            return true;
        }
        return false;
    }
}
exports.store = new PgStore();
