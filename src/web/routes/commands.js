const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const channelRepo = require('../../database/repositories/channel-repo');
const commandRepo = require('../../database/repositories/command-repo');
const commandResponsesRepo = require('../../database/repositories/command-responses-repo');
const chatMembershipRepo = require('../../database/repositories/chat-membership-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('command-routes');

// Configure multer for file uploads (temporary storage)
const uploadDir = path.join(__dirname, '../../../data/uploads');
const uploadRoot = path.resolve(uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Validate that a file path is within the upload directory
 * Prevents path traversal attacks
 * @param {string} filePath - The file path to validate
 * @returns {string|null} The safe resolved path, or null if invalid
 */
function validateUploadPath(filePath) {
  // Resolve the provided path against the upload root to prevent path traversal
  const resolvedPath = path.resolve(uploadRoot, filePath);
  if (!resolvedPath.startsWith(uploadRoot + path.sep) && resolvedPath !== uploadRoot) {
    return null;
  }
  return resolvedPath;
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 1024 * 1024 // 1MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Only accept text files
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
});

/**
 * List commands for a channel
 */
router.get('/:id/commands', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const commands = commandRepo.findByChannel(channelId);

  res.render('commands/list', {
    title: `Commands - ${channel.display_name || channel.twitch_username}`,
    channel,
    commands,
    userLevels: commandRepo.USER_LEVELS
  });
});

/**
 * New command form
 */
router.get('/:id/commands/new', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const chatMemberships = chatMembershipRepo.findByChannel(channelId, true);

  res.render('commands/form', {
    title: `New Command - ${channel.display_name || channel.twitch_username}`,
    channel,
    command: null,
    userLevels: commandRepo.USER_LEVELS,
    responseModes: commandRepo.RESPONSE_MODES,
    emojiPositions: commandRepo.EMOJI_POSITIONS,
    chatMemberships,
    isNew: true
  });
});

/**
 * Create command
 */
router.post('/:id/commands', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const channel = channelRepo.findById(channelId);

  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  try {
    let { command_name, response, cooldown_seconds, user_level, chat_scope, response_mode, emoji, emoji_position } = req.body;
    let chatScopes = req.body.chat_scopes || [];

    // Ensure chatScopes is an array
    if (!Array.isArray(chatScopes)) {
      chatScopes = chatScopes ? [chatScopes] : [];
    }

    logger.debug('Create command request', { channelId, body: req.body });

    // Validate command_name exists
    if (!command_name) {
      req.flash('error', 'Command name is required');
      return res.redirect(`/channels/${channelId}/commands/new`);
    }

    // Clean up command name
    command_name = command_name.toLowerCase().replace(/^!/, '').trim();

    // Validate
    if (!command_name || !command_name.match(/^[a-z0-9_]+$/)) {
      req.flash('error', 'Command name must be alphanumeric (letters, numbers, underscores only)');
      return res.redirect(`/channels/${channelId}/commands/new`);
    }

    // For single mode, response is required
    // For random mode, response is optional (can be blank placeholder)
    if (response_mode !== 'random' && (!response || response.trim().length === 0)) {
      req.flash('error', 'Response cannot be empty');
      return res.redirect(`/channels/${channelId}/commands/new`);
    }

    if (commandRepo.exists(channelId, command_name)) {
      req.flash('error', `Command !${command_name} already exists`);
      return res.redirect(`/channels/${channelId}/commands/new`);
    }

    // Validate chat scope
    if (chat_scope === 'selected' && chatScopes.length === 0) {
      req.flash('error', 'At least one chat must be selected when using "Selected Chats Only"');
      return res.redirect(`/channels/${channelId}/commands/new`);
    }

    commandRepo.create(channelId, command_name, (response || '').trim(), {
      cooldownSeconds: parseInt(cooldown_seconds, 10) || 5,
      userLevel: user_level || 'everyone',
      chatScope: chat_scope || 'all',
      chatScopes: chatScopes,
      responseMode: response_mode || 'single',
      emoji: emoji && emoji.trim() ? emoji.trim() : null,
      emojiPosition: emoji_position || 'start'
    });

    logger.info(`Command created: !${command_name} for ${channel.twitch_username}`);
    req.flash('success', `Command !${command_name} created successfully`);
    res.redirect(`/channels/${channelId}/commands`);
  } catch (err) {
    logger.error('Failed to create command', { error: err.message });
    req.flash('error', `Failed to create command: ${err.message}`);
    res.redirect(`/channels/${channelId}/commands/new`);
  }
});

/**
 * Edit command form
 */
