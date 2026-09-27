import { screen } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import App from "../App";
import { renderWithProviders } from "../test/renderWithProviders";
import { server } from "../test/server";
import { apiError, db, TEST_PASSWORD } from "../test/handlers";
import { buildUser } from "../test/factories";
import { getAccessToken } from "../lib/tokenStore";

// Integration: the real <App /> routes, AuthProvider and api client; only the network is mocked.
function renderLogin() {
  return renderWithProviders(<App />, { route: "/login" });
}

describe("Login flow", () => {
  it("signs a student in and lands on their subjects page", async () => {
    db.users.push(buildUser({ role: "student", email: "ana@uni.edu" }));
    const { user } = renderLogin();

    await user.type(await screen.findByLabelText("Email"), "ana@uni.edu");
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "My subjects" })).toBeInTheDocument();
    expect(getAccessToken()).not.toBeNull();
  });

  it("forces a password change when the account uses a temporary password", async () => {
    db.users.push(buildUser({ email: "new@uni.edu", must_change_password: true }));
    const { user } = renderLogin();

    await user.type(await screen.findByLabelText("Email"), "new@uni.edu");
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
  });

  it("shows an error and stays on the login page for wrong credentials", async () => {
    db.users.push(buildUser({ email: "ana@uni.edu" }));
    const { user } = renderLogin();

    await user.type(await screen.findByLabelText("Email"), "ana@uni.edu");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByRole("heading", { name: "Sign in to fictIn" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("explains when the account has been deactivated", async () => {
    server.use(http.post("/api/v1/auth/login", () => apiError(403, "ACCOUNT_INACTIVE")));
    const { user } = renderLogin();

    await user.type(await screen.findByLabelText("Email"), "old@uni.edu");
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This account has been deactivated.");
  });

  it("disables the submit button while the request is in flight", async () => {
    server.use(http.post("/api/v1/auth/login", () => delay("infinite")));
    const { user } = renderLogin();

    await user.type(await screen.findByLabelText("Email"), "ana@uni.edu");
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("redirects an already signed-in user away from /login", async () => {
    renderWithProviders(<App />, { route: "/login", user: buildUser({ role: "professor" }) });

    expect(await screen.findByRole("heading", { name: "Your subjects" })).toBeInTheDocument();
  });
});
