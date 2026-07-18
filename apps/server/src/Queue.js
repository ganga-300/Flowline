import { Queue } from "bullmq";
import IORedis from "ioredis";

// setup the connection to Redis from IoRedis

const connection = new IORedis("redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const zapExecutionQueue = new Queue("zap-execution", {
  connection,
});