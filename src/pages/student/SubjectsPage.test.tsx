import { screen } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { StudentSubjectsPage } from "./SubjectsPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import { buildSubject } from "../../test/factories";

const renderPage = () => renderWithProviders(<StudentSubjectsPage />, { authValue: {} });

describe("Student › My subjects", () => {
  it("shows a loading indicator while subjects are being fetched", () => {
    server.use(http.get("/api/v1/student/subjects", () => delay("infinite")));

    renderPage();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("tells the student how to get enrolled when they have no subjects", async () => {
    renderPage();

    expect(await screen.findByText("You're not enrolled in any subjects yet")).toBeInTheDocument();
    expect(screen.getByText("Ask your professor to add you.")).toBeInTheDocument();
  });

  it("shows each enrolled subject's code and name", async () => {
    db.subjects = [
      buildSubject({ code: "CS101", name: "Algorithms" }),
      buildSubject({ code: "MA201", name: "Linear Algebra" }),
    ];

    renderPage();

    expect(await screen.findByText("Algorithms")).toBeInTheDocument();
    expect(screen.getByText("CS101")).toBeInTheDocument();
    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
    expect(screen.getByText("MA201")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
  });

  it("shows a friendly error when the request fails", async () => {
    server.use(http.get("/api/v1/student/subjects", () => apiError(500, "INTERNAL")));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our end.");
  });
});
