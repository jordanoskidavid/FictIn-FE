# fictIn Frontend — Testing Summary

## Overview

The fictIn frontend (React 19, TypeScript, Vite) started with **no tests**. It now has an
automated test suite covering every page, runs on every commit and in CI, and passes on a
fresh clone with three commands.

| Metric             | Before | After     |
| ------------------ | ------ | --------- |
| Test files         | 0      | **20**    |
| Tests              | 0      | **172**   |
| Statement coverage | 0%     | **96.8%** |
| Branch coverage    | 0%     | **87.8%** |
| Line coverage      | 0%     | **98.2%** |

CI fails if coverage drops below 92% statements / 83% branches / 90% functions / 93% lines.

## Tech stack

- **Vitest**: test runner and coverage
- **React Testing Library + user-event**: render components and interact with them like a real user
- **MSW (Mock Service Worker)**: mocks every HTTP and WebSocket call; a test **fails** if it tries to reach a real server
- **GitHub Actions**: runs on every pull request and every push to `main`
- **Husky + lint-staged**: lints staged files and runs their related tests before each commit

## Running the tests

```bash
nvm use        # Node 24
npm ci         # install exact dependency versions
npm test       # run all tests
```

Other commands: `npm run test:watch` (re-run tests while you edit) and `npm run test:coverage` (coverage report).

## What is tested

| Area | Key scenarios |
| --- | --- |
| **Authentication** | Login per role, wrong credentials, deactivated accounts, forced password change, logout, automatic token refresh |
| **Access control** | Guests redirected to login, each role lands on its own home page, other roles' pages are blocked |
| **Student – QR scan** | Marked present, already marked, expired or invalid QR, not enrolled, scan cooldown, camera released when leaving the page |
| **Professor – subjects** | Create a subject, schedules, enrolling students, deleting a subject |
| **Professor – live session** | Start and stop a session, restoring a live session after reload, live attendance list |
| **Professor – QR board** | QR shows the correct session and token, refreshes on every new token, fallback when the WebSocket fails or times out |
| **Admin** | User management (create, filter, activate/deactivate, delete), attendance search, CSV export |
| **Every data page** | Loading, empty, data and error states |

Along with each success path, the tests check the backend's error cases: validation (422),
conflicts (409), not found (404), missing permissions (403) and server errors.

## Testing approach

- **Test behaviour, not implementation.** Tests find elements by role and label, the way a
  user or screen reader does, never by CSS class.
- **Unit and integration tests.** Utilities and hooks are tested in isolation; full user flows
  (log in, then land on the right page) run through the real router and auth.
- **Realistic mocks.** The mock API copies the real Go backend's status codes and responses,
  checked against the backend source code.
- **Time-dependent logic** (QR rotation, cooldowns, timeouts) uses fake timers, so tests are
  fast and give the same result every run.
- **Reusable helpers** (`src/test/`): a mock backend with an in-memory database, test-data
  builders and a render helper that sets up routing and login.

## Quality assurance

- **Fresh-clone check:** the suite passes on a new clone after `npm ci`.
- **Flakiness check:** timing-sensitive test files were run 3–5 times each without failures.
- **Mutation testing:** the source was broken on purpose (for example, a wrong QR payload) to
  confirm the tests catch the bug.
- **Independent review:** a dedicated test-review agent checked the tests for weak assertions,
  brittle selectors and differences from the backend, and its valid findings were fixed.

## Side benefits

- **Accessibility:** loading spinners, alerts, dialogs, dropdowns and the QR code now have
  proper roles and labels for screen readers.
- **Documentation:** `CONTRIBUTING.md` (setup and testing conventions), `CLAUDE.md`, a
  `write-tests` skill and a `test-reviewer` agent for AI-assisted development.

## Issues found by the tests (not yet fixed)

1. The admin and student subjects pages show the error message **and** a loading spinner that never stops when loading fails.
2. A wrong current password on "Change password" triggers an unnecessary token refresh and a second request, then shows the misleading message "Incorrect email or password."
3. Screen readers announce form hints as part of the field label (e.g. "Code e.g. CS101 — will be uppercased").
