import { describe, expect, it } from "vitest";
import {
  FLOPPYDATA_API_BASE_URL,
  FLOPPYDATA_API_KEY_ENV
} from "../src/constants.js";
import {
  FloppydataApiClient,
  FloppydataApiError,
  getApiKeyFromEnv
} from "../src/api.js";
import { toSafeToolError } from "../src/server.js";

interface CapturedRequest {
  input: string | URL | Request;
  init?: RequestInit;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function createMockFetcher(response: Response) {
  const calls: CapturedRequest[] = [];
  const fetcher = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    calls.push({ input, init });
    return response.clone();
  };

  return { calls, fetcher };
}

describe("FloppydataApiClient", () => {
  it("sends authenticated JSON requests to production Client API v2", async () => {
    const { calls, fetcher } = createMockFetcher(
      jsonResponse({
        html: "<html></html>",
        sourceUrl: "https://example.com",
        fetchedAt: "2026-06-26T00:00:00.000Z"
      })
    );
    const client = new FloppydataApiClient({
      apiKey: "test-api-key",
      fetcher
    });

    await client.fetchWebData({
      url: "https://example.com",
      countryCode: "US"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(`${FLOPPYDATA_API_BASE_URL}/v2/web-data/fetch`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Api-Key": "test-api-key"
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      url: "https://example.com",
      countryCode: "US"
    });
  });

  it("adds query parameters without exposing a base URL option", async () => {
    const { calls, fetcher } = createMockFetcher(
      jsonResponse({ type: "residential", items: [] })
    );
    const client = new FloppydataApiClient({
      apiKey: "test-api-key",
      fetcher
    });

    await client.listRotatingProxyLocations({ type: "residential" });

    expect(calls[0]?.input).toBe(
      `${FLOPPYDATA_API_BASE_URL}/v2/proxy/rotating/locations?type=residential`
    );
  });

  it("uses the required public API key env var", () => {
    expect(getApiKeyFromEnv({ [FLOPPYDATA_API_KEY_ENV]: " key " })).toBe("key");
    expect(() => getApiKeyFromEnv({})).toThrow(FLOPPYDATA_API_KEY_ENV);
  });

  it("normalizes structured v2 API errors and redacts secrets", async () => {
    const { fetcher } = createMockFetcher(
      jsonResponse(
        {
          error: {
            message:
              "Bad proxy http://user:proxy-password@geo.g-w.info:10080 with secret-api-key",
            code: "BAD_PROXY",
            details: {
              password: "proxy-password",
              connectionString: "http://user:proxy-password@geo.g-w.info:10080"
            }
          }
        },
        403
      )
    );
    const client = new FloppydataApiClient({
      apiKey: "secret-api-key",
      fetcher
    });

    await expect(client.checkProxy({ connectionString: "http://x:y@z:1" }))
      .rejects.toMatchObject({
        name: "FloppydataApiError",
        status: 403,
        code: "BAD_PROXY"
      });

    try {
      await client.checkProxy({ connectionString: "http://x:y@z:1" });
    } catch (error) {
      expect(error).toBeInstanceOf(FloppydataApiError);
      expect(String(error)).not.toContain("secret-api-key");
      expect(String(error)).not.toContain("proxy-password");
      expect((error as FloppydataApiError).details).toEqual({
        password: "[REDACTED]",
        connectionString:
          "http://user:[REDACTED_PASSWORD]@geo.g-w.info:10080"
      });
      expect(toSafeToolError(error, "secret-api-key").message).toBe(
        "Bad proxy http://user:[REDACTED_PASSWORD]@geo.g-w.info:10080 with [REDACTED_API_KEY] (status 403, code BAD_PROXY)"
      );
    }
  });

  it("does not expose raw non-JSON error bodies", async () => {
    const { fetcher } = createMockFetcher(
      new Response("<html>upstream secret</html>", { status: 502 })
    );
    const client = new FloppydataApiClient({
      apiKey: "test-api-key",
      fetcher
    });

    await expect(client.listStaticProxies()).rejects.toThrow(
      "Floppydata API request failed with status 502"
    );
    await expect(client.listStaticProxies()).rejects.not.toThrow(
      "upstream secret"
    );
  });

  it("redacts secrets from network failures", async () => {
    const client = new FloppydataApiClient({
      apiKey: "secret-api-key",
      fetcher: async () => {
        throw new Error(
          "network failed for secret-api-key and http://user:pass@host:123"
        );
      }
    });

    await expect(client.getAccountBalances({})).rejects.toThrow(
      "network failed for [REDACTED_API_KEY] and http://user:[REDACTED_PASSWORD]@host:123"
    );
  });
});
