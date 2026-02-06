"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    // Для локальной разработки можно раскомментировать и подставить свою строку подключения
    // но для продакшна (Render) нужно использовать переменную окружения DATABASE_URL
    throw new Error('DATABASE_URL is not set');
}
exports.pool = new pg_1.Pool({
    connectionString,
});
