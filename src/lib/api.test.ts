import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/server";
import { apiError, db, ok } from "../test/handlers";
import { buildLoginResponse, buildUser } from "../test/factories";
import { mockDownloads } from "../test/downloads";
import { api, ApiError, apiRequest, downloadCsv, wsUrl } from "./api";
import { getAccessToken, getRefreshToken, setTokens } from "./tokenStore";

describe("api client", () => {
  it("unwraps the { data } envelope", async () => {
    server.use(http.get("/api/v1/ping", () => ok({ pong: true })));

    const result = await api.get<{ pong: boolean }>("/api/v1/ping");

    expect(result).toEqual({ pong: true });
  });

  it("throws an ApiError carrying the backend code, status and message", async () => {
    server.use(http.get("/api/v1/ping", () => apiError(409, "CONFLICT", "already exists")));

    const error = await api.get("/api/v1/ping").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "CONFLICT", message: "already exists" });
  });

  it("falls back to an INTERNAL error when the error body is not JSON", async () => {
    server.use(
      http.get("/api/v1/ping", () => new HttpResponse("<html>oops</html>", { status: 502 })),
    );

    await expect(api.get("/api/v1/ping")).rejects.toMatchObject({ status: 502, code: "INTERNAL" });
  });

  it("returns undefined for 204 No Content", async () => {
    server.use(http.delete("/api/v1/thing", () => new HttpResponse(null, { status: 204 })));

    await expect(api.del("/api/v1/thing")).resolves.toBeUndefined();
  });

  it("sends the bearer token and JSON body", async () => {
    setTokens("access-abc", "refresh-abc");
    let seen: { auth: string | null; type: string | null; body: unknown } | undefined;
    server.use(
      http.post("/api/v1/echo", async ({ request }) => {
        seen = {
          auth: request.headers.get("Authorization"),
          type: request.headers.get("Content-Type"),
          body: await request.json(),
        };
        return ok(null);
      }),
    );

    await api.post("/api/v1/echo", { name: "Algorithms" });

    expect(seen).toEqual({
      auth: "Bearer access-abc",
      type: "application/json",
      body: { name: "Algorithms" },
    });
  });

  it("omits the Authorization header for auth: false requests", async () => {
    setTokens("access-abc", "refresh-abc");
    let authHeader: string | null = "unset";
    server.use(
      http.get("/api/v1/public", ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return ok(null);
      }),
    );

    await apiRequest("/api/v1/public", { auth: false });

    expect(authHeader).toBeNull();
  });

  it("serialises query params and skips undefined values", async () => {
    let search = "";
    server.use(
      http.get("/api/v1/admin/users", ({ request }) => {
        search = new URL(request.url).search;
        return ok([]);
      }),
    );

    await api.get("/api/v1/admin/users", { role: "student", active: undefined, page: 2 });

    expect(search).toBe("?role=student&page=2");
  });
});

