const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('personality-repo');

/**
 * All supported event types for personality templates
 */
const EVENT_TYPES = [
  '8ball_response',
  'raid_shoutout',
  'counter_increment',
  'sub_notification',
  'resub_notification',
  'gift_sub_notification',
  'trivia_question',
  'trivia_correct',
  'trivia_timeout',
  'rps_result',
  'dadjoke_intro',
  'advice_intro',
  'fact_intro',
  'define_response',
  'horoscope_intro',
  'command_response',
  'detection_alert',
  'error_response'
];

/**
 * Default starter templates for new packs (generic passthroughs)
 */
const STARTER_TEMPLATES = {
  '8ball_response': ['{response}'],
  'raid_shoutout': ['@{raider} is raiding with {viewers} viewers! Check them out at https://twitch.tv/{raider}'],
  'counter_increment': ['{counter} count: {count} {emoji}'],
  'sub_notification': ['Thank you for subscribing, @{user}!'],
  'resub_notification': ['Thank you for resubscribing for {months} months, @{user}!'],
  'gift_sub_notification': ['Thank you {gifter} for gifting {gift_count} subs!'],
  'trivia_question': ['TRIVIA TIME! Category: {category} | Difficulty: {difficulty}'],
  'trivia_correct': ['@{user} got it right! The answer was {answer}! +{points} points!'],
  'trivia_timeout': ['Time\'s up! The correct answer was {answer}'],
  'rps_result': ['@{user} threw {user_choice} vs {bot_choice}! {result}!'],
  'dadjoke_intro': ['{joke}'],
  'advice_intro': ['"{quote}" - {author}'],
  'fact_intro': ['Did you know: {fact}'],
  'define_response': ['{word}: {definition}'],
  'horoscope_intro': ['{sign}: {horoscope}'],
  'command_response': ['{response}'],
  'detection_alert': ['Detected {object} on stream! (confidence: {confidence})'],
  'error_response': ['{original}']
};

/**
 * Get all personality packs
 * @returns {Array} All packs with template counts and active channel info
 */
function getAllPacks() {
  const db = getDb();
  const packs = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM personality_templates WHERE pack_id = p.id) as template_count,
      (SELECT COUNT(*) FROM channel_settings WHERE active_personality_pack_id = p.id) as active_channel_count
    FROM personality_packs p
    ORDER BY p.is_default DESC, p.name ASC
  `).all();
  return packs;
}

/**
 * Get a pack by ID
 * @param {number} packId - Pack ID
 * @returns {Object|null} Pack or null
 */
function getPackById(packId) {
  const db = getDb();
  return db.prepare('SELECT * FROM personality_packs WHERE id = ?').get(packId);
}

/**
 * Get a pack by name (case-insensitive)
 * @param {string} name - Pack name
 * @returns {Object|null} Pack or null
 */
function getPackByName(name) {
  const db = getDb();
  return db.prepare('SELECT * FROM personality_packs WHERE LOWER(name) = LOWER(?)').get(name);
}

/**
 * Create a new pack with starter templates
 * @param {string} name - Pack name
 * @param {string} description - Pack description
 * @param {string} author - Pack author
 * @returns {Object} Created pack
 */
function createPack(name, description = '', author = '') {
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO personality_packs (name, description, author)
    VALUES (?, ?, ?)
  `).run(name, description, author);

  const packId = result.lastInsertRowid;

  // Seed with starter templates
  const insertTemplate = db.prepare(`
    INSERT INTO personality_templates (pack_id, event_type, template_text)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const [eventType, templates] of Object.entries(STARTER_TEMPLATES)) {
      for (const template of templates) {
        insertTemplate.run(packId, eventType, template);
      }
    }
  });
  insertMany();

  logger.info(`Created personality pack: ${name} (id: ${packId})`);
  return getPackById(packId);
}

/**
 * Update pack metadata
 * @param {number} packId - Pack ID
 * @param {Object} data - Fields to update (name, description, author)
 * @returns {Object|null} Updated pack or null
 */
function updatePack(packId, data) {
  const db = getDb();
  const allowedFields = ['name', 'description', 'author'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return getPackById(packId);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(packId);

  db.prepare(`UPDATE personality_packs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  logger.debug(`Updated personality pack ${packId}`);
  return getPackById(packId);
}

/**
 * Delete a pack and deactivate it on all channels
 * @param {number} packId - Pack ID
 * @returns {number} Number of channels deactivated
 */
function deletePack(packId) {
  const db = getDb();

  // Deactivate on all channels first
  const deactivated = db.prepare(
    'UPDATE channel_settings SET active_personality_pack_id = NULL WHERE active_personality_pack_id = ?'
  ).run(packId);

  db.prepare('DELETE FROM personality_packs WHERE id = ?').run(packId);

  logger.info(`Deleted personality pack ${packId}, deactivated on ${deactivated.changes} channels`);
  return deactivated.changes;
}

