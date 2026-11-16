const request = require('supertest');
const app = require('../src/app');
const { closeDatabase } = require('../src/database/connection');

describe('Health Check API', () => {
  afterAll(() => {
    closeDatabase();
  });

  it('GET /health deve responder com status 200 e informações de integridade', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('database', 'connected');
  });

  it('GET /rota-inexistente deve responder com status 404', async () => {
    const response = await request(app).get('/rota-inexistente');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('status', 'error');
    expect(response.body).toHaveProperty('message', 'Rota não encontrada');
  });
});
