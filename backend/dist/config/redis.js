"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis = process.env.REDIS_URL
    ? new ioredis_1.default(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    })
    : new ioredis_1.default({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
    });
exports.redis = redis;
exports.default = redis;
