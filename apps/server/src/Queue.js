const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis("redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const zapExecutionQueue = new Queue("zap-execution", { connection });

module.exports = { zapExecutionQueue };
