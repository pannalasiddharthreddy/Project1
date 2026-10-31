'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');

describe('error handling', () => {
  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(createApp())
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": "broken json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 404 with a JSON body for unknown routes', async () => {
    const res = await request(createApp()).get('/definitely/not/a/route');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('route GET /definitely/not/a/route not found');
  });
});
