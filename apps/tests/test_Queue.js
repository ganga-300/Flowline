import { zapExecutionQueue } from "../server/src/Queue.js";

zapExecutionQueue.add("test-job", { message: "hello queue" }).then(() => {
  console.log("Job added!");
  process.exit(0);
});