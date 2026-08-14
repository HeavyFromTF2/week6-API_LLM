const { createApp } = require("./app");

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`todo-ai-categorizer listening on port ${PORT}`);
    console.log(`LLM_ENABLED=${process.env.LLM_ENABLED ?? "true"} LLM_STUB=${process.env.LLM_STUB ?? "0"}`);
  });
}

module.exports = { createApp };