router.get('/:id/commands/:cmdId/edit', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  const chatMemberships = chatMembershipRepo.findByChannel(channelId, true);

  const responseCount = commandResponsesRepo.count(cmdId);

  res.render('commands/form', {
    title: `Edit !${command.command_name} - ${channel.display_name || channel.twitch_username}`,
    channel,
    command,
    userLevels: commandRepo.USER_LEVELS,
    responseModes: commandRepo.RESPONSE_MODES,
    emojiPositions: commandRepo.EMOJI_POSITIONS,
    chatMemberships,
    responseCount,
    isNew: false
  });
});

/**
 * Update command
 */
router.post('/:id/commands/:cmdId', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  try {
    const { response, cooldown_seconds, user_level, is_enabled, chat_scope, response_mode, emoji, emoji_position } = req.body;
    let chatScopes = req.body.chat_scopes || [];

    // Ensure chatScopes is an array
    if (!Array.isArray(chatScopes)) {
      chatScopes = chatScopes ? [chatScopes] : [];
    }

    // For single mode, response is required
    // For random mode, response is optional (can be blank placeholder)
    if (response_mode !== 'random' && (!response || response.trim().length === 0)) {
      req.flash('error', 'Response cannot be empty');
      return res.redirect(`/channels/${channelId}/commands/${cmdId}/edit`);
    }

    // Validate chat scope
    if (chat_scope === 'selected' && chatScopes.length === 0) {
      req.flash('error', 'At least one chat must be selected when using "Selected Chats Only"');
      return res.redirect(`/channels/${channelId}/commands/${cmdId}/edit`);
    }

    commandRepo.update(cmdId, {
      response: (response || '').trim(),
      cooldown_seconds: parseInt(cooldown_seconds, 10) || 5,
      user_level: user_level || 'everyone',
      is_enabled: is_enabled === 'on',
      chat_scope: chat_scope || 'all',
      chatScopes: chatScopes,
      response_mode: response_mode || 'single',
      emoji: emoji && emoji.trim() ? emoji.trim() : null,
      emoji_position: emoji_position || 'start'
    });

    logger.info(`Command updated: !${command.command_name} for ${channel.twitch_username}`);
    req.flash('success', `Command !${command.command_name} updated successfully`);
    res.redirect(`/channels/${channelId}/commands`);
  } catch (err) {
    logger.error('Failed to update command', { error: err.message });
    req.flash('error', `Failed to update command: ${err.message}`);
    res.redirect(`/channels/${channelId}/commands/${cmdId}/edit`);
  }
});

/**
 * Toggle command enabled
 */
router.post('/:id/commands/:cmdId/toggle', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  try {
    commandRepo.toggleEnabled(cmdId);
    req.flash('success', `Command !${command.command_name} ${command.is_enabled ? 'disabled' : 'enabled'}`);
  } catch (err) {
    req.flash('error', `Failed to toggle command: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/commands`);
});

/**
 * Delete command
 */
router.post('/:id/commands/:cmdId/delete', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  try {
    commandRepo.remove(cmdId);
    logger.info(`Command deleted: !${command.command_name}`);
    req.flash('success', `Command !${command.command_name} deleted`);
  } catch (err) {
    req.flash('error', `Failed to delete command: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/commands`);
});

// ============================================
// Command Responses Routes
// ============================================

/**
 * List responses for a command (paginated)
 */
router.get('/:id/commands/:cmdId/responses', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = 10;

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  const paginatedResponses = commandResponsesRepo.findByCommandPaginated(cmdId, page, perPage);

  res.render('commands/responses', {
    title: `Responses for !${command.command_name} - ${channel.display_name || channel.twitch_username}`,
    channel,
    command,
    responses: paginatedResponses.items,
    pagination: {
      page: paginatedResponses.page,
      pages: paginatedResponses.pages,
      total: paginatedResponses.total,
      perPage: paginatedResponses.perPage
    }
  });
});

/**
 * Add response to a command
 */
