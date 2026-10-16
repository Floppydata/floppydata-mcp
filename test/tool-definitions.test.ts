import { describe, expect, it } from "vitest";
import { FloppydataApiClient } from "../src/api.js";
import {
  accountUsageInputSchema,
  browserSessionCreateInputSchema,
  browserSessionIdInputSchema,
  checkProxyInputSchema,
  getToolSummary,
  rotatingConnectionInputSchema,
  runFloppydataTool,
  toolDefinitions
} from "../src/tool-definitions.js";

interface CapturedRequest {
  input: string | URL | Request;
  init?: RequestInit;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function createClient(responseByPath: Record<string, unknown>) {
  const calls: CapturedRequest[] = [];
  const client = new FloppydataApiClient({
    apiKey: "test-api-key",
    fetcher: async (input, init) => {
      calls.push({ input, init });
      const url = new URL(String(input));
      const key = `${init?.method ?? "GET"} ${url.pathname}`;
      const response = responseByPath[key] ?? {};
      return jsonResponse(response);
    }
  });

  return { calls, client };
}

describe("tool definitions", () => {
  it("exposes the curated v2 MCP tool set", () => {
    expect(toolDefinitions.map((tool) => tool.name)).toEqual([
      "fetch_web_data",
      "create_rotating_proxy_connection",
      "list_rotating_proxy_locations",
      "check_proxy",
      "list_static_proxies",
      "get_account_balances",
      "get_account_usage",
      "create_browser_session",
      "list_browser_sessions",
      "get_browser_session",
      "stop_browser_session",
      "create_browser_live_view",
      "delete_browser_session",
      "delete_browser_settings"
    ]);
  });

  it("does not expose removed rotating credential concepts", () => {
    expect(rotatingConnectionInputSchema.safeParse({
      type: "residential",
      country: "US",
      credentialId: "abc"
    }).success).toBe(false);
    expect(rotatingConnectionInputSchema.safeParse({
      type: "residential",
      country: "US",
      quantity: 5
    }).success).toBe(false);
    expect(
      JSON.stringify(toolDefinitions.map((tool) => tool.inputShape))
    ).not.toMatch(/credentialId|quantity|credentials/);
  });

  it("validates check_proxy as connectionString or structured credentials", () => {
    expect(checkProxyInputSchema.safeParse({
      connectionString: "http://user:pass@host:10080"
    }).success).toBe(true);
    expect(checkProxyInputSchema.safeParse({
      host: "geo.g-w.info",
      port: 10080,
      username: "user",
      password: "pass"
    }).success).toBe(true);
    expect(checkProxyInputSchema.safeParse({
      host: "geo.g-w.info"
    }).success).toBe(false);
  });

  it("accepts the account usage filters exposed by Client API v2", () => {
    expect(accountUsageInputSchema.parse({
      product: "proxy-rotating",
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26",
      poolId: 123,
      countryCode: "US",
      proxyType: "residential"
    })).toEqual({
      product: "proxy-rotating",
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26",
      poolId: 123,
      countryCode: "US",
      proxyType: "residential"
    });
  });

  it("maps each MCP tool to the expected v2 API request", async () => {
    const { calls, client } = createClient({
      "POST /v2/web-data/fetch": {
        html: "<html></html>",
        sourceUrl: "https://example.com",
        fetchedAt: "2026-06-26T00:00:00.000Z"
      },
      "POST /v2/proxy/rotating/connections": {
        connection: {
          protocol: "http",
          host: "geo.g-w.info",
          port: 10080,
          username: "user",
          password: "pass",
          connectionString: "http://user:pass@geo.g-w.info:10080"
        },
        parameters: {
          type: "residential",
          country: "US"
        }
      },
      "GET /v2/proxy/rotating/locations": {
        type: "residential",
        items: []
      },
      "POST /v2/proxy/check": {
        ip: "123.45.67.89",
        location: {
          countryCode: "US",
          country: "United States",
          state: "California",
          city: "San Francisco"
        }
      },
      "GET /v2/proxy/static": {
        items: [],
        pendingCount: 0
      },
      "GET /v2/account/balances": {
        webData: {
          requests: {
            total: 10,
            used: 1,
            remaining: 9
          }
        }
      },
      "GET /v2/account/usage": {
        lastUpdatedAt: null,
        filters: {}
      }
    });

    await runFloppydataTool(client, "fetch_web_data", {
      url: "https://example.com"
    });
    await runFloppydataTool(client, "create_rotating_proxy_connection", {
      type: "residential",
      country: "US",
      city: "New York",
      rotation: 15,
      protocol: "http"
    });
    await runFloppydataTool(client, "list_rotating_proxy_locations", {
      type: "residential"
    });
    await runFloppydataTool(client, "check_proxy", {
      connectionString: "http://user:pass@geo.g-w.info:10080"
    });
    await runFloppydataTool(client, "list_static_proxies", {});
    await runFloppydataTool(client, "get_account_balances", {
      product: "proxy-rotating"
    });
    await runFloppydataTool(client, "get_account_usage", {
      product: "proxy-rotating",
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26",
      countryCode: "US",
      proxyType: "residential"
    });

    expect(calls.map((call) => {
      const url = new URL(String(call.input));
      return `${call.init?.method ?? "GET"} ${url.pathname}${url.search}`;
    })).toEqual([
      "POST /v2/web-data/fetch",
      "POST /v2/proxy/rotating/connections",
      "GET /v2/proxy/rotating/locations?type=residential",
      "POST /v2/proxy/check",
      "GET /v2/proxy/static",
      "GET /v2/account/balances?product=proxy-rotating",
      "GET /v2/account/usage?product=proxy-rotating&from=2026-06-01T00%3A00%3A00Z&to=2026-06-26&countryCode=US&proxyType=residential"
    ]);

    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      type: "residential",
      country: "US",
      city: "New York",
      rotation: 15,
      protocol: "http"
    });
  });