/**
 * Duplicate a pack with all its templates
 * @param {number} packId - Source pack ID
 * @param {string} newName - Name for the copy
 * @returns {Object} New pack
 */
function duplicatePack(packId, newName) {
  const db = getDb();
  const source = getPackById(packId);
  if (!source) throw new Error('Source pack not found');

  const result = db.prepare(`
    INSERT INTO personality_packs (name, description, author)
    VALUES (?, ?, ?)
  `).run(newName, source.description, source.author);

  const newPackId = result.lastInsertRowid;

  // Copy all templates
  db.prepare(`
    INSERT INTO personality_templates (pack_id, event_type, template_text)
    SELECT ?, event_type, template_text FROM personality_templates WHERE pack_id = ?
  `).run(newPackId, packId);

  logger.info(`Duplicated pack ${packId} as "${newName}" (id: ${newPackId})`);
  return getPackById(newPackId);
}

/**
 * Get all templates for a pack, grouped by event type
 * @param {number} packId - Pack ID
 * @returns {Object} Templates grouped by event type
 */
function getTemplatesByPack(packId) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM personality_templates WHERE pack_id = ? ORDER BY event_type, id'
  ).all(packId);

  const grouped = {};
  for (const eventType of EVENT_TYPES) {
    grouped[eventType] = [];
  }
  for (const row of rows) {
    if (!grouped[row.event_type]) grouped[row.event_type] = [];
    grouped[row.event_type].push(row);
  }
  return grouped;
}

/**
 * Get a random template for an event type from a pack
 * @param {number} packId - Pack ID
 * @param {string} eventType - Event type
 * @returns {string|null} Template text or null
 */
function getRandomTemplate(packId, eventType) {
  const db = getDb();
  const templates = db.prepare(
    'SELECT template_text FROM personality_templates WHERE pack_id = ? AND event_type = ?'
  ).all(packId, eventType);

  if (templates.length === 0) return null;
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx].template_text;
}

/**
 * Get the active pack ID for a channel
 * @param {string} channelName - Channel username (without #)
 * @returns {number|null} Pack ID or null
 */
function getActivePackForChannel(channelName) {
  const db = getDb();
  const row = db.prepare(`
    SELECT cs.active_personality_pack_id
    FROM channel_settings cs
    JOIN channels c ON cs.channel_id = c.id
    WHERE LOWER(c.twitch_username) = LOWER(?)
  `).get(channelName);

  return row?.active_personality_pack_id || null;
}

/**
 * Set the active pack for a channel
 * @param {number} channelId - Channel ID
 * @param {number|null} packId - Pack ID or null to disable
 */
function setActivePackForChannel(channelId, packId) {
  const db = getDb();
  db.prepare(
    'UPDATE channel_settings SET active_personality_pack_id = ?, updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?'
  ).run(packId, channelId);
  logger.debug(`Set active personality pack for channel ${channelId} to ${packId}`);
}

/**
 * Save all templates for a pack (replaces existing)
 * @param {number} packId - Pack ID
 * @param {Object} templatesByType - { eventType: [templateText, ...], ... }
 */
function saveTemplates(packId, templatesByType) {
  const db = getDb();

  const save = db.transaction(() => {
    // Delete existing templates
    db.prepare('DELETE FROM personality_templates WHERE pack_id = ?').run(packId);

    // Insert new templates
    const insert = db.prepare(
      'INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES (?, ?, ?)'
    );

    for (const [eventType, templates] of Object.entries(templatesByType)) {
      if (!EVENT_TYPES.includes(eventType)) continue;
      for (const text of templates) {
        if (text && text.trim()) {
          insert.run(packId, eventType, text.trim());
        }
      }
    }
  });
  save();

  logger.debug(`Saved templates for pack ${packId}`);
}

/**
 * Add a single template variant
 * @param {number} packId - Pack ID
 * @param {string} eventType - Event type
 * @param {string} templateText - Template text
 * @returns {number} New template ID
 */
function addTemplate(packId, eventType, templateText) {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES (?, ?, ?)'
  ).run(packId, eventType, templateText);
  return result.lastInsertRowid;
}

/**
 * Delete a template by ID
 * @param {number} templateId - Template ID
 */
function deleteTemplate(templateId) {
  const db = getDb();
  db.prepare('DELETE FROM personality_templates WHERE id = ?').run(templateId);
}

/**
 * Export a pack as a JSON-serializable object
 * @param {number} packId - Pack ID
 * @returns {Object} Exportable pack data
 */
