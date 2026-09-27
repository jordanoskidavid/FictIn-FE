# fictIn frontend — notes for Claude

QR-code class attendance app. React 19 + TypeScript + Vite 8 + Tailwind 4, React Router 7.
Backend is a separate Go API; its contract is documented in `FrontendDirections.md`
(response envelope `{ data }` / `{ error: { code, message } }`, error codes, endpoints, WebSocket).

## Architecture in one glance

- `src/lib/api.ts` — the only HTTP client (fetch). Unwraps `{ data }`, throws `ApiError`
  (`code`, `status`), refreshes the token once on 401 and retries. `wsUrl()` builds WS URLs.
- `src/lib/errors.ts` — `errorMessage(err)` maps API error codes to user-facing copy.
- `src/context/AuthContext.tsx` + `useAuth()` — the only app-wide state (user, login/logout).
  Tokens live in `localStorage` (`src/lib/tokenStore.ts`).
- `src/App.tsx` — all routes. `ProtectedRoute` gates by role; `RoleHome` redirects `/`.
- Roles: `admin`, `professor`, `student`. `must_change_password` forces `/change-password`.
- `src/hooks/useQrBoard.ts` — WebSocket QR stream with REST polling fallback.
- No store library, no React Query, no theme provider.

## Commands

```bash
npm ci                    # install (always from the lockfile)
npm test                  # all tests once
npm run test:watch        # watch mode
npm run test:coverage     # with coverage + thresholds
npx vitest run <file>     # one file; add -t "test name" to filter
npm run lint              # ESLint
npm run typecheck         # tsc -b
npm run build             # production build
```

Before saying work is done: `npm run lint && npm run typecheck && npm test` must pass.

## Testing stack & rules

Vitest (jsdom) + React Testing Library + `@testing-library/user-event` + `@testing-library/jest-dom` + MSW.

- **No real network, ever.** All HTTP and WebSocket traffic goes through MSW. The server uses
  `onUnhandledRequest: "error"`, so a missing handler fails the test — add a handler, never
  bypass it. Do not mock `fetch`, `api.ts` or `WebSocket` by hand. (One sanctioned exception:
  a never-opening `WebSocket` stub via `vi.stubGlobal` to test connect timeouts, which MSW
  cannot simulate — see the "connect timeout" test in `src/hooks/useQrBoard.test.ts`.)
- Test files live **next to their source**: `Foo.tsx` → `Foo.test.tsx`.
- Query by **role/label/text** (`getByRole(..., { name })`, `getByLabelText`). Never by CSS
  class; avoid `data-testid`. If an element has no accessible handle, prefer fixing the markup
  (aria-label, role) — and mention it to the user, since it's a source change.
- Interact with **`userEvent`**, never `fireEvent`.
- **Arrange / Act / Assert**, separated by blank lines. Test behaviour the user sees, not state
  or implementation details.
- Async: `findBy*` / `waitFor`. No sleeps.
- Time-dependent code: `vi.useFakeTimers()` (+ `vi.useRealTimers()` in `afterEach`).
  `findBy*`/`waitFor` work with fake timers thanks to a shim in `src/test/setup.ts`.
  For userEvent pass `advanceTimers: vi.advanceTimersByTime` to `renderWithProviders`.
- Only mock at the edges: network (MSW) and hardware libs (e.g. `html5-qrcode`, see
  `src/pages/student/ScanPage.test.tsx`).
- Coverage thresholds live in `vitest.config.ts`. Never lower them to make CI pass.

## Test helpers (`src/test/`)

| File | Use it for |
| --- | --- |
| `setup.ts` | Global: MSW lifecycle, jest-dom, cleanup, resets `db`, handlers and `localStorage` after each test |
| `server.ts` | `server.use(...)` for per-test handler overrides |
| `handlers.ts` | Default handlers mirroring the Go backend (`../fictin/internal/handlers` — when it disagrees with `FrontendDirections.md`, the backend code wins); in-memory `db` (`users`, `subjects`, `schedules`, `enrollments`, `sessions`, `attendance`); helpers `ok(data)`, `apiError(status, code)`; `TEST_PASSWORD` for login and change-password |
| `factories.ts` | `buildUser`, `buildSubject`, `buildSession` (a `SessionView`), `buildSchedule`, `buildEnrollment`, `buildAttendanceRow`, `buildTokenMessage`, `buildLoginResponse` — pass overrides |
| `renderWithProviders.tsx` | Renders inside `MemoryRouter` + auth. Options: `route`, `path` (for `useParams`), `user` (signed in via the real AuthProvider + MSW), `authValue` (stub context), `advanceTimers`. Returns `{ user: userEvent, ...rtl }` |
| `RouteStub.tsx` | `<RouteStub name="Board" />` as a destination route; assert navigation with `findByRole("heading", { name: "Board at /path" })` |
| `downloads.ts` | `mockDownloads()` captures file downloads (filename + Blob) since jsdom can't download |

Auth in tests: access tokens are `access-<userId>`; the `/auth/me` handler resolves the caller
from `db.users`. Passing `user` to `renderWithProviders` does this setup for you.

## Reference tests to copy

- Pure util: `src/lib/errors.test.ts`, `src/lib/format.test.ts`
- API client / MSW overrides: `src/lib/api.test.ts`
- Hook (`renderHook`): `src/context/useAuth.test.tsx`; with WebSocket + fake timers: `src/hooks/useQrBoard.test.ts`
- Component states (loading/empty/error/data): `src/pages/student/AttendancePage.test.tsx`
- Form flow + API error: `src/pages/LoginPage.test.tsx`, `src/pages/professor/SubjectsListPage.test.tsx`
- Routing / guards: `src/App.test.tsx`
- Navigation to other pages + localStorage: `src/pages/professor/SubjectDetailPage.test.tsx`
- File download: `src/pages/admin/AttendancePage.test.tsx`
- Verifying a rendered QR payload: `src/pages/professor/BoardPage.test.tsx`

Use the `write-tests` skill for new tests and the `test-reviewer` agent to review them.
