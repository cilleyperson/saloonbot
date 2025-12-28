# Stream Object Detection - Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the stream object detection feature. Testing must cover functionality, security, performance, and integration to ensure reliable operation.

---

## Testing Principles

1. **Test Early, Test Often**: Write tests alongside implementation, not after
2. **Automate Everything**: Manual tests should be rare exceptions
3. **Test at Multiple Levels**: Unit, integration, and end-to-end
4. **Security is Not Optional**: Security tests are as important as functional tests
5. **Performance Matters**: Include performance benchmarks in CI/CD
6. **Mocks Are Friends**: Use mocks to test edge cases that are hard to reproduce

---

## Test Categories

### 1. Unit Tests

Unit tests verify individual functions and classes in isolation.

**Coverage Target**: 80% minimum

#### Database Repository Tests

**File**: `tests/unit/object-detection-repo.test.js`

```javascript
describe('ObjectDetectionRepo', () => {
  let testDb;

  beforeEach(() => {
    // Create in-memory test database
    testDb = createTestDatabase();
    jest.mock('../../src/database/index', () => ({
      getDb: () => testDb
    }));
  });

  afterEach(() => {
    testDb.close();
  });

  describe('getConfig', () => {
    it('should return null for non-existent channel', () => {
      const config = repo.getConfig(999);
      expect(config).toBeNull();
    });

    it('should return config for existing channel', () => {
      // Setup
      testDb.prepare('INSERT INTO object_detection_configs ...').run();

      const config = repo.getConfig(1);

      expect(config).not.toBeNull();
      expect(config.channel_id).toBe(1);
    });

    it('should handle invalid channel ID gracefully', () => {
      expect(repo.getConfig(null)).toBeNull();
      expect(repo.getConfig('invalid')).toBeNull();
      expect(repo.getConfig(-1)).toBeNull();
    });
  });

  describe('createRule', () => {
    it('should create a valid rule', () => {
      const rule = repo.createRule(1, {
        object_class: 'cat',
        min_confidence: 0.5,
        message_template: 'Found a {object}!'
      });

      expect(rule.id).toBeDefined();
      expect(rule.object_class).toBe('cat');
    });

    it('should reject invalid object class', () => {
      expect(() => repo.createRule(1, {
        object_class: 'invalid_object',
        min_confidence: 0.5
      })).toThrow('Invalid object class');
    });

    it('should reject out-of-range confidence', () => {
      expect(() => repo.createRule(1, {
        object_class: 'cat',
        min_confidence: 1.5  // > 1.0
      })).toThrow('Confidence must be between 0 and 1');

      expect(() => repo.createRule(1, {
        object_class: 'cat',
        min_confidence: -0.1  // < 0
      })).toThrow('Confidence must be between 0 and 1');
    });

    it('should prevent SQL injection in object class', () => {
      expect(() => repo.createRule(1, {
        object_class: "'; DROP TABLE users; --",
        min_confidence: 0.5
      })).toThrow();
    });
  });

  describe('logDetection', () => {
    it('should log detection event', () => {
      const logId = repo.logDetection(1, 1, {
        object_class: 'dog',
        confidence: 0.87,
        message_sent: 'Found a dog!'
      });

      expect(logId).toBeDefined();

      const logs = repo.getRecentLogs(1, 10);
      expect(logs).toHaveLength(1);
      expect(logs[0].confidence).toBe(0.87);
    });

    it('should prune old logs correctly', () => {
      // Insert 100 old logs
      for (let i = 0; i < 100; i++) {
        repo.logDetection(1, 1, { object_class: 'cat', confidence: 0.5 });
      }

      const deleted = repo.pruneOldLogs(0); // Delete all
      expect(deleted).toBe(100);
    });
  });
});
```

#### YOLO Classes Tests

**File**: `tests/unit/yolo-classes.test.js`