  it("accepts the grouped Cloud Browser session request", () => {
    const input = {
      browser: {
        viewport: { width: 1440, height: 900 },
        fingerprint: {
          strategy: "custom",
          os: "windows",
          locale: "en-US",
          timezone: "auto",
          geolocation: { mode: "auto" },
          masking: { canvas: "noise", webrtc: "proxy" }
        }
      },
      storage: {
        cookies: {
          mode: "replace",
          items: [{ name: "sid", value: "v", domain: ".example.com" }]
        }
      },
      proxy: {
        type: "residential",
        location: { countryCode: "US", city: "New York" },
        rotation: { mode: "sticky" }
      },
      persist: { ttlSeconds: 900 },
      runtime: { timeoutSeconds: 1800, keepAlive: true },
      startUrl: "https://example.com",
      metadata: { taskId: "checkout-42" }
    };

    expect(browserSessionCreateInputSchema.parse(input)).toEqual(input);
    expect(browserSessionCreateInputSchema.parse({})).toEqual({});
    expect(browserSessionCreateInputSchema.safeParse({
      proxy: { type: "static", ip: "123.45.67.89" }
    }).success).toBe(true);
  });

  it("rejects unknown Cloud Browser fields and legacy profile ids", () => {
    expect(browserSessionCreateInputSchema.safeParse({
      profileId: "f742823c-7ba6-4488-a72d-6e9c5447eacb"
    }).success).toBe(false);
    expect(browserSessionCreateInputSchema.safeParse({
      runtime: { timeoutSeconds: 30 }
    }).success).toBe(false);
    expect(browserSessionIdInputSchema.safeParse({
      sessionId: "not-a-uuid"
    }).success).toBe(false);
  });

  it("maps each Cloud Browser tool to the expected v2 API request", async () => {
    const sessionId = "58e531ee-16ca-49d0-8722-b425d154cc10";
    const settingsId = "f742823c-7ba6-4488-a72d-6e9c5447eacb";
    const session = {
      id: sessionId,
      status: "running",
      connectUrl: `wss://api.floppydata.net/v2/browser/sessions/${sessionId}/connect?token=T`,
      settings: { id: settingsId, persistence: "burner", ttlSeconds: null, retentionExpiresAt: null },
      runtime: { timeoutSeconds: 600, keepAlive: false },
      createdAt: "2026-07-10T12:00:00Z",
      startedAt: "2026-07-10T12:00:01Z",
      expiresAt: "2026-07-10T12:10:00Z",
      endedAt: null
    };
    const { calls, client } = createClient({
      "POST /v2/browser/sessions": session,
      "GET /v2/browser/sessions": { items: [session], nextCursor: null },
      [`GET /v2/browser/sessions/${sessionId}`]: session,
      [`POST /v2/browser/sessions/${sessionId}/stop`]: { ...session, status: "stopped" },
      [`POST /v2/browser/sessions/${sessionId}/live-view`]: {
        liveViewUrl: "https://live.example.com/view"
      }
    });

    const created = await runFloppydataTool(client, "create_browser_session", {
      proxy: { type: "residential", location: { countryCode: "US" } }
    });
    await runFloppydataTool(client, "list_browser_sessions", {
      status: "running",
      limit: 5
    });
    await runFloppydataTool(client, "get_browser_session", { sessionId });
    await runFloppydataTool(client, "stop_browser_session", { sessionId });
    await runFloppydataTool(client, "create_browser_live_view", { sessionId });
    const deletedSession = await runFloppydataTool(client, "delete_browser_session", {
      sessionId
    });
    const deletedSettings = await runFloppydataTool(client, "delete_browser_settings", {
      settingsId
    });

    expect(calls.map((call) => {
      const url = new URL(String(call.input));
      return `${call.init?.method ?? "GET"} ${url.pathname}${url.search}`;
    })).toEqual([
      "POST /v2/browser/sessions",
      "GET /v2/browser/sessions?status=running&limit=5",
      `GET /v2/browser/sessions/${sessionId}`,
      `POST /v2/browser/sessions/${sessionId}/stop`,
      `POST /v2/browser/sessions/${sessionId}/live-view`,
      `DELETE /v2/browser/sessions/${sessionId}`,
      `DELETE /v2/browser/settings/${settingsId}`
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      proxy: { type: "residential", location: { countryCode: "US" } }
    });
    expect(created).toEqual(session);
    expect(getToolSummary("create_browser_session", created)).toBe(
      `Browser session ${sessionId} is running. Connect with Puppeteer or Playwright over connectUrl.`
    );
    expect(deletedSession).toEqual({ deleted: true, sessionId });
    expect(deletedSettings).toEqual({ deleted: true, settingsId });
  });
});
