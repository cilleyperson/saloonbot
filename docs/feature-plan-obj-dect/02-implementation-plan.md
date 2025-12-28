# Stream Object Detection - Implementation Plan

## Overview

This document provides a comprehensive, phased implementation plan with detailed task lists for the stream object detection feature. Tasks are organized by phase, with dependencies clearly marked.

---

## Phase 1: Foundation & Database Layer

**Objective**: Establish database schema and core data structures

### Task 1.1: Database Migration
- [ ] Create migration file `migrations/010_object_detection.sql`
- [ ] Define `object_detection_configs` table:
  ```sql
  - id (INTEGER PRIMARY KEY)
  - channel_id (INTEGER, FK to channels)
  - is_enabled (BOOLEAN, default 0)
  - stream_url (TEXT, nullable - for custom streams)
  - frame_interval_ms (INTEGER, default 1000)
  - max_concurrent_detections (INTEGER, default 1)
  - cooldown_seconds (INTEGER, default 30)
  - created_at (TIMESTAMP)
  - updated_at (TIMESTAMP)
  ```
- [ ] Define `object_detection_rules` table:
  ```sql
  - id (INTEGER PRIMARY KEY)
  - config_id (INTEGER, FK to object_detection_configs)
  - object_class (TEXT, e.g., 'cat', 'dog')
  - min_confidence (REAL, 0.0-1.0, default 0.5)
  - message_template (TEXT)
  - is_enabled (BOOLEAN, default 1)
  - created_at (TIMESTAMP)
  - updated_at (TIMESTAMP)
  ```
- [ ] Define `object_detection_logs` table:
  ```sql
  - id (INTEGER PRIMARY KEY)
  - config_id (INTEGER, FK to object_detection_configs)
  - rule_id (INTEGER, FK to object_detection_rules)
  - object_class (TEXT)
  - confidence (REAL)
  - message_sent (TEXT)
  - detected_at (TIMESTAMP)
  ```
- [ ] Add appropriate indexes for query performance
- [ ] **TEST**: Run migration on fresh database
- [ ] **TEST**: Run migration on existing database with data

### Task 1.2: Object Detection Repository
- [ ] Create `src/database/repositories/object-detection-repo.js`
- [ ] Implement CRUD operations for configs:
  - `getConfig(channelId)`
  - `createConfig(channelId, options)`
  - `updateConfig(configId, options)`
  - `deleteConfig(configId)`
- [ ] Implement CRUD operations for rules:
  - `getRules(configId)`
  - `getRule(ruleId)`
  - `createRule(configId, ruleData)`
  - `updateRule(ruleId, ruleData)`
  - `deleteRule(ruleId)`
  - `getRulesByObject(configId, objectClass)`
- [ ] Implement log operations:
  - `logDetection(configId, ruleId, data)`
  - `getRecentLogs(configId, limit)`
  - `pruneOldLogs(daysToKeep)`
- [ ] Implement helper functions:
  - `getEnabledConfigs()`
  - `isMonitoringActive(channelId)`
- [ ] **TEST**: Unit tests for all repository functions
- [ ] **TEST**: Edge cases (null inputs, invalid IDs, SQL injection attempts)
- [ ] **TEST**: Concurrent access scenarios

### Task 1.3: YOLO Object Classes Definition
- [ ] Create `src/constants/yolo-classes.js`
- [ ] Define all 80 COCO class names with IDs
- [ ] Add human-readable display names
- [ ] Group classes by category for UI
- [ ] Export helper functions:
  - `getClassName(id)`
  - `getClassId(name)`
  - `getAllClasses()`
  - `getClassesByCategory(category)`
- [ ] **TEST**: Verify all 80 classes are defined correctly

---

## Phase 2: Stream Capture Service

**Objective**: Implement reliable stream capture with frame extraction

### Task 2.1: FFmpeg Integration Setup
- [ ] Add `fluent-ffmpeg` to package.json dependencies
- [ ] Create `src/services/stream-capture.js`
- [ ] Implement FFmpeg availability check
- [ ] Create stream URL resolver for Twitch channels
- [ ] **TEST**: Verify FFmpeg detection works
- [ ] **TEST**: Handle missing FFmpeg gracefully

### Task 2.2: Stream Capture Implementation
- [ ] Implement `StreamCapture` class:
  ```javascript
  class StreamCapture {
    constructor(streamUrl, options)
    async start()
    async stop()
    onFrame(callback)
    onError(callback)
    getStatus()
  }
  ```
