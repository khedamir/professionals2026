import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { store } from './store';
import { JwtPayload, User } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function register(req: Request, res: Response) {
  const { email, name, password } = req.body as {
    email?: string;
    name?: string;
    password?: string;
  };

  const errors: Record<string, string> = {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Некорректный email';
  }
  if (!name || !/^[a-zA-Z]+$/.test(name)) {
    errors.name = 'Имя должно содержать только латинские буквы';
  }
  if (
    !password ||
    password.length < 8 ||
    !/[0-9]/.test(password) ||
    !/[!@#$%^&*(),.?":{}|<>]/.test(password)
  ) {
    errors.password =
      'Пароль от 8 символов, с цифрами и спецсимволами';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const emailStr = email!;
  const nameStr = name!;
  const passwordStr = password!;

  const existing = await store.findUserByEmail(emailStr);
  if (existing) {
    return res
      .status(400)
      .json({ errors: { email: 'Пользователь с таким email уже существует' } });
  }

  const passwordHash = await bcrypt.hash(passwordStr, 10);
  const user = await store.createUser(emailStr, nameStr, passwordHash);

  return res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res
      .status(400)
      .json({ errors: { common: 'Необходимо указать email и пароль' } });
  }

  const emailStr = email!;
  const passwordStr = password!;

  const user = await store.findUserByEmail(emailStr);
  if (!user) {
    return res
      .status(401)
      .json({ errors: { common: 'Неверный email или пароль' } });
  }

  const ok = await bcrypt.compare(passwordStr, user.passwordHash);
  if (!ok) {
    return res
      .status(401)
      .json({ errors: { common: 'Неверный email или пароль' } });
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  return res.json({ token });
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Токен не указан' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await store.findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    req.user = user;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Невалидный токен' });
  }
}

