"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
});
exports.redis = redis;
console.log('❤️ Redis connection initialized');
exports.default = redis;
// import Redis from 'ioredis'
// const redis = new Redis({ host :  process.env.REDIS_URL as string,port: parseInt(process.env.REDIS_PORT || '6379'),maxRetriesPerRequest : null})
// redis.on('connect', () => console.log('Redis connected'))
// redis.on('error', (err) => console.error('Redis error:', err))
// export default redis
