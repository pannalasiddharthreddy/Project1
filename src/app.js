'use strict';

const express = require('express');

const MAX_TITLE_LENGTH = 120;

/**
 * Creates an Express app with an in-memory task store.
 *
 * The store is injectable so tests can start from a clean, known state.
 * Data lives only in process memory: it resets whenever the container
 * restarts, which is fine for a CI/CD demo API.
 *
 * @param {Array<{id: number, title: string, done: boolean}>} seedTasks initial tasks
 * @returns {import('express').Express}
 */
function createApp(seedTasks = []) {
  const tasks = [...seedTasks];
  let nextId = tasks.length > 0 ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;

  const app = express();
  app.use(express.json());

  // --- Liveness / readiness probe used by humans, Docker and Jenkins ---
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      timestamp: new Date().toISOString(),
    });
  });

  // --- List all tasks ---
  app.get('/api/tasks', (_req, res) => {
    res.status(200).json({ count: tasks.length, tasks });
  });

  // --- Create a task ---
  app.post('/api/tasks', (req, res) => {
    const title = validateTitle(req.body ? req.body.title : undefined);
    if (title instanceof Error) {
      return res.status(400).json({ error: title.message });
    }
    const task = {
      id: nextId++,
      title,
      done: false,
      createdAt: new Date().toISOString(),
    };
    tasks.push(task);
    return res.status(201).json(task);
  });

  // --- Get one task ---
  app.get('/api/tasks/:id', (req, res) => {
    const task = findTask(tasks, req.params.id);
    if (!task) {
      return res.status(404).json({ error: `task ${req.params.id} not found` });
    }
    return res.status(200).json(task);
  });

  // --- Update a task (partial) ---
  app.patch('/api/tasks/:id', (req, res) => {
    const task = findTask(tasks, req.params.id);
    if (!task) {
      return res.status(404).json({ error: `task ${req.params.id} not found` });
    }

    const body = req.body || {};
    const updates = {};

    if (body.title !== undefined) {
      const title = validateTitle(body.title);
      if (title instanceof Error) {
        return res.status(400).json({ error: title.message });
      }
      updates.title = title;
    }

    if (body.done !== undefined) {
      if (typeof body.done !== 'boolean') {
        return res.status(400).json({ error: 'done must be a boolean' });
      }
      updates.done = body.done;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'provide at least one updatable field: title or done' });
    }

    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    return res.status(200).json(task);
  });

  // --- Delete a task ---
  app.delete('/api/tasks/:id', (req, res) => {
    const index = tasks.findIndex((t) => t.id === toId(req.params.id));
    if (index === -1) {
      return res.status(404).json({ error: `task ${req.params.id} not found` });
    }
    tasks.splice(index, 1);
    return res.status(204).send();
  });

  // --- Unknown routes ---
  app.use((req, res) => {
    res.status(404).json({ error: `route ${req.method} ${req.path} not found` });
  });

  // --- Error handler (bad JSON bodies land here with a 4xx status) ---
  app.use((err, req, res, _next) => {
    if (res.headersSent) {
      return;
    }
    const status = err.status || err.statusCode || 500;
    const message = status < 500 ? err.message : 'Internal server error';
    res.status(status).json({ error: message });
  });

  return app;
}

/** Parses a route param into a numeric id (NaN for garbage input). */
function toId(raw) {
  return Number(raw);
}

/** Finds a task by raw route param. */
function findTask(tasks, rawId) {
  const id = toId(rawId);
  return tasks.find((t) => t.id === id);
}

/** Returns a trimmed title or an Error describing why it is invalid. */
function validateTitle(title) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return new Error('title is required and must be a non-empty string');
  }
  const trimmed = title.trim();
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return new Error(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  return trimmed;
}

module.exports = { createApp, MAX_TITLE_LENGTH };
