import { screen, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { SubjectsListPage } from "./SubjectsListPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import { buildSubject } from "../../test/factories";

// Note: fields with a hint currently include it in their label ("Code e.g. CS101 …"),
// so we match the label prefix. See CONTRIBUTING.md › Known a11y follow-ups.
function renderSubjects() {
  return renderWithProviders(<SubjectsListPage />, { authValue: {} });
}

describe("Professor › Subjects list", () => {
  it("links each subject to its detail page", async () => {
    db.subjects = [buildSubject({ id: "sub-1", name: "Algorithms", code: "CS101" })];

    renderSubjects();

    expect(await screen.findByRole("link", { name: /Algorithms/ })).toHaveAttribute(
      "href",
      "/professor/subjects/sub-1",
    );
  });

  it("guides the professor when they have no subjects", async () => {
    renderSubjects();

    expect(await screen.findByText("No subjects yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first subject to get started.")).toBeInTheDocument();
  });

  it("creates a subject and shows it in the list", async () => {
    const { user } = renderSubjects();
    await screen.findByText("No subjects yet");

    await user.click(screen.getByRole("button", { name: "New subject" }));
    const dialog = screen.getByRole("dialog", { name: "New subject" });
    await user.type(within(dialog).getByLabelText("Name"), "Databases");
    await user.type(within(dialog).getByLabelText(/^Code/), "cs202");
    await user.click(within(dialog).getByRole("button", { name: "Create subject" }));

    const link = await screen.findByRole("link", { name: /Databases/ });
    expect(link).toHaveTextContent("CS202"); // the server uppercases codes
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("No subjects yet")).not.toBeInTheDocument();
  });

  it("shows a conflict error when the subject code is already taken", async () => {
    db.subjects = [buildSubject({ code: "CS101" })];
    const { user } = renderSubjects();
    await user.click(await screen.findByRole("button", { name: "New subject" }));
    const dialog = screen.getByRole("dialog", { name: "New subject" });

    await user.type(within(dialog).getByLabelText("Name"), "Algorithms again");
    await user.type(within(dialog).getByLabelText(/^Code/), "cs101");
    await user.click(within(dialog).getByRole("button", { name: "Create subject" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That conflicts with existing data.",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("closes the dialog without creating anything", async () => {
    const { user } = renderSubjects();
    await user.click(await screen.findByRole("button", { name: "New subject" }));

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(db.subjects).toHaveLength(0);
  });

  it("shows an error when subjects fail to load", async () => {
    server.use(http.get("/api/v1/subjects", () => apiError(500, "INTERNAL")));

    renderSubjects();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our end.");
  });
});
