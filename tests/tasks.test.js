'use strict';

const request = require('supertest');
const { createApp, MAX_TITLE_LENGTH } = require('../src/app');

describe('task API', () => {
  let app;

  beforeEach(() => {
    app = createApp(); // fresh app, empty store for every test
  });

  describe('GET /api/tasks', () => {
    it('starts empty', async () => {
      const res = await request(app).get('/api/tasks');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.tasks).toEqual([]);
    });

    it('lists created tasks', async () => {
      await request(app).post('/api/tasks').send({ title: 'Buy milk' });
      await request(app).post('/api/tasks').send({ title: 'Ship v1' });

      const res = await request(app).get('/api/tasks');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.tasks.map((t) => t.title)).toEqual(['Buy milk', 'Ship v1']);
    });
  });

  describe('POST /api/tasks', () => {
    it('creates a task with defaults and increments ids', async () => {
      const res = await request(app).post('/api/tasks').send({ title: '  Write docs  ' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 1, title: 'Write docs', done: false });
      expect(res.body.createdAt).toBeDefined();

      const second = await request(app).post('/api/tasks').send({ title: 'Second' });
      expect(second.body.id).toBe(2);
    });

    it.each([
      ['missing title', {}],
      ['non-string title', { title: 42 }],
      ['whitespace-only title', { title: '   ' }],
    ])('rejects %s with 400', async (_label, payload) => {
      const res = await request(app).post('/api/tasks').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('title is required and must be a non-empty string');
    });

    it('rejects titles longer than 120 characters', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(`title must be at most ${MAX_TITLE_LENGTH} characters`);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns the task when it exists', async () => {
      const created = await request(app).post('/api/tasks').send({ title: 'Find me' });

      const res = await request(app).get(`/api/tasks/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Find me');
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).get('/api/tasks/999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('task 999 not found');
    });

    it('returns 404 for a non-numeric id', async () => {
      const res = await request(app).get('/api/tasks/abc');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('task abc not found');
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('updates done and/or title', async () => {
      const created = await request(app).post('/api/tasks').send({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/tasks/${created.body.id}`)
        .send({ done: true });

      expect(res.status).toBe(200);
      expect(res.body.done).toBe(true);
      expect(res.body.updatedAt).toBeDefined();

      const retitled = await request(app)
        .patch(`/api/tasks/${created.body.id}`)
        .send({ title: 'Renamed' });
      expect(retitled.body.title).toBe('Renamed');
    });

    it('rejects a non-boolean done', async () => {
      const created = await request(app).post('/api/tasks').send({ title: 'Keep' });

      const res = await request(app)
        .patch(`/api/tasks/${created.body.id}`)
        .send({ done: 'yes' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('done must be a boolean');
    });

    it('rejects an invalid title', async () => {
      const created = await request(app).post('/api/tasks').send({ title: 'Keep' });

      const res = await request(app)
        .patch(`/api/tasks/${created.body.id}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('title is required and must be a non-empty string');
    });

    it('rejects an empty patch body', async () => {
      const created = await request(app).post('/api/tasks').send({ title: 'Keep' });

      const res = await request(app).patch(`/api/tasks/${created.body.id}`).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('provide at least one updatable field: title or done');
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).patch('/api/tasks/999').send({ done: true });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('deletes a task and returns 204', async () => {
      const created = await request(app).post('/api/tasks').send({ title: 'Delete me' });

      const res = await request(app).delete(`/api/tasks/${created.body.id}`);
      expect(res.status).toBe(204);

      const gone = await request(app).get(`/api/tasks/${created.body.id}`);
      expect(gone.status).toBe(404);
    });

    it('returns 404 when deleting a task twice', async () => {
      const created = await request(app).post('/api/tasks').send({ title: 'Once' });

      await request(app).delete(`/api/tasks/${created.body.id}`);
      const res = await request(app).delete(`/api/tasks/${created.body.id}`);

      expect(res.status).toBe(404);
    });
  });

  describe('seed data', () => {
    it('continues ids after the highest seeded id', async () => {
      const seeded = createApp([{ id: 7, title: 'Seeded', done: false }]);

      const res = await request(seeded).post('/api/tasks').send({ title: 'Next' });

      expect(res.body.id).toBe(8);
    });
  });
});
