-- Схема базы данных для интерактивных досок (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  public_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  canvas_width INT NOT NULL,
  canvas_height INT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_access (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE IF NOT EXISTS board_likes (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE IF NOT EXISTS board_objects (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'text' | 'image' | 'rect' | 'circle' | 'line'
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  rotation DOUBLE PRECISION NOT NULL,
  width DOUBLE PRECISION NOT NULL,
  height DOUBLE PRECISION NOT NULL,
  text TEXT,
  url TEXT,
  color TEXT
);

CREATE TABLE IF NOT EXISTS board_locks (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES board_objects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (board_id, object_id)
);

