const predefinedSettingsRepo = require('../../database/repositories/predefined-settings-repo');
const magic8ballRepo = require('../../database/repositories/magic-8ball-repo');
const dictionaryRepo = require('../../database/repositories/dictionary-repo');
const rpsStatsRepo = require('../../database/repositories/rps-stats-repo');
const triviaStatsRepo = require('../../database/repositories/trivia-stats-repo');
const horoscopeRepo = require('../../database/repositories/horoscope-repo');
const commandRepo = require('../../database/repositories/command-repo');
const counterRepo = require('../../database/repositories/counter-repo');
const adviceApi = require('../../services/advice-api');
const dictionaryApi = require('../../services/dictionary-api');
const dadjokeApi = require('../../services/dadjoke-api');
const horoscopeApi = require('../../services/horoscope-api');
const randomfactApi = require('../../services/randomfact-api');
const triviaApi = require('../../services/trivia-api');
const personalityRepo = require('../../database/repositories/personality-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const { splitMessage } = require('../../utils/message-splitter');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('predefined-command-handler');

/**
 * RPS choice emoji mapping
 */
const RPS_EMOJIS = {
  rock: '🪨',
  paper: '📄',
  scissors: '✂️'
};

/**
 * RPS input aliases
 */
const RPS_ALIASES = {
  r: 'rock',
  rock: 'rock',
  '🪨': 'rock',
  p: 'paper',
  paper: 'paper',
  '📄': 'paper',
  s: 'scissors',
  scissors: 'scissors',
  '✂️': 'scissors'
};

/**
 * RPS win conditions (key beats value)
 */
const RPS_WINS = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper'
};

/**
 * Trivia answer timeout in milliseconds (30 seconds)
 */
const TRIVIA_TIMEOUT_MS = 30000;

/**
 * Handles predefined commands (!ball, !define, !rps, !rpsstats)
 */
class PredefinedCommandHandler {
  constructor(chatClient, channelManager) {
    this.chatClient = chatClient;
    this.channelManager = channelManager;
    this.cooldowns = new Map(); // 'channelId_commandName' -> timestamp
    this.activeTrivia = new Map(); // 'chatName' -> { question, correctKey, channelId, timeout, participants }
  }

  /**
   * Handle a chat message
   * @param {string} channelName - Channel name (without #)
   * @param {string} user - Username
   * @param {string} message - Message text
   * @param {Object} msg - Full message object from Twurple
   * @returns {boolean} Whether a predefined command was handled
   */
  async handle(channelName, user, message, msg) {
    const chatName = channelName.replace('#', '').toLowerCase();
    const trimmedMessage = message.trim();

    // Check for trivia answers first (A, B, C, D)
    if (this.activeTrivia.has(chatName)) {
      const handled = await this.checkTriviaAnswer(chatName, user, trimmedMessage, msg);
      if (handled) {
        return true;
      }
    }

    // Check if it's a command
    if (!trimmedMessage.startsWith('!')) {
      return false;
    }

    const parts = trimmedMessage.slice(1).split(' ');
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Check if this is a predefined command
    if (!predefinedSettingsRepo.PREDEFINED_COMMANDS.includes(commandName)) {
      return false;
    }

    // Get all channels that have access to this chat
    const channelsForChat = this.channelManager.getChannelsForChat(chatName);
    if (channelsForChat.length === 0) {
      return false;
    }

    // Try to execute the command for each channel that manages this chat
    for (const { channel } of channelsForChat) {
      const handled = await this.handleCommand(
        channel.id,
        chatName,
        channel.twitch_username,
        user,
        commandName,
        args,
        msg
      );
      if (handled) {
        return true; // Only execute once even if multiple channels manage this chat
      }
    }

    return false;
  }

