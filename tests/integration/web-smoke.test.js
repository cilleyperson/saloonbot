/**
 * Web Smoke Tests (integration)
 *
 * Exercises the upgraded dependency surfaces through the real Express stack
 * (regression guard for the major bumps):
 *   - ejs 6      -> login view renders
 *   - express-rate-limit 8 -> standard RateLimit headers + 429 enforcement
 *   - express 5  -> routing, auth redirect
 *   - new GET /healthz liveness route
 *
 *   request ──▶ helmet ──▶ /healthz (early, pre-session) ──▶ 200
 *           └─▶ session/CSRF/rate-limit ──▶ /auth/login (ejs) ──▶ 200
 *                                        └─▶ /  (requireAuth) ──▶ 302
 */

const request = require('supertest');
const { createApp } = require('../../src/web/index');

describe('Web smoke (dependency upgrade regression)', () => {
  let app;
  beforeAll(() => {
    app = createApp();
  });

  describe('GET /healthz (liveness)', () => {
    it('returns 200 with ok status, no auth required', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('does not set a session cookie (mounted before session middleware)', async () => {
      const res = await request(app).get('/healthz');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('GET / (auth guard)', () => {
    it('redirects unauthenticated requests to login', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/auth\/login/);
    });
  });

  describe('GET /auth/login (ejs 6 render)', () => {
    it('renders the login page as HTML', async () => {
      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text.toLowerCase()).toContain('login');
    });

    it('emits express-rate-limit v8 standard RateLimit headers', async () => {
      const res = await request(app).get('/auth/login');
      // v8 with standardHeaders:true emits the draft RateLimit-* headers.
      const hasRateLimitHeader = Object.keys(res.headers).some((h) =>
        h.toLowerCase().startsWith('ratelimit')
      );
      expect(hasRateLimitHeader).toBe(true);
    });
  });

  describe('express-rate-limit v8 enforcement', () => {
    it('returns 429 once the global limit (100/15min) is exceeded', async () => {
      // Fresh app -> clean limiter counter for this test.
      const freshApp = createApp();
      let saw429 = false;
      // globalLimiter max is 100; the 101st request should be limited.
      for (let i = 0; i < 105 && !saw429; i++) {
        const res = await request(freshApp).get('/auth/login');
        if (res.status === 429) saw429 = true;
      }
      expect(saw429).toBe(true);
    });
  });
});
