import { screen } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import App from "./App";
import { server } from "./test/server";
import { apiError, db } from "./test/handlers";
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

  it("sends a user to change their password when the server demands it mid-session", async () => {
    server.use(
      http.get("/api/v1/subjects", () =>
        apiError(403, "PASSWORD_CHANGE_REQUIRED", "password change required"),
      ),
    );

    renderWithProviders(<App />, { route: "/professor/subjects", user: buildUser({ role: "professor" }) });

    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your subjects" })).not.toBeInTheDocument();
  });

  it("sends a user to change their password once the server starts requiring it", async () => {
    const professor = buildUser({ role: "professor" });
    const { user } = renderWithProviders(<App />, { route: "/professor/subjects", user: professor });
    await user.click(await screen.findByRole("button", { name: "New subject" }));
    db.users.find((u) => u.id === professor.id)!.must_change_password = true;

    await user.type(screen.getByLabelText("Name"), "Databases");
    await user.type(screen.getByLabelText(/^Code/), "CS101");
    await user.click(screen.getByRole("button", { name: "Create subject" }));

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
