# FOCUS FLOW — product & implementation plan

## Product

A calm personal workspace: plan the day → choose a task → focus → review progress. Russian UI. Fully static, local-first, no tracking, no runtime dependencies. Existing Vanilla TodoMVC was considered as a baseline; it only covers basic tasks, while the requested custom product needs calendar, resilient timer, analytics, and a distinct visual system. Native browser APIs suffice; GitHub Pages is the free deployment platform.

## Art direction: a little more headspace

Warm paper (#f5f4ef), ink (#242722), acid-lime (#d9f279), muted olive, violet and coral. System grotesk typography with oversized editorial headings, monospaced numbers, fine borders, gentle 20px radii. Asymmetric dashboard: editorial greeting, wide charcoal focus composition, narrow daily progress, practical task agenda and weekly chart. Decorative orbit is CSS/SVG, not an external image. Dark mode uses charcoal surfaces and the same accent vocabulary.

## Navigation & screens

Desktop left rail, tablet narrow rail, mobile bottom navigation with Settings in the top bar. Day: current date, today counts, streak, focus, next tasks and weekly activity. Tasks: search/status/category/priority filters, sorting, manual drag and accessible move controls. Focus: work/short/long, linked task, timestamp-based countdown, pause/resume/reset. Calendar: Monday-first local-date month grid, selected-day agenda and add action. Analytics: real completion and focus history, week/month controls, category breakdown. Settings: theme, durations, sound, optional browser notifications, name, demo cleanup, JSON export/import, confirmed reset.

## Architecture

index.html + css/styles.css; ES modules js/store.js (schema, validation, persistence, stats), js/timer.js (deadline engine), js/icons.js (inline SVG), js/charts.js (accessible SVG charts), js/app.js (views, forms, delegated interactions). No build step. Relative URLs work on /repository-name/. Local civil dates use local date parts, not UTC slicing. Completed timestamps and session history underpin analytics. Running timer uses an absolute deadline and persists; finishing is recorded once.

## States & accessibility

Native modal dialogs, Escape and focus restoration, visible focus, labeled inputs, aria-live feedback, keyboard task controls, 44px touch targets, semantic navigation. Empty states with a useful next action; validation and storage failures visible. Sound off by default; request notifications only on user action. Animations 160–400ms with reduced-motion support. User content escaped; imports whitelist fields, bound length/counts and validate all relations before mutation.

## Sequential implementation

1. Store and timer engines; shell, design tokens and responsive navigation.
2. All six working views, shared task dialog, charts, settings/data tools.
3. Browser interaction suite, small-to-large layouts, screenshots, visual audit and fixes.
4. Public GitHub repository, main-root Pages, HTTPS and deployed-browser verification.

## Completion test map

Tasks: create/edit/delete, priority/date/category/description/duration, status/search/filters/sort/reorder, persistence and XSS. Timer: modes, settings, linked task, pause/resume/reset, timestamp drift, reload, single completion, mute. Calendar: navigation, date selection, add with selected date. Analytics: history-derived weekly/monthly figures, category chart. Settings: theme persistence, import/export roundtrip, malformed import, confirmed reset/demo cleanup. Accessibility: keyboard/dialog/focus, reduced motion; layouts 320/375/390/430/768/1440/1920, no overflow. Browser console and Lighthouse.
