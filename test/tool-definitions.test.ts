import { describe, expect, it } from "vitest";
import { FloppydataApiClient } from "../src/api.js";
import {
  accountUsageInputSchema,
  checkProxyInputSchema,
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
      "get_account_usage"
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
});
