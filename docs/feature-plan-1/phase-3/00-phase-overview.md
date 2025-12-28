# Phase 3: Engagement Features

## Phase ID
`P3`

## Prerequisites
- Phase 1 completed (UI Modernization)
- Phase 2 completed (Core Bot Features)
- All previous acceptance criteria verified

## Objective
Implement viewer engagement features including loyalty points system, giveaways, and viewer queues for interactive streaming.

## Phase Duration
4-5 weeks estimated

## Branch Strategy
```bash
# Create main phase branch from master
git checkout master
git pull origin master
git checkout -b feature/phase-3-engagement
```

## Task Overview

| Task | ID | Description | Dependencies | Agent Type |
|------|----|-------------|--------------|------------|
| 01 | P3-T01 | Loyalty Points System | None | backend, frontend-developer |
| 02 | P3-T02 | Giveaway System | P3-T01 (optional) | backend, frontend-developer |
| 03 | P3-T03 | Viewer Queue System | None | backend, frontend-developer |

## Parallelization Opportunities

Tasks can be partially parallelized:
- **Group A**: Loyalty Points (P3-T01) - Start first as it provides foundation
- **Group B**: Queue System (P3-T03) - Can run parallel to Group A
- **Sequential**: Giveaway System (P3-T02) - Can start after T01 partial completion

The Giveaway System optionally integrates with Loyalty Points for entry costs, so it's recommended to complete T01 first, but the core giveaway functionality can be built independently.

## Database Migrations in This Phase

```
migrations/
├── 011_loyalty.sql       (Task 01)
├── 012_giveaways.sql     (Task 02)
└── 013_queue.sql         (Task 03)
```

## New Files Created in This Phase

### Loyalty Points System (Task 01)
```
src/database/repositories/loyalty-repo.js
src/bot/managers/loyalty-manager.js
src/bot/handlers/loyalty-handler.js
src/web/routes/loyalty.js
src/web/views/loyalty/
  ├── settings.ejs
  ├── users.ejs
  └── leaderboard.ejs
migrations/011_loyalty.sql
```

### Giveaway System (Task 02)
```
src/database/repositories/giveaway-repo.js
src/bot/handlers/giveaway-handler.js
src/web/routes/giveaways.js
src/web/views/giveaways/
  ├── list.ejs
  ├── form.ejs
  ├── active.ejs
  └── history.ejs
migrations/012_giveaways.sql
```

### Queue System (Task 03)
```
src/database/repositories/queue-repo.js
src/bot/handlers/queue-handler.js
src/web/routes/queue.js
src/web/views/queue/
  ├── manage.ejs
  └── settings.ejs
migrations/013_queue.sql
```

## Security Focus Areas

### Loyalty Points System
- Prevent point manipulation/cheating
- Rate limit point transfers
- Validate all point amounts as positive integers
- Transaction logging for audit
- Prevent integer overflow

### Giveaway System
- Prevent duplicate entries
- Verify subscriber/follower status when required
- Secure random winner selection
- Rate limit entry commands
- Prevent giveaway manipulation

### Queue System
- Prevent queue position manipulation
- Validate queue limits
- Rate limit join/leave commands
- Secure random selection for picks

## Testing Requirements

### Per-Task Testing
Each task requires:
- Unit tests for repository functions
- Unit tests for handler/manager logic
- Integration tests for web routes
- Manual testing of chat commands
- Load testing for concurrent users

### Phase Completion Testing
- All three features working together
- Points integration with giveaways (if implemented)
- Performance testing with 100+ concurrent users
- Security audit of new endpoints

## Git Workflow

```bash
# For each task, create a sub-branch
git checkout feature/phase-3-engagement
git checkout -b phase-3-loyalty    # Task 01
# ... complete task ...
git checkout feature/phase-3-engagement
git merge phase-3-loyalty

# Repeat for other tasks
```

## Phase Completion Checklist

- [ ] Task 01 (Loyalty Points) complete
- [ ] Task 02 (Giveaway System) complete
- [ ] Task 03 (Queue System) complete
- [ ] All migrations run successfully
- [ ] All tests passing
- [ ] Manual testing completed
- [ ] Load testing completed
- [ ] Security review passed
- [ ] Documentation updated (CLAUDE.md, README.md)
- [ ] Feature branch merged to master
- [ ] Tag created (v1.3.0-phase3)

## Rollback Plan

If phase introduces critical issues:
```bash
# Revert to Phase 2 tag
git checkout master
git reset --hard v1.2.0-phase2
git push origin master --force  # Use with caution

# Database rollback
# Keep backup of bot.db before starting Phase 3
cp data/bot.db data/bot.db.backup-phase2
```

## Performance Considerations

These features involve real-time user tracking and high-frequency operations:

1. **Loyalty Points**
   - Cache active viewer lists in memory
   - Batch point updates (every 5 minutes)
   - Use database transactions for transfers

2. **Giveaways**
   - Index entries by giveaway_id
   - Use efficient random selection algorithm
   - Cache entry counts

3. **Queue System**
   - Keep queue state in memory
   - Persist to database periodically
   - Efficient position calculations
