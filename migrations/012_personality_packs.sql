-- =====================================================
-- Personality Packs Migration
-- =====================================================

-- Personality packs - themed response template collections
CREATE TABLE IF NOT EXISTS personality_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  author TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Personality templates - per event type, multiple variants per pack
CREATE TABLE IF NOT EXISTS personality_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id INTEGER NOT NULL REFERENCES personality_packs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  template_text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for personality tables
CREATE INDEX IF NOT EXISTS idx_personality_templates_pack
  ON personality_templates(pack_id);
CREATE INDEX IF NOT EXISTS idx_personality_templates_event
  ON personality_templates(pack_id, event_type);

-- Add active_personality_pack_id to channel_settings
ALTER TABLE channel_settings ADD COLUMN active_personality_pack_id INTEGER REFERENCES personality_packs(id) ON DELETE SET NULL;

-- =====================================================
-- Seed: Cowboy Saloon personality pack
-- =====================================================

INSERT INTO personality_packs (name, description, author, is_default) VALUES
  ('Cowboy Saloon', 'Rootin tootin Wild West personality for your saloon', 'Saloon Bot', 1);

-- 8ball_response
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, '8ball_response', 'The tumbleweed says... {response}'),
  (1, '8ball_response', 'I reckon the stars above the saloon say... {response}'),
  (1, '8ball_response', 'Well partner, the spirits of the old west whisper... {response}');

-- raid_shoutout
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'raid_shoutout', 'YEEHAW! @{raider} just rode into town with a posse of {viewers}! Go check em out at https://twitch.tv/{raider}'),
  (1, 'raid_shoutout', 'Hold yer horses! @{raider} and {viewers} cowboys just busted through the saloon doors! Mosey on over to https://twitch.tv/{raider}'),
  (1, 'raid_shoutout', 'The dust is settlin... @{raider} brought {viewers} gunslingers to the party! Ride over to https://twitch.tv/{raider}');

-- counter_increment
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'counter_increment', 'That be {count} times now, cowpoke! {emoji}'),
  (1, 'counter_increment', 'Notch number {count} on the old hitching post! {emoji}'),
  (1, 'counter_increment', 'Well I''ll be... {count} times and countin! {emoji}');

-- sub_notification
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'sub_notification', 'YEEHAW! @{user} just bought a ticket to the saloon! Welcome, partner!'),
  (1, 'sub_notification', 'Well saddle up! @{user} has joined the ranch! Much obliged, cowpoke!'),
  (1, 'sub_notification', 'Ring the dinner bell! @{user} is officially part of the posse!');

-- resub_notification
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'resub_notification', '@{user} has been ridin with us for {months} moons now! The saloon thanks ya, partner!'),
  (1, 'resub_notification', '{months} months of loyalty! @{user} is a true cowpoke through and through!'),
  (1, 'resub_notification', 'Well I''ll be darned! @{user} has been at the saloon for {months} months! That''s dedication, partner!');

-- gift_sub_notification
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'gift_sub_notification', 'YEEHAW! @{gifter} just bought a round for the house! {gift_count} lucky cowpokes get a seat at the saloon!'),
  (1, 'gift_sub_notification', '@{gifter} is feelin generous tonight! {gift_count} gift subs ridin into the sunset!'),
  (1, 'gift_sub_notification', 'The sheriff @{gifter} just handed out {gift_count} deputy badges! Welcome to the posse!');

-- trivia_question
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'trivia_question', 'HOWDY FOLKS! Time for a showdown of wits! Category: {category} | Difficulty: {difficulty}'),
  (1, 'trivia_question', 'Gather round the campfire, partners! Trivia time! Category: {category} | Difficulty: {difficulty}');

-- trivia_correct
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'trivia_correct', 'YEEHAW! @{user} hit the bullseye! The answer was {answer}! +{points} points!'),
  (1, 'trivia_correct', 'Quick draw @{user}! That''s the right answer: {answer}! +{points} to your bounty!');

-- trivia_timeout
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'trivia_timeout', 'Time''s up, cowboys! The answer was ridin right past ya: {answer}'),
  (1, 'trivia_timeout', 'Nobody got it! The tumbleweed rolls on... The answer was {answer}');

-- rps_result
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'rps_result', 'DRAW! @{user} threw {user_choice}, I threw {bot_choice}! This town ain''t big enough for a tie!'),
  (1, 'rps_result', '@{user} threw {user_choice} vs my {bot_choice}! {result}! That''s how we settle things in the wild west!');

-- dadjoke_intro
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'dadjoke_intro', 'The old timer at the bar says... {joke}'),
  (1, 'dadjoke_intro', 'Heard this one at the hitching post... {joke}'),
  (1, 'dadjoke_intro', 'The bartender slaps the counter and says... {joke}');

-- advice_intro
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'advice_intro', 'Words of wisdom from the trail: "{quote}" - {author}'),
  (1, 'advice_intro', 'The old prospector once said: "{quote}" - {author}'),
  (1, 'advice_intro', 'Sittin by the campfire, I recall: "{quote}" - {author}');

-- fact_intro
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'fact_intro', 'Well I''ll be! Did y''all know: {fact}'),
  (1, 'fact_intro', 'Here''s a nugget of gold for ya: {fact}'),
  (1, 'fact_intro', 'The saloon almanac says: {fact}');

-- define_response
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'define_response', 'The town dictionary says "{word}" means: {definition}'),
  (1, 'define_response', 'Well partner, "{word}" is what the learned folk call: {definition}');

-- command_response
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'command_response', '{response}'),
  (1, 'command_response', 'The saloon announces: {response}');

-- detection_alert
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'detection_alert', 'Well I''ll be! Spotted a {object} on the stream! (confidence: {confidence})'),
  (1, 'detection_alert', 'Hold yer horses! A {object} just appeared! (confidence: {confidence})');

-- horoscope_intro
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'horoscope_intro', 'The stars above the saloon say for {sign}: {horoscope}'),
  (1, 'horoscope_intro', 'Well partner, the cosmos have spoken for {sign}... {horoscope}');

-- error_response
INSERT INTO personality_templates (pack_id, event_type, template_text) VALUES
  (1, 'error_response', 'Well shucks, partner... {original}'),
  (1, 'error_response', 'The saloon ran into some trouble... {original}'),
  (1, 'error_response', 'Dag nabbit! {original}');
