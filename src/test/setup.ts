import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./server";
import { resetDb } from "./handlers";

// RTL's waitFor/findBy* only advance fake timers when a Jest-style global exists.
// This shim makes them work with vi.useFakeTimers(); it's a no-op with real timers.
Object.assign(globalThis, {
  jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) },
});

// Any request without a matching handler fails the test: tests never hit the real network.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetDb();
  localStorage.clear();
});

afterAll(() => server.close());
