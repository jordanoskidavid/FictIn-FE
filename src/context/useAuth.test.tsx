import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";
import { server } from "../test/server";
import { apiError, db, TEST_PASSWORD } from "../test/handlers";
import { buildUser } from "../test/factories";
import { getAccessToken, getRefreshToken, setTokens } from "../lib/tokenStore";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper });
}

describe("useAuth", () => {
  it("throws a helpful error when used outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used within AuthProvider");
  });

  describe("bootstrapping on mount", () => {
    it("finishes loading with no user when there is no stored token", async () => {
      const { result } = renderAuth();

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();
    });

    it("loads the current user from /auth/me when a token is stored", async () => {
      const user = buildUser({ role: "professor" });
      db.users.push(user);
      setTokens(`access-${user.id}`, `refresh-${user.id}`);

      const { result } = renderAuth();

      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toEqual(user);
    });

    it("clears stored tokens when the session can't be restored", async () => {
      setTokens("access-ghost", "refresh-ghost");

      const { result } = renderAuth();

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();
      expect(getAccessToken()).toBeNull();
    });
  });

  describe("login", () => {
    it("stores tokens and exposes the user on success", async () => {
      const user = buildUser({ email: "ana@example.com" });
      db.users.push(user);
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      let returned;
      await act(async () => {
        returned = await result.current.login("ana@example.com", TEST_PASSWORD);
      });

      expect(returned).toEqual(user);
      expect(result.current.user).toEqual(user);
      expect(getAccessToken()).toBe(`access-${user.id}`);
    });

    it("rejects with the API error and stays signed out on bad credentials", async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(() => result.current.login("nobody@example.com", "wrong")),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
      expect(result.current.user).toBeNull();
      expect(getAccessToken()).toBeNull();
    });
  });

  describe("logout", () => {
    it("clears the user and tokens even if the server call fails", async () => {
      const user = buildUser();
      db.users.push(user);
      setTokens(`access-${user.id}`, `refresh-${user.id}`);
      server.use(http.post("/api/v1/auth/logout", () => apiError(500, "INTERNAL")));
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.user).toEqual(user));

      await act(() => result.current.logout());

      expect(result.current.user).toBeNull();
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });
});
