/**
 * Express application configuration module.
 * Sets up global middleware, OpenAPI documentation routes, and application endpoints.
 */

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protectedRoutes'); 
const llmRoutes = require('./routes/llmRoutes');

const app = express();

// Middleware to parse incoming request bodies as JSON
app.use(express.json());

// Load OpenAPI JSON file and mount Swagger UI documentation at /docs
const swaggerDocument = JSON.parse(fs.readFileSync('./src/docs/openapi.json', 'utf8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// GET / - Root endpoint returning basic API metadata
app.get('/', (req, res) => {    
  res.json({ name: "Task API", version: "1.0", endpoints: ["/tasks"] });
});

// GET /health - Healthcheck endpoint to verify if the server is running
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// Mount task-related routes under the /tasks prefix
app.use('/auth', authRoutes);
app.use('/protected', protectedRoutes);
app.use('/tasks', taskRoutes);
app.use('/llm', llmRoutes);


module.exports = app;