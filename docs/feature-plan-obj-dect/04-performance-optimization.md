# Stream Object Detection - Performance Optimization

## Overview

This document outlines strategies for efficient bandwidth usage and CPU utilization in the stream object detection feature. Real-time video processing is resource-intensive, requiring careful optimization.

---

## Performance Goals

| Metric | Target | Critical Limit |
|--------|--------|----------------|
| CPU usage per stream | <25% of 1 core | <50% of 1 core |
| Memory per stream | <256MB | <512MB |
| Bandwidth per stream | <500 KB/s | <1 MB/s |
| Detection latency | <500ms | <2000ms |
| Frame processing rate | 1 FPS | 0.5 FPS minimum |
| Concurrent streams | 3+ | 1 minimum |

---

## Bandwidth Optimization

### Strategy 1: Use Lowest Viable Stream Quality

Twitch streams are available in multiple quality levels. For object detection, we don't need full HD.

**Implementation**:
```javascript
const QUALITY_PREFERENCE = [
  '160p30',   // ~200 KB/s - Preferred for detection
  '360p30',   // ~600 KB/s - Acceptable fallback
  '480p30',   // ~1.2 MB/s - Maximum we should use
  // Never use 720p, 1080p, or source quality
];

async function getOptimalStreamUrl(channelName) {
  const streamInfo = await twitchApi.getStreamInfo(channelName);

  // Find lowest available quality from our preference list
  for (const quality of QUALITY_PREFERENCE) {
    const url = streamInfo.qualities.find(q => q.name === quality);
    if (url) {
      logger.debug(`Selected ${quality} quality for ${channelName}`);
      return url;
    }
  }

  // Fallback to lowest available
  return streamInfo.qualities[streamInfo.qualities.length - 1];
}
```

**Bandwidth Impact**:
| Quality | Bandwidth | Detection Accuracy |
|---------|-----------|-------------------|
| 160p30 | ~200 KB/s | 70-80% (sufficient for most objects) |
| 360p30 | ~600 KB/s | 85-90% (good balance) |
| 480p30 | ~1.2 MB/s | 90-95% (diminishing returns) |
| 720p60 | ~3 MB/s | 95%+ (overkill, avoid) |

### Strategy 2: Reduce Frame Capture Rate

We don't need 30 FPS for object detection. Most objects persist for seconds.

**Implementation**:
```javascript
const DEFAULT_FRAME_INTERVAL_MS = 2000; // 0.5 FPS default
const MIN_FRAME_INTERVAL_MS = 500;      // 2 FPS maximum
const MAX_FRAME_INTERVAL_MS = 10000;    // 0.1 FPS minimum

class AdaptiveFrameCapture {
  constructor(options = {}) {
    this.interval = options.interval || DEFAULT_FRAME_INTERVAL_MS;
    this.lastDetection = 0;
    this.consecutiveEmpty = 0;
  }

  // Slow down if no detections for a while
  adaptInterval() {
    const now = Date.now();
    const timeSinceDetection = now - this.lastDetection;

    if (timeSinceDetection > 60000) { // 1 minute no detections
      // Slow down to conserve bandwidth
      this.interval = Math.min(this.interval * 1.5, MAX_FRAME_INTERVAL_MS);
    }
  }

  // Speed up when objects are being detected
  onDetection() {
    this.lastDetection = Date.now();
    this.consecutiveEmpty = 0;
    // Speed up to catch more objects
    this.interval = Math.max(this.interval * 0.8, MIN_FRAME_INTERVAL_MS);
  }

  onEmptyFrame() {
    this.consecutiveEmpty++;
    if (this.consecutiveEmpty > 10) {
      this.adaptInterval();
    }
  }
}
```

### Strategy 3: Skip Identical Frames

Twitch streams often have static overlays or paused content. Skip redundant frames.

**Implementation**:
```javascript
const crypto = require('crypto');

class FrameDeduplicator {
  constructor(options = {}) {
    this.lastFrameHash = null;
    this.threshold = options.threshold || 0.95; // 95% similarity = skip
  }

  shouldProcess(frameBuffer) {
    // Quick hash comparison (much faster than pixel comparison)
    const hash = crypto.createHash('md5')
      .update(frameBuffer)
      .digest('hex');

    if (hash === this.lastFrameHash) {
      return false; // Exact duplicate, skip
    }

    this.lastFrameHash = hash;
    return true;
  }

  // For more sophisticated comparison, use perceptual hashing
  async shouldProcessAdvanced(frameBuffer) {
    // TODO: Implement perceptual hash comparison
    // This detects near-identical frames (e.g., small text changes)
    return this.shouldProcess(frameBuffer);
  }
}
```

### Strategy 4: Stream Connection Pooling

Reuse connections and cache stream metadata.

**Implementation**:
```javascript
class StreamConnectionPool {
  constructor() {
    this.connections = new Map();
    this.metadata = new Map();
    this.metadataTTL = 5 * 60 * 1000; // 5 minute cache
  }

  async getConnection(channelName) {
    // Reuse existing connection if available
    if (this.connections.has(channelName)) {
      return this.connections.get(channelName);
    }

    // Check metadata cache
    let streamUrl = this.metadata.get(channelName);
    if (!streamUrl || streamUrl.expiry < Date.now()) {
      streamUrl = await this.fetchStreamUrl(channelName);
      this.metadata.set(channelName, {
        url: streamUrl,
        expiry: Date.now() + this.metadataTTL
      });
    }

    const connection = await this.createConnection(streamUrl);
    this.connections.set(channelName, connection);
    return connection;
  }
}
```

---

## CPU Optimization

### Strategy 1: Use Appropriate YOLO Model Size

YOLO comes in multiple sizes. Smaller = faster but less accurate.

**Model Comparison**:
| Model | Size | Inference Time | Accuracy | Recommendation |
|-------|------|----------------|----------|----------------|
| YOLOv8n (nano) | 6.3MB | ~15ms | 37.3 mAP | Default choice |
| YOLOv8s (small) | 22.5MB | ~30ms | 44.9 mAP | If accuracy needed |
| YOLOv8m (medium) | 52.0MB | ~80ms | 50.2 mAP | High-end systems |
| YOLOv8l (large) | 87.7MB | ~150ms | 52.9 mAP | Not recommended |
| YOLOv8x (xlarge) | 136.7MB | ~280ms | 53.9 mAP | Never use |

**Implementation**:
```javascript
const YOLO_MODELS = {
  nano: {
    path: 'models/yolov8n.onnx',
    inputSize: 640,
    expectedLatency: 15
  },
  small: {
    path: 'models/yolov8s.onnx',
    inputSize: 640,
    expectedLatency: 30
  }
};

class ModelSelector {
  static selectModel(options = {}) {
    const { cpuCores, gpuAvailable, streamCount } = options;

    // If GPU available, can use larger model
    if (gpuAvailable) {
      return YOLO_MODELS.small;
    }

    // Scale down based on concurrent streams
    if (streamCount > 2 || cpuCores < 4) {
      return YOLO_MODELS.nano;
    }

    return YOLO_MODELS.small;
  }
}
```

### Strategy 2: Reduce Input Resolution

YOLO input is 640x640, but we can resize streams before that.

**Implementation**:
```javascript
const DETECTION_RESOLUTION = {
  width: 320,   // Half of YOLO input
  height: 320,
  // Will be upscaled to 640x640 for YOLO, but faster preprocessing
};

function resizeFrameForDetection(frameBuffer) {
  // Use sharp for fast image resizing
  const sharp = require('sharp');

  return sharp(frameBuffer)
    .resize(DETECTION_RESOLUTION.width, DETECTION_RESOLUTION.height, {
      fit: 'fill',
      kernel: 'nearest' // Fastest interpolation
    })
    .jpeg({ quality: 80 }) // Slight compression
    .toBuffer();
}
```

### Strategy 3: Detection Queue with Rate Limiting

Prevent CPU overload by queuing and throttling detections.

**Implementation**:
```javascript
class DetectionQueue {
  constructor(options = {}) {
    this.queue = [];
    this.processing = false;
    this.maxQueueSize = options.maxQueueSize || 10;
    this.maxConcurrent = options.maxConcurrent || 1;
    this.activeCount = 0;
  }

  async enqueue(frame, callback) {
    // Drop oldest frames if queue is full (prefer recent data)
    if (this.queue.length >= this.maxQueueSize) {
      const dropped = this.queue.shift();
      logger.debug('Dropped old frame due to queue overflow');
    }

    this.queue.push({ frame, callback, timestamp: Date.now() });
    this.processQueue();
  }

  async processQueue() {
    if (this.activeCount >= this.maxConcurrent) {
      return; // Already at capacity
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;

    try {
      // Skip if frame is too old (stale data)
      const age = Date.now() - item.timestamp;
      if (age > 5000) {
        logger.debug(`Skipping stale frame (${age}ms old)`);
        return;
      }

      const result = await this.detector.detect(item.frame);
      item.callback(null, result);
    } catch (err) {
      item.callback(err);
    } finally {
      this.activeCount--;
      // Process next item
      setImmediate(() => this.processQueue());
    }
  }
}
```

### Strategy 4: Lazy Model Loading

Don't load YOLO model until actually needed.

**Implementation**:
```javascript
class LazyYOLODetector {
  constructor(modelConfig) {
    this.modelConfig = modelConfig;
    this.model = null;
    this.loading = null;
  }

  async ensureLoaded() {
    if (this.model) return this.model;

    // Prevent multiple simultaneous loads
    if (this.loading) {
      return this.loading;
    }

    this.loading = this.loadModel();
    this.model = await this.loading;
    this.loading = null;

    return this.model;
  }

  async loadModel() {
    logger.info('Loading YOLO model (lazy initialization)');
    const startTime = Date.now();

    const session = await ort.InferenceSession.create(
      this.modelConfig.path,
      {
        executionProviders: ['cpu'], // or ['cuda'] for GPU
        graphOptimizationLevel: 'all'
      }
    );

    logger.info(`YOLO model loaded in ${Date.now() - startTime}ms`);
    return session;
  }

  async detect(frame) {
    const model = await this.ensureLoaded();
    // ... run inference
  }

  async unload() {
    if (this.model) {
      await this.model.release();
      this.model = null;
      logger.info('YOLO model unloaded');
    }
  }
}
```

### Strategy 5: Worker Thread for Detection

Offload detection to worker thread to not block main event loop.

**Implementation**:
```javascript
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Main thread
class DetectionWorkerPool {
  constructor(workerCount = 1) {
    this.workers = [];
    this.roundRobin = 0;

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker('./detection-worker.js');
      worker.on('message', this.handleResult.bind(this));
      this.workers.push({
        worker,
        busy: false,
        pending: []
      });
    }
  }

  async detect(frameBuffer) {
    return new Promise((resolve, reject) => {
      // Find available worker or use round-robin
      const workerInfo = this.getNextWorker();

      workerInfo.pending.push({ resolve, reject });
      workerInfo.worker.postMessage({
        type: 'detect',
        frame: frameBuffer
      });
    });
  }

  getNextWorker() {
    // Simple round-robin selection
    const worker = this.workers[this.roundRobin];
    this.roundRobin = (this.roundRobin + 1) % this.workers.length;
    return worker;
  }
}

// detection-worker.js
if (!isMainThread) {
  let detector = null;

  parentPort.on('message', async (msg) => {
    if (msg.type === 'detect') {
      if (!detector) {
        detector = new YOLODetector();
        await detector.initialize();
      }

      try {
        const result = await detector.detect(msg.frame);
        parentPort.postMessage({ success: true, result });
      } catch (err) {
        parentPort.postMessage({ success: false, error: err.message });
      }
    }
  });
}
```

---

## Memory Optimization

### Strategy 1: Frame Buffer Limits

Strictly limit memory used for frame storage.

**Implementation**:
```javascript
class BoundedFrameBuffer {
  constructor(options = {}) {
    this.maxFrames = options.maxFrames || 5;
    this.maxTotalSize = options.maxTotalSize || 50 * 1024 * 1024; // 50MB
    this.frames = [];
    this.totalSize = 0;
  }

  push(frameBuffer) {
    const frameSize = frameBuffer.length;

    // Reject if single frame is too large
    if (frameSize > 10 * 1024 * 1024) {
      throw new Error('Frame exceeds maximum size');
    }

    // Remove old frames until we have space
    while (
      this.frames.length >= this.maxFrames ||
      this.totalSize + frameSize > this.maxTotalSize
    ) {
      const removed = this.frames.shift();
      this.totalSize -= removed.length;
    }

    this.frames.push(frameBuffer);
    this.totalSize += frameSize;
  }

  clear() {
    this.frames = [];
    this.totalSize = 0;
  }

  getStats() {
    return {
      frameCount: this.frames.length,
      totalSize: this.totalSize,
      avgFrameSize: this.frames.length > 0
        ? Math.round(this.totalSize / this.frames.length)
        : 0
    };
  }
}
```

### Strategy 2: Explicit Buffer Cleanup

Ensure buffers are properly released.

**Implementation**:
```javascript
class FrameProcessor {
  async processFrame(frameBuffer) {
    let resizedBuffer = null;
    let tensorData = null;

    try {
      // Resize frame
      resizedBuffer = await this.resize(frameBuffer);

      // Convert to tensor
      tensorData = await this.toTensor(resizedBuffer);

      // Run detection
      const result = await this.detector.run(tensorData);

      return result;

    } finally {
      // Explicit cleanup
      resizedBuffer = null;
      tensorData = null;

      // Hint to garbage collector
      if (global.gc && this.processCount++ % 100 === 0) {
        global.gc();
      }
    }
  }
}
```

### Strategy 3: Stream Processing

Process frames as streams rather than loading all into memory.

**Implementation**:
```javascript
const { Transform } = require('stream');

class FrameDetectionStream extends Transform {
  constructor(detector, options = {}) {
    super({ objectMode: true });
    this.detector = detector;
  }

  async _transform(frame, encoding, callback) {
    try {
      const detections = await this.detector.detect(frame.buffer);

      if (detections.length > 0) {
        this.push({
          timestamp: frame.timestamp,
          detections
        });
      }

      // Frame buffer is automatically released after callback
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

// Usage
captureStream
  .pipe(new FrameDetectionStream(detector))
  .pipe(new DetectionHandlerStream(messageHandler));
```

---

## Monitoring & Metrics

### Performance Metrics to Track

```javascript
class DetectionMetrics {
  constructor() {
    this.metrics = {
      framesProcessed: 0,
      framesCaptured: 0,
      framesDropped: 0,
      detectionsFound: 0,
      totalInferenceTime: 0,
      peakMemoryUsage: 0,
      errors: 0
    };
    this.startTime = Date.now();
  }

  recordFrame(processed, inferenceTime) {
    this.metrics.framesCaptured++;
    if (processed) {
      this.metrics.framesProcessed++;
      this.metrics.totalInferenceTime += inferenceTime;
    } else {
      this.metrics.framesDropped++;
    }
  }

  recordDetection(count) {
    this.metrics.detectionsFound += count;
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();

    return {
      uptime: Math.round(uptime / 1000),
      framesPerSecond: this.metrics.framesProcessed / (uptime / 1000),
      dropRate: this.metrics.framesDropped / this.metrics.framesCaptured,
      avgInferenceTime: this.metrics.framesProcessed > 0
        ? Math.round(this.metrics.totalInferenceTime / this.metrics.framesProcessed)
        : 0,
      memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      detectionsPerMinute: this.metrics.detectionsFound / (uptime / 60000)
    };
  }
}
```

