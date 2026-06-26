import {
  DEFAULT_TIMEOUT_MS,
  FLOPPYDATA_API_BASE_URL,
  FLOPPYDATA_API_KEY_ENV
} from "./constants.js";
import type { FetchLike, JsonObject } from "./types.js";

type QueryValue = string | number | boolean | null | undefined;

export class FloppydataApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      details?: unknown;
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "FloppydataApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export interface FloppydataApiClientOptions {
  apiKey: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export class FloppydataApiClient {
  private readonly apiKey: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: FloppydataApiClientOptions) {
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async fetchWebData(input: unknown): Promise<JsonObject> {
    return this.request("POST", "/v2/web-data/fetch", { body: input });
  }

  async createRotatingProxyConnection(input: unknown): Promise<JsonObject> {
    return this.request("POST", "/v2/proxy/rotating/connections", { body: input });
  }

  async listRotatingProxyLocations(input: {
    type: string;
  }): Promise<JsonObject> {
    return this.request("GET", "/v2/proxy/rotating/locations", {
      query: { type: input.type }
    });
  }

  async checkProxy(input: unknown): Promise<JsonObject> {
    return this.request("POST", "/v2/proxy/check", { body: input });
  }

  async listStaticProxies(): Promise<JsonObject> {
    return this.request("GET", "/v2/proxy/static");
  }

  async getAccountBalances(input: {
    product?: string;
  }): Promise<JsonObject> {
    return this.request("GET", "/v2/account/balances", {
      query: { product: input.product }
    });
  }

  async getAccountUsage(input: {
    product?: string;
    from?: string;
    to?: string;
    poolId?: number;
    countryCode?: string;
    proxyType?: string;
  }): Promise<JsonObject> {
    return this.request("GET", "/v2/account/usage", {
      query: {
        product: input.product,
        from: input.from,
        to: input.to,
        poolId: input.poolId,
        countryCode: input.countryCode,
        proxyType: input.proxyType
      }
    });
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions = {}
  ): Promise<JsonObject> {
    const url = new URL(path, FLOPPYDATA_API_BASE_URL);
    appendQuery(url, options.query);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        method,
        headers: buildHeaders(this.apiKey, options.body !== undefined),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
    } catch (error) {
      throw this.toNetworkError(error);
    } finally {
      clearTimeout(timeout);
    }

    const payload = await parseJsonPayload(response);

    if (!response.ok) {
      throw this.toApiError(response.status, payload);
    }

    return payload ?? {};
  }

  private toNetworkError(error: unknown): FloppydataApiError {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Floppydata API request timed out"
        : `Floppydata API request failed: ${errorMessage(error)}`;

    return new FloppydataApiError(redactSecrets(message, this.apiKey), {
      cause: error
    });
  }

  private toApiError(status: number, payload: unknown): FloppydataApiError {
    const errorPayload = readErrorPayload(payload);
    const message =
      errorPayload.message ?? `Floppydata API request failed with status ${status}`;

    return new FloppydataApiError(redactSecrets(message, this.apiKey), {
      status,
      code: errorPayload.code,
      details:
        errorPayload.details === undefined
          ? undefined
          : redactUnknown(errorPayload.details, this.apiKey)
    });
  }
}

export function getApiKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const apiKey = env[FLOPPYDATA_API_KEY_ENV]?.trim();

  if (!apiKey) {
    throw new Error(
      `${FLOPPYDATA_API_KEY_ENV} is required. Create an API key at https://app.floppydata.com/api-keys and pass it as an environment variable.`
    );
  }

  return apiKey;
}

export function redactSecrets(value: unknown, apiKey?: string): string {
  if (typeof value === "string") {
    return redactString(value, apiKey);
  }

  return redactString(JSON.stringify(redactUnknown(value, apiKey)), apiKey);
}

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
}

function buildHeaders(apiKey: string, hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Api-Key": apiKey
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function parseJsonPayload(response: Response): Promise<JsonObject | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return isRecord(payload) ? (payload as JsonObject) : null;
  } catch {
    return null;
  }
}

function readErrorPayload(payload: unknown): {
  message?: string;
  code?: string;
  details?: unknown;
} {
  if (!isRecord(payload)) {
    return {};
  }

  const nestedError = isRecord(payload.error) ? payload.error : undefined;
  const source = nestedError ?? payload;

  return {
    message: readString(source.message),
    code: readString(source.code),
    details: source.details
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactUnknown(value: unknown, apiKey?: string): unknown {
  if (typeof value === "string") {
    return redactString(value, apiKey);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, apiKey));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (isSecretField(key)) {
        return [key, "[REDACTED]"];
      }

      return [key, redactUnknown(entry, apiKey)];
    })
  );
}

function redactString(value: string, apiKey?: string): string {
  let output = value;

  if (apiKey) {
    output = output.split(apiKey).join("[REDACTED_API_KEY]");
  }

  return output.replace(
    /([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi,
    "$1[REDACTED_PASSWORD]$3"
  );
}

function isSecretField(key: string): boolean {
  return /^(api[-_]?key|authorization|password|pass|token|secret)$/i.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
