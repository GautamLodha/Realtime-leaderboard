import IORedis from 'ioredis';


const redis = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, 
});

console.log('❤️ Redis connection initialized');
export default redis
export { redis }
// import Redis from 'ioredis'

// const redis = new Redis({ host :  process.env.REDIS_URL as string,port: parseInt(process.env.REDIS_PORT || '6379'),maxRetriesPerRequest : null})

// redis.on('connect', () => console.log('Redis connected'))
// redis.on('error', (err) => console.error('Redis error:', err))

// export default redis
