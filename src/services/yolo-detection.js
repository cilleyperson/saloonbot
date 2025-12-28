/**
 * YOLO Object Detection Service
 * Runs object detection using YOLO models via ONNX Runtime
 */

const ort = require('onnxruntime-node');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { createChildLogger } = require('../utils/logger');
const { getClassName, COCO_CLASSES } = require('../constants/yolo-classes');

const logger = createChildLogger('yolo-detection');

// Constants
const DEFAULT_MODEL_PATH = 'models/yolov8n.onnx';
const DEFAULT_INPUT_SIZE = 640;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.25;
const DEFAULT_IOU_THRESHOLD = 0.45;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_INFERENCE_TIMEOUT_MS = 30000; // 30 seconds

/**
 * YOLO Object Detector class
 * Handles model loading, image preprocessing, inference, and post-processing
 */
class YOLODetector {
  /**
   * Create a new YOLO detector instance
   * @param {Object} options - Configuration options
   * @param {string} options.modelPath - Path to the ONNX model file
   * @param {number} options.inputSize - Model input size (default 640)
   * @param {number} options.confidenceThreshold - Minimum confidence threshold (default 0.25)
   * @param {number} options.iouThreshold - IoU threshold for NMS (default 0.45)
   * @param {number} options.inferenceTimeout - Inference timeout in ms (default 30000)
   */
  constructor(options = {}) {
    this.modelPath = options.modelPath || DEFAULT_MODEL_PATH;
    this.inputSize = options.inputSize || DEFAULT_INPUT_SIZE;
    this.confidenceThreshold = options.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
    this.iouThreshold = options.iouThreshold || DEFAULT_IOU_THRESHOLD;
    this.inferenceTimeout = options.inferenceTimeout || DEFAULT_INFERENCE_TIMEOUT_MS;

    this.session = null;
    this.inputName = null;
    this.outputName = null;
    this.isInitialized = false;

    logger.debug('YOLODetector created', {
      modelPath: this.modelPath,
      inputSize: this.inputSize,
      confidenceThreshold: this.confidenceThreshold,
      iouThreshold: this.iouThreshold
    });
  }

  /**
   * Initialize the detector by loading the ONNX model
   * @returns {Promise<void>}
   * @throws {Error} If model file not found or loading fails
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('YOLODetector already initialized');
      return;
    }

    const absoluteModelPath = path.isAbsolute(this.modelPath)
      ? this.modelPath
      : path.resolve(process.cwd(), this.modelPath);

    // Validate model file exists
    if (!fs.existsSync(absoluteModelPath)) {
      const error = new Error(`Model file not found: ${absoluteModelPath}`);
      logger.error('Model file not found', { modelPath: absoluteModelPath });
      throw error;
    }

    try {
      logger.info('Loading YOLO model', { modelPath: absoluteModelPath });

      // Create inference session with optimizations
      const sessionOptions = {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all'
      };

      this.session = await ort.InferenceSession.create(absoluteModelPath, sessionOptions);

      // Get input/output names from model
      this.inputName = this.session.inputNames[0];
      this.outputName = this.session.outputNames[0];

      this.isInitialized = true;

      logger.info('YOLO model loaded successfully', {
        inputName: this.inputName,
        outputName: this.outputName,
        inputNames: this.session.inputNames,
        outputNames: this.session.outputNames
      });

    } catch (error) {
      logger.error('Failed to load YOLO model', { error: error.message });
      throw new Error(`Failed to load YOLO model: ${error.message}`);
    }
  }

  /**
   * Run object detection on an image
   * @param {Buffer} imageBuffer - Image data as a Buffer
   * @returns {Promise<Object>} Detection results
   */
  async detect(imageBuffer) {
    if (!this.isInitialized) {
      throw new Error('YOLODetector not initialized. Call initialize() first.');
    }

    // Validate image buffer
    this._validateImageBuffer(imageBuffer);

    const startTime = Date.now();
    let originalWidth, originalHeight;
    let tensorData;

    try {
      // Preprocess image
      const preprocessResult = await this._preprocessImage(imageBuffer);
      tensorData = preprocessResult.tensorData;
      originalWidth = preprocessResult.originalWidth;
      originalHeight = preprocessResult.originalHeight;

    } catch (error) {
      logger.error('Image preprocessing failed', { error: error.message });
      throw new Error(`Failed to preprocess image: ${error.message}`);
    }

    let outputData;

    try {
      // Create input tensor (NCHW format: batch, channels, height, width)
      const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, this.inputSize, this.inputSize]);

      // Run inference with timeout
      const feeds = { [this.inputName]: inputTensor };
      const results = await this._runWithTimeout(
        this.session.run(feeds),
        this.inferenceTimeout
      );