```javascript
describe('YOLOClasses', () => {
  const yoloClasses = require('../../src/constants/yolo-classes');

  it('should define exactly 80 classes', () => {
    expect(yoloClasses.getAllClasses()).toHaveLength(80);
  });

  it('should map class names to correct IDs', () => {
    expect(yoloClasses.getClassId('person')).toBe(0);
    expect(yoloClasses.getClassId('cat')).toBe(15);
    expect(yoloClasses.getClassId('dog')).toBe(16);
    expect(yoloClasses.getClassId('toothbrush')).toBe(79);
  });

  it('should map class IDs to correct names', () => {
    expect(yoloClasses.getClassName(0)).toBe('person');
    expect(yoloClasses.getClassName(15)).toBe('cat');
    expect(yoloClasses.getClassName(79)).toBe('toothbrush');
  });

  it('should return null for invalid IDs', () => {
    expect(yoloClasses.getClassName(-1)).toBeNull();
    expect(yoloClasses.getClassName(80)).toBeNull();
    expect(yoloClasses.getClassName(null)).toBeNull();
  });

  it('should return null for invalid names', () => {
    expect(yoloClasses.getClassId('invalid')).toBeNull();
    expect(yoloClasses.getClassId('')).toBeNull();
    expect(yoloClasses.getClassId(null)).toBeNull();
  });

  it('should group classes by category', () => {
    const animals = yoloClasses.getClassesByCategory('animals');
    expect(animals).toContain('cat');
    expect(animals).toContain('dog');
    expect(animals).not.toContain('car');
  });
});
```

#### Detection Service Tests

**File**: `tests/unit/yolo-detection.test.js`

```javascript
describe('YOLODetector', () => {
  let detector;
  let mockModel;

  beforeEach(() => {
    mockModel = {
      run: jest.fn().mockResolvedValue({
        // Mock YOLO output tensor
        output0: { data: new Float32Array([...]) }
      })
    };

    jest.mock('onnxruntime-node', () => ({
      InferenceSession: {
        create: jest.fn().mockResolvedValue(mockModel)
      }
    }));

    detector = new YOLODetector('models/test.onnx');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should load model successfully', async () => {
      await detector.initialize();
      expect(detector.isInitialized()).toBe(true);
    });

    it('should handle missing model file', async () => {
      detector = new YOLODetector('models/nonexistent.onnx');
      await expect(detector.initialize()).rejects.toThrow();
    });
  });

  describe('detect', () => {
    beforeEach(async () => {
      await detector.initialize();
    });

    it('should detect objects in valid image', async () => {
      const imageBuffer = fs.readFileSync('tests/fixtures/cat.jpg');
      const results = await detector.detect(imageBuffer);

      expect(results.detections).toBeDefined();
      expect(Array.isArray(results.detections)).toBe(true);
    });

    it('should return inference time', async () => {
      const imageBuffer = fs.readFileSync('tests/fixtures/cat.jpg');
      const results = await detector.detect(imageBuffer);

      expect(results.inferenceTime).toBeDefined();
      expect(typeof results.inferenceTime).toBe('number');
      expect(results.inferenceTime).toBeGreaterThan(0);
    });

    it('should reject invalid image data', async () => {
      await expect(detector.detect(null)).rejects.toThrow();
      await expect(detector.detect(Buffer.from([]))).rejects.toThrow();
      await expect(detector.detect(Buffer.from('not an image'))).rejects.toThrow();
    });

    it('should reject oversized images', async () => {
      const hugeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      await expect(detector.detect(hugeBuffer)).rejects.toThrow();
    });
  });

  describe('postprocessing', () => {
    it('should apply confidence threshold', async () => {
      // Test that low-confidence detections are filtered
    });

    it('should apply non-maximum suppression', async () => {
      // Test that overlapping boxes are merged
    });

    it('should limit max detections', async () => {
      // Test that we don't return too many detections
    });
  });
});
```

#### Stream Capture Tests

**File**: `tests/unit/stream-capture.test.js`

```javascript
describe('StreamCapture', () => {
  let capture;
  let mockFfmpeg;

  beforeEach(() => {
    mockFfmpeg = {
      input: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      output: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      run: jest.fn().mockReturnThis(),
      kill: jest.fn()
    };

    jest.mock('fluent-ffmpeg', () => () => mockFfmpeg);
  });

  describe('start', () => {
    it('should connect to valid stream URL', async () => {
      capture = new StreamCapture('https://twitch.tv/validchannel');
      await capture.start();

      expect(mockFfmpeg.input).toHaveBeenCalled();
      expect(mockFfmpeg.run).toHaveBeenCalled();
    });

    it('should reject invalid URLs', async () => {
      capture = new StreamCapture('not-a-url');
      await expect(capture.start()).rejects.toThrow('Invalid URL');
    });

    it('should reject non-Twitch URLs', async () => {
      capture = new StreamCapture('https://youtube.com/watch?v=123');
      await expect(capture.start()).rejects.toThrow('Only Twitch URLs supported');
    });
  });

  describe('frame extraction', () => {
    it('should emit frames at configured interval', async () => {
      const frameCallback = jest.fn();
      capture = new StreamCapture('https://twitch.tv/test', {
        frameIntervalMs: 1000
      });

      capture.onFrame(frameCallback);
      await capture.start();

      // Simulate FFmpeg outputting frames
      // ... (mock implementation)

      // Wait for frames
      await new Promise(r => setTimeout(r, 3500));

      expect(frameCallback).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should handle stream disconnect', async () => {
      const errorCallback = jest.fn();
      capture = new StreamCapture('https://twitch.tv/test');

      capture.onError(errorCallback);
      await capture.start();

      // Simulate disconnect
      mockFfmpeg.on.mock.calls
        .find(([event]) => event === 'error')[1](new Error('Stream ended'));

      expect(errorCallback).toHaveBeenCalled();
    });

    it('should attempt reconnection', async () => {
      capture = new StreamCapture('https://twitch.tv/test', {
        reconnectAttempts: 3,
        reconnectDelay: 100
      });

      await capture.start();

      // Simulate multiple disconnects
      // ... verify reconnection attempts
    });
  });
});
```

---

### 2. Integration Tests

Integration tests verify that components work together correctly.

#### Detection Pipeline Integration

**File**: `tests/integration/detection-pipeline.test.js`

```javascript
describe('Detection Pipeline Integration', () => {
  let pipeline;
  let testDb;
  let mockChatClient;

  beforeAll(async () => {
    // Setup test database with schema
    testDb = await createTestDatabase();

    // Create mock chat client
    mockChatClient = {
      say: jest.fn().mockResolvedValue(undefined)
    };
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('end-to-end detection flow', () => {
    it('should process frame and send message when object detected', async () => {
      // Setup: Create config and rules
      const config = await createTestConfig(testDb, {
        is_enabled: true,
        cooldown_seconds: 0  // No cooldown for testing
      });

      const rule = await createTestRule(testDb, config.id, {
        object_class: 'cat',
        min_confidence: 0.5,
        message_template: 'I see a {object}!'
      });

      // Create pipeline with test image
      pipeline = new DetectionPipeline(config, mockChatClient);
      await pipeline.initialize();

      // Process test image containing a cat
      const catImage = fs.readFileSync('tests/fixtures/cat.jpg');
      await pipeline.processFrame(catImage);

      // Verify message was sent
      expect(mockChatClient.say).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('I see a cat!')
      );

      // Verify detection was logged
      const logs = await repo.getRecentLogs(config.id, 10);
      expect(logs).toHaveLength(1);
      expect(logs[0].object_class).toBe('cat');
    });

    it('should respect cooldown between messages', async () => {
      const config = await createTestConfig(testDb, {
        is_enabled: true,
        cooldown_seconds: 60  // 1 minute cooldown
      });

      const rule = await createTestRule(testDb, config.id, {
        object_class: 'dog',
        min_confidence: 0.3
      });

      pipeline = new DetectionPipeline(config, mockChatClient);
      await pipeline.initialize();

      // Process two frames quickly
      const dogImage = fs.readFileSync('tests/fixtures/dog.jpg');
      await pipeline.processFrame(dogImage);
      await pipeline.processFrame(dogImage);

      // Only one message should be sent (second blocked by cooldown)
      expect(mockChatClient.say).toHaveBeenCalledTimes(1);
    });

    it('should filter by confidence threshold', async () => {
      const config = await createTestConfig(testDb, {
        is_enabled: true
      });

      const rule = await createTestRule(testDb, config.id, {
        object_class: 'cat',
        min_confidence: 0.9  // Very high threshold
      });

      pipeline = new DetectionPipeline(config, mockChatClient);
      await pipeline.initialize();

      // Process image with low confidence detection
      // (need to mock detector to return specific confidence)
      const mockDetector = {
        detect: jest.fn().mockResolvedValue({
          detections: [{ class: 'cat', confidence: 0.6 }]  // Below threshold
        })
      };
      pipeline.detector = mockDetector;

      const catImage = fs.readFileSync('tests/fixtures/cat.jpg');
      await pipeline.processFrame(catImage);

      // No message should be sent
      expect(mockChatClient.say).not.toHaveBeenCalled();
    });
  });

  describe('multiple rules', () => {
    it('should match multiple rules for same frame', async () => {
      const config = await createTestConfig(testDb);

      await createTestRule(testDb, config.id, {
        object_class: 'cat',
        min_confidence: 0.5,
        message_template: 'Cat detected!'
      });

      await createTestRule(testDb, config.id, {
        object_class: 'dog',
        min_confidence: 0.5,
        message_template: 'Dog detected!'
      });

      pipeline = new DetectionPipeline(config, mockChatClient);
      pipeline.detector = {
        detect: jest.fn().mockResolvedValue({
          detections: [
            { class: 'cat', confidence: 0.8 },
            { class: 'dog', confidence: 0.7 }
          ]
        })
      };
      await pipeline.initialize();

      const image = fs.readFileSync('tests/fixtures/test.jpg');
      await pipeline.processFrame(image);

      // Both rules should trigger
      expect(mockChatClient.say).toHaveBeenCalledTimes(2);
    });
  });
});
```

#### Web Interface Integration

**File**: `tests/integration/detection-routes.test.js`

```javascript
const request = require('supertest');
const app = require('../../src/web');

describe('Detection Routes Integration', () => {
  let testDb;
  let agent;
  let csrfToken;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    // Setup test admin user and channel
  });

  beforeEach(async () => {
    // Login and get CSRF token
    agent = request.agent(app);
    await agent.post('/login').send({ username: 'admin', password: 'test' });
    const res = await agent.get('/detection');
    csrfToken = extractCsrfToken(res.text);
  });

  describe('GET /detection', () => {
    it('should return detection dashboard', async () => {
      const res = await agent.get('/detection');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Object Detection');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/detection');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('login');
    });
  });

  describe('POST /detection/channels/:id/config', () => {
    it('should update detection config', async () => {
      const res = await agent
        .post('/detection/channels/1/config')
        .send({
          _csrf: csrfToken,
          is_enabled: true,
          frame_interval_ms: 2000,
          cooldown_seconds: 30
        });

      expect(res.status).toBe(302);  // Redirect on success

      // Verify config was updated
      const config = await repo.getConfig(1);
      expect(config.is_enabled).toBe(true);
      expect(config.frame_interval_ms).toBe(2000);
    });

    it('should reject without CSRF token', async () => {
      const res = await agent
        .post('/detection/channels/1/config')
        .send({ is_enabled: true });

      expect(res.status).toBe(403);
    });

    it('should validate input ranges', async () => {
      const res = await agent
        .post('/detection/channels/1/config')
        .send({
          _csrf: csrfToken,
          frame_interval_ms: -1000  // Invalid
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /detection/channels/:id/rules', () => {
    it('should create new detection rule', async () => {
      const res = await agent
        .post('/detection/channels/1/rules')
        .send({
          _csrf: csrfToken,
          object_class: 'cat',
          min_confidence: 0.7,
          message_template: 'Found a {object}!'
        });

      expect(res.status).toBe(302);

      const rules = await repo.getRules(1);
      expect(rules.some(r => r.object_class === 'cat')).toBe(true);
    });

    it('should reject invalid object class', async () => {
      const res = await agent
        .post('/detection/channels/1/rules')
        .send({
          _csrf: csrfToken,
          object_class: 'invalid_class',
          min_confidence: 0.5
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid object class');
    });
  });

  describe('POST /detection/channels/:id/start', () => {
    it('should start monitoring', async () => {
      // First create config
      await agent
        .post('/detection/channels/1/config')
        .send({ _csrf: csrfToken, is_enabled: true });

      const res = await agent
        .post('/detection/channels/1/start')
        .send({ _csrf: csrfToken });

      expect(res.status).toBe(200);

      // Verify monitoring is active
      const status = await orchestrator.getMonitoringStatus(1);
      expect(status.active).toBe(true);
    });

    it('should create chat membership if missing', async () => {
      // Ensure no membership exists
      await chatMembershipRepo.deleteAll(1);

      await agent
        .post('/detection/channels/1/start')
        .send({ _csrf: csrfToken });

      // Verify membership was created
      const memberships = await chatMembershipRepo.findByChannel(1);
      expect(memberships.length).toBeGreaterThan(0);
    });
  });
});
```

---

### 3. Security Tests

Security-focused tests to verify protection mechanisms.

**File**: `tests/security/detection-security.test.js`

