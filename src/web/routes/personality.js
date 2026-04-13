const express = require('express');
const router = express.Router();
const personalityRepo = require('../../database/repositories/personality-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('personality-routes');

/**
 * List all personality packs
 */
router.get('/', (req, res) => {
  const packs = personalityRepo.getAllPacks();

  res.render('personality/list', {
    title: 'Personality Packs',
    packs
  });
});

/**
 * Create new pack form
 */
router.get('/new', (req, res) => {
  res.render('personality/editor', {
    title: 'Create Personality Pack',
    pack: null,
    templates: null,
    eventTypes: personalityRepo.EVENT_TYPES,
    isNew: true
  });
});

/**
 * Create new pack (POST)
 */
router.post('/new', (req, res) => {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    req.flash('error', 'Pack name is required');
    return res.redirect('/personality/new');
  }

  try {
    const existing = personalityRepo.getPackByName(name.trim());
    if (existing) {
      req.flash('error', `A pack named "${name}" already exists`);
      return res.redirect('/personality/new');
    }

    const pack = personalityRepo.createPack(name.trim(), description || '');
    req.flash('success', `Pack "${pack.name}" created with starter templates`);
    res.redirect(`/personality/${pack.id}`);
  } catch (error) {
    logger.error('Failed to create pack', { error: error.message });
    req.flash('error', 'Failed to create pack');
    res.redirect('/personality/new');
  }
});

/**
 * Edit pack page
 */
router.get('/:id', (req, res) => {
  const packId = parseInt(req.params.id, 10);
  const pack = personalityRepo.getPackById(packId);

  if (!pack) {
    req.flash('error', 'Pack not found');
    return res.redirect('/personality');
  }

  const templates = personalityRepo.getTemplatesByPack(packId);

  res.render('personality/editor', {
    title: `Edit: ${pack.name}`,
    pack,
    templates,
    eventTypes: personalityRepo.EVENT_TYPES,
    isNew: false
  });
});

/**
 * Save pack (POST) — updates metadata and all templates
 */
router.post('/:id', (req, res) => {
  const packId = parseInt(req.params.id, 10);
  const pack = personalityRepo.getPackById(packId);

  if (!pack) {
    req.flash('error', 'Pack not found');
    return res.redirect('/personality');
  }

  const { name, description } = req.body;

  try {
    // Update metadata
    if (name && name.trim()) {
      personalityRepo.updatePack(packId, { name: name.trim(), description: description || '' });
    }

    // Collect templates from form data
    // Form fields are like: templates[8ball_response][] = "template text"
    const templatesByType = {};
    const templates = req.body.templates || {};

    for (const [eventType, values] of Object.entries(templates)) {
      if (Array.isArray(values)) {
        templatesByType[eventType] = values.filter(v => v && v.trim());
      } else if (values && values.trim()) {
        templatesByType[eventType] = [values];
      }
    }

    personalityRepo.saveTemplates(packId, templatesByType);

    req.flash('success', 'Pack saved');
    res.redirect(`/personality/${packId}`);
  } catch (error) {
    logger.error('Failed to save pack', { error: error.message });
    req.flash('error', 'Failed to save pack');
    res.redirect(`/personality/${packId}`);
  }
});

/**
 * Delete pack
 */
router.post('/:id/delete', (req, res) => {
  const packId = parseInt(req.params.id, 10);
  const pack = personalityRepo.getPackById(packId);

  if (!pack) {
    req.flash('error', 'Pack not found');
    return res.redirect('/personality');
  }

  if (pack.is_default) {
    req.flash('error', 'Cannot delete the default personality pack');
    return res.redirect('/personality');
  }

  try {
    const deactivated = personalityRepo.deletePack(packId);
    let msg = `Pack "${pack.name}" deleted`;
    if (deactivated > 0) {
      msg += ` and deactivated on ${deactivated} channel${deactivated > 1 ? 's' : ''}`;
    }
    req.flash('success', msg);
  } catch (error) {
    logger.error('Failed to delete pack', { error: error.message });
    req.flash('error', 'Failed to delete pack');
  }

  res.redirect('/personality');
});

/**
 * Duplicate pack
 */
router.post('/:id/duplicate', (req, res) => {
  const packId = parseInt(req.params.id, 10);
  const pack = personalityRepo.getPackById(packId);

  if (!pack) {
    req.flash('error', 'Pack not found');
    return res.redirect('/personality');
  }

  try {
    const newPack = personalityRepo.duplicatePack(packId, `${pack.name} (Copy)`);
    req.flash('success', `Pack duplicated as "${newPack.name}"`);
    res.redirect(`/personality/${newPack.id}`);
  } catch (error) {
    logger.error('Failed to duplicate pack', { error: error.message });
    req.flash('error', 'Failed to duplicate pack');
    res.redirect('/personality');
  }
});

/**
 * Export pack as JSON
 */
router.get('/:id/export', (req, res) => {
  const packId = parseInt(req.params.id, 10);

  try {
    const data = personalityRepo.exportPack(packId);
    if (!data) {
      req.flash('error', 'Pack not found');
      return res.redirect('/personality');
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${data.name.replace(/[^a-z0-9]/gi, '_')}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error('Failed to export pack', { error: error.message });
    req.flash('error', 'Failed to export pack');
    res.redirect('/personality');
  }
});

/**
 * Import pack from JSON (POST)
 */
router.post('/import', (req, res) => {
  const { importData } = req.body;

  if (!importData || !importData.trim()) {
    req.flash('error', 'No import data provided');
    return res.redirect('/personality');
  }

  try {
    const data = JSON.parse(importData);
    const result = personalityRepo.importPack(data);

    let msg = `Imported pack "${result.pack.name}" (${result.importedCount} templates)`;
    if (result.skippedCount > 0) {
      msg += `. ${result.skippedCount} templates skipped (unknown event types).`;
    }
    req.flash('success', msg);
    res.redirect(`/personality/${result.pack.id}`);
  } catch (error) {
    logger.error('Failed to import pack', { error: error.message });
    req.flash('error', `Import failed: ${error.message}`);
    res.redirect('/personality');
  }
});

/**
 * Preview API — returns sample themed messages for a pack
 */
router.get('/:id/preview', (req, res) => {
  const packId = parseInt(req.params.id, 10);
  const pack = personalityRepo.getPackById(packId);

  if (!pack) {
    return res.status(404).json({ error: 'Pack not found' });
  }

  try {
    const previews = personalityRepo.getPreviewData(packId);
    res.json({ pack: pack.name, previews });
  } catch (error) {
    logger.error('Failed to generate preview', { error: error.message });
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

module.exports = router;
