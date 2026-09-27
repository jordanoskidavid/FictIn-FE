import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
import { renderWithProviders } from "./test/renderWithProviders";
import { buildUser } from "./test/factories";
import { getAccessToken } from "./lib/tokenStore";
import type { Role } from "./lib/types";

// Integration: route guards (ProtectedRoute / RoleHome) through the real router and AuthProvider.
describe("App routing", () => {
  it("sends guests to the login page", async () => {
    renderWithProviders(<App />, { route: "/student/subjects" });

    expect(await screen.findByRole("heading", { name: "Sign in to fictIn" })).toBeInTheDocument();
  });

  it.each<[Role, string]>([
    ["admin", "Users"],
    ["professor", "Your subjects"],
    ["student", "My subjects"],
  ])("sends a signed-in %s from / to their home page (%s)", async (role, heading) => {
    renderWithProviders(<App />, { route: "/", user: buildUser({ role }) });

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("bounces a user away from another role's pages", async () => {
    renderWithProviders(<App />, { route: "/admin/users", user: buildUser({ role: "student" }) });

    expect(await screen.findByRole("heading", { name: "My subjects" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
  });

  it("forces users with a temporary password to change it first", async () => {
    renderWithProviders(<App />, {
      route: "/student/attendance",
      user: buildUser({ role: "student", must_change_password: true }),
    });

    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
  });

  it("redirects unknown URLs to the user's home page", async () => {
    renderWithProviders(<App />, { route: "/does/not/exist", user: buildUser({ role: "student" }) });

    expect(await screen.findByRole("heading", { name: "My subjects" })).toBeInTheDocument();
  });

  it("shows only the navigation links for the user's role", async () => {
    renderWithProviders(<App />, { route: "/", user: buildUser({ role: "student" }) });

    const nav = await screen.findByRole("navigation");
    expect(nav).toHaveTextContent("My subjects");
    expect(nav).toHaveTextContent("Scan QR");
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("signs out and returns to the login page", async () => {
    const { user } = renderWithProviders(<App />, { route: "/", user: buildUser({ role: "admin" }) });

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in to fictIn" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });
});
