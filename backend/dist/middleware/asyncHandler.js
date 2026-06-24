"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
// Express 4 does not forward rejected async handlers automatically.
const asyncHandler = (handler) => (req, res, next) => {
    void handler(req, res, next).catch(next);
};
exports.asyncHandler = asyncHandler;
