require("dotenv").config();
const { checkEnv, allowedOrigins } = require("./config");
try {
  checkEnv("server");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const zapsRouter = require("./routes/zaps");
const authRouter = require("./routes/auth");
const webhooksRouter = require("./routes/webhooks");
const connectionsRouter = require("./routes/connections");
const testStepRouter = require("./routes/testStep");
const alertsRouter = require("./routes/alerts");
const optionsRouter = require("./routes/options");

const app = express();

// Only the Flowline frontend(s) in FRONTEND_URL may call the API from a browser.
// Requests without an Origin (webhooks, curl, health checks) aren't affected.
const origins = allowedOrigins();
app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)) }));
app.use(express.json());

app.use("/auth", authRouter);
app.use("/webhooks", webhooksRouter);
app.use("/zaps/test-step", testStepRouter);
app.use("/zaps", zapsRouter);
app.use("/connections", optionsRouter);
app.use("/connections", connectionsRouter);
app.use("/alerts", alertsRouter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});