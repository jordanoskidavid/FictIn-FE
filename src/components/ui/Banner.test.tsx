import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./Banner";

describe("Banner", () => {
  it("announces errors assertively as an alert", () => {
    render(<Banner tone="error">Incorrect email or password.</Banner>);

    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("announces success and info politely as a status", () => {
    render(<Banner tone="success">Marked present!</Banner>);

    expect(screen.getByRole("status")).toHaveTextContent("Marked present!");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no dismiss button unless onDismiss is provided", () => {
    render(<Banner>Heads up</Banner>);

    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("calls onDismiss when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Banner onDismiss={onDismiss}>Heads up</Banner>);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
