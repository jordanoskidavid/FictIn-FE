import { screen, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { UsersPage } from "./UsersPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import { buildUser } from "../../test/factories";

function renderUsersPage() {
  return renderWithProviders(<UsersPage />, { authValue: {} });
}

function rowFor(name: string) {
  return screen.getByRole("row", { name: new RegExp(name) });
}

describe("Admin › Users", () => {
  it("lists all users with their role and status", async () => {
    db.users = [
      buildUser({ full_name: "Ana Student", role: "student" }),
      buildUser({ full_name: "Petar Professor", role: "professor", is_active: false }),
    ];

    renderUsersPage();

    expect(await screen.findByRole("cell", { name: "Ana Student" })).toBeInTheDocument();
    expect(within(rowFor("Ana Student")).getByText("Active")).toBeInTheDocument();
    expect(within(rowFor("Petar Professor")).getByText("Inactive")).toBeInTheDocument();
  });

  it("filters the list by role", async () => {
    db.users = [
      buildUser({ full_name: "Ana Student", role: "student" }),
      buildUser({ full_name: "Petar Professor", role: "professor" }),
    ];
    const { user } = renderUsersPage();
    await screen.findByRole("cell", { name: "Ana Student" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by role" }), "professor");

    expect(await screen.findByRole("cell", { name: "Petar Professor" })).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.queryByRole("cell", { name: "Ana Student" })).not.toBeInTheDocument(),
    );
  });

  it("shows an empty state when no users match", async () => {
    renderUsersPage();

    expect(await screen.findByText("No users found")).toBeInTheDocument();
  });

  describe("creating a user", () => {
    it("creates a student and adds them to the list", async () => {
      let sentBody: unknown;
      server.use(
        http.post("/api/v1/auth/register", async ({ request }) => {
          sentBody = await request.clone().json();
          return undefined; // fall through to the default handler
        }),
      );
      const { user } = renderUsersPage();
      await screen.findByText("No users found");

      await user.click(screen.getByRole("button", { name: "New user" }));
      const dialog = screen.getByRole("dialog", { name: "New user" });
      await user.type(within(dialog).getByLabelText("Full name"), "Mila Novak");
      await user.type(within(dialog).getByLabelText("Email"), "mila@uni.edu");
      await user.type(within(dialog).getByLabelText(/^Temporary password/), "temp-1234");
      await user.type(within(dialog).getByLabelText("Student code"), "S2026");
      await user.click(within(dialog).getByRole("button", { name: "Create user" }));

      expect(await screen.findByRole("cell", { name: "Mila Novak" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(sentBody).toEqual({
        full_name: "Mila Novak",
        email: "mila@uni.edu",
        password: "temp-1234",
        role: "student",
        student_code: "S2026",
      });
    });

    it("only asks for a student code when the role is student", async () => {
      const { user } = renderUsersPage();
      await user.click(await screen.findByRole("button", { name: "New user" }));
      const dialog = screen.getByRole("dialog", { name: "New user" });

      await user.selectOptions(within(dialog).getByLabelText("Role"), "professor");

      expect(within(dialog).queryByLabelText("Student code")).not.toBeInTheDocument();
    });

    it("keeps the dialog open and shows the error when the email is taken", async () => {
      server.use(http.post("/api/v1/auth/register", () => apiError(409, "CONFLICT")));
      const { user } = renderUsersPage();
      await user.click(await screen.findByRole("button", { name: "New user" }));
      const dialog = screen.getByRole("dialog", { name: "New user" });

      await user.type(within(dialog).getByLabelText("Full name"), "Mila Novak");
      await user.type(within(dialog).getByLabelText("Email"), "taken@uni.edu");
      await user.type(within(dialog).getByLabelText(/^Temporary password/), "temp-1234");
      await user.type(within(dialog).getByLabelText("Student code"), "S2026");
      await user.click(within(dialog).getByRole("button", { name: "Create user" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "That conflicts with existing data.",
      );
    });
  });

  it("deactivates an active user", async () => {
    db.users = [buildUser({ full_name: "Ana Student", is_active: true })];
    const { user } = renderUsersPage();
    await screen.findByRole("cell", { name: "Ana Student" });

    await user.click(within(rowFor("Ana Student")).getByRole("button", { name: "Deactivate" }));

    expect(
      await within(rowFor("Ana Student")).findByRole("button", { name: "Activate" }),
    ).toBeInTheDocument();
    expect(within(rowFor("Ana Student")).getByText("Inactive")).toBeInTheDocument();
  });

  it("deletes a user after confirmation", async () => {
    db.users = [buildUser({ full_name: "Ana Student" })];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderUsersPage();
    await screen.findByRole("cell", { name: "Ana Student" });

    await user.click(within(rowFor("Ana Student")).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("No users found")).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith("Delete Ana Student? This cannot be undone.");
  });

  it("keeps the user when deletion is cancelled", async () => {
    db.users = [buildUser({ full_name: "Ana Student" })];
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderUsersPage();
    await screen.findByRole("cell", { name: "Ana Student" });

    await user.click(within(rowFor("Ana Student")).getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("cell", { name: "Ana Student" })).toBeInTheDocument();
    expect(db.users).toHaveLength(1);
  });

  it("shows a dismissible error when loading fails", async () => {
    server.use(http.get("/api/v1/admin/users", () => apiError(500, "INTERNAL")));
    const { user } = renderUsersPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our end.");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
