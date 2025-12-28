# YOLO Model Files

This directory contains YOLO model files used for object detection.

## Required Model

The object detection feature requires a YOLOv8 model in ONNX format. The recommended model is:

**YOLOv8n (Nano)** - Smallest and fastest, suitable for real-time detection
- File: `yolov8n.onnx`
- Size: ~7MB
- Input: 640x640 RGB images
- Output: 84x8400 tensor (80 classes + 4 bbox coords)

## Download Options

### Option 1: Download from Ultralytics (Recommended)

1. Install ultralytics Python package:
   ```bash
   pip install ultralytics
   ```

2. Export the model to ONNX:
   ```python
   from ultralytics import YOLO
   model = YOLO('yolov8n.pt')
   model.export(format='onnx')
   ```

3. Copy the generated `yolov8n.onnx` to this directory.

### Option 2: Direct Download

Download pre-converted ONNX models from:
- https://github.com/ultralytics/assets/releases

Look for `yolov8n.onnx` in the releases.

### Option 3: Use the Download Script

Run the provided download script:
```bash
node scripts/download-yolo-model.js
```

## Model Variants

Other YOLOv8 variants can be used for different speed/accuracy tradeoffs:

| Model     | Size (MB) | Speed | Accuracy |
|-----------|-----------|-------|----------|
| yolov8n   | 7         | Fast  | Good     |
| yolov8s   | 22        | Medium| Better   |
| yolov8m   | 52        | Slower| Best     |

**Note:** Larger models require more memory and processing time per frame.

## Directory Structure

```
models/
├── README.md           # This file
└── yolov8n.onnx       # YOLOv8 nano model (download required)
```
