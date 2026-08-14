#!/usr/bin/env node
/**
 * Standalone checkpoint test runner — no test framework dependency.
 * Boots the real Express app in-process on an ephemeral port and exercises
 * it over HTTP using the global fetch (Node >= 18).
 *
 * Usage: node tests/run-checkpoints.js
 * All paths are resolved relative to this file (inside /ai-version).
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");
const QUARANTINE_FILE = path.join(PROJECT_ROOT, "logs", "quarantine.jsonl");
const PROMPT_FILE = path.join(PROJECT_ROOT, "prompts", "categorize-task-v1.md");
const SRC_DIR = path.join(PROJECT_ROOT, "src");

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

async function main() {
  // Default env for this run; individual checks override as needed.
  process.env.LLM_STUB = "1";
  process.env.LLM_ENABLED = "true";

  const { createApp } = require(path.join(SRC_DIR, "server.js"));
  const store = require(path.join(SRC_DIR, "store", "taskStore.js"));

  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  // Clean quarantine log before the quarantine checkpoint.
  if (fs.existsSync(QUARANTINE_FILE)) fs.unlinkSync(QUARANTINE_FILE);

  // -------------------------------------------------------------------
  // 1. Input validation rejects bad input with 400 BEFORE any AI call
  // -------------------------------------------------------------------
  await check("rejects empty text with 400", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  await check("rejects text over 500 chars with 400", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "a".repeat(501) }),
    });
    assert.equal(res.status, 400);
  });

  await check("rejects missing text field with 400", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  // -------------------------------------------------------------------
  // 2. Stub mode returns a valid, structured categorization
  // -------------------------------------------------------------------
  let createdTaskId;
  await check("LLM_STUB=1 categorizes and creates task (201)", async () => {
    process.env.LLM_STUB = "1";
    process.env.LLM_ENABLED = "true";
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "pay doctor bill 50$ urgent" }),
    });
    assert.equal(res.status, 201);
    const task = await res.json();
    assert.equal(task.category, "Finance");
    assert.equal(task.priority, "high");
    assert.ok(task.id);
    assert.equal(task.meta.source, "stub");
    createdTaskId = task.id;
  });

  // -------------------------------------------------------------------
  // 3. Kill switch: LLM_ENABLED=false -> safe deterministic fallback
  // -------------------------------------------------------------------
  await check("LLM_ENABLED=false falls back to Other/low without calling AI", async () => {
    process.env.LLM_ENABLED = "false";
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "pay doctor bill 50$ urgent" }),
    });
    assert.equal(res.status, 201);
    const task = await res.json();
    assert.equal(task.category, "Other");
    assert.equal(task.priority, "low");
    assert.equal(task.meta.source, "fallback");
    process.env.LLM_ENABLED = "true";
  });

  // -------------------------------------------------------------------
  // 4. Repair path: first AI response invalid, repair attempt succeeds
  // -------------------------------------------------------------------
  await check("invalid AI output triggers a single repair attempt that succeeds", async () => {
    process.env.LLM_STUB = "1";
    process.env.LLM_ENABLED = "true";
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "force_broken_once please fix me" }),
    });
    assert.equal(res.status, 201);
    const task = await res.json();
    assert.equal(task.meta.repaired, true);
    assert.equal(task.category, "Other");
    assert.equal(task.priority, "low");
  });

  // -------------------------------------------------------------------
  // 5. Quarantine path: both attempts invalid -> 422, never raw model text,
  //    and the failure is persisted to logs/quarantine.jsonl
  // -------------------------------------------------------------------
  await check("unrecoverable AI output returns 422 and never leaks raw model text", async () => {
    process.env.LLM_STUB = "1";
    process.env.LLM_ENABLED = "true";
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "force_broken_json please break" }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.error);
    // The raw broken model text must never appear in the client response.
    assert.ok(!JSON.stringify(body).includes("this is not valid json"));
  });

  await check("quarantined failure is persisted to logs/quarantine.jsonl", async () => {
    assert.ok(fs.existsSync(QUARANTINE_FILE), "quarantine.jsonl should exist");
    const lines = fs.readFileSync(QUARANTINE_FILE, "utf8").trim().split("\n");
    assert.ok(lines.length >= 1);
    const last = JSON.parse(lines[lines.length - 1]);
    assert.ok(last.input_text.includes("force_broken_json"));
    assert.ok(last.raw_first_attempt);
    assert.ok(last.validation_errors);
  });

  // -------------------------------------------------------------------
  // 6. Full CRUD lifecycle
  // -------------------------------------------------------------------
  let crudId;
  await check("CRUD: create", async () => {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "buy milk and eggs at the store" }),
    });
    assert.equal(res.status, 201);
    const task = await res.json();
    assert.equal(task.category, "Shopping");
    crudId = task.id;
  });

  await check("CRUD: list includes created task", async () => {
    const res = await fetch(`${base}/api/tasks`);
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(list.some((t) => t.id === crudId));
  });

  await check("CRUD: get by id", async () => {
    const res = await fetch(`${base}/api/tasks/${crudId}`);
    assert.equal(res.status, 200);
    const task = await res.json();
    assert.equal(task.id, crudId);
  });

  await check("CRUD: get unknown id returns 404", async () => {
    const res = await fetch(`${base}/api/tasks/00000000-0000-0000-0000-000000000000`);
    assert.equal(res.status, 404);
  });

  await check("CRUD: update (manual, no AI call)", async () => {
    const res = await fetch(`${base}/api/tasks/${crudId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "Personal", priority: "medium" }),
    });
    assert.equal(res.status, 200);
    const task = await res.json();
    assert.equal(task.category, "Personal");
    assert.equal(task.priority, "medium");
  });

  await check("CRUD: update rejects invalid category with 400", async () => {
    const res = await fetch(`${base}/api/tasks/${crudId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "NotARealCategory" }),
    });
    assert.equal(res.status, 400);
  });

  await check("CRUD: delete", async () => {
    const res = await fetch(`${base}/api/tasks/${crudId}`, { method: "DELETE" });
    assert.equal(res.status, 204);
  });

  await check("CRUD: get after delete returns 404", async () => {
    const res = await fetch(`${base}/api/tasks/${crudId}`);
    assert.equal(res.status, 404);
  });

  // -------------------------------------------------------------------
  // 7. Prompt isolation: prompt text lives only in prompts/*.md, never in JS
  // -------------------------------------------------------------------
  await check("prompt file exists and is loaded from prompts/ (not inlined in JS)", async () => {
    assert.ok(fs.existsSync(PROMPT_FILE), "prompts/categorize-task-v1.md must exist");
    const promptContent = fs.readFileSync(PROMPT_FILE, "utf8");
    assert.ok(promptContent.includes("Handling doubt"));

    const jsFiles = walkJsFiles(SRC_DIR);
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes("Handling doubt"),
        `Prompt text leaked into JS source: ${file}`
      );
    }
  });

  // -------------------------------------------------------------------
  // 8. Ensure originalId reference (createdTaskId) is still retrievable
  // -------------------------------------------------------------------
  await check("earlier stub-created task is still retrievable", async () => {
    const res = await fetch(`${base}/api/tasks/${createdTaskId}`);
    assert.equal(res.status, 200);
  });

  server.close();
  store.reset();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function walkJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

main();
