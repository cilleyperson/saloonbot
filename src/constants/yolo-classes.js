/**
 * YOLO Object Detection Classes
 * Defines all 80 COCO class names with their IDs for object detection
 */

/**
 * COCO class names indexed by ID (0-79)
 */
const COCO_CLASSES = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush'
];

/**
 * Map of class names to their IDs for quick lookup
 */
const CLASS_NAME_TO_ID = {};
COCO_CLASSES.forEach((name, id) => {
  CLASS_NAME_TO_ID[name] = id;
});

/**
 * Class categories for grouping related objects
 */
const CATEGORIES = {
  people: ['person'],
  animals: [
    'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
    'elephant', 'bear', 'zebra', 'giraffe'
  ],
  vehicles: [
    'bicycle', 'car', 'motorcycle', 'airplane', 'bus',
    'train', 'truck', 'boat'
  ],
  outdoor: [
    'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench'
  ],
  sports: [
    'frisbee', 'skis', 'snowboard', 'sports ball', 'kite',
    'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket'
  ],
  kitchen: [
    'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl'
  ],
  food: [
    'banana', 'apple', 'sandwich', 'orange', 'broccoli',
    'carrot', 'hot dog', 'pizza', 'donut', 'cake'
  ],
  furniture: [
    'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet'
  ],
  electronics: [
    'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone'
  ],
  appliances: [
    'microwave', 'oven', 'toaster', 'sink', 'refrigerator'
  ],
  other: [
    'backpack', 'umbrella', 'handbag', 'tie', 'suitcase',
    'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
  ]
};

/**
 * Get the class name for a given ID
 * @param {number} id - Class ID (0-79)
 * @returns {string|null} Class name or null if invalid ID
 */
function getClassName(id) {
  if (typeof id !== 'number' || id < 0 || id >= COCO_CLASSES.length) {
    return null;
  }
  return COCO_CLASSES[id];
}

/**
 * Get the ID for a given class name
 * @param {string} name - Class name
 * @returns {number|null} Class ID or null if invalid name
 */
function getClassId(name) {
  if (typeof name !== 'string') {
    return null;
  }
  const id = CLASS_NAME_TO_ID[name.toLowerCase()];
  return id !== undefined ? id : null;
}

/**
 * Get an array of all class names
 * @returns {string[]} Array of all 80 COCO class names
 */
function getAllClasses() {
  return [...COCO_CLASSES];
}

/**
 * Get classes grouped by category
 * @param {string} category - Category name (people, animals, vehicles, outdoor, sports, kitchen, food, furniture, electronics, appliances, other)
 * @returns {string[]|null} Array of class names in the category, or null if invalid category
 */
function getClassesByCategory(category) {
  if (typeof category !== 'string') {
    return null;
  }
  const classes = CATEGORIES[category.toLowerCase()];
  return classes ? [...classes] : null;
}

/**
 * Get all available category names
 * @returns {string[]} Array of category names
 */
function getAllCategories() {
  return Object.keys(CATEGORIES);
}

/**
 * Get the category for a given class name
 * @param {string} className - Class name
 * @returns {string|null} Category name or null if not found
 */
function getCategoryForClass(className) {
  if (typeof className !== 'string') {
    return null;
  }
  const normalizedName = className.toLowerCase();
  for (const [category, classes] of Object.entries(CATEGORIES)) {
    if (classes.includes(normalizedName)) {
      return category;
    }
  }
  return null;
}

module.exports = {
  COCO_CLASSES,
  CATEGORIES,
  getClassName,
  getClassId,
  getAllClasses,
  getClassesByCategory,
  getAllCategories,
  getCategoryForClass
};