- [ ] Implement HLS stream connection via FFmpeg
- [ ] Configure frame extraction at specified intervals
- [ ] Output frames as raw image buffers (JPEG or PNG)
- [ ] Handle stream quality selection (prefer lower quality for efficiency)
- [ ] Implement automatic reconnection on stream failure
- [ ] Add connection timeout handling
- [ ] **TEST**: Capture frames from live Twitch stream
- [ ] **TEST**: Handle stream going offline
- [ ] **TEST**: Handle network interruption
- [ ] **TEST**: Memory usage stays bounded over time
- [ ] **SECURITY**: Validate stream URLs before connecting
- [ ] **SECURITY**: Limit frame buffer size to prevent memory exhaustion

### Task 2.3: Twitch Stream URL Resolution
- [ ] Create `src/services/twitch-stream-resolver.js`
- [ ] Implement stream URL fetching using Twitch API
- [ ] Cache stream URLs with appropriate TTL
- [ ] Handle private/subscriber-only streams
- [ ] **TEST**: Resolve live stream URLs
- [ ] **TEST**: Handle offline channels
- [ ] **TEST**: Handle invalid channel names
- [ ] **SECURITY**: Use authenticated API calls only

---

## Phase 3: YOLO Detection Service

**Objective**: Implement object detection using YOLO models

### Task 3.1: ONNX Runtime Setup
- [ ] Add `onnxruntime-node` to package.json dependencies
- [ ] Create `src/services/yolo-detection.js`
- [ ] Implement model loading and caching
- [ ] Download and store YOLOv8n ONNX model (smallest/fastest)
- [ ] Create model management utilities
- [ ] **TEST**: Model loads successfully
- [ ] **TEST**: Handle missing model file

### Task 3.2: YOLO Inference Implementation
- [ ] Implement `YOLODetector` class:
  ```javascript
  class YOLODetector {
    constructor(modelPath, options)
    async initialize()
    async detect(imageBuffer)
    async detectBatch(imageBuffers)
    getModelInfo()
    dispose()
  }
  ```
- [ ] Implement image preprocessing:
  - Resize to model input size (640x640)
  - Normalize pixel values
  - Convert to tensor format
- [ ] Implement inference execution
- [ ] Implement output postprocessing:
  - Parse bounding boxes
  - Apply Non-Maximum Suppression (NMS)
  - Map class IDs to names
- [ ] Return structured detection results:
  ```javascript
  {
    detections: [{
      class: 'cat',
      classId: 15,
      confidence: 0.87,
      bbox: { x, y, width, height }
    }],
    inferenceTime: 45, // ms
    timestamp: Date.now()
  }
  ```
- [ ] **TEST**: Detect objects in sample images
- [ ] **TEST**: Verify confidence scores are accurate
- [ ] **TEST**: Performance benchmarks (target: <100ms per frame)
- [ ] **TEST**: Handle corrupted/invalid image data
- [ ] **SECURITY**: Validate image buffers before processing

### Task 3.3: Python Fallback (Optional)
- [ ] Create `python/detection_worker.py`
- [ ] Implement Ultralytics YOLO wrapper
- [ ] Create IPC mechanism (stdin/stdout JSON)
- [ ] Implement process pool for concurrent detection
- [ ] **TEST**: Python worker processes frames correctly
- [ ] **TEST**: Handle Python process crashes

---

## Phase 4: Detection Orchestrator

**Objective**: Coordinate detection pipeline and manage message sending

### Task 4.1: Orchestrator Core
- [ ] Create `src/services/detection-orchestrator.js`
- [ ] Implement `DetectionOrchestrator` class:
  ```javascript
  class DetectionOrchestrator {
    constructor(botCore)
    async startMonitoring(channelId)
    async stopMonitoring(channelId)
    getMonitoringStatus(channelId)
    getAllActiveMonitors()
    async shutdown()
  }
  ```
- [ ] Implement monitor lifecycle management
- [ ] Track active monitors in Map
- [ ] Handle graceful startup/shutdown
- [ ] **TEST**: Start and stop monitoring
- [ ] **TEST**: Handle multiple concurrent monitors

### Task 4.2: Detection Pipeline
- [ ] Create `src/services/detection-pipeline.js`
- [ ] Implement `DetectionPipeline` class:
  ```javascript
  class DetectionPipeline {
    constructor(config, streamCapture, detector)
    async start()
    async stop()
    onDetection(callback)
    getStats()
  }
  ```
- [ ] Connect stream capture to detector
- [ ] Implement frame sampling logic
- [ ] Filter detections by configured rules
- [ ] Apply confidence thresholds
- [ ] Implement detection deduplication
- [ ] **TEST**: Pipeline processes frames correctly
- [ ] **TEST**: Filters work as expected
- [ ] **TEST**: Deduplication prevents spam

