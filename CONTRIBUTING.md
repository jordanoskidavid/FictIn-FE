# Contributing to fictIn (frontend)

## Setup (3 commands)

```bash
nvm use            # Node 24, from .nvmrc (or install Node 24 any way you like)
npm ci             # installs exactly what's in package-lock.json — don't use `npm install` for setup
npm test           # should be all green on a fresh clone
```

Then `npm run dev` starts the app (it proxies `/api` and `/ws` to a backend on `localhost:8080`).

> Only use `npm install <pkg>` when you are deliberately adding/upgrading a dependency,
> and commit the updated `package-lock.json` in the same PR.

## Commands

| Command                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm test`              | Run the whole suite once (what CI runs, minus coverage)        |
| `npm run test:watch`    | Watch mode — re-runs tests affected by your changes            |
| `npm run test:coverage` | Run once with coverage; fails if below the thresholds          |
| `npm run lint`          | ESLint                                                         |
| `npm run typecheck`     | TypeScript (`tsc -b`)                                          |
| `npx vitest run src/lib/api.test.ts` | Run a single file (add `-t "name"` to filter by test name) |

Coverage HTML report: `coverage/index.html` after `npm run test:coverage`.

**Pre-commit hook** (Husky + lint-staged): on every commit, staged `.ts/.tsx` files are
`eslint --fix`ed and `vitest related --run` runs only the tests that import them.
It's installed automatically by `npm ci` (the `prepare` script).

**CI** (`.github/workflows/ci.yml`), on every PR and push to `main`:
`npm ci` → lint → type-check → build → tests with coverage.

## Testing stack

- **Vitest** (jsdom) — test runner, config in `vitest.config.ts`
- **React Testing Library** + **@testing-library/user-event** + **@testing-library/jest-dom**
- **MSW** (Mock Service Worker) — all HTTP _and_ WebSocket mocking

### The golden rule: no real network

Tests must never hit a real server. MSW is configured with `onUnhandledRequest: "error"`,
so any request without a handler **fails the test**. If you see
`[MSW] Error: intercepted a request without a matching request handler`, add a handler.

## Where things live

```
src/
  lib/api.ts
  lib/api.test.ts                ← tests sit next to the file they test
  pages/LoginPage.tsx
  pages/LoginPage.test.tsx
  test/
    setup.ts                     ← MSW lifecycle, jest-dom, cleanup, resets (runs before every file)
    server.ts                    ← the shared MSW server
    handlers.ts                  ← default API handlers + in-memory `db` + ok()/apiError() helpers
    factories.ts                 ← buildUser(), buildSubject(), buildAttendanceRow(), …
    renderWithProviders.tsx      ← render with MemoryRouter + auth, returns { user, ...rtl }
```

Name test files `Thing.test.ts(x)` next to `Thing.ts(x)`.

## Conventions

1. **Query like a user.** Prefer `getByRole` (with `{ name }`), then `getByLabelText`,
   then `getByText`. **Never** query by CSS class, and avoid `data-testid` unless there is
   truly no accessible handle (and then consider fixing the markup instead).
2. **Interact with `userEvent`, not `fireEvent`.** Use the `user` returned by
   `renderWithProviders()` (or `userEvent.setup()` for bare `render`).
3. **Arrange / Act / Assert.** Separate the three with blank lines.
4. **Test behaviour, not implementation.** Assert what the user sees or what the API
   receives — not component state, hook internals or which functions were called.
5. **Async UI:** use `findBy*` / `waitFor`, never arbitrary sleeps.
6. **Time:** use `vi.useFakeTimers()` whenever behaviour depends on time (cooldowns,
   intervals, timeouts). RTL's `findBy*`/`waitFor` work with fake timers (see the shim in
   `setup.ts`). With `userEvent`, pass `advanceTimers: vi.advanceTimersByTime` to
   `renderWithProviders`. Restore with `vi.useRealTimers()` in `afterEach`.
7. **Data:** build it with factories and only override what the test cares about:
   `buildUser({ role: "admin" })`.
8. **Mock only at the edges:** the network (MSW) and browser hardware (e.g. the
   `html5-qrcode` camera in `ScanPage.test.tsx`). Don't mock our own modules.

## Rendering components

```tsx
// Page that needs a signed-in user: the real AuthProvider loads them through MSW.
renderWithProviders(<App />, { route: "/", user: buildUser({ role: "professor" }) });

// Component that only reads auth: stub the context.
renderWithProviders(<StudentAttendancePage />, { authValue: {} });

// Component that uses useParams():
renderWithProviders(<SubjectDetailPage />, {
  route: "/professor/subjects/sub-1",
  path: "/professor/subjects/:id",
  user: buildUser({ role: "professor" }),
});
```

## Adding or overriding an MSW handler

**Default behaviour for an endpoint** (used by every test) → add it to `src/test/handlers.ts`,
using the real path and the backend's envelope:

```ts
http.get("/api/v1/subjects/:id", ({ params }) => {
  const subject = db.subjects.find((s) => s.id === params.id);
  return subject ? ok({ subject, schedules: [], roster: [] }) : apiError(404, "NOT_FOUND");
}),
```

**One test needs different behaviour** (errors, slow responses, capturing the body) →
override inside the test; it's reset automatically afterwards:

```ts
server.use(http.post("/api/v1/subjects", () => apiError(409, "CONFLICT")));
server.use(http.get("/api/v1/student/attendance", () => delay("infinite"))); // loading state
```

**Seed data** instead of writing a handler when the default one reads from `db`:

```ts
db.users = [buildUser({ full_name: "Ana Student" })];
```

**WebSockets** use `ws.link(...)` from MSW — see `src/hooks/useQrBoard.test.ts`. The only hand-written
WebSocket stub is the never-opening socket in that file's "connect timeout" test (MSW can't simulate a hang).

## Known follow-ups

- `Input`/`Select` render their `hint` inside the `<label>`, so the accessible name of
  fields like "Code" is "Code e.g. CS101 — will be uppercased". Tests match with a regex
  (`getByLabelText(/^Code/)`). Moving hints out of the label + `aria-describedby` would fix it.