router.post('/:id/commands/:cmdId/responses', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  try {
    const { response_text, weight } = req.body;

    if (!response_text || response_text.trim().length === 0) {
      req.flash('error', 'Response text cannot be empty');
      return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
    }

    commandResponsesRepo.create(cmdId, response_text.trim(), {
      weight: parseInt(weight, 10) || 1
    });

    logger.info(`Response added to !${command.command_name}`);
    req.flash('success', 'Response added successfully');
  } catch (err) {
    logger.error('Failed to add response', { error: err.message });
    req.flash('error', `Failed to add response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
});

/**
 * Update a response
 */
router.post('/:id/commands/:cmdId/responses/:respId', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);
  const respId = parseInt(req.params.respId, 10);

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  const response = commandResponsesRepo.findById(respId);
  if (!response || response.command_id !== cmdId) {
    req.flash('error', 'Response not found');
    return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
  }

  try {
    const { response_text, weight, is_enabled } = req.body;

    if (!response_text || response_text.trim().length === 0) {
      req.flash('error', 'Response text cannot be empty');
      return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
    }

    commandResponsesRepo.update(respId, {
      response_text: response_text.trim(),
      weight: parseInt(weight, 10) || 1,
      is_enabled: is_enabled === 'on'
    });

    logger.info(`Response ${respId} updated for !${command.command_name}`);
    req.flash('success', 'Response updated successfully');
  } catch (err) {
    logger.error('Failed to update response', { error: err.message });
    req.flash('error', `Failed to update response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
});

/**
 * Toggle response enabled
 */
router.post('/:id/commands/:cmdId/responses/:respId/toggle', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);
  const respId = parseInt(req.params.respId, 10);

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  const response = commandResponsesRepo.findById(respId);
  if (!response || response.command_id !== cmdId) {
    req.flash('error', 'Response not found');
    return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
  }

  try {
    commandResponsesRepo.toggleEnabled(respId);
    req.flash('success', `Response ${response.is_enabled ? 'disabled' : 'enabled'}`);
  } catch (err) {
    req.flash('error', `Failed to toggle response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
});

/**
 * Delete a response
 */
router.post('/:id/commands/:cmdId/responses/:respId/delete', (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);
  const respId = parseInt(req.params.respId, 10);

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  const response = commandResponsesRepo.findById(respId);
  if (!response || response.command_id !== cmdId) {
    req.flash('error', 'Response not found');
    return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
  }

  try {
    commandResponsesRepo.remove(respId);
    logger.info(`Response ${respId} deleted from !${command.command_name}`);
    req.flash('success', 'Response deleted');
  } catch (err) {
    req.flash('error', `Failed to delete response: ${err.message}`);
  }

  res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
});

/**
 * Import responses from a text file
 * Each line in the file becomes a separate response with weight=1
 */
router.post('/:id/commands/:cmdId/responses/import', upload.single('responses_file'), (req, res) => {
  const channelId = parseInt(req.params.id, 10);
  const cmdId = parseInt(req.params.cmdId, 10);

  const channel = channelRepo.findById(channelId);
  if (!channel) {
    req.flash('error', 'Channel not found');
    return res.redirect('/channels');
  }

  const command = commandRepo.findById(cmdId);
  if (!command || command.channel_id !== channelId) {
    req.flash('error', 'Command not found');
    return res.redirect(`/channels/${channelId}/commands`);
  }

  // Check if command is in random mode
  if (command.response_mode !== 'random') {
    req.flash('error', 'Import is only available for commands with random response mode');
    return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
  }

  if (!req.file) {
    req.flash('error', 'Please select a file to upload');
    return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
  }

  // Validate that the file path is within the upload directory (prevent path traversal)
  const safeFilePath = validateUploadPath(req.file.path);
  if (!safeFilePath) {
    logger.warn('Path traversal attempt detected in file upload', {
      providedPath: req.file.path,
      uploadRoot
    });
    req.flash('error', 'Invalid file path');
    return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
  }

  try {
    // Read and parse the file using validated path
    const fileContent = fs.readFileSync(safeFilePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/);

    // Filter out empty lines
    const responses = lines.filter(line => line.trim().length > 0);

    if (responses.length === 0) {
      req.flash('error', 'The file contains no valid responses');
      return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
    }

    // Bulk insert responses with weight=1
    const insertedCount = commandResponsesRepo.createBulk(cmdId, responses, { weight: 1 });

    logger.info(`Imported ${insertedCount} responses for !${command.command_name} from file`, {
      channelId,
      commandId: cmdId,
      fileName: req.file.originalname
    });

    req.flash('success', `Successfully imported ${insertedCount} responses`);
  } catch (err) {
    logger.error('Failed to import responses', { error: err.message, safeFilePath });
    req.flash('error', `Failed to import responses: ${err.message}`);
  } finally {
    // Always delete the uploaded file using validated path
    try {
      fs.unlinkSync(safeFilePath);
      logger.debug(`Deleted temporary upload file: ${safeFilePath}`);
    } catch (unlinkErr) {
      logger.warn(`Failed to delete temporary file: ${safeFilePath}`, { error: unlinkErr.message });
    }
  }

  res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
});

// Handle multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      req.flash('error', 'File size exceeds 1MB limit');
    } else {
      req.flash('error', `Upload error: ${err.message}`);
    }
    // Try to redirect back to responses page
    const channelId = req.params.id;
    const cmdId = req.params.cmdId;
    if (channelId && cmdId) {
      return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
    }
  } else if (err.message === 'Only .txt files are allowed') {
    req.flash('error', err.message);
    const channelId = req.params.id;
    const cmdId = req.params.cmdId;
    if (channelId && cmdId) {
      return res.redirect(`/channels/${channelId}/commands/${cmdId}/responses`);
    }
  }
  next(err);
});

module.exports = router;
