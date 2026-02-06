import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Для локальной разработки можно раскомментировать и подставить свою строку подключения
  // но для продакшна (Render) нужно использовать переменную окружения DATABASE_URL
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString,
});

