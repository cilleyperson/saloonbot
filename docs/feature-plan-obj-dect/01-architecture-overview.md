# Stream Object Detection - Architecture Overview

## Executive Summary

This document outlines the architecture for implementing real-time object detection on Twitch streams using YOLO (You Only Look Once) models from Ultralytics. The feature enables the bot to monitor live streams, detect configurable objects, and post customized chat messages when objects are detected with sufficient confidence.

## Feature Requirements

### Functional Requirements

1. **Stream Monitoring**: Ability to connect to and monitor live Twitch streams
2. **Object Detection**: Real-time detection using YOLO models (YOLOv8/YOLOv11)
3. **Configurable Detection**: Administrators can specify which objects to detect
4. **Confidence Thresholds**: Per-object minimum confidence levels before triggering messages
5. **Custom Messages**: Configurable message templates for each detected object type
6. **Automatic Membership**: Auto-create bot chat membership when designating a stream for monitoring
7. **Web Interface**: Full administration through the existing web dashboard

### Non-Functional Requirements

1. **Performance**: Efficient CPU/GPU utilization for real-time detection
2. **Bandwidth**: Minimize network usage through optimized frame sampling
3. **Security**: Secure handling of stream data and user configurations
4. **Reliability**: Graceful handling of stream disconnections and errors
5. **Scalability**: Support monitoring multiple streams concurrently

## System Architecture

```
+------------------+     +-------------------+     +------------------+
|   Web Interface  |---->|   Bot Core        |---->|  Twitch Chat     |
|   (Admin UI)     |     |   (Node.js)       |     |  (Twurple)       |
+------------------+     +-------------------+     +------------------+
                               |
                               v
                    +-------------------+
                    |  Detection        |
                    |  Orchestrator     |
                    |  (Node.js)        |
                    +-------------------+
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
    +-------------------+             +-------------------+
    |  Stream Capture   |             |  YOLO Detection   |
    |  Service          |             |  Service          |
    |  (FFmpeg/Node)    |             |  (Python/ONNX)    |
    +-------------------+             +-------------------+
              |                                 |
              v                                 v
    +-------------------+             +-------------------+
    |  Twitch Stream    |             |  Detection        |
    |  (HLS/RTMP)       |             |  Results          |
    +-------------------+             +-------------------+
```

## Component Breakdown

### 1. Web Interface (Admin Dashboard)

**Location**: `src/web/routes/object-detection.js`, `src/web/views/object-detection/`

**Responsibilities**:
- Configure which streams to monitor
- Select objects to detect from YOLO's 80 COCO classes
- Set per-object confidence thresholds (0.0 - 1.0)
- Define message templates with variable substitution
- Enable/disable detection for specific streams
- View detection activity logs

### 2. Detection Orchestrator

**Location**: `src/services/detection-orchestrator.js`

**Responsibilities**:
- Manage lifecycle of stream monitors
- Coordinate between stream capture and detection services
- Handle detection events and trigger chat messages
- Implement cooldown logic to prevent message spam
- Manage concurrent stream monitoring

### 3. Stream Capture Service

**Location**: `src/services/stream-capture.js`

**Responsibilities**:
- Connect to Twitch streams via HLS (HTTP Live Streaming)
- Extract frames at configurable intervals (default: 1 frame per second)
- Handle stream reconnection on failure
- Manage frame buffers efficiently
- Support multiple concurrent streams

### 4. YOLO Detection Service

**Location**: `src/services/yolo-detection.js` (orchestration) + `python/detection_worker.py`

**Responsibilities**:
- Load and run YOLO model inference
- Process frames and return detection results
- Support multiple YOLO model sizes (nano, small, medium)
- Provide GPU acceleration when available
- Handle batch processing for efficiency

### 5. Database Layer

**Location**: `src/database/repositories/object-detection-repo.js`

**New Tables**:
- `object_detection_configs`: Per-channel detection configuration
- `object_detection_rules`: Object types, thresholds, and messages
- `object_detection_logs`: Detection event history

## Technology Choices

### YOLO Implementation Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Python subprocess** | Full Ultralytics support, GPU acceleration | Process overhead, IPC complexity | For development/flexibility |
| **ONNX Runtime (Node.js)** | Native integration, no Python dependency | Limited model support | For production/simplicity |
| **TensorFlow.js** | Pure JavaScript, browser-compatible | Lower performance | Not recommended |

**Recommended Approach**: Start with ONNX Runtime for Node.js integration, with Python subprocess fallback for advanced models.