describe("api client — token refresh on 401", () => {
  function seedExpiredSession() {
    const user = buildUser({ id: "u1" });
    db.users.push(user);
    // Access token is stale (unknown to the server); refresh token is still valid.
    setTokens("stale-access", `refresh-${user.id}`);
    return user;
  }

  it("refreshes once, stores the rotated tokens and retries the request", async () => {
    const user = seedExpiredSession();

    const me = await api.get("/api/v1/auth/me");

    expect(me).toEqual(user);
    expect(getAccessToken()).toBe("access-u1");
    expect(getRefreshToken()).toBe("refresh-u1");
  });

  it("clears tokens and surfaces the 401 when the refresh token is rejected", async () => {
    seedExpiredSession();
    server.use(http.post("/api/v1/auth/refresh", () => apiError(401, "UNAUTHORIZED")));

    await expect(api.get("/api/v1/auth/me")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("does not try to refresh when there is no refresh token", async () => {
    let refreshCalls = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => {
        refreshCalls++;
        return apiError(401, "UNAUTHORIZED");
      }),
    );

    await expect(api.get("/api/v1/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(0);
  });

  it("shares a single refresh between concurrent 401s", async () => {
    const user = seedExpiredSession();
    let refreshCalls = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => {
        refreshCalls++;
        return ok(buildLoginResponse(user));
      }),
    );

    const results = await Promise.all([
      api.get("/api/v1/auth/me"),
      api.get("/api/v1/auth/me"),
      api.get("/api/v1/auth/me"),
    ]);

    expect(results).toEqual([user, user, user]);
    expect(refreshCalls).toBe(1);
  });
});

describe("wsUrl", () => {
  it("builds a same-origin ws:// URL with the access token as a query param", () => {
    setTokens("tok en", "refresh");

    expect(wsUrl("/ws/sessions/s1/qr")).toBe(
      `ws://${window.location.host}/ws/sessions/s1/qr?access_token=tok%20en`,
    );
  });

  it("appends with & when the path already has a query string", () => {
    setTokens("t", "r");

    expect(wsUrl("/ws/x?a=1")).toMatch(/\/ws\/x\?a=1&access_token=t$/);
  });
});

describe("downloadCsv", () => {
  const csvResponse = (body: string, headers: Record<string, string> = {}) =>
    new HttpResponse(body, { headers: { "Content-Type": "text/csv", ...headers } });

  it("downloads the file using the server's filename and releases the blob URL", async () => {
    const downloads = mockDownloads();
    server.use(
      http.get("/api/v1/export", () =>
        csvResponse("a,b\n1,2\n", { "Content-Disposition": 'attachment; filename="report-2026.csv"' }),
      ),
    );

    await downloadCsv("/api/v1/export", { format: "csv" });

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe("report-2026.csv");
    expect(await downloads[0].blob.text()).toBe("a,b\n1,2\n");
    expect(downloads.revoked).toEqual(["blob:test/1"]);
  });

  it("accepts an unquoted filename", async () => {
    const downloads = mockDownloads();
    server.use(
      http.get("/api/v1/export", () =>
        csvResponse("x", { "Content-Disposition": "attachment; filename=plain.csv" }),
      ),
    );

    await downloadCsv("/api/v1/export", {});

    expect(downloads[0].filename).toBe("plain.csv");
  });

  it("falls back to attendance.csv when the server sends no filename", async () => {
    const downloads = mockDownloads();
    server.use(http.get("/api/v1/export", () => csvResponse("x")));

    await downloadCsv("/api/v1/export", {});

    expect(downloads[0].filename).toBe("attendance.csv");
  });

  it("sends the query and the bearer token", async () => {
    mockDownloads();
    setTokens("access-abc", "refresh-abc");
    let seen: { search: string; auth: string | null } | undefined;
    server.use(
      http.get("/api/v1/export", ({ request }) => {
        seen = { search: new URL(request.url).search, auth: request.headers.get("Authorization") };
        return csvResponse("x");
      }),
    );

    await downloadCsv("/api/v1/export", { subject_id: "s1", format: "csv" });

    expect(seen).toEqual({ search: "?subject_id=s1&format=csv", auth: "Bearer access-abc" });
  });

  it("throws the API error from a JSON error body and downloads nothing", async () => {
    const downloads = mockDownloads();
    server.use(http.get("/api/v1/export", () => apiError(403, "FORBIDDEN", "admins only")));

    await expect(downloadCsv("/api/v1/export", {})).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "admins only",
    });
    expect(downloads).toHaveLength(0);
  });

  it("throws a generic error when the error body isn't JSON", async () => {
    mockDownloads();
    server.use(
      http.get("/api/v1/export", () => new HttpResponse("Bad Gateway", { status: 502 })),
    );

    const error = await downloadCsv("/api/v1/export", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "INTERNAL", message: "Download failed" });
  });
});
