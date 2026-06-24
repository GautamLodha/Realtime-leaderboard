"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOnly = void 0;
const adminOnly = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ message: 'Not authenticated' });
        return;
    }
    if (req.user.role !== 'ADMIN') {
        res.status(403).json({ message: 'Access denied: Admins only' });
        return;
    }
    next();
};
exports.adminOnly = adminOnly;
