# Phase 2: Core Bot Features

## Phase ID
`P2`

## Prerequisites
- Phase 1 completed and merged to master
- All Phase 1 acceptance criteria verified

## Objective
Implement core bot functionality including timer/scheduled messages, spam filtering/moderation, and quotes system.

## Phase Duration
3-4 weeks estimated

## Branch Strategy
```bash
# Create main phase branch from master
git checkout master
git pull origin master
git checkout -b feature/phase-2-core-features
```

## Task Overview

| Task | ID | Description | Dependencies | Agent Type |
|------|----|-------------|--------------|------------|
| 01 | P2-T01 | Timer System | None | backend, frontend-developer |
| 02 | P2-T02 | Moderation System | None | backend, security-auditor |
| 03 | P2-T03 | Quotes System | None | backend, frontend-developer |

## Parallelization Opportunities

Tasks can be executed in parallel since they are independent features:
- **Group A**: Timer System (P2-T01)
- **Group B**: Moderation System (P2-T02)
- **Group C**: Quotes System (P2-T03)

All three tasks can run concurrently as they have no dependencies on each other.

## Database Migrations in This Phase

```
migrations/
├── 008_timers.sql        (Task 01)
├── 009_moderation.sql    (Task 02)
└── 010_quotes.sql        (Task 03)
```

## New Files Created in This Phase

### Timer System (Task 01)
```
src/database/repositories/timer-repo.js
src/bot/managers/timer-manager.js
src/web/routes/timers.js
src/web/views/timers/
  ├── list.ejs
  └── form.ejs
migrations/008_timers.sql
```

### Moderation System (Task 02)
```
src/database/repositories/moderation-repo.js
src/bot/handlers/moderation-handler.js
src/web/routes/moderation.js
src/web/views/moderation/
  ├── settings.ejs
  ├── phrases.ejs
  ├── whitelist.ejs
  └── log.ejs
migrations/009_moderation.sql
```

### Quotes System (Task 03)
```
src/database/repositories/quote-repo.js
src/bot/handlers/quote-handler.js
src/web/routes/quotes.js
src/web/views/quotes/
  ├── list.ejs
  └── form.ejs
migrations/010_quotes.sql
```

## Security Focus Areas

### Timer System
- Message content sanitized for template variables
- Timer names validated for length and characters
- Rate limiting on timer execution

### Moderation System
- Regex patterns validated before storage (prevent ReDoS)
- Moderation actions rate-limited
- Timeout/ban operations require proper Twitch scopes
- Log entries sanitized

### Quotes System
- Quote text sanitized for XSS
- Quote numbers validated as integers
- Rate limiting on quote additions

## Testing Requirements

### Per-Task Testing
Each task requires:
- Unit tests for repository functions
- Unit tests for handler/manager logic
- Integration tests for web routes
- Manual testing of chat commands (where applicable)

### Phase Completion Testing
- All three features working together
- No conflicts between features
- Performance testing with multiple timers/filters active
- Security audit of new endpoints

## Git Workflow

```bash
# For each task, create a sub-branch
git checkout feature/phase-2-core-features
git checkout -b phase-2-timers    # Task 01
# ... complete task ...
git checkout feature/phase-2-core-features
git merge phase-2-timers

# Repeat for other tasks
```

## Phase Completion Checklist

- [ ] Task 01 (Timer System) complete
- [ ] Task 02 (Moderation System) complete
- [ ] Task 03 (Quotes System) complete
- [ ] All migrations run successfully
- [ ] All tests passing
- [ ] Manual testing completed
- [ ] Security review passed
- [ ] Documentation updated (CLAUDE.md, README.md)
- [ ] Feature branch merged to master
- [ ] Tag created (v1.2.0-phase2)

## Rollback Plan

If phase introduces critical issues:
```bash
# Revert to Phase 1 tag
git checkout master
git reset --hard v1.1.0-phase1
git push origin master --force  # Use with caution

# Database rollback
# Keep backup of bot.db before starting Phase 2
cp data/bot.db data/bot.db.backup-phase1
```