```javascript
describe('Detection Security Tests', () => {
  describe('Input Validation', () => {
    it('should reject SQL injection in object class', async () => {
      const res = await agent
        .post('/detection/channels/1/rules')
        .send({
          _csrf: csrfToken,
          object_class: "cat'; DROP TABLE users; --",
          min_confidence: 0.5
        });

      expect(res.status).toBe(400);

      // Verify database is intact
      const users = testDb.prepare('SELECT * FROM admin_users').all();
      expect(users.length).toBeGreaterThan(0);
    });

    it('should reject XSS in message template', async () => {
      const res = await agent
        .post('/detection/channels/1/rules')
        .send({
          _csrf: csrfToken,
          object_class: 'cat',
          min_confidence: 0.5,
          message_template: '<script>alert("xss")</script>'
        });

      // Either reject or sanitize
      if (res.status === 200) {
        const rules = await repo.getRules(1);
        const rule = rules.find(r => r.object_class === 'cat');
        expect(rule.message_template).not.toContain('<script>');
      }
    });

    it('should reject path traversal in stream URL', async () => {
      const res = await agent
        .post('/detection/channels/1/config')
        .send({
          _csrf: csrfToken,
          stream_url: 'file:///etc/passwd'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Authentication', () => {
    it('should reject unauthenticated config changes', async () => {
      const res = await request(app)
        .post('/detection/channels/1/config')
        .send({ is_enabled: true });

      expect(res.status).toBe(403);
    });

    it('should reject access to other users channels', async () => {
      // Login as user 1
      await agent.post('/login').send({ username: 'user1', password: 'test1' });

      // Try to access user 2's channel
      const res = await agent.get('/detection/channels/2');

      expect(res.status).toBe(403);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit start/stop requests', async () => {
      // Make 10 rapid requests
      const requests = Array(10).fill().map(() =>
        agent.post('/detection/channels/1/start').send({ _csrf: csrfToken })
      );

      const results = await Promise.all(requests);

      // Some should be rate limited
      const limited = results.filter(r => r.status === 429);
      expect(limited.length).toBeGreaterThan(0);
    });
  });

  describe('Resource Limits', () => {
    it('should reject oversized image frames', async () => {
      const hugeBuffer = Buffer.alloc(20 * 1024 * 1024); // 20MB

      await expect(
        pipeline.processFrame(hugeBuffer)
      ).rejects.toThrow('exceeds maximum');
    });

    it('should limit concurrent streams per user', async () => {
      // Try to start more streams than allowed
      const startRequests = Array(10).fill().map((_, i) =>
        agent.post('/detection/channels/' + i + '/start').send({ _csrf: csrfToken })
      );

      const results = await Promise.all(startRequests);

      // Only some should succeed
      const succeeded = results.filter(r => r.status === 200);
      expect(succeeded.length).toBeLessThanOrEqual(5);  // Max limit
    });
  });
});
```

---

### 4. Performance Tests

**File**: `tests/performance/detection-performance.test.js`

```javascript
describe('Detection Performance Tests', () => {
  describe('YOLO Inference', () => {
    it('should complete inference within 100ms', async () => {
      const detector = new YOLODetector('models/yolov8n.onnx');
      await detector.initialize();

      const image = fs.readFileSync('tests/fixtures/test.jpg');

      const start = Date.now();
      await detector.detect(image);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should handle 10 frames in under 2 seconds', async () => {
      const detector = new YOLODetector('models/yolov8n.onnx');
      await detector.initialize();

      const image = fs.readFileSync('tests/fixtures/test.jpg');
      const frames = Array(10).fill(image);

      const start = Date.now();
      await Promise.all(frames.map(f => detector.detect(f)));
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory over 100 frames', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const detector = new YOLODetector('models/yolov8n.onnx');
      await detector.initialize();

      const image = fs.readFileSync('tests/fixtures/test.jpg');

      for (let i = 0; i < 100; i++) {
        await detector.detect(image);
        if (i % 10 === 0 && global.gc) global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const growth = finalMemory - initialMemory;

      // Memory growth should be reasonable (< 50MB)
      expect(growth).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Pipeline Throughput', () => {
    it('should process at least 0.5 FPS sustained', async () => {
      const pipeline = new DetectionPipeline(testConfig, mockChatClient);
      await pipeline.initialize();

      const image = fs.readFileSync('tests/fixtures/test.jpg');
      let framesProcessed = 0;

      const start = Date.now();
      const duration = 10000;  // 10 seconds

      while (Date.now() - start < duration) {
        await pipeline.processFrame(image);
        framesProcessed++;
      }

      const fps = framesProcessed / (duration / 1000);
      expect(fps).toBeGreaterThanOrEqual(0.5);
    });
  });
});
```