### Automatic Throttling

Automatically reduce load when resources are constrained.

**Implementation**:
```javascript
class AdaptiveThrottler {
  constructor(options = {}) {
    this.targetCpuPercent = options.targetCpu || 50;
    this.targetMemoryMB = options.targetMemory || 512;
    this.currentMultiplier = 1.0;
  }

  async checkAndAdjust() {
    const cpuUsage = await this.getCpuUsage();
    const memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;

    if (cpuUsage > this.targetCpuPercent || memoryMB > this.targetMemoryMB) {
      // Slow down
      this.currentMultiplier = Math.min(this.currentMultiplier * 1.2, 5.0);
      logger.warn('Throttling detection due to resource pressure', {
        cpu: cpuUsage,
        memory: memoryMB,
        multiplier: this.currentMultiplier
      });
    } else if (cpuUsage < this.targetCpuPercent * 0.5) {
      // Can speed up
      this.currentMultiplier = Math.max(this.currentMultiplier * 0.9, 1.0);
    }
  }

  getAdjustedInterval(baseInterval) {
    return Math.round(baseInterval * this.currentMultiplier);
  }
}
```

---

## Configuration Recommendations

### Default Settings

```javascript
const DEFAULT_DETECTION_CONFIG = {
  // Frame capture
  frameIntervalMs: 2000,        // 0.5 FPS
  streamQuality: '360p30',      // Balance of quality and bandwidth
  maxConcurrentStreams: 2,      // Per instance

  // Detection
  modelSize: 'nano',            // YOLOv8n
  confidenceThreshold: 0.5,     // 50% minimum
  maxDetectionsPerFrame: 10,    // Limit results

  // Resource limits
  maxMemoryMB: 512,             // Per-stream limit
  maxCpuPercent: 25,            // Per-stream limit
  detectionTimeoutMs: 5000,     // Max time for single detection

  // Cooldowns
  messageCooldownSeconds: 30,   // Per object type
  globalCooldownSeconds: 10,    // Between any messages
};
```

### Hardware-Based Profiles

```javascript
const HARDWARE_PROFILES = {
  minimal: {
    // Single-core, 1GB RAM
    maxConcurrentStreams: 1,
    frameIntervalMs: 5000,
    modelSize: 'nano',
    streamQuality: '160p30'
  },
  standard: {
    // Quad-core, 4GB RAM
    maxConcurrentStreams: 2,
    frameIntervalMs: 2000,
    modelSize: 'nano',
    streamQuality: '360p30'
  },
  performance: {
    // 8+ cores, 8GB+ RAM, optional GPU
    maxConcurrentStreams: 5,
    frameIntervalMs: 1000,
    modelSize: 'small',
    streamQuality: '480p30'
  }
};
```

---

## Performance Testing Requirements

### Benchmarks to Run

1. **Single Stream Baseline**
   - Measure CPU, memory, bandwidth for 1 stream over 1 hour
   - Target: <25% CPU, <256MB RAM, <500KB/s

2. **Multi-Stream Scaling**
   - Add streams incrementally, measure resource growth
   - Target: Near-linear scaling up to 3 streams

3. **Long-Running Stability**
   - Run for 24+ hours with 2 streams
   - Target: No memory leaks, stable performance

4. **Stress Test**
   - Maximum streams until performance degrades
   - Document breaking point

5. **Recovery Test**
   - Simulate stream disconnections, process crashes
   - Target: Full recovery within 30 seconds

### Performance Test Script

```bash
#!/bin/bash
# performance-test.sh

echo "Starting performance test..."

# Monitor system resources
vmstat 5 > vmstat.log &
VMSTAT_PID=$!

# Run bot with detection enabled
NODE_OPTIONS="--max-old-space-size=1024" npm start &
BOT_PID=$!

# Wait for test duration
sleep 3600  # 1 hour

# Cleanup
kill $BOT_PID
kill $VMSTAT_PID

# Analyze results
node scripts/analyze-performance.js vmstat.log
```