### Stream Capture Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **FFmpeg subprocess** | Robust, handles all formats | External dependency | Recommended |
| **fluent-ffmpeg** | Node.js wrapper for FFmpeg | Still requires FFmpeg | Recommended |
| **node-media-server** | Pure Node.js | Complex, overkill | Not recommended |

**Recommended Approach**: Use fluent-ffmpeg with FFmpeg binary for stream capture.

### Frame Processing Strategy

1. **Capture**: FFmpeg extracts frames from HLS stream at 1 FPS
2. **Buffer**: Maintain a rolling buffer of recent frames
3. **Sample**: Process every Nth frame based on CPU load
4. **Detect**: Run YOLO inference on sampled frames
5. **Deduplicate**: Suppress repeated detections within cooldown period

## Data Flow

```
1. Admin configures detection via web interface
   |
   v
2. Configuration saved to SQLite database
   |
   v
3. Detection Orchestrator starts stream monitor
   |
   v
4. Stream Capture connects to Twitch HLS endpoint
   |
   v
5. Frames extracted at configured interval
   |
   v
6. Frames passed to YOLO Detection Service
   |
   v
7. Detection results filtered by configured rules
   |
   v
8. Matching detections trigger chat messages
   |
   v
9. Messages sent via Twurple ChatClient
   |
   v
10. Detection logged to database
```

## Message Template Variables

Administrators can use these variables in detection message templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{object}` | Detected object name | "cat" |
| `{confidence}` | Detection confidence | "0.95" |
| `{confidence_pct}` | Confidence as percentage | "95%" |
| `{count}` | Number of objects detected | "3" |
| `{streamer}` | Stream channel name | "StreamerName" |
| `{time}` | Detection timestamp | "14:32:05" |

**Example Template**: "I spotted a {object} in the stream! ({confidence_pct} sure)"

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/detection/channels/:id/config` | Get detection config for channel |
| PUT | `/detection/channels/:id/config` | Update detection config |
| POST | `/detection/channels/:id/rules` | Add detection rule |
| PUT | `/detection/channels/:id/rules/:ruleId` | Update detection rule |
| DELETE | `/detection/channels/:id/rules/:ruleId` | Delete detection rule |
| GET | `/detection/channels/:id/logs` | Get detection logs |
| POST | `/detection/channels/:id/start` | Start monitoring |
| POST | `/detection/channels/:id/stop` | Stop monitoring |
| GET | `/detection/status` | Get all monitoring status |
| GET | `/detection/objects` | List available YOLO objects |

## YOLO Model Classes (COCO Dataset)

The YOLO model can detect 80 object classes:

**People & Animals**: person, bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe

**Vehicles**: bicycle, car, motorcycle, airplane, bus, train, truck, boat

**Outdoor**: traffic light, fire hydrant, stop sign, parking meter, bench

**Sports**: frisbee, skis, snowboard, sports ball, kite, baseball bat, baseball glove, skateboard, surfboard, tennis racket

**Kitchen**: bottle, wine glass, cup, fork, knife, spoon, bowl

**Food**: banana, apple, sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake

**Furniture**: chair, couch, potted plant, bed, dining table, toilet

**Electronics**: tv, laptop, mouse, remote, keyboard, cell phone

**Appliances**: microwave, oven, toaster, sink, refrigerator

**Other**: book, clock, vase, scissors, teddy bear, hair drier, toothbrush

## Deployment Considerations

### Dependencies

- **FFmpeg**: Required for stream capture (system package)
- **ONNX Runtime**: For YOLO inference in Node.js
- **Python 3.10+**: Optional, for Ultralytics fallback
- **Ultralytics**: Python package for YOLO models

### Resource Requirements

| Component | CPU | RAM | GPU |
|-----------|-----|-----|-----|
| Stream Capture (per stream) | 0.5 core | 256MB | N/A |
| YOLO Detection (per stream) | 1-2 cores | 512MB-2GB | Optional |
| Total (3 streams) | 4-6 cores | 2-4GB | Recommended |

### Docker Considerations

The existing Docker setup will need:
- FFmpeg installation
- ONNX Runtime native libraries
- Optional: NVIDIA Container Toolkit for GPU support

## Next Steps

1. Review [02-implementation-plan.md](./02-implementation-plan.md) for detailed task breakdown
2. Review [03-security-considerations.md](./03-security-considerations.md) for security requirements
3. Review [04-performance-optimization.md](./04-performance-optimization.md) for efficiency strategies
4. Review [05-testing-strategy.md](./05-testing-strategy.md) for testing requirements
