# DESIGN.md — Saloon Bot Design System

This documents the CSS design system used in the admin interface. All styles live in `public/css/style.css`.

## Theme System

Light/dark theme via `data-theme` attribute on `<html>`. Toggled in `public/js/theme.js`, with flash-prevention script in `layout.ejs`. Respects `prefers-color-scheme`.

## Custom Properties

### Colors
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg-primary` | #ffffff | #0e0e10 | Page background |
| `--bg-secondary` | #f7f7f8 | #18181b | Cards, sidebar |
| `--bg-tertiary` | #efeff1 | #1f1f23 | Hover states |
| `--bg-elevated` | #ffffff | #26262c | Elevated surfaces |
| `--text-primary` | #0e0e10 | #efeff1 | Primary text |
| `--text-secondary` | #53535f | #adadb8 | Secondary text |
| `--text-tertiary` | #adadb8 | — | Hints, placeholders |
| `--accent-primary` | #9147ff | — | Twitch purple, buttons |
| `--accent-primary-hover` | #772ce8 | — | Button hover |
| `--status-success` | #00c853 | — | Online, success |
| `--status-error` | #f44336 | — | Offline, errors |

### Typography
- **Primary font:** `--font-primary` — Inter + system fallback stack
- **Monospace:** `--font-mono` — JetBrains Mono + Fira Code
- **Scale:** `--text-xs` (0.75rem) through `--text-3xl` (1.875rem)
- **Weights:** `--font-normal` (400), `--font-medium` (500), `--font-semibold` (600), `--font-bold` (700)

### Spacing
8-point scale: `--space-1` (0.25rem) through `--space-16` (4rem).

### Layout
- `--sidebar-width`: 240px
- `--header-height`: 60px

### Borders & Radius
- `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-full` (9999px)
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

### Transitions
- `--transition-fast` (0.15s), `--transition-normal` (0.2s), `--transition-slow` (0.3s)

## Component Vocabulary

### Page Structure
```
.page > .page-header + .page-content
.page-header > .page-header-content + .page-header-actions
.page-header-content > .back-link + .page-title + .page-subtitle
```

### Cards
```
.card > .card-header + .card-body
.card-header > .card-title + [actions]
```

### Tables
```
.table-container > table.table > thead + tbody
```

### Forms
```
.form-group > .form-label + .form-input + .form-hint
.form-checkbox > input[type=checkbox] + .form-checkbox-label
.form-radio > input[type=radio] + .form-radio-label
.form-radio-group (container for radio options)
```

### Buttons
- `.btn` — base
- `.btn-primary` — purple accent
- `.btn-secondary` — neutral
- `.btn-danger` — destructive
- `.btn-ghost` — text only
- `.btn-sm` — small variant
- `.btn-icon` — icon only

### Badges
- `.badge` — base
- `.badge-success` — green
- `.badge-error` — red
- `.badge-info` — blue
- `.badge-secondary` — neutral

### Alerts (flash messages)
- `.alert-success`, `.alert-error`, `.alert-info`

### Sidebar Navigation
```
.sidebar > .sidebar-nav > .sidebar-link
.sidebar-link.active
.sidebar-icon (20x20 SVG)
.sidebar-section > .sidebar-section-title + .sidebar-link[]
```

### Empty States
```
.empty-state > p + .btn
```

### Stat Cards (dashboard)
```
.stats-grid > .stat-card > .stat-icon + .stat-content
.stat-icon-success, .stat-icon-error, .stat-icon-primary
.stat-content > .stat-value + .stat-label
```

### Grid
```
.grid.grid-cols-2.gap-4
```

## Personality Pack Components (new)

### Editor Layout
```
.editor-layout — CSS Grid, 60/40 two-column on desktop
.editor-column — left column (templates)
.preview-column — right column (preview, sticky)
```

### Template Sections
```
.template-section > .template-section-header + .template-section-body
.template-section-header — collapsible, aria-expanded
.template-section-title, .template-section-count, .template-section-chevron
.template-variant > .form-input.template-input + remove button
```

### Variable Tags
```
code.var-tag — purple pill for {variable} syntax
```

### Preview Panel
```
.preview-panel > .preview-header + .preview-messages
.preview-message > .preview-username + .preview-text
.preview-placeholder — empty/loading state
```
Styled like Twitch chat: dark background (#18181b), purple usernames, compact line-height.

### Mini Preview (channel settings)
```
.personality-mini-preview > .preview-message[]
```
Compact version for inline previews.

## Responsive Breakpoints

| Breakpoint | Sidebar | Layout |
|------------|---------|--------|
| >1024px | Full sidebar | Two-column editors |
| 768-1024px | Collapsed sidebar | Narrower columns |
| <768px | Hidden (hamburger) | Single column, stacked |

## Accessibility

- All interactive elements: 44px minimum touch target
- Collapsible sections: `aria-expanded`, `aria-controls`
- Live regions: `aria-live="polite"` on preview panels
- Form inputs: associated `<label>` or `aria-label`
- Color contrast: WCAG AA on both themes
