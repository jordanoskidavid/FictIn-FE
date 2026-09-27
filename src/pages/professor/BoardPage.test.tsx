import { render, screen } from "@testing-library/react";
import { http, ws } from "msw";
import { QRCodeSVG } from "qrcode.react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardPage } from "./BoardPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { RouteStub } from "../../test/RouteStub";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import { buildSession, buildTokenMessage } from "../../test/factories";
import { getStoredSessionId, setStoredSessionId } from "../../lib/activeSession";
import type { TokenMessage } from "../../lib/types";

const SESSION_ID = "sess-1";
const SUBJECT_ID = "sub-1";
const qrSocket = ws.link(`ws://${window.location.host}/ws/sessions/:sessionId/qr`);

/** The QR modules (path data) a correct board must show for this token. */
function expectedQrPaths(token: TokenMessage) {
  const value = JSON.stringify({ session_id: token.session_id, token: token.token });
  const { container, unmount } = render(<QRCodeSVG value={value} level="M" />);
  const paths = [...container.querySelectorAll("path")].map((p) => p.getAttribute("d"));
  unmount();
  expect(paths.length).toBeGreaterThan(0);
  return paths;
}

function qrPaths(img: HTMLElement) {
  return [...img.querySelectorAll("path")].map((p) => p.getAttribute("d"));
}

/** Server pushes the given frames as soon as the board connects. */
function streamTokens(...tokens: TokenMessage[]) {
  server.use(
    qrSocket.addEventListener("connection", ({ client }) => {
      tokens.forEach((t) => client.send(JSON.stringify(t)));
    }),
  );
}

/**
 * The board learns its subject from GET /sessions/:id, separately from the socket.
 * Tests that depend on where "End session" navigates must wait for that response.
 */
function trackSessionLookup() {
  let answered = false;
  server.events.on("response:mocked", ({ request }) => {
    if (request.method === "GET" && new URL(request.url).pathname === `/api/v1/sessions/${SESSION_ID}`) {
      answered = true;
    }
  });
  return () => vi.waitFor(() => expect(answered).toBe(true));
}

function renderBoard() {
  return renderWithProviders(
    <Routes>
      <Route path="/professor/sessions/:sessionId/board" element={<BoardPage />} />
      <Route path="/professor/subjects/:id" element={<RouteStub name="Subject" />} />
      <Route path="/professor/subjects" element={<RouteStub name="Subjects list" />} />
    </Routes>,
    { route: `/professor/sessions/${SESSION_ID}/board`, authValue: {} },
  );
}

describe("Professor › QR board", () => {
  beforeEach(() => {
    db.sessions = [buildSession({ id: SESSION_ID, subject_id: SUBJECT_ID, status: "live" })];
    setStoredSessionId(SUBJECT_ID, SESSION_ID);
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  it("waits for the first token while connecting", () => {
    streamTokens();

    renderBoard();

    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.getByText("Waiting for first token…")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Attendance QR code" })).not.toBeInTheDocument();
  });

  it("shows a QR code encoding the session id and current token", async () => {
    const token = buildTokenMessage({ session_id: SESSION_ID, token: "tok-abc" });
    streamTokens(token);

    renderBoard();

    const qr = await screen.findByRole("img", { name: "Attendance QR code" });
    expect(qrPaths(qr)).toEqual(expectedQrPaths(token));
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("replaces the QR code when a new token arrives", async () => {
    const first = buildTokenMessage({ session_id: SESSION_ID, token: "tok-1" });
    const second = buildTokenMessage({ session_id: SESSION_ID, token: "tok-2" });
    let push: (t: TokenMessage) => void = () => undefined;
    server.use(
      qrSocket.addEventListener("connection", ({ client }) => {
        client.send(JSON.stringify(first));
        push = (t) => client.send(JSON.stringify(t));
      }),
    );
    renderBoard();
    const qr = await screen.findByRole("img", { name: "Attendance QR code" });
    expect(qrPaths(qr)).toEqual(expectedQrPaths(first));

    expect(expectedQrPaths(second)).not.toEqual(expectedQrPaths(first));

    push(second);

    await expect
      .poll(() => qrPaths(screen.getByRole("img", { name: "Attendance QR code" })))
      .toEqual(expectedQrPaths(second));
  });

  it("ends the session, forgets it and returns to the subject", async () => {
    streamTokens(buildTokenMessage({ session_id: SESSION_ID }));
    const sessionLookup = trackSessionLookup();
    const { user } = renderBoard();
    await screen.findByRole("img", { name: "Attendance QR code" });
    await sessionLookup();

    await user.click(screen.getByRole("button", { name: "End session" }));

    expect(
      await screen.findByRole("heading", { name: `Subject at /professor/subjects/${SUBJECT_ID}` }),
    ).toBeInTheDocument();
    expect(db.sessions[0].status).toBe("ended");
    expect(getStoredSessionId(SUBJECT_ID)).toBeNull();
  });

  it("falls back to the subjects list when the session's subject is unknown", async () => {
    streamTokens();
    server.use(http.get("/api/v1/sessions/:id", () => apiError(404, "NOT_FOUND")));
    const sessionLookup = trackSessionLookup();
    const { user } = renderBoard();
    await sessionLookup();

    await user.click(screen.getByRole("button", { name: "End session" }));

    expect(
      await screen.findByRole("heading", { name: "Subjects list at /professor/subjects" }),
    ).toBeInTheDocument();
  });

  it("shows the error and stays on the board when ending fails", async () => {
    streamTokens(buildTokenMessage({ session_id: SESSION_ID }));
    server.use(http.post("/api/v1/sessions/:id/stop", () => apiError(500, "INTERNAL")));
    const { user } = renderBoard();
    await screen.findByRole("img", { name: "Attendance QR code" });

    await user.click(screen.getByRole("button", { name: "End session" }));

    expect(await screen.findByText("Something went wrong on our end.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Attendance QR code" })).toBeInTheDocument();
    expect(getStoredSessionId(SUBJECT_ID)).toBe(SESSION_ID);
  });

  it("tells the professor when the server ends the session", async () => {
    server.use(
      qrSocket.addEventListener("connection", ({ client }) => {
        client.close(1000, "session ended");
      }),
    );
    const { user } = renderBoard();

    expect(await screen.findByText("This session has ended.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End session" })).not.toBeInTheDocument();
    await expect.poll(() => getStoredSessionId(SUBJECT_ID)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to subject" }));

    expect(
      await screen.findByRole("heading", { name: `Subject at /professor/subjects/${SUBJECT_ID}` }),
    ).toBeInTheDocument();
  });
});
