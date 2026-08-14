const express = require("express");
const tasksRouter = require("./routes/tasks");

function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api/tasks", tasksRouter);

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Centralized error handler. Ensures raw model text / stack traces never
  // leak to the client — only safe, typed error responses.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;

    if (status >= 500) {
      console.error("Unhandled error:", err);
    }

    const body = { error: err.message || "Internal server error" };
    if (err.details) body.details = err.details;

    res.status(status).json(body);
  });

  return app;
}

module.exports = { createApp };
