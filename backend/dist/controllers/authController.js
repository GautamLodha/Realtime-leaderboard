"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const register = async (req, res) => {
    const { name, email, password } = req.body;
    // check if user already exists
    const existing = await db_1.prisma.user.findUnique({ where: { email } });
    if (existing)
        return res.status(400).json({ error: 'Email already in use' });
    const hashed = await bcryptjs_1.default.hash(password, 10);
    const user = await db_1.prisma.user.create({
        data: { name, email, password: hashed }
    });
    res.status(201).json({ message: 'User created', userId: user.id });
};
exports.register = register;
const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await db_1.prisma.user.findUnique({ where: { email } });
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    const valid = await bcryptjs_1.default.compare(password, user.password);
    if (!valid)
        return res.status(401).json({ error: 'Wrong password' });
    const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, name: user.name });
};
exports.login = login;
