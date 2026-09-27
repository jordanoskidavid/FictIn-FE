import { screen, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { AdminSubjectsPage } from "./SubjectsPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, db, ok } from "../../test/handlers";
import { buildSubject } from "../../test/factories";

const renderPage = () => renderWithProviders(<AdminSubjectsPage />, { authValue: {} });

describe("Admin › Subjects", () => {
  it("shows a loading indicator while subjects are being fetched", () => {
    server.use(http.get("/api/v1/admin/subjects", () => delay("infinite")));

    renderPage();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no subjects", async () => {
    renderPage();

    expect(await screen.findByText("No subjects yet")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
  });

  it("treats a null response as no subjects", async () => {
    server.use(http.get("/api/v1/admin/subjects", () => ok(null)));

    renderPage();

    expect(await screen.findByText("No subjects yet")).toBeInTheDocument();
  });

  it("lists every subject with its professor", async () => {
    db.subjects = [
      buildSubject({ code: "CS101", name: "Algorithms", professor_id: "prof-ana" }),
      buildSubject({ code: "MA201", name: "Linear Algebra", professor_id: "prof-marko" }),
    ];

    renderPage();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2 subjects
    const row = screen.getByRole("row", { name: /CS101/ });
    expect(within(row).getByRole("cell", { name: "Algorithms" })).toBeInTheDocument();
    expect(within(row).getByRole("cell", { name: "prof-ana" })).toBeInTheDocument();
  });

  it("shows a friendly error when the request fails", async () => {
    server.use(http.get("/api/v1/admin/subjects", () => apiError(403, "FORBIDDEN")));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have permission to do that.",
    );
  });
});
