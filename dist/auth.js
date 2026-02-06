"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const store_1 = require("./store");
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
async function register(req, res) {
    const { email, name, password } = req.body;
    const errors = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Некорректный email';
    }
    if (!name || !/^[a-zA-Z]+$/.test(name)) {
        errors.name = 'Имя должно содержать только латинские буквы';
    }
    if (!password ||
        password.length < 8 ||
        !/[0-9]/.test(password) ||
        !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.password =
            'Пароль от 8 символов, с цифрами и спецсимволами';
    }
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
    }
    const emailStr = email;
    const nameStr = name;
    const passwordStr = password;
    const existing = await store_1.store.findUserByEmail(emailStr);
    if (existing) {
        return res
            .status(400)
            .json({ errors: { email: 'Пользователь с таким email уже существует' } });
    }
    const passwordHash = await bcryptjs_1.default.hash(passwordStr, 10);
    const user = await store_1.store.createUser(emailStr, nameStr, passwordHash);
    return res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name,
    });
}
async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        return res
            .status(400)
            .json({ errors: { common: 'Необходимо указать email и пароль' } });
    }
    const emailStr = email;
    const passwordStr = password;
    const user = await store_1.store.findUserByEmail(emailStr);
    if (!user) {
        return res
            .status(401)
            .json({ errors: { common: 'Неверный email или пароль' } });
    }
    const ok = await bcryptjs_1.default.compare(passwordStr, user.passwordHash);
    if (!ok) {
        return res
            .status(401)
            .json({ errors: { common: 'Неверный email или пароль' } });
    }
    const payload = {
        userId: user.id,
        email: user.email,
        name: user.name,
    };
    const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
}
async function authMiddleware(req, res, next) {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не указан' });
    }
    const token = authHeader.slice('Bearer '.length);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = await store_1.store.findUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        req.user = user;
        return next();
    }
    catch (e) {
        return res.status(401).json({ error: 'Невалидный токен' });
    }
}
