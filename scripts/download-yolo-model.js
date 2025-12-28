#!/usr/bin/env node
/**
 * Download YOLOv8 ONNX model for object detection
 *
 * Usage:
 *   node scripts/download-yolo-model.js
 *   node scripts/download-yolo-model.js --model yolov8s
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Model configurations
// Models hosted on HuggingFace: https://huggingface.co/unity/inference-engine-yolo
const MODELS = {
  yolov8n: {
    url: 'https://huggingface.co/unity/inference-engine-yolo/resolve/main/models/yolov8n.onnx',
    size: '6.4 MB',
    description: 'Nano - Fastest, smallest (recommended)'
  },
  yolov8s: {
    url: 'https://huggingface.co/unity/inference-engine-yolo/resolve/main/models/yolov8s.onnx',
    size: '22 MB',
    description: 'Small - Balanced speed/accuracy'
  },
  yolo11n: {
    url: 'https://huggingface.co/unity/inference-engine-yolo/resolve/main/models/yolo11n.onnx',
    size: '5.4 MB',
    description: 'YOLO11 Nano - Latest architecture'
  },
  yolo11s: {
    url: 'https://huggingface.co/unity/inference-engine-yolo/resolve/main/models/yolo11s.onnx',
    size: '19 MB',
    description: 'YOLO11 Small - Latest with better accuracy'
  }
};

const DEFAULT_MODEL = 'yolov8n';
const MODELS_DIR = path.join(__dirname, '..', 'models');

/**
 * Follow redirects and download file
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const request = https.get(url, (response) => {
      // Handle redirects (GitHub releases redirect)
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress && totalSize) {
          const percent = Math.round((downloadedSize / totalSize) * 100);
          onProgress(percent, downloadedSize, totalSize);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Main download function
 */
async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  let modelName = DEFAULT_MODEL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      modelName = args[i + 1];
    }
    if (args[i] === '--help' || args[i] === '-h') {
      console.log('Download YOLO model for object detection\n');
      console.log('Usage: node scripts/download-yolo-model.js [options]\n');
      console.log('Options:');
      console.log('  --model <name>   Model to download (default: yolov8n)');
      console.log('  --help, -h       Show this help\n');
      console.log('Available models:');
      for (const [name, config] of Object.entries(MODELS)) {
        console.log(`  ${name.padEnd(10)} ${config.size.padEnd(8)} ${config.description}`);
      }
      process.exit(0);
    }
  }

  const model = MODELS[modelName];
  if (!model) {
    console.error(`Unknown model: ${modelName}`);
    console.error(`Available models: ${Object.keys(MODELS).join(', ')}`);
    process.exit(1);
  }

  // Ensure models directory exists
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  const destPath = path.join(MODELS_DIR, `${modelName}.onnx`);

  // Check if already exists
  if (fs.existsSync(destPath)) {
    console.log(`Model already exists: ${destPath}`);
    console.log('Delete the file to re-download.');
    process.exit(0);
  }

  console.log(`Downloading ${modelName} (${model.size})...`);
  console.log(`Source: ${model.url}`);
  console.log(`Destination: ${destPath}\n`);

  let lastPercent = -1;
  const isTTY = process.stdout.isTTY;

  try {
    await downloadFile(model.url, destPath, (percent, downloaded, total) => {
      if (percent !== lastPercent) {
        if (isTTY && process.stdout.clearLine) {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(`Progress: ${percent}% (${formatBytes(downloaded)} / ${formatBytes(total)})`);
        } else if (percent % 10 === 0) {
          // Non-TTY: print every 10%
          console.log(`Progress: ${percent}% (${formatBytes(downloaded)} / ${formatBytes(total)})`);
        }
        lastPercent = percent;
      }
    });

    console.log('\n\nDownload complete!');
    console.log(`Model saved to: ${destPath}`);

    // Verify file size
    const stats = fs.statSync(destPath);
    console.log(`File size: ${formatBytes(stats.size)}`);

  } catch (error) {
    console.error(`\nDownload failed: ${error.message}`);
    console.error('\nManual download instructions:');
    console.error(`1. Visit: ${model.url}`);
    console.error(`2. Save the file as: ${destPath}`);
    process.exit(1);
  }
}

main();
