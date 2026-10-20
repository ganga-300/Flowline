const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const { redisUrl } = require("./config");

const connection = new IORedis(redisUrl(), {
  maxRetriesPerRequest: null,
});

const zapExecutionQueue = new Queue("zap-execution", { connection });

module.exports = { zapExecutionQueue };
