require("dotenv").config();
const express = require("express");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/", (req, res) => {
  res.send("Hello World!");
});


app.post("/test-echo", (req, res) => {
  console.log("Test echo received:", req.body);
  res.json({ received: req.body, timestamp: new Date().toISOString() });
});


const webhooksRouter = require("./routes/webhooks");
app.use(express.json());
app.use("/webhooks", webhooksRouter);

app.listen(4000,()=>{
    console.log("Server is running on port 4000");
})