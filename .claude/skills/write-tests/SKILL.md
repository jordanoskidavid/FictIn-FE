---
name: write-tests
description: Write unit and/or integration tests for a component, hook, util or feature in this repo, following the team's Vitest + RTL + MSW conventions, then run them and fix failures until green. Use when asked to "test", "add tests for", "cover", or "write specs for" something in src/.
---

# Write tests for fictIn

Follow these steps in order. Read `CLAUDE.md` first if it isn't already in context. It holds the rules and helper locations.

## 1. Read the code under test

- Read the target file and anything it renders or calls that affects behavior: API endpoints it hits, context it reads, child components with their own states.
- Find the endpoints in `src/test/handlers.ts`. Note any the target uses that have no default handler yet.
- Check whether a test file already exists next to the source (`Foo.test.tsx`). If it does, extend it instead of creating a new one.

## 2. List states and edge cases before writing anything

Write a short checklist and show it to the user as part of your progress update. Typical items:

- **Data states:** loading, empty, populated, error (and which error codes produce which copy, see `src/lib/errors.ts`)
- **User flows:** fill, submit, success; validation that blocks submission; server error that keeps the form open
- **Auth/roles:** signed out, wrong role, `must_change_password`
- **Time:** intervals, cooldowns, timeouts (use fake timers)
- **Boundaries:** empty strings, missing optional fields, out-of-range values, duplicate actions
- **Cleanup:** unmount stops intervals, sockets and cameras

## 3. Choose the test level

| Target | Level | Pattern to copy |
| --- | --- | --- |
| Pure function in `src/lib` | Unit, no DOM | `src/lib/errors.test.ts` |
| Custom hook | `renderHook` (+ wrapper) | `src/context/useAuth.test.tsx`, `src/hooks/useQrBoard.test.ts` |
| Presentational / read-only page | Component with `renderWithProviders(ui, { authValue: {} })` | `src/pages/student/AttendancePage.test.tsx` |
| Form / multi-step user flow | Integration | `src/pages/professor/SubjectsListPage.test.tsx`, `src/pages/LoginPage.test.tsx` |
| Route guards, redirects, role navigation | Integration through `<App />` | `src/App.test.tsx` |

## 4. Write the tests

Conventions (they are not optional):

- The file goes next to the source as `Name.test.ts(x)`. Import `describe/it/expect/vi` from `vitest`.
- Render with `renderWithProviders()` from `src/test/renderWithProviders.tsx` and use the `user` it returns.
- Build data with `src/test/factories.ts` and override only the fields that matter.
- **Network:** seed `db` from `src/test/handlers.ts`, or override with `server.use(http.x(path, () => ok(...) | apiError(status, code)))`. For loading states use `delay("infinite")`. For WebSockets use `ws.link(...)`. Never mock `fetch`, `api.ts` or `WebSocket` by hand.
- If an endpoint has no default handler and many tests will need it, add one to `handlers.ts`, shaped like `FrontendDirections.md`.
- Query with `getByRole(role, { name })`, then `getByLabelText`, then `getByText`. Never use CSS classes or DOM structure. Use `within(dialog|row|table)` to scope.
- Use `userEvent`, never `fireEvent`.
- Separate Arrange / Act / Assert with blank lines. Test names describe user-visible behavior.
- Assert on what the user sees, what the URL/page becomes, or the request body the API received. Don't assert on internal state or on which internal functions were called.
- For time: `vi.useFakeTimers()`, `await act(() => vi.advanceTimersByTimeAsync(ms))`, pass `advanceTimers: vi.advanceTimersByTime` to `renderWithProviders`, and `vi.useRealTimers()` in `afterEach`.
- Reset module-level mock state in `beforeEach`, not `afterEach`. Global cleanup (unmount) runs after your `afterEach`.
- If an element can't be reached by role or label, adding an `aria-label` or role is preferred over `data-testid`. Tell the user, because it changes source code.

## 5. Run and fix until green

```bash
npx vitest run path/to/File.test.tsx
```

- If a test fails, read the failure and decide whether the test or the code is wrong. **Never change app behavior just to make a test pass** without telling the user. If you find a real bug, report it and ask before fixing.
- `[MSW] ... without a matching request handler` means you should add a handler or override.
- A `findBy`/`waitFor` timeout under fake timers usually means timers weren't advanced, or the state never changes.
- Run the file 3 times to catch flakiness, especially with timers or sockets.

Then run the full gate:

```bash
npm run lint && npm run typecheck && npm test
```

## 6. Report

Summarize for the user: the files added or changed, the checklist from step 2 with each item marked covered or not, any source changes made for accessibility, and any bugs found.
