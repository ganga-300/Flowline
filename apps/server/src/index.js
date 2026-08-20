require("dotenv").config();
const express = require("express");
const cors = require("cors");
const zapsRouter = require("./routes/zaps");
const authRouter = require("./routes/auth");
const webhooksRouter = require("./routes/webhooks");
const connectionsRouter = require("./routes/connections");

const app = express();

app.use(cors());
app.use(express.json());



app.use("/auth", authRouter);
app.use("/webhooks", webhooksRouter);
app.use("/zaps", zapsRouter);
app.use("/connections", connectionsRouter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/", (req, res) => {
  res.send("Hello World!");
});


app.post("/test-echo", (req, res) => {
  console.log("Test echo received:", req.body);
  res.json({ received: req.body, timestamp: new Date().toISOString() });
});




app.listen(4000,()=>{
    console.log("Server is running on port 4000");
})