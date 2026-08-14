const crypto = require("crypto");

// Simple in-memory store. Swap this for a real DB layer later without
// touching controllers/services — they only depend on this module's API.
let tasks = new Map();

function reset() {
  tasks = new Map();
}

function create({ originalText, title, category, priority, confidence, meta }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const task = {
    id,
    originalText,
    title,
    category,
    priority,
    confidence,
    meta: meta ?? {},
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(id, task);
  return task;
}

function findAll() {
  return Array.from(tasks.values());
}

function findById(id) {
  return tasks.get(id) ?? null;
}

function update(id, patch) {
  const existing = tasks.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  tasks.set(id, updated);
  return updated;
}

function remove(id) {
  return tasks.delete(id);
}

module.exports = { create, findAll, findById, update, remove, reset };