      outputData = results[this.outputName].data;

    } catch (error) {
      if (error.message === 'Inference timeout') {
        logger.error('Inference timed out', { timeout: this.inferenceTimeout });
        throw new Error('Object detection timed out');
      }
      logger.error('Inference failed', { error: error.message });
      throw new Error(`Object detection failed: ${error.message}`);
    }

    // Post-process results
    const detections = this._postProcess(
      outputData,
      originalWidth,
      originalHeight
    );

    const inferenceTime = Date.now() - startTime;

    logger.debug('Detection complete', {
      detectionCount: detections.length,
      inferenceTime
    });

    return {
      detections,
      inferenceTime,
      timestamp: Date.now()
    };
  }

  /**
   * Get information about the loaded model
   * @returns {Object} Model information
   */
  getModelInfo() {
    if (!this.isInitialized) {
      return {
        initialized: false,
        modelPath: this.modelPath,
        inputSize: this.inputSize,
        confidenceThreshold: this.confidenceThreshold,
        iouThreshold: this.iouThreshold,
        numClasses: COCO_CLASSES.length
      };
    }

    return {
      initialized: true,
      modelPath: this.modelPath,
      inputSize: this.inputSize,
      confidenceThreshold: this.confidenceThreshold,
      iouThreshold: this.iouThreshold,
      numClasses: COCO_CLASSES.length,
      inputName: this.inputName,
      outputName: this.outputName,
      inputNames: this.session.inputNames,
      outputNames: this.session.outputNames
    };
  }

  /**
   * Clean up model resources
   */
  dispose() {
    if (this.session) {
      // ONNX Runtime sessions don't have an explicit dispose method
      // but we can clear our references
      this.session = null;
      this.inputName = null;
      this.outputName = null;
      this.isInitialized = false;

      logger.info('YOLODetector disposed');
    }
  }

  /**
   * Validate image buffer
   * @param {Buffer} imageBuffer - Image buffer to validate
   * @private
   */
  _validateImageBuffer(imageBuffer) {
    if (!imageBuffer) {
      throw new Error('Image buffer is required');
    }

    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('Input must be a Buffer');
    }

    if (imageBuffer.length === 0) {
      throw new Error('Image buffer is empty');
    }

    if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`);
    }
  }

  /**
   * Preprocess image for model input
   * @param {Buffer} imageBuffer - Raw image buffer
   * @returns {Promise<Object>} Preprocessed tensor data and original dimensions
   * @private
   */
  async _preprocessImage(imageBuffer) {
    // Get original image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    if (!originalWidth || !originalHeight) {
      throw new Error('Could not determine image dimensions');
    }

    // Resize and convert to raw RGB
    const { data, info } = await sharp(imageBuffer)
      .resize(this.inputSize, this.inputSize, {
        fit: 'fill',
        kernel: 'lanczos3'
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Convert to float32 and normalize to 0-1
    // Also convert from HWC (height, width, channels) to CHW (channels, height, width)
    const float32Data = new Float32Array(3 * this.inputSize * this.inputSize);
    const pixelCount = this.inputSize * this.inputSize;

    for (let i = 0; i < pixelCount; i++) {
      // data is in RGB format, 3 bytes per pixel
      const r = data[i * 3] / 255.0;
      const g = data[i * 3 + 1] / 255.0;
      const b = data[i * 3 + 2] / 255.0;

      // Place in CHW format
      float32Data[i] = r;                    // R channel
      float32Data[pixelCount + i] = g;       // G channel
      float32Data[2 * pixelCount + i] = b;   // B channel
    }

    return {
      tensorData: float32Data,
      originalWidth,
      originalHeight
    };
  }

  /**
   * Run a promise with timeout
   * @param {Promise} promise - Promise to run
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} Result of the promise
   * @private
   */
  _runWithTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Inference timeout'));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Post-process YOLO output to extract detections
   * Handles YOLOv8 output format: [1, 84, 8400] where 84 = 4 bbox + 80 classes
   * @param {Float32Array} outputData - Raw model output
   * @param {number} originalWidth - Original image width
   * @param {number} originalHeight - Original image height
   * @returns {Array} Array of detection objects
   * @private
   */
  _postProcess(outputData, originalWidth, originalHeight) {
    const numClasses = COCO_CLASSES.length; // 80
    const numBoxes = 8400; // YOLOv8 default grid

    // YOLOv8 output is [1, 84, 8400] - transposed compared to v5
    // Each column is a detection: [cx, cy, w, h, class1_conf, class2_conf, ..., class80_conf]

    const candidates = [];

    for (let i = 0; i < numBoxes; i++) {
      // Get bounding box values (center x, center y, width, height)
      const cx = outputData[0 * numBoxes + i];
      const cy = outputData[1 * numBoxes + i];
      const w = outputData[2 * numBoxes + i];
      const h = outputData[3 * numBoxes + i];

      // Find the class with highest confidence
      let maxClassConf = 0;
      let maxClassId = 0;

      for (let c = 0; c < numClasses; c++) {
        const classConf = outputData[(4 + c) * numBoxes + i];
        if (classConf > maxClassConf) {
          maxClassConf = classConf;
          maxClassId = c;
        }
      }

      // Filter by confidence threshold
      if (maxClassConf >= this.confidenceThreshold) {
        // Convert from center format to corner format and scale to original image
        const scaleX = originalWidth / this.inputSize;
        const scaleY = originalHeight / this.inputSize;

        const x = (cx - w / 2) * scaleX;
        const y = (cy - h / 2) * scaleY;
        const width = w * scaleX;
        const height = h * scaleY;

        candidates.push({
          classId: maxClassId,
          class: getClassName(maxClassId),
          confidence: maxClassConf,
          bbox: {
            x: Math.max(0, x),
            y: Math.max(0, y),
            width: Math.min(width, originalWidth - x),
            height: Math.min(height, originalHeight - y)
          }
        });
      }
    }

    // Apply Non-Maximum Suppression
    const detections = this._nonMaxSuppression(candidates);

    // Sort by confidence (highest first)
    detections.sort((a, b) => b.confidence - a.confidence);

    return detections;
  }

  /**
   * Apply Non-Maximum Suppression to remove overlapping detections
   * @param {Array} candidates - Array of detection candidates
   * @returns {Array} Filtered detections
   * @private
   */
  _nonMaxSuppression(candidates) {
    if (candidates.length === 0) {
      return [];
    }

    // Sort by confidence (descending)
    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    const selected = [];
    const suppressed = new Set();

    for (let i = 0; i < sorted.length; i++) {
      if (suppressed.has(i)) {
        continue;
      }

      const current = sorted[i];
      selected.push(current);

      // Check remaining boxes for overlap
      for (let j = i + 1; j < sorted.length; j++) {
        if (suppressed.has(j)) {
          continue;
        }

        const other = sorted[j];

        // Only suppress if same class
        if (current.classId !== other.classId) {
          continue;
        }

        const iou = this._calculateIoU(current.bbox, other.bbox);
        if (iou >= this.iouThreshold) {
          suppressed.add(j);
        }
      }
    }

    return selected;
  }

  /**
   * Calculate Intersection over Union (IoU) between two bounding boxes
   * @param {Object} box1 - First bounding box {x, y, width, height}
   * @param {Object} box2 - Second bounding box {x, y, width, height}
   * @returns {number} IoU value (0-1)
   * @private
   */
  _calculateIoU(box1, box2) {
    // Calculate intersection
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    const intersectionWidth = Math.max(0, x2 - x1);
    const intersectionHeight = Math.max(0, y2 - y1);
    const intersectionArea = intersectionWidth * intersectionHeight;

    // Calculate union
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const unionArea = area1 + area2 - intersectionArea;

    if (unionArea === 0) {
      return 0;
    }

    return intersectionArea / unionArea;
  }
}

/**
 * Download instructions for YOLO model
 * The model file must be downloaded separately as it's too large to include in the repo
 *
 * To download YOLOv8n ONNX model:
 *
 * Option 1: Using Python and ultralytics
 *   pip install ultralytics
 *   python -c "from ultralytics import YOLO; model = YOLO('yolov8n.pt'); model.export(format='onnx')"
 *
 * Option 2: Download pre-exported model
 *   mkdir -p models
 *   curl -L -o models/yolov8n.onnx https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx
 *
 * The model should be placed at: models/yolov8n.onnx
 */
function getModelDownloadInstructions() {
  return `
YOLO Model Download Instructions
================================

The YOLO model file must be downloaded separately.

Option 1: Using Python and ultralytics
--------------------------------------
pip install ultralytics
python -c "from ultralytics import YOLO; model = YOLO('yolov8n.pt'); model.export(format='onnx')"
mv yolov8n.onnx models/

Option 2: Download pre-exported model
-------------------------------------
mkdir -p models
curl -L -o models/yolov8n.onnx https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx

The model should be placed at: models/yolov8n.onnx
`.trim();
}

module.exports = {
  YOLODetector,
  getModelDownloadInstructions,
  DEFAULT_MODEL_PATH,
  DEFAULT_INPUT_SIZE,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_IOU_THRESHOLD,
  MAX_IMAGE_SIZE_BYTES
};
