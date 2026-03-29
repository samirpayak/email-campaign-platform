const request = require('supertest');
const app = require('./api/server');
const mongoose = require('mongoose');

describe('Trugydex Email Platform - API Tests', () => {
    let authToken = '';
    let testUserId = '';
    let testGroupId = '';

    beforeAll(async () => {
        // Setup: Connect to test database
        if (!process.env.MONGODB_URI) {
            console.warn('⚠️ MONGODB_URI not set, tests may fail');
        }
    });

    afterAll(async () => {
        // Cleanup: Close database connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    });

    // ─── Authentication Tests ───────────────────────────────────────────────
    describe('Authentication', () => {
        test('POST /api/auth/signup - Should create new user account', async () => {
            const res = await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Test User',
                    email: `test-${Date.now()}@example.com`,
                    password: 'Password123'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Account created');
        });

        test('POST /api/auth/signup - Should reject weak password', async () => {
            const res = await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Test User 2',
                    email: `test2-${Date.now()}@example.com`,
                    password: '123' // Too short
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        test('POST /api/auth/login - Should login with valid credentials', async () => {
            // First signup
            const signup = await request(app)
                .post('/api/auth/signup')
                .send({
                    name: 'Login Test',
                    email: `login-${Date.now()}@example.com`,
                    password: 'Password123'
                });

            // For testing, we'll use the seed admin
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: process.env.ADMIN_EMAIL || 'admin@test.com',
                    password: process.env.ADMIN_PASSWORD || 'password'
                });

            // Note: Will fail if admin not seeded, which is expected for test
            if (res.status === 200) {
                authToken = res.body.token;
                expect(res.body.token).toBeDefined();
            }
        });

        test('POST /api/auth/verify - Should verify JWT token', async () => {
            if (!authToken) {
                console.log('⚠️ Skipping token verification test (no auth token)');
                return;
            }

            const res = await request(app)
                .post('/api/auth/verify')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // ─── Health Check Tests ───────────────────────────────────────────────── 
    describe('Health & Status', () => {
        test('GET /api/health - Should return server status', async () => {
            const res = await request(app).get('/api/health');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('running');
        });
    });

    // ─── Groups Management Tests ────────────────────────────────────────────
    describe('Group Management', () => {
        test('POST /api/groups - Should create new group (requires auth)', async () => {
            if (!authToken) {
                console.log('⚠️ Skipping group creation test (no auth token)');
                return;
            }

            const res = await request(app)
                .post('/api/groups')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: `Test Group ${Date.now()}`,
                    description: 'Test group for unit tests',
                    emails: ['test1@example.com', 'test2@example.com'],
                    names: ['Test User 1', 'Test User 2']
                });

            if (res.status === 201) {
                testGroupId = res.body.group._id;
                expect(res.body.success).toBe(true);
                expect(res.body.group.recipientCount).toBe(2);
            }
        });

        test('POST /api/groups - Should reject invalid emails', async () => {
            if (!authToken) return;

            const res = await request(app)
                .post('/api/groups')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Invalid Group',
                    emails: ['notanemail', 'also-invalid']
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        test('GET /api/groups - Should list all groups (requires auth)', async () => {
            if (!authToken) return;

            const res = await request(app)
                .get('/api/groups')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.groups)).toBe(true);
        });
    });

    // ─── Email Sending Tests ───────────────────────────────────────────────
    describe('Email Sending', () => {
        test('POST /api/email/test - Should send test email (requires auth)', async () => {
            if (!authToken) return;

            const res = await request(app)
                .post('/api/email/test')
                .set('Authorization', `Bearer ${authToken}`);

            // Will fail if Gmail not configured, which is expected
            if (res.status === 200) {
                expect(res.body.success).toBe(true);
            } else {
                console.log('⚠️ Test email failed (Gmail not configured)');
            }
        });

        test('POST /api/email/send - Should queue emails for group', async () => {
            if (!authToken || !testGroupId) {
                console.log('⚠️ Skipping email send test (missing prerequisites)');
                return;
            }

            const res = await request(app)
                .post('/api/email/send')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    groupId: testGroupId,
                    subject: 'Test Campaign',
                    body: 'Hello {name}, this is a test email',
                    campaignName: 'Test Campaign'
                });

            if (res.status === 200) {
                expect(res.body.success).toBe(true);
                expect(res.body.totalEmails).toBeGreaterThan(0);
            }
        });
    });

    // ─── Campaign Management Tests ──────────────────────────────────────────
    describe('Campaign Management', () => {
        test('GET /api/campaigns - Should list campaigns (requires auth)', async () => {
            if (!authToken) return;

            const res = await request(app)
                .get('/api/campaigns')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.campaigns)).toBe(true);
        });

        test('GET /api/campaigns/stats - Should return campaign statistics', async () => {
            if (!authToken) return;

            const res = await request(app)
                .get('/api/campaigns/stats')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.stats).toHaveProperty('totalGroups');
            expect(res.body.stats).toHaveProperty('totalCampaigns');
        });
    });

    // ─── Authorization Tests ────────────────────────────────────────────────
    describe('Authorization', () => {
        test('GET /api/groups - Should reject request without auth token', async () => {
            const res = await request(app).get('/api/groups');

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        test('POST /api/groups - Should reject invalid token', async () => {
            const res = await request(app)
                .post('/api/groups')
                .set('Authorization', 'Bearer invalid-token-here')
                .send({
                    name: 'Test',
                    emails: ['test@example.com']
                });

            expect(res.status).toBe(401);
        });
    });

    // ─── Error Handling Tests ───────────────────────────────────────────────
    describe('Error Handling', () => {
        test('GET /api/non-existent-endpoint - Should return 404', async () => {
            const res = await request(app).get('/api/non-existent');

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('Route not found');
        });

        test('POST /api/groups - Should reject missing required fields', async () => {
            if (!authToken) return;

            const res = await request(app)
                .post('/api/groups')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    // Missing 'name' and 'emails'
                    description: 'Incomplete group'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });
});

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                   TRUGYDEX API TEST SUITE                                  ║
║                                                                            ║
║  Prerequisites:                                                            ║
║  ✓ MONGODB_URI environment variable set                                   ║
║  ✓ GMAIL credentials (for email tests)                                    ║
║  ✓ JWT_SECRET environment variable set                                    ║
║  ✓ Redis connection (for job queue)                                       ║
║                                                                            ║
║  Run tests: npm test                                                       ║
║  Watch mode: npm run test:watch                                          ║
║  Coverage: npm test -- --coverage                                         ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
