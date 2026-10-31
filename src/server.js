/* eslint-disable no-console */
'use strict';

const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Friendly seed data so the very first `curl /api/tasks` is not empty.
// (In-memory only — restarting the container resets it.)
const seedTasks = [
  { id: 1, title: 'Set up the Jenkins pipeline', done: true },
  { id: 2, title: 'Push the image to Docker Hub', done: false },
];

const app = createApp(seedTasks);

app.listen(PORT, HOST, () => {
  console.log(`task-api listening on http://${HOST}:${PORT}`);
});
