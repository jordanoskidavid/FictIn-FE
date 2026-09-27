import { screen } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import App from "../App";
import { renderWithProviders } from "../test/renderWithProviders";
import { server } from "../test/server";
import { apiError, ok } from "../test/handlers";
import { buildUser } from "../test/factories";
import { getAccessToken } from "../lib/tokenStore";

function renderChangePassword() {
  return renderWithProviders(<App />, {
    route: "/change-password",
    user: buildUser({ must_change_password: true }),
  });
}

describe("Change password flow", () => {
  it("updates the password, signs out and returns to login", async () => {
    let sentBody: unknown;
    server.use(
      http.post("/api/v1/auth/change-password", async ({ request }) => {
        sentBody = await request.json();
        return ok({ status: "password_changed" });
      }),
    );
    const { user } = renderChangePassword();

    await user.type(await screen.findByLabelText("Current (temporary) password"), "temp-pass");
    await user.type(screen.getByLabelText("New password"), "brand-new-pass");
    await user.type(screen.getByLabelText("Confirm new password"), "brand-new-pass");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("heading", { name: "Sign in to fictIn" })).toBeInTheDocument();
    expect(sentBody).toEqual({ current_password: "temp-pass", new_password: "brand-new-pass" });
    expect(getAccessToken()).toBeNull();
  });

  it("blocks submission when the new passwords don't match", async () => {
    let called = false;
    server.use(
      http.post("/api/v1/auth/change-password", () => {
        called = true;
        return ok({ status: "password_changed" });
      }),
    );
    const { user } = renderChangePassword();

    await user.type(await screen.findByLabelText("Current (temporary) password"), "temp-pass");
    await user.type(screen.getByLabelText("New password"), "brand-new-pass");
    await user.type(screen.getByLabelText("Confirm new password"), "different-pass");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("New passwords don't match.");
    expect(called).toBe(false);
  });

  it("shows the server error and keeps the user on the page", async () => {
    server.use(
      http.post("/api/v1/auth/change-password", () => apiError(422, "VALIDATION_ERROR")),
    );
    const { user } = renderChangePassword();

    await user.type(await screen.findByLabelText("Current (temporary) password"), "temp-pass");
    await user.type(screen.getByLabelText("New password"), "brand-new-pass");
    await user.type(screen.getByLabelText("Confirm new password"), "brand-new-pass");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please check the form and try again.",
    );
    expect(screen.getByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(getAccessToken()).not.toBeNull();
  });
});
