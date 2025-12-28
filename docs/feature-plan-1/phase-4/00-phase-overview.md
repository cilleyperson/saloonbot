# Phase 4: Advanced Features

## Phase ID
`P4`

## Prerequisites
- Phase 1 completed (UI Modernization)
- Phase 2 completed (Core Bot Features)
- Phase 3 completed (Engagement Features)
- All previous acceptance criteria verified

## Objective
Implement advanced features including user role management (regulars/VIPs) and an interactive polls system.

## Phase Duration
2-3 weeks estimated

## Branch Strategy
```bash
# Create main phase branch from master
git checkout master
git pull origin master
git checkout -b feature/phase-4-advanced
```

## Task Overview

| Task | ID | Description | Dependencies | Agent Type |
|------|----|-------------|--------------|------------|
| 01 | P4-T01 | User Roles System | P3-T01 (Loyalty Points) | backend, frontend-developer |
| 02 | P4-T02 | Polls System | None | backend, frontend-developer |

## Parallelization Opportunities

Tasks can be partially parallelized:
- **Group A**: User Roles (P4-T01) - Depends on loyalty points for auto-promotion
- **Group B**: Polls System (P4-T02) - Fully independent, can start immediately

The User Roles system integrates with Loyalty Points for automatic promotion based on watch time, so if P3-T01 is not complete, manual-only role assignment can still be implemented.

## Database Migrations in This Phase

```
migrations/
├── 014_user_roles.sql     (Task 01)
└── 015_polls.sql          (Task 02)
```

## New Files Created in This Phase

### User Roles System (Task 01)
```
src/database/repositories/user-role-repo.js
src/bot/handlers/role-handler.js
src/web/routes/roles.js
src/web/views/roles/
  ├── settings.ejs
  └── users.ejs
migrations/014_user_roles.sql
```

### Polls System (Task 02)
```
src/database/repositories/poll-repo.js
src/bot/handlers/poll-handler.js
src/web/routes/polls.js
src/web/views/polls/
  ├── create.ejs
  ├── active.ejs
  └── history.ejs
migrations/015_polls.sql
```

## Security Focus Areas

### User Roles System
- Validate role assignments
- Prevent privilege escalation
- Rate limit role commands
- Audit role changes
- Secure auto-promotion logic

### Polls System
- Prevent vote manipulation
- One vote per user enforcement
- Secure vote counting
- Rate limit vote commands
- Prevent poll spam

## Testing Requirements

### Per-Task Testing
Each task requires:
- Unit tests for repository functions
- Unit tests for handler logic
- Integration tests for web routes
- Manual testing of chat commands
- Security testing for permission bypass

### Phase Completion Testing
- Both features working together
- Role-based command restrictions
- Performance with many users voting
- Security audit of new endpoints

## Git Workflow

```bash
# For each task, create a sub-branch
git checkout feature/phase-4-advanced
git checkout -b phase-4-roles    # Task 01
# ... complete task ...
git checkout feature/phase-4-advanced
git merge phase-4-roles

# Repeat for polls
```

## Phase Completion Checklist

- [ ] Task 01 (User Roles) complete
- [ ] Task 02 (Polls System) complete
- [ ] All migrations run successfully
- [ ] All tests passing
- [ ] Manual testing completed
- [ ] Security review passed
- [ ] Documentation updated (CLAUDE.md, README.md)
- [ ] Feature branch merged to master
- [ ] Tag created (v1.4.0-phase4)

## Rollback Plan

If phase introduces critical issues:
```bash
# Revert to Phase 3 tag
git checkout master
git reset --hard v1.3.0-phase3
git push origin master --force  # Use with caution

# Database rollback
# Keep backup of bot.db before starting Phase 4
cp data/bot.db data/bot.db.backup-phase3
```

## Feature Plan Completion

After Phase 4 is complete, the following features from the original plan will be implemented:

### Completed Features
- UI Modernization (responsive, dark/light mode, component library)
- Timer/Scheduled Messages
- Spam Filters/Moderation
- Quotes System
- Loyalty Points
- Giveaways
- Viewer Queue
- User Roles (Regulars)
- Polls

### Future Considerations (Phase 5+)
The following features were identified in the competitor analysis but scoped out of the initial implementation:
- Song Request System (requires audio integration)
- Analytics Dashboard (requires data collection over time)
- Discord Integration (requires Discord bot setup)

These can be added in future phases based on user demand and priorities.