function exportPack(packId) {
  const pack = getPackById(packId);
  if (!pack) return null;

  const templates = getTemplatesByPack(packId);
  const templateData = {};
  for (const [eventType, rows] of Object.entries(templates)) {
    const texts = rows.map(r => r.template_text);
    if (texts.length > 0) {
      templateData[eventType] = texts;
    }
  }

  return {
    name: pack.name,
    description: pack.description,
    author: pack.author,
    templates: templateData
  };
}

/**
 * Import a pack from JSON data
 * @param {Object} data - Pack data { name, description, author, templates }
 * @returns {Object} Created pack
 */
function importPack(data) {
  if (!data || !data.name || !data.templates) {
    throw new Error('Invalid pack data: missing name or templates');
  }

  // Check for duplicate name
  if (getPackByName(data.name)) {
    throw new Error(`A pack named "${data.name}" already exists`);
  }

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO personality_packs (name, description, author)
    VALUES (?, ?, ?)
  `).run(data.name, data.description || '', data.author || '');

  const packId = result.lastInsertRowid;

  const insert = db.prepare(
    'INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES (?, ?, ?)'
  );

  let importedCount = 0;
  let skippedCount = 0;

  const importAll = db.transaction(() => {
    for (const [eventType, templates] of Object.entries(data.templates)) {
      if (!EVENT_TYPES.includes(eventType)) {
        skippedCount += Array.isArray(templates) ? templates.length : 0;
        continue;
      }
      if (!Array.isArray(templates)) continue;
      for (const text of templates) {
        if (text && typeof text === 'string' && text.trim()) {
          insert.run(packId, eventType, text.trim());
          importedCount++;
        }
      }
    }
  });
  importAll();

  logger.info(`Imported pack "${data.name}" (id: ${packId}): ${importedCount} templates, ${skippedCount} skipped`);
  return { pack: getPackById(packId), importedCount, skippedCount };
}

/**
 * Get preview data for a pack (sample themed messages)
 * @param {number} packId - Pack ID
 * @returns {Array} Sample messages
 */
function getPreviewData(packId) {
  const { formatTemplate } = require('../../utils/template');

  const sampleVars = {
    '8ball_response': { response: 'Ask again later' },
    'raid_shoutout': { raider: 'TestUser', raider_display: 'TestUser', viewers: 42, game: 'Just Chatting', channel: 'testchannel' },
    'counter_increment': { word: 'gg', count: 23, emoji: '', user: 'Viewer1' },
    'sub_notification': { user: 'NewSub', months: 1, tier: 'Tier 1', channel: 'testchannel' },
    'resub_notification': { user: 'LoyalFan', months: 12, streak: 12, tier: 'Tier 1', channel: 'testchannel' },
    'gift_sub_notification': { gifter: 'GenerosPerson', recipient: 'LuckyViewer', gift_count: 5, tier: 'Tier 1', channel: 'testchannel' },
    'trivia_question': { category: 'Science', difficulty: 'Medium', question: 'What is the chemical symbol for gold?' },
    'trivia_correct': { user: 'SmartViewer', answer: 'Au', points: 10 },
    'trivia_timeout': { answer: 'Au' },
    'rps_result': { user: 'Player1', user_choice: 'rock', bot_choice: 'scissors', result: 'You win' },
    'dadjoke_intro': { joke: 'Why did the scarecrow win an award? He was outstanding in his field!' },
    'advice_intro': { quote: 'The only way to do great work is to love what you do', author: 'Steve Jobs' },
    'fact_intro': { fact: 'Honey never spoils. Archaeologists have found 3000-year-old honey that was still edible.' },
    'define_response': { word: 'serendipity', definition: 'the occurrence of events by chance in a happy way' },
    'horoscope_intro': { sign: 'Aries', horoscope: 'Today is a great day for new beginnings.' },
    'command_response': { user: 'Viewer1', response: 'Hello from a custom command!', command: 'hello' },
    'detection_alert': { object: 'cat', confidence: '0.95', channel: 'testchannel' },
    'error_response': { original: 'Something went wrong, please try again later.' }
  };

  const previews = [];
  for (const [eventType, vars] of Object.entries(sampleVars)) {
    const template = getRandomTemplate(packId, eventType);
    if (template) {
      previews.push({
        eventType,
        message: formatTemplate(template, vars),
        template
      });
    }
  }
  return previews;
}

module.exports = {
  EVENT_TYPES,
  STARTER_TEMPLATES,
  getAllPacks,
  getPackById,
  getPackByName,
  createPack,
  updatePack,
  deletePack,
  duplicatePack,
  getTemplatesByPack,
  getRandomTemplate,
  getActivePackForChannel,
  setActivePackForChannel,
  saveTemplates,
  addTemplate,
  deleteTemplate,
  exportPack,
  importPack,
  getPreviewData
};