### Task 4.3: Message Handling
- [ ] Implement message template rendering
- [ ] Support all template variables:
  - `{object}`, `{confidence}`, `{confidence_pct}`
  - `{count}`, `{streamer}`, `{time}`
- [ ] Implement cooldown tracking per object type
- [ ] Integrate with BotCore chat sending
- [ ] Log all sent messages to database
- [ ] **TEST**: Template rendering works correctly
- [ ] **TEST**: Cooldowns are enforced
- [ ] **TEST**: Messages are logged properly
- [ ] **SECURITY**: Sanitize message content before sending

### Task 4.4: Automatic Membership Creation
- [ ] Check for existing chat membership when enabling detection
- [ ] Create membership automatically if missing
- [ ] Use existing chat-membership-repo functions
- [ ] Log membership creation
- [ ] **TEST**: Membership is created when needed
- [ ] **TEST**: Existing memberships are not duplicated

---

## Phase 5: Web Interface

**Objective**: Build administration UI for detection configuration

### Task 5.1: Routes Setup
- [ ] Create `src/web/routes/object-detection.js`
- [ ] Implement routes:
  - `GET /detection` - Dashboard
  - `GET /detection/channels/:id` - Channel config
  - `POST /detection/channels/:id/config` - Update config
  - `POST /detection/channels/:id/rules` - Add rule
  - `PUT /detection/channels/:id/rules/:ruleId` - Update rule
  - `DELETE /detection/channels/:id/rules/:ruleId` - Delete rule
  - `POST /detection/channels/:id/start` - Start monitoring
  - `POST /detection/channels/:id/stop` - Stop monitoring
  - `GET /detection/channels/:id/logs` - View logs
- [ ] Add routes to Express app
- [ ] Implement CSRF protection
- [ ] **TEST**: All routes respond correctly
- [ ] **SECURITY**: Verify authentication on all routes
- [ ] **SECURITY**: Validate all input parameters

### Task 5.2: Detection Dashboard View
- [ ] Create `src/web/views/object-detection/index.ejs`
- [ ] Display all channels with detection status
- [ ] Show active/inactive monitoring indicators
- [ ] Quick enable/disable toggles
- [ ] Link to individual channel configuration
- [ ] **TEST**: Dashboard renders correctly
- [ ] **TEST**: Status indicators update properly

### Task 5.3: Channel Configuration View
- [ ] Create `src/web/views/object-detection/channel.ejs`
- [ ] Configuration section:
  - Enable/disable detection
  - Frame interval setting
  - Global cooldown setting
- [ ] Object rules section:
  - List of configured rules
  - Add new rule form
  - Edit/delete existing rules
- [ ] Object selector:
  - Searchable dropdown of all 80 YOLO classes
  - Category grouping
- [ ] Confidence threshold slider (0-100%)
- [ ] Message template editor with variable hints
- [ ] **TEST**: All form elements function correctly
- [ ] **TEST**: Changes save properly
- [ ] **SECURITY**: CSRF tokens on all forms

### Task 5.4: Detection Logs View
- [ ] Create `src/web/views/object-detection/logs.ejs`
- [ ] Display recent detection events
- [ ] Show timestamp, object, confidence, message sent
- [ ] Pagination for large log sets
- [ ] Filter by object type
- [ ] Clear logs functionality
- [ ] **TEST**: Logs display correctly
- [ ] **TEST**: Pagination works
- [ ] **TEST**: Filters function properly

### Task 5.5: Navigation Integration
- [ ] Add "Object Detection" to main navigation
- [ ] Add appropriate icons
- [ ] Update layout.ejs if needed
- [ ] **TEST**: Navigation links work correctly

---

## Phase 6: Integration & Bot Lifecycle

**Objective**: Integrate detection with bot startup/shutdown

### Task 6.1: BotCore Integration
- [ ] Add DetectionOrchestrator to BotCore
- [ ] Initialize orchestrator in bot startup sequence
- [ ] Auto-start monitors for enabled configs on boot
- [ ] Graceful shutdown of all monitors on bot stop
- [ ] **TEST**: Monitors start automatically on bot start
- [ ] **TEST**: Monitors stop cleanly on bot shutdown

### Task 6.2: Event Integration
- [ ] Add detection events to event system
- [ ] Emit events for:
  - Monitor started/stopped
  - Object detected
  - Message sent
  - Error occurred
- [ ] **TEST**: Events fire correctly
- [ ] **TEST**: Event handlers receive correct data

