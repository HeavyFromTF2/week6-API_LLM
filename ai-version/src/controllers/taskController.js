const { categorizeInputSchema, manualUpdateSchema } = require("../schemas/taskSchema");
const { categorizeTask } = require("../services/categorizeService");
const store = require("../store/taskStore");
const { InputValidationError, NotFoundError } = require("../utils/errors");

/** POST /api/tasks — takes raw messy text, categorizes it via AI, stores the result. */
async function createTask(req, res, next) {
  try {
    const parsed = categorizeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputValidationError(
        "Invalid input",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      );
    }

    const { text } = parsed.data;
    const result = await categorizeTask(text); // may throw QuarantineError -> handled by error middleware

    const task = store.create({
      originalText: text,
      title: result.title,
      category: result.category,
      priority: result.priority,
      confidence: result.confidence,
      meta: result.meta,
    });

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
}

/** GET /api/tasks */
function listTasks(req, res) {
  res.status(200).json(store.findAll());
}

/** GET /api/tasks/:id */
function getTask(req, res, next) {
  try {
    const task = store.findById(req.params.id);
    if (!task) throw new NotFoundError(`Task ${req.params.id} not found`);
    res.status(200).json(task);
  } catch (err) {
    next(err);
  }
}

/** PUT /api/tasks/:id — manual edit (no AI call), validated with Zod. */
function updateTask(req, res, next) {
  try {
    const existing = store.findById(req.params.id);
    if (!existing) throw new NotFoundError(`Task ${req.params.id} not found`);

    const parsed = manualUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputValidationError(
        "Invalid input",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      );
    }

    const updated = store.update(req.params.id, parsed.data);
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/tasks/:id */
function deleteTask(req, res, next) {
  try {
    const existed = store.findById(req.params.id);
    if (!existed) throw new NotFoundError(`Task ${req.params.id} not found`);
    store.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { createTask, listTasks, getTask, updateTask, deleteTask };