---

### 5. End-to-End Tests

**File**: `tests/e2e/detection-e2e.test.js`

```javascript
describe('Detection End-to-End Tests', () => {
  // These tests require actual external services
  // Run manually or in staging environment

  describe.skip('Live Stream Detection', () => {
    it('should detect objects in live Twitch stream', async () => {
      // This requires a real Twitch stream
      // Best run manually with a known test stream

      const capture = new StreamCapture('https://twitch.tv/test_channel');
      const detector = new YOLODetector('models/yolov8n.onnx');

      await capture.start();
      await detector.initialize();

      let detectionCount = 0;

      capture.onFrame(async (frame) => {
        const results = await detector.detect(frame);
        if (results.detections.length > 0) {
          detectionCount++;
        }
      });

      // Wait 30 seconds
      await new Promise(r => setTimeout(r, 30000));

      await capture.stop();

      // Should have detected something in 30 seconds
      expect(detectionCount).toBeGreaterThan(0);
    }, 60000);  // 60 second timeout
  });
});
```

---

## Test Fixtures

### Required Test Images

Place in `tests/fixtures/`:

- `cat.jpg` - Clear image of a cat for positive detection
- `dog.jpg` - Clear image of a dog for positive detection
- `empty.jpg` - Image with no detectable objects
- `multiple.jpg` - Image with multiple objects
- `low_quality.jpg` - Blurry/low-res image
- `corrupt.jpg` - Corrupted image file for error testing

### Test Database Setup

```javascript
// tests/helpers/test-database.js
async function createTestDatabase() {
  const db = new Database(':memory:');

  // Run all migrations
  const migrations = fs.readdirSync('migrations');
  for (const migration of migrations.sort()) {
    const sql = fs.readFileSync('migrations/' + migration, 'utf8');
    db.run(sql);
  }

  return db;
}

async function createTestConfig(db, overrides = {}) {
  const defaults = {
    channel_id: 1,
    is_enabled: true,
    frame_interval_ms: 1000,
    cooldown_seconds: 0
  };

  const config = { ...defaults, ...overrides };

  db.prepare(
    'INSERT INTO object_detection_configs (channel_id, is_enabled, frame_interval_ms, cooldown_seconds) VALUES (?, ?, ?, ?)'
  ).run(config.channel_id, config.is_enabled, config.frame_interval_ms, config.cooldown_seconds);

  return db.prepare('SELECT * FROM object_detection_configs WHERE channel_id = ?').get(config.channel_id);
}

module.exports = { createTestDatabase, createTestConfig };
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/detection-tests.yml
name: Detection Feature Tests

on:
  push:
    branches: [ feature/stream-object-detection ]
  pull_request:
    branches: [ master ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install FFmpeg
        run: sudo apt-get update && sudo apt-get install -y ffmpeg

      - name: Install dependencies
        run: npm ci

      - name: Download YOLO model
        run: npm run download-model

      - name: Run integration tests
        run: npm run test:integration

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run security tests
        run: npm run test:security

      - name: Run npm audit
        run: npm audit

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Download YOLO model
        run: npm run download-model

      - name: Run performance tests
        run: npm run test:performance
```

---

## Test Coverage Requirements

| Category | Minimum Coverage | Critical Paths |
|----------|------------------|----------------|
| Repository | 90% | All CRUD operations |
| Detection Service | 85% | Inference, postprocessing |
| Stream Capture | 80% | Connection, frame extraction |
| Orchestrator | 85% | Lifecycle, error handling |
| Web Routes | 90% | All endpoints |
| Security | 100% | All security controls |

---

## Manual Testing Checklist

Before release, manually verify:

- [ ] Detection works with real Twitch stream
- [ ] Messages appear in chat correctly
- [ ] Web interface is responsive and functional
- [ ] Configuration persists across restarts
- [ ] Multiple streams can run simultaneously
- [ ] Errors are handled gracefully
- [ ] Logs contain useful information
- [ ] Memory usage is stable over time
- [ ] CPU usage is within limits
