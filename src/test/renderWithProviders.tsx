import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import type { RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { AuthContext } from "../context/auth-context";
import type { AuthContextValue } from "../context/auth-context";
import { setTokens } from "../lib/tokenStore";
import type { User } from "../lib/types";
import { db } from "./handlers";

export interface ProviderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Initial URL, e.g. "/professor/subjects/subject-1". Defaults to "/". */
  route?: string;
  /**
   * Route pattern to mount `ui` under, e.g. "/professor/subjects/:id",
   * so `useParams()` works. Omit when rendering <App /> (it has its own <Routes>).
   */
  path?: string;
  /**
   * Signed-in user. They are added to the MSW db and their tokens are stored,
   * so the real <AuthProvider> loads them via GET /auth/me — exactly like the app.
   */
  user?: User;
  /** Replace the real AuthProvider with a stub context (for components that only read auth). */
  authValue?: Partial<AuthContextValue>;
  /** Pass `vi.advanceTimersByTime` when the test uses fake timers. */
  advanceTimers?: (ms: number) => unknown;
}

export function stubAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    loading: false,
    login: async () => {
      throw new Error("login not stubbed");
    },
    logout: async () => undefined,
    refreshUser: async () => undefined,
    setUser: () => undefined,
    ...overrides,
  };
}

/**
 * Renders `ui` inside every provider the app uses (MemoryRouter + auth).
 * Returns RTL's render result plus a ready-to-use `user` (userEvent instance).
 */
export function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  const { route = "/", path, user, authValue, advanceTimers, ...renderOptions } = options;

  if (user) {
    if (!db.users.some((u) => u.id === user.id)) db.users.push(user);
    setTokens(`access-${user.id}`, `refresh-${user.id}`);
  }

  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  );

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        {authValue ? (
          <AuthContext.Provider value={stubAuth(authValue)}>{children}</AuthContext.Provider>
        ) : (
          <AuthProvider>{children}</AuthProvider>
        )}
      </MemoryRouter>
    );
  }

  return {
    user: userEvent.setup(advanceTimers ? { advanceTimers } : {}),
    ...render(content, { wrapper: Wrapper, ...renderOptions }),
  };
}