  /**
   * Handle a predefined command
   * @param {number} channelId - Channel ID (the owning channel)
   * @param {string} chatName - The chat where the message was sent
   * @param {string} ownerUsername - The username of the owning channel
   * @param {string} user - Username who triggered the command
   * @param {string} commandName - Command name (without !)
   * @param {string[]} args - Command arguments
   * @param {Object} msg - Message object
   * @returns {boolean} Whether the command was executed
   */
  async handleCommand(channelId, chatName, ownerUsername, user, commandName, args, msg) {
    // Get command settings
    const settings = predefinedSettingsRepo.getSettings(channelId, commandName);

    // Check if enabled
    if (!settings.is_enabled) {
      return false;
    }

    // Check chat scope
    if (!predefinedSettingsRepo.isEnabledForChat(settings, chatName, ownerUsername)) {
      logger.debug(`Predefined command !${commandName} not enabled for chat ${chatName}`);
      return false;
    }

    // Check cooldown
    const cooldownKey = `${channelId}_${commandName}`;
    if (!this.checkCooldown(cooldownKey, settings.cooldown_seconds)) {
      logger.debug(`Predefined command !${commandName} is on cooldown`);
      return false;
    }

    try {
      // Dispatch to specific handler
      switch (commandName) {
        case 'advice':
          await this.handleAdvice(chatName, user);
          break;
        case 'ball':
          await this.handleBall(chatName, user);
          break;
        case 'botcommands':
          await this.handleBotCommands(channelId, chatName, user, ownerUsername);
          break;
        case 'dadjoke':
          await this.handleDadjoke(chatName, user);
          break;
        case 'define':
          await this.handleDefine(channelId, chatName, user, args);
          break;
        case 'horoscope':
          await this.handleHoroscope(chatName, user, args);
          break;
        case 'personality':
          await this.handlePersonality(channelId, chatName, user, args, msg);
          break;
        case 'randomfact':
          await this.handleRandomfact(chatName, user);
          break;
        case 'rps':
          await this.handleRps(channelId, chatName, user, args, msg);
          break;
        case 'rpsstats':
          await this.handleRpsStats(channelId, chatName, user, msg);
          break;
        case 'trivia':
          await this.handleTrivia(channelId, chatName, user);
          break;
        case 'triviastats':
          await this.handleTriviaStats(channelId, chatName, user, msg);
          break;
        default:
          return false;
      }

      // Set cooldown
      this.setCooldown(cooldownKey);
      return true;

    } catch (error) {
      logger.error(`Failed to execute !${commandName}`, {
        channel: chatName,
        user,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle !advice command (Random Advice)
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   */
  async handleAdvice(chatName, user) {
    try {
      const advice = await adviceApi.fetchAdvice();

      if (!advice) {
        await this.chatClient.sayAs(chatName, `💡 @${user}, I'm fresh out of advice right now!`, 'error_response', { original: `@${user}, I'm fresh out of advice right now!` });
        return;
      }

      await this.chatClient.sayAs(chatName, `💡 ${advice}`, 'advice_intro', { quote: advice, author: '' });
      logger.debug(`!advice executed for ${user} in ${chatName}`);

    } catch (error) {
      logger.error('Advice API error', { error: error.message });
      await this.chatClient.sayAs(chatName, `💡 @${user}, the advice service is taking a break. Try again later!`, 'error_response', { original: `@${user}, the advice service is taking a break. Try again later!` });
    }
  }

  /**
   * Handle !ball command (Magic 8 Ball)
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   */
  async handleBall(chatName, user) {
    const response = magic8ballRepo.getRandomResponse();

    if (!response) {
      await this.chatClient.sayAs(chatName, `🎱 @${user}, the Magic 8 Ball is unavailable.`, 'error_response', { original: `@${user}, the Magic 8 Ball is unavailable.` });
      return;
    }

    await this.chatClient.sayAs(chatName, `🎱 @${user}, the Magic 8 Ball says: ${response.response_text}`, '8ball_response', { response: response.response_text });
    logger.debug(`!ball executed for ${user} in ${chatName}`);
  }

  /**
   * Handle !botcommands command (List all enabled commands)
   * @param {number} channelId - Channel ID
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   * @param {string} ownerUsername - The username of the channel that owns the settings
   */
  async handleBotCommands(channelId, chatName, user, ownerUsername) {
    const commandLists = [];

    // Get enabled predefined commands for this chat
    const predefinedSettings = predefinedSettingsRepo.findByChannel(channelId);
    const enabledPredefined = predefinedSettings
      .filter(s => predefinedSettingsRepo.isEnabledForChat(s, chatName, ownerUsername))
      .map(s => `!${s.command_name}`);

    if (enabledPredefined.length > 0) {
      commandLists.push(`Built-in: ${enabledPredefined.join(', ')}`);
    }

    // Get enabled custom commands for this chat
    const customCommands = commandRepo.findByChannel(channelId, true);
    const enabledCustom = customCommands
      .filter(cmd => commandRepo.isEnabledForChat(cmd, chatName, ownerUsername))
      .map(cmd => `!${cmd.command_name}`);

    if (enabledCustom.length > 0) {
      commandLists.push(`Custom: ${enabledCustom.join(', ')}`);
    }

    // Get enabled counters for this chat
    const counters = counterRepo.findByChannel(channelId, true);
    const enabledCounters = counters
      .filter(c => counterRepo.isEnabledForChat(c, chatName, ownerUsername))
      .map(c => `${c.counter_name}++`);

    if (enabledCounters.length > 0) {
      commandLists.push(`Counters: ${enabledCounters.join(', ')}`);
    }

    // Build response
    if (commandLists.length === 0) {
      await this.chatClient.say(chatName, `📋 @${user}, no commands are currently enabled for this chat.`);
      return;
    }

    const response = `📋 @${user}, available commands: ${commandLists.join(' | ')}`;

    // Split message if too long
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await this.chatClient.say(chatName, chunk);
      if (chunks.length > 1) {
        await this.delay(500);
      }
    }

    logger.debug(`!botcommands executed for ${user} in ${chatName}`);
  }

  /**
   * Handle !dadjoke command (Dad Joke)
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   */
  async handleDadjoke(chatName, user) {
    try {
      const joke = await dadjokeApi.fetchDadJoke();

      if (!joke) {
        await this.chatClient.sayAs(chatName, `👨 @${user}, I'm fresh out of dad jokes right now!`, 'error_response', { original: `@${user}, I'm fresh out of dad jokes right now!` });
        return;
      }

      await this.chatClient.sayAs(chatName, `👨 ${joke}`, 'dadjoke_intro', { joke });
      logger.debug(`!dadjoke executed for ${user} in ${chatName}`);

    } catch (error) {
      logger.error('Dad joke API error', { error: error.message });
      await this.chatClient.sayAs(chatName, `👨 @${user}, the dad joke service is taking a nap. Try again later!`, 'error_response', { original: `@${user}, the dad joke service is taking a nap. Try again later!` });
    }
  }

  /**
   * Handle !define command (Dictionary)
   * @param {number} channelId - Channel ID for custom definitions
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   * @param {string[]} args - Command arguments
   */
  async handleDefine(channelId, chatName, user, args) {
    if (args.length === 0) {
      await this.chatClient.say(chatName, `📖 @${user}, usage: !define <word>`);
      return;
    }

    const word = args[0].toLowerCase().replace(/[^a-z]/g, '');

    if (!word || word.length === 0) {
      await this.chatClient.say(chatName, `📖 @${user}, please provide a valid word.`);
      return;
    }

    if (word.length > 50) {
      await this.chatClient.say(chatName, `📖 @${user}, that word is too long.`);
      return;
    }

    // Check for custom definition first
    const customDef = dictionaryRepo.findByWord(channelId, word);

    if (customDef) {
      const message = dictionaryApi.formatDefinition({
        word: customDef.word,
        partOfSpeech: customDef.part_of_speech,
        definition: customDef.definition
      }, true);

      await this.chatClient.sayAs(chatName, message, 'define_response', { word: customDef.word, definition: customDef.definition });
      logger.debug(`!define executed for ${user} in ${chatName} (custom: ${word})`);
      return;
    }

    // Try dictionary API
    try {
      const definition = await dictionaryApi.fetchDefinition(word);

      if (!definition) {
        await this.chatClient.say(chatName, `📖 @${user}, I couldn't find a definition for "${word}".`);
        return;
      }

      const message = dictionaryApi.formatDefinition(definition);
      await this.chatClient.sayAs(chatName, message, 'define_response', { word: definition.word, definition: definition.definition });
      logger.debug(`!define executed for ${user} in ${chatName} (API: ${word})`);

    } catch (error) {
      logger.error(`Dictionary API error for word: ${word}`, { error: error.message });
      await this.chatClient.sayAs(chatName, `📖 @${user}, the dictionary service is currently unavailable.`, 'error_response', { original: `@${user}, the dictionary service is currently unavailable.` });
    }
  }

  /**
   * Handle !horoscope command (Daily Horoscope)
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   * @param {string[]} args - Command arguments (zodiac sign)
   */
  async handleHoroscope(chatName, user, args) {
    let signInput;

    if (args.length === 0) {
      // Pick a random zodiac sign
      const signs = horoscopeRepo.getValidSigns();
      signInput = signs[Math.floor(Math.random() * signs.length)];
    } else {
      signInput = args[0];
    }

    try {
      const result = await horoscopeApi.getHoroscope(signInput);

      if (!result.success) {
        await this.chatClient.say(chatName, `🔮 @${user}, ${result.error}`);
        return;
      }

      // Format and send the response
      const response = horoscopeApi.formatResponse(result.sign, result.text, result.emoji);
      await this.chatClient.sayAs(chatName, response, 'horoscope_intro', { sign: result.sign, horoscope: result.text });

      logger.debug(`!horoscope executed for ${user} in ${chatName} (sign: ${result.sign}, cached: ${result.fromCache})`);

    } catch (error) {
      logger.error('Horoscope error', { error: error.message, user, chatName });
      await this.chatClient.sayAs(chatName, `🔮 @${user}, the horoscope service is temporarily unavailable. Please try again later.`, 'error_response', { original: `@${user}, the horoscope service is temporarily unavailable.` });
    }
  }

  /**
   * Handle !randomfact command (Random Useless Fact)
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   */
  async handleRandomfact(chatName, user) {
    try {
      const fact = await randomfactApi.fetchRandomFact();

      if (!fact) {
        await this.chatClient.sayAs(chatName, `🧠 @${user}, I couldn't find a fact right now!`, 'error_response', { original: `@${user}, I couldn't find a fact right now!` });
        return;
      }

      await this.chatClient.sayAs(chatName, `🧠 ${fact}`, 'fact_intro', { fact });
      logger.debug(`!randomfact executed for ${user} in ${chatName}`);

    } catch (error) {
      logger.error('Random fact API error', { error: error.message });
      await this.chatClient.sayAs(chatName, `🧠 @${user}, the fact service is taking a break. Try again later!`, 'error_response', { original: `@${user}, the fact service is taking a break. Try again later!` });
    }
  }

  /**
   * Handle !rps command (Rock Paper Scissors)
   * @param {number} channelId - Channel ID for stats
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   * @param {string[]} args - Command arguments
   * @param {Object} msg - Message object
   */
  async handleRps(channelId, chatName, user, args, msg) {
    if (args.length === 0) {
      await this.chatClient.say(chatName, `🎮 @${user}, usage: !rps <rock|paper|scissors>`);
      return;
    }

    const userInput = args[0].toLowerCase();
    const userChoice = RPS_ALIASES[userInput];

    if (!userChoice) {
      await this.chatClient.say(chatName, `🎮 @${user}, invalid choice! Use rock, paper, or scissors.`);
      return;
    }

    // Generate bot's choice
    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    // Determine winner
    let result;
    let stats;
    const userId = msg.userInfo?.userId || user;

    if (userChoice === botChoice) {
      result = 'tie';
      stats = rpsStatsRepo.recordTie(channelId, userId, user);
    } else if (RPS_WINS[userChoice] === botChoice) {
      result = 'win';
      stats = rpsStatsRepo.recordWin(channelId, userId, user);
    } else {
      result = 'loss';
      stats = rpsStatsRepo.recordLoss(channelId, userId, user);
    }

    // Format response
    const userEmoji = RPS_EMOJIS[userChoice];
    const botEmoji = RPS_EMOJIS[botChoice];
    const statsText = `(W:${stats.wins} L:${stats.losses})`;

    let message;
    if (result === 'tie') {
      message = `🎮 ${userEmoji} vs ${botEmoji} - It's a tie, @${user}! ${statsText}`;
    } else if (result === 'win') {
      message = `🎮 ${userEmoji} vs ${botEmoji} - You win, @${user}! 🎉 ${statsText}`;
    } else {
      message = `🎮 ${userEmoji} vs ${botEmoji} - I win! Better luck next time, @${user}. ${statsText}`;
    }

    await this.chatClient.sayAs(chatName, message, 'rps_result', {
      user,
      user_choice: userChoice,
      bot_choice: botChoice,
      result: result === 'win' ? 'You win' : result === 'loss' ? 'I win' : 'Tie'
    });
    logger.debug(`!rps executed for ${user} in ${chatName} (${result})`);
  }

  /**
   * Handle !rpsstats command
   * @param {number} channelId - Channel ID for stats
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   * @param {Object} msg - Message object
   */
  async handleRpsStats(channelId, chatName, user, msg) {
    const userId = msg.userInfo?.userId || user;
    const stats = rpsStatsRepo.getStats(channelId, userId, user);

    if (stats.total_games === 0) {
      await this.chatClient.say(chatName, `📊 @${user}, you haven't played any RPS games yet! Try !rps rock`);
      return;
    }

    const winPct = rpsStatsRepo.calculateWinPercentage(stats);
    const message = `📊 @${user}'s RPS Stats: ${stats.wins}W-${stats.losses}L-${stats.ties}T (${winPct}%) | Games: ${stats.total_games} | Best Streak: ${stats.best_streak}`;

    await this.chatClient.say(chatName, message);
    logger.debug(`!rpsstats executed for ${user} in ${chatName}`);
  }

  /**
   * Handle !trivia command (Trivia Game)
   * @param {number} channelId - Channel ID for stats
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   */
  async handleTrivia(channelId, chatName, user) {
    // Check if there's already an active trivia in this chat
    if (this.activeTrivia.has(chatName)) {
      await this.chatClient.say(chatName, `🎯 @${user}, there's already an active trivia question! Answer with A, B, C, or D.`);
      return;
    }

    try {
      const questionData = await triviaApi.fetchQuestion();

      if (!questionData) {
        await this.chatClient.say(chatName, `🎯 @${user}, couldn't fetch a trivia question. Try again later!`);
        return;
      }

      // Generate answer keys (A, B, C, D)
      const keyedAnswers = triviaApi.generateAnswerKeys(questionData.allAnswers);
      const correctKey = triviaApi.getCorrectKey(keyedAnswers, questionData.correctAnswer);

      // Store active trivia state
      const triviaState = {
        question: questionData.question,
        correctKey: correctKey,
        correctAnswer: questionData.correctAnswer,
        keyedAnswers: keyedAnswers,
        channelId: channelId,
        startedBy: user,
        startedAt: Date.now(),
        participants: new Set(),
        timeout: null
      };

      // Format answers before sending anything
      // Use colon instead of parenthesis to prevent "B)" being interpreted as Twitch emoji
      const answersText = keyedAnswers.map(ka => `${ka.key}: ${ka.answer}`).join(' | ');

      // Send all messages first, then set state
      // This prevents race conditions with answer checking during delays
      await this.chatClient.sayAs(chatName, `🎯 TRIVIA TIME! ${questionData.question}`, 'trivia_question', {
        category: questionData.category || 'General',
        difficulty: questionData.difficulty || 'Medium',
        question: questionData.question
      });
      await this.chatClient.say(chatName, `📝 ${answersText}`);
      await this.chatClient.say(chatName, `⏱️ You have 30 seconds! Type A, B, C, or D to answer!`);

      // Now set the active trivia state so answers can be accepted
      this.activeTrivia.set(chatName, triviaState);

      // Set timeout for no answer
      triviaState.timeout = setTimeout(async () => {
        if (this.activeTrivia.get(chatName) === triviaState) {
          this.activeTrivia.delete(chatName);
          await this.chatClient.sayAs(chatName, `⏱️ Time's up! The correct answer was ${correctKey}: ${questionData.correctAnswer}`, 'trivia_timeout', { answer: questionData.correctAnswer });
          logger.debug(`Trivia timeout in ${chatName}`);
        }
      }, TRIVIA_TIMEOUT_MS);

      logger.debug(`!trivia started in ${chatName} by ${user}`);

    } catch (error) {
      logger.error('Trivia error', { error: error.message, stack: error.stack });
      // Clean up any partial state
      this.activeTrivia.delete(chatName);
      // Include error type in message for debugging
      const errorType = error.message?.includes('Rate') ? 'rate limited' :
                       error.message?.includes('fetch') ? 'connection error' : 'error';
      await this.chatClient.say(chatName, `🎯 @${user}, trivia ${errorType}. Try again in a moment!`);
    }
  }

  /**
   * Check if a message is a trivia answer and process it
   * @param {string} chatName - Chat where message was sent
   * @param {string} user - Username who sent the message
   * @param {string} message - Message text
   * @param {Object} msg - Full message object from Twurple
   * @returns {boolean} Whether a trivia answer was processed
   */
  async checkTriviaAnswer(chatName, user, message, msg) {
    const triviaState = this.activeTrivia.get(chatName);
    if (!triviaState) {
      return false;
    }

    // Normalize answer input
    const answer = message.trim().toUpperCase();

    // Check if it's a valid answer key
    if (!['A', 'B', 'C', 'D'].includes(answer)) {
      return false;
    }

    const userId = msg.userInfo?.userId || user;

    // Check if user already participated
    if (triviaState.participants.has(userId)) {
      return false; // Don't process duplicate answers from same user
    }

    // Mark user as participated
    triviaState.participants.add(userId);

    // Check if correct
    if (answer === triviaState.correctKey) {
      // Winner!
      clearTimeout(triviaState.timeout);
      this.activeTrivia.delete(chatName);

      // Record correct answer (with error handling for missing table)
      let statsText = '';
      try {
        const stats = triviaStatsRepo.recordCorrect(triviaState.channelId, userId, user);
        statsText = ` | Correct: ${stats.correct_answers} | Streak: ${stats.current_streak}`;
      } catch (statsError) {
        logger.error('Failed to record trivia stats', { error: statsError.message });
      }

      await this.chatClient.sayAs(chatName,
        `🎉 @${user} got it right! The answer was ${triviaState.correctKey}: ${triviaState.correctAnswer}${statsText}`,
        'trivia_correct', { user, answer: triviaState.correctAnswer, points: statsText ? '1' : '0' }
      );
      logger.debug(`Trivia won by ${user} in ${chatName}`);
      return true;
    } else {
      // Wrong answer - record incorrect (with error handling)
      try {
        triviaStatsRepo.recordIncorrect(triviaState.channelId, userId, user);
      } catch (statsError) {
        logger.error('Failed to record trivia stats', { error: statsError.message });
      }
      await this.chatClient.say(chatName, `❌ @${user}, that's not correct!`);
      logger.debug(`Trivia wrong answer from ${user} in ${chatName}`);
      return true;
    }
  }

  /**
   * Handle !triviastats command
   * @param {number} channelId - Channel ID for stats
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   * @param {Object} msg - Message object
   */
  async handleTriviaStats(channelId, chatName, user, msg) {
    const userId = msg.userInfo?.userId || user;
    const stats = triviaStatsRepo.getStats(channelId, userId, user);

    if (stats.total_games === 0) {
      await this.chatClient.say(chatName, `📊 @${user}, you haven't played any trivia games yet! Try !trivia`);
      return;
    }

    const accuracy = triviaStatsRepo.calculateAccuracy(stats);
    const message = `📊 @${user}'s Trivia Stats: ${stats.correct_answers} correct, ${stats.incorrect_answers} incorrect (${accuracy}% accuracy) | Games: ${stats.total_games} | Best Streak: ${stats.best_streak}`;

    await this.chatClient.say(chatName, message);
    logger.debug(`!triviastats executed for ${user} in ${chatName}`);
  }

  /**
   * Handle !personality command (switch personality pack)
   * @param {number} channelId - Channel ID
   * @param {string} chatName - Chat to respond in
   * @param {string} user - User who triggered the command
   * @param {string[]} args - Command arguments
   * @param {Object} msg - Message object
   */
  async handlePersonality(channelId, chatName, user, args, msg) {
    // Mod-only command
    if (!msg.userInfo?.isMod && !msg.userInfo?.isBroadcaster) {
      await this.chatClient.say(chatName, `🎭 @${user}, only moderators can change the personality.`);
      return;
    }

    if (args.length === 0) {
      // Show current personality
      const currentPackId = personalityRepo.getActivePackForChannel(chatName);
      if (currentPackId) {
        const pack = personalityRepo.getPackById(currentPackId);
        await this.chatClient.say(chatName, `🎭 Current personality: ${pack ? pack.name : 'Unknown'}. Use !personality <name> to switch or !personality off to disable.`);
      } else {
        const packs = personalityRepo.getAllPacks();
        const packNames = packs.map(p => p.name.toLowerCase()).join(', ');
        await this.chatClient.say(chatName, `🎭 No personality active. Available: ${packNames || 'none'}. Use !personality <name> to activate.`);
      }
      return;
    }

    const packName = args.join(' ').toLowerCase();

    // Handle "off" to disable
    if (packName === 'off' || packName === 'none' || packName === 'disable') {
      personalityRepo.setActivePackForChannel(channelId, null);
      await this.chatClient.say(chatName, `🎭 Personality disabled. Bot messages will use default responses.`);
      logger.info(`Personality disabled for channel ${chatName} by ${user}`);
      return;
    }

    // Find the pack
    const pack = personalityRepo.getPackByName(packName);
    if (!pack) {
      const packs = personalityRepo.getAllPacks();
      const packNames = packs.map(p => p.name.toLowerCase()).join(', ');
      await this.chatClient.say(chatName, `🎭 Pack "${args.join(' ')}" not found. Available: ${packNames || 'none'}`);
      return;
    }

    // Activate the pack
    personalityRepo.setActivePackForChannel(channelId, pack.id);
    // Send confirmation through the new personality
    await this.chatClient.sayAs(chatName, `🎭 Switched to ${pack.name} personality!`, 'command_response', {
      user, response: `Switched to ${pack.name} personality!`, command: 'personality'
    });
    logger.info(`Personality set to "${pack.name}" for channel ${chatName} by ${user}`);
  }

  /**
   * Check if command is on cooldown
   * @param {string} key - Cooldown key
   * @param {number} cooldownSeconds - Cooldown duration
   * @returns {boolean} True if not on cooldown
   */
  checkCooldown(key, cooldownSeconds) {
    const lastUsed = this.cooldowns.get(key);
    if (!lastUsed) return true;

    const elapsed = (Date.now() - lastUsed) / 1000;
    return elapsed >= cooldownSeconds;
  }

  /**
   * Set cooldown for a command
   * @param {string} key - Cooldown key
   */
  setCooldown(key) {
    this.cooldowns.set(key, Date.now());
  }

  /**
   * Clear all cooldowns
   */
  clearCooldowns() {
    this.cooldowns.clear();
  }

  /**
   * Helper to delay execution
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PredefinedCommandHandler;