### Task 6.3: Status Reporting
- [ ] Add detection status to dashboard
- [ ] Show number of active monitors
- [ ] Show recent detection activity
- [ ] CPU/memory usage indicators
- [ ] **TEST**: Status displays correctly

---

## Phase 7: Performance Optimization

**Objective**: Ensure efficient resource usage

### Task 7.1: Bandwidth Optimization
- [ ] Implement adaptive frame rate based on activity
- [ ] Use lowest viable stream quality
- [ ] Implement frame skipping under high load
- [ ] Cache stream metadata
- [ ] **TEST**: Bandwidth usage is reasonable
- [ ] **TEST**: Adaptive rates work correctly

### Task 7.2: CPU Optimization
- [ ] Implement detection queue with rate limiting
- [ ] Use worker threads for detection if beneficial
- [ ] Profile and optimize hot paths
- [ ] Implement graceful degradation under load
- [ ] **TEST**: CPU usage stays within limits
- [ ] **TEST**: System remains responsive

### Task 7.3: Memory Optimization
- [ ] Implement frame buffer limits
- [ ] Ensure proper cleanup of image buffers
- [ ] Monitor for memory leaks
- [ ] Implement memory pressure handling
- [ ] **TEST**: Memory usage is stable over time
- [ ] **TEST**: No memory leaks in long-running tests

---

## Phase 8: Testing & Documentation

**Objective**: Comprehensive testing and documentation

### Task 8.1: Unit Tests
- [ ] Repository tests (see Task 1.2)
- [ ] Service tests (stream capture, detection, orchestrator)
- [ ] Utility function tests
- [ ] **TARGET**: 80%+ code coverage

### Task 8.2: Integration Tests
- [ ] Full pipeline tests (mock stream to message)
- [ ] Web interface tests
- [ ] Database integration tests
- [ ] API endpoint tests
- [ ] **TARGET**: All critical paths covered

### Task 8.3: End-to-End Tests
- [ ] Manual testing with real Twitch streams
- [ ] Multi-stream concurrent testing
- [ ] Long-running stability tests
- [ ] Error recovery tests
- [ ] **DOCUMENT**: Test results and findings

### Task 8.4: Documentation
- [ ] Update README.md with feature documentation
- [ ] Update CLAUDE.md with new architecture
- [ ] Create user guide for web interface
- [ ] Document API endpoints
- [ ] Add inline code documentation
- [ ] **REVIEW**: Documentation accuracy

---

## Dependency Graph

```
Phase 1 (Database)
    |
    +--> Phase 2 (Stream Capture)
    |         |
    |         +--> Phase 4 (Orchestrator)
    |         |         |
    |         |         +--> Phase 6 (Integration)
    |         |         |         |
    +--> Phase 3 (Detection)        |
              |                     |
              +---------------------+
                        |
                        +--> Phase 5 (Web Interface)
                        |
                        +--> Phase 7 (Optimization)
                        |
                        +--> Phase 8 (Testing)
```

---

## Milestone Checklist

### Milestone 1: Database & Core Services
- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] All unit tests passing

### Milestone 2: Detection Pipeline
- [ ] Phase 4 complete
- [ ] Detection works end-to-end
- [ ] Messages sent to chat correctly

### Milestone 3: Web Interface
- [ ] Phase 5 complete
- [ ] All UI elements functional
- [ ] Configuration persists correctly

### Milestone 4: Production Ready
- [ ] Phase 6 complete
- [ ] Phase 7 complete
- [ ] Phase 8 complete
- [ ] Documentation complete
- [ ] All tests passing
- [ ] Security review complete

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| FFmpeg not available | Medium | High | Clear error messaging, Docker includes FFmpeg |
| YOLO model too slow | Medium | High | Use smaller model (nano), GPU acceleration |
| Twitch API rate limits | Low | Medium | Implement caching, respect limits |
| Memory leaks | Medium | High | Careful buffer management, monitoring |
| Stream capture failures | Medium | Medium | Automatic reconnection, error handling |
| High CPU usage | High | Medium | Adaptive frame rate, queue limits |

---

## Estimated Effort

| Phase | Effort | Notes |
|-------|--------|-------|
| Phase 1 | 4-6 hours | Database and repository |
| Phase 2 | 8-12 hours | Stream capture is complex |
| Phase 3 | 8-12 hours | YOLO integration |
| Phase 4 | 6-8 hours | Orchestration logic |
| Phase 5 | 8-10 hours | Full web interface |
| Phase 6 | 4-6 hours | Integration |
| Phase 7 | 6-8 hours | Optimization |
| Phase 8 | 8-12 hours | Testing and documentation |
| **Total** | **52-74 hours** | |
