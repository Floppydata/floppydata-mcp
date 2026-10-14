import { z } from "zod";
import type { FloppydataApiClient } from "./api.js";
import type { JsonObject } from "./types.js";

const proxyTypeSchema = z.enum(["residential", "mobile", "datacenter"]);
const protocolSchema = z.enum(["http", "https", "socks5"]);
const rotationSchema = z.union([
  z.literal(-1),
  z.literal(0),
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
  z.literal(60)
]);
const accountBalanceProductSchema = z.enum([
  "web-data",
  "proxy-rotating",
  "proxy-static"
]);
const accountUsageProductSchema = z.enum(["web-data", "proxy-rotating"]);

const fetchWebDataShape = {
  url: z.string().url().describe("Target page URL to fetch through Web Data."),
  countryCode: z
    .string()
    .regex(/^[a-zA-Z]{2}$/)
    .optional()
    .describe("Optional 2-letter exit country code, for example US."),
  city: z.string().min(1).optional().describe("Optional exit city."),
  difficulty: z
    .enum(["low", "medium"])
    .optional()
    .describe("Optional access difficulty pool."),
  cacheMaxAgeDays: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Optional maximum age of cached content in days.")
};

const rotatingConnectionShape = {
  type: proxyTypeSchema.describe("Proxy type."),
  country: z
    .string()
    .regex(/^[a-zA-Z]{2}$/)
    .describe("2-letter country code, for example US."),
  city: z
    .string()
    .min(1)
    .optional()
    .describe("City from list_rotating_proxy_locations. Ignored when state is supplied."),
  state: z
    .string()
    .min(1)
    .optional()
    .describe("State or subdivision from list_rotating_proxy_locations. Wins over city."),
  asn: z.string().regex(/^\d+$/).optional().describe("Optional target ASN."),
  rotation: rotationSchema
    .optional()
    .describe("-1 for each request, 0 for sticky, or interval minutes."),
  session: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe("Optional sticky session id."),
  protocol: protocolSchema.optional().describe("Proxy protocol. Defaults to http.")
};

const rotatingLocationsShape = {
  type: proxyTypeSchema.describe("Proxy type to list locations for.")
};

const checkProxyShape = {
  connectionString: z
    .string()
    .url()
    .optional()
    .describe("Proxy URL to check, for example http://user:pass@host:10080."),
  host: z.string().min(1).optional().describe("Proxy host."),
  port: z.number().int().optional().describe("Proxy port."),
  username: z.string().min(1).optional().describe("Proxy username."),
  password: z.string().min(1).optional().describe("Proxy password."),
  protocol: protocolSchema.optional().describe("Proxy protocol. Defaults to http.")
};

const accountBalancesShape = {
  product: accountBalanceProductSchema
    .optional()
    .describe("Optional product filter.")
};

const accountUsageShape = {
  product: accountUsageProductSchema.optional().describe("Optional product filter."),
  from: z
    .string()
    .min(1)
    .optional()
    .describe("Optional start date or UTC date-time."),
  to: z
    .string()
    .min(1)
    .optional()
    .describe("Optional end date or UTC date-time."),
  poolId: z.number().int().positive().optional().describe("Optional pool id filter."),
  countryCode: z
    .string()
    .regex(/^[a-zA-Z]{2}$/)
    .optional()
    .describe("Optional 2-letter country code filter."),
  proxyType: proxyTypeSchema.optional().describe("Optional rotating proxy type filter.")
};

const browserSessionStatusSchema = z.enum([
  "running",
  "stopped",
  "timedOut",
  "failed"
]);
const countryCodeSchema = z.string().regex(/^[a-zA-Z]{2}$/);
const dimensionsShape = {
  width: z.number().int().min(320).max(7680),
  height: z.number().int().min(240).max(4320)
};
const noiseModeSchema = z.enum(["auto", "noise", "off"]);

const browserFingerprintSchema = z
  .object({
    strategy: z
      .enum(["auto", "custom"])
      .optional()
      .describe("auto picks a consistent fingerprint. userAgent, screen, hardware, and masking require custom."),
    os: z.enum(["linux", "windows", "macos", "android"]).optional(),
    osVersion: z.string().min(1).max(64).optional().describe("Requires os."),
    userAgent: z
      .string()
      .min(1)
      .max(1024)
      .optional()
      .describe("Custom user agent. Requires strategy custom, os, and screen."),
    screen: z
      .object({
        ...dimensionsShape,
        devicePixelRatio: z.number().min(0.5).max(8).optional()
      })
      .strict()
      .optional(),
    locale: z.string().min(2).max(64).optional().describe("BCP-47 locale, for example en-US."),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("auto to match the proxy exit, or an IANA timezone."),
    geolocation: z
      .object({
        mode: z.enum(["auto", "custom", "disabled"]),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        accuracy: z.number().positive().max(100_000).optional()
      })
      .strict()
      .optional()
      .describe("Coordinates are valid only with mode custom."),
    hardware: z
      .object({
        cpuCores: z.number().int().min(1).max(128).optional(),
        memoryGb: z.number().int().min(1).max(256).optional(),
        maxTouchPoints: z.number().int().min(0).max(20).optional()
      })
      .strict()
      .optional(),
    masking: z
      .object({
        canvas: noiseModeSchema.optional(),
        webgl: z
          .object({
            mode: z.enum(["auto", "noise", "mask", "off"]).optional(),
            vendor: z.string().min(1).max(256).optional(),
            renderer: z.string().min(1).max(512).optional()
          })
          .strict()
          .optional()
          .describe("vendor and renderer go together and require mode mask."),
        audioContext: noiseModeSchema.optional(),
        clientRects: noiseModeSchema.optional(),
        webrtc: z.enum(["auto", "proxy", "disabled"]).optional(),
        mediaDevices: z
          .object({
            mode: z.enum(["auto", "mask", "disabled"]).optional(),
            videoInputs: z.number().int().min(0).max(20).optional(),
            audioInputs: z.number().int().min(0).max(20).optional(),
            audioOutputs: z.number().int().min(0).max(20).optional()
          })
          .strict()
          .optional(),
        fonts: z
          .object({
            mode: z.enum(["auto", "custom"]).optional(),
            families: z.array(z.string().min(1).max(128)).max(256).optional()
          })
          .strict()
          .optional()
      })
      .strict()
      .optional()
  })
  .strict();

const browserCookieSchema = z
  .object({
    name: z.string().min(1).max(256),
    value: z.string().max(16_384),
    url: z.string().url().max(2048).optional(),
    domain: z.string().min(1).max(253).optional(),
    path: z.string().min(1).max(2048).optional().describe("Valid only with domain."),
    expires: z.number().int().nonnegative().optional().describe("Unix seconds."),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(["strict", "lax", "none"]).optional()
  })
  .strict()
  .describe("Provide exactly one of url or domain.");

const browserRotatingProxySchema = z
  .object({
    type: proxyTypeSchema.optional().describe("Defaults to residential."),
    location: z
      .object({
        countryCode: countryCodeSchema.optional(),
        state: z.string().min(1).max(128).optional(),
        city: z.string().min(1).max(128).optional()
      })
      .strict()
      .optional()
      .describe("city or state (not both) requires countryCode. Use list_rotating_proxy_locations."),
    asn: z.string().regex(/^\d+$/).max(32).optional(),
    rotation: z
      .object({
        mode: z.enum(["sticky", "perRequest", "interval"]).optional(),
        intervalMinutes: z
          .union([
            z.literal(5),
            z.literal(10),
            z.literal(15),
            z.literal(20),
            z.literal(60)
          ])
          .optional()
          .describe("Required for interval mode."),
        stickyKey: z.string().min(1).max(128).optional().describe("Sticky mode only.")
      })
      .strict()
      .optional()
      .describe("Defaults to sticky.")
  })
  .strict();

const browserStaticProxySchema = z
  .object({
    type: z.literal("static"),
    ip: z.ipv4().describe("A static IP from list_static_proxies.")
  })
  .strict();

const browserSessionCreateShape = {
  settings: z
    .object({ id: z.string().uuid() })
    .strict()
    .optional()
    .describe("Reuse persistent settings from an earlier session. Cannot be combined with browser, proxy, persist, or startUrl."),
  browser: z
    .object({
      viewport: z.object(dimensionsShape).strict().optional(),
      fingerprint: browserFingerprintSchema.optional()
    })
    .strict()
    .optional()
    .describe("Viewport and fingerprint for newly created settings."),
  storage: z
    .object({
      cookies: z
        .object({
          mode: z.enum(["merge", "replace"]).optional().describe("Defaults to merge."),
          items: z.array(browserCookieSchema).max(100)
        })
        .strict()
        .optional()
    })
    .strict()
    .optional()
    .describe("Cookies to load before the session starts."),
  proxy: z
    .union([browserStaticProxySchema, browserRotatingProxySchema])
    .optional()
    .describe("Rotating proxy (residential by default), or type static with one of the account's static IPs."),
  persist: z
    .object({
      ttlSeconds: z.number().int().min(60).max(86_400)
    })
    .strict()
    .optional()
    .describe("Keep settings.id reusable for this long after the session ends. Omit for burner state."),
  runtime: z
    .object({
      timeoutSeconds: z
        .number()
        .int()
        .min(60)
        .max(21_600)
        .optional()
        .describe("Hard session lifetime. Defaults to 600."),
      keepAlive: z
        .boolean()
        .optional()
        .describe("Keep the browser running after the CDP client disconnects. Defaults to false.")
    })
    .strict()
    .optional(),
  startUrl: z
    .string()
    .url()
    .max(2048)
    .optional()
    .describe("http(s) URL the browser opens on launch."),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Free-form JSON stored with the session, up to 4 KiB.")
};

const browserSessionListShape = {
  status: browserSessionStatusSchema.optional().describe("Optional status filter."),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe("nextCursor from a previous list_browser_sessions response."),
  limit: z.number().int().min(1).max(100).optional().describe("Page size. Defaults to 20.")
};

const browserSessionIdShape = {
  sessionId: z.string().uuid().describe("Browser session id.")
};

const browserSettingsIdShape = {
  settingsId: z.string().uuid().describe("Saved browser settings id (session settings.id).")
};

export const fetchWebDataInputSchema = z.object(fetchWebDataShape).strict();
export const rotatingConnectionInputSchema = z
  .object(rotatingConnectionShape)
  .strict();
export const rotatingLocationsInputSchema = z
  .object(rotatingLocationsShape)
  .strict();
export const checkProxyInputSchema = z
  .object(checkProxyShape)
  .strict()
  .superRefine((input, context) => {
    if (input.connectionString) {
      return;
    }

    const hasStructuredProxy =
      input.host && input.port !== undefined && input.username && input.password;

    if (!hasStructuredProxy) {
      context.addIssue({
        code: "custom",
        message:
          "Provide connectionString, or provide host, port, username, and password."
      });
    }
  });
export const accountBalancesInputSchema = z.object(accountBalancesShape).strict();
export const accountUsageInputSchema = z.object(accountUsageShape).strict();
export const browserSessionCreateInputSchema = z
  .object(browserSessionCreateShape)
  .strict();
export const browserSessionListInputSchema = z
  .object(browserSessionListShape)
  .strict();
export const browserSessionIdInputSchema = z
  .object(browserSessionIdShape)
  .strict();
export const browserSettingsIdInputSchema = z
  .object(browserSettingsIdShape)
  .strict();

export interface ToolDefinition<Input> {
  readonly name: string;
  readonly description: string;
  readonly inputShape: z.ZodRawShape;
  readonly inputSchema: z.ZodType<Input>;
  readonly execute: (
    client: FloppydataApiClient,
    input: Input
  ) => Promise<JsonObject>;
  readonly summarize: (output: JsonObject) => string;
}

export interface RuntimeToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputShape: z.ZodRawShape;
  readonly inputSchema: z.ZodType<unknown>;
  readonly execute: (
    client: FloppydataApiClient,
    input: unknown
  ) => Promise<JsonObject>;
  readonly summarize: (output: JsonObject) => string;
}

function defineTool<Input>(
  definition: ToolDefinition<Input>
): RuntimeToolDefinition {
  return {
    ...definition,
    inputSchema: definition.inputSchema as z.ZodType<unknown>,
    execute: (client, input) => definition.execute(client, input as Input)
  };
}

export const toolDefinitions = [
  defineTool({
    name: "fetch_web_data",
    description:
      "Fetch a public web page through Floppydata Web Data. Use this when the agent needs the HTML of a URL.",
    inputShape: fetchWebDataShape,
    inputSchema: fetchWebDataInputSchema,
    execute: (client, input) => client.fetchWebData(input),
    summarize: (output) => summarizeFetchWebData(output)
  }),
  defineTool({
    name: "create_rotating_proxy_connection",
    description:
      "Build one copy-paste rotating proxy connection string for a country, state, city, ASN, session, and rotation.",
    inputShape: rotatingConnectionShape,
    inputSchema: rotatingConnectionInputSchema,
    execute: (client, input) => client.createRotatingProxyConnection(input),
    summarize: (output) => summarizeConnection(output)
  }),
  defineTool({
    name: "list_rotating_proxy_locations",
    description:
      "List countries, cities, and states available for rotating proxy connection generation.",
    inputShape: rotatingLocationsShape,
    inputSchema: rotatingLocationsInputSchema,
    execute: (client, input) => client.listRotatingProxyLocations(input),
    summarize: (output) => summarizeLocations(output)
  }),
  defineTool({
    name: "check_proxy",
    description:
      "Check a proxy connection and return the exit IP and location seen through that proxy.",
    inputShape: checkProxyShape,
    inputSchema: checkProxyInputSchema,
    execute: (client, input) => client.checkProxy(input),
    summarize: (output) => summarizeProxyCheck(output)
  }),
  defineTool({
    name: "list_static_proxies",
    description:
      "List static proxies owned by the account, including each proxy connectionString.",
    inputShape: {},
    inputSchema: z.object({}).strict(),
    execute: (client) => client.listStaticProxies(),
    summarize: (output) => summarizeStaticProxies(output)
  }),
  defineTool({
    name: "get_account_balances",
    description:
      "Get account balances for Web Data, rotating proxy traffic, and static proxies.",
    inputShape: accountBalancesShape,
    inputSchema: accountBalancesInputSchema,
    execute: (client, input) => client.getAccountBalances(input),
    summarize: () => "Fetched account balances."
  }),
  defineTool({
    name: "get_account_usage",
    description:
      "Get account usage rollups. Responses include yesterday, last7Days, last30Days, optional requestedRange, and lastUpdatedAt.",
    inputShape: accountUsageShape,
    inputSchema: accountUsageInputSchema,
    execute: (client, input) => client.getAccountUsage(input),
    summarize: () => "Fetched account usage."
  }),
  defineTool({
    name: "create_browser_session",
    description:
      "Start a Cloud Browser with a Floppydata proxy attached. Drive it with Puppeteer connect({ browserWSEndpoint }) or Playwright chromium.connectOverCDP() using the returned connectUrl. The smallest request is {}. Stop the session when done to stop billing.",
    inputShape: browserSessionCreateShape,
    inputSchema: browserSessionCreateInputSchema,
    execute: (client, input) => client.createBrowserSession(input),
    summarize: (output) => summarizeBrowserSession(output)
  }),
  defineTool({
    name: "list_browser_sessions",
    description:
      "List Cloud Browser session history, newest first, with cursor pagination.",
    inputShape: browserSessionListShape,
    inputSchema: browserSessionListInputSchema,
    execute: (client, input) => client.listBrowserSessions(input),
    summarize: (output) => summarizeBrowserSessions(output)
  }),
  defineTool({
    name: "get_browser_session",
    description:
      "Get a Cloud Browser session's state. Returns a freshly signed connectUrl while the session is running.",
    inputShape: browserSessionIdShape,
    inputSchema: browserSessionIdInputSchema,
    execute: (client, input) => client.getBrowserSession(input),
    summarize: (output) => summarizeBrowserSession(output)
  }),
  defineTool({
    name: "stop_browser_session",
    description:
      "Stop a Cloud Browser session and save its persistent browser state. Safe to call more than once.",
    inputShape: browserSessionIdShape,
    inputSchema: browserSessionIdInputSchema,
    execute: (client, input) => client.stopBrowserSession(input),
    summarize: (output) => summarizeBrowserSession(output)
  }),
  defineTool({
    name: "create_browser_live_view",
    description:
      "Get a URL a human can open to watch and control a running Cloud Browser session. Rejected while a CDP client is connected.",
    inputShape: browserSessionIdShape,
    inputSchema: browserSessionIdInputSchema,
    execute: (client, input) => client.createBrowserLiveView(input),
    summarize: (output) => {
      const liveViewUrl = readString(output.liveViewUrl);
      return liveViewUrl
        ? `Live view: ${liveViewUrl}`
        : "Created browser live view.";
    }
  }),
  defineTool({
    name: "delete_browser_session",
    description:
      "Delete an ended Cloud Browser session from history. Persistent browser settings are kept; use delete_browser_settings for those.",
    inputShape: browserSessionIdShape,
    inputSchema: browserSessionIdInputSchema,
    execute: async (client, input) => {
      await client.deleteBrowserSession(input);
      return { deleted: true, sessionId: input.sessionId };
    },
    summarize: (output) => `Deleted browser session ${String(output.sessionId)}.`
  }),
  defineTool({
    name: "delete_browser_settings",
    description:
      "Permanently delete saved Cloud Browser settings and browser state (cookies, storage). Fails while a session using them is running.",
    inputShape: browserSettingsIdShape,
    inputSchema: browserSettingsIdInputSchema,
    execute: async (client, input) => {
      await client.deleteBrowserSettings(input);
      return { deleted: true, settingsId: input.settingsId };
    },
    summarize: (output) => `Deleted browser settings ${String(output.settingsId)}.`
  })
];

export type ToolName = (typeof toolDefinitions)[number]["name"];

export async function runFloppydataTool(
  client: FloppydataApiClient,
  name: ToolName,
  input: unknown
): Promise<JsonObject> {
  const definition = toolDefinitions.find((tool) => tool.name === name);

  if (!definition) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const parsedInput = definition.inputSchema.parse(input);
  return definition.execute(client, parsedInput);
}

export function getToolSummary(name: ToolName, output: JsonObject): string {
  const definition = toolDefinitions.find((tool) => tool.name === name);
  return definition?.summarize(output) ?? "Floppydata tool completed.";
}

function summarizeFetchWebData(output: JsonObject): string {
  if (isRecord(output)) {
    const sourceUrl = readString(output.sourceUrl);
    const html = readString(output.html);
    const fetchedAt = readString(output.fetchedAt);

    if (sourceUrl && html && fetchedAt) {
      return `Fetched ${sourceUrl} at ${fetchedAt}. HTML length: ${html.length} characters.`;
    }
  }

  return "Fetched Web Data.";
}

function summarizeConnection(output: JsonObject): string {
  const connection = isRecord(output) && isRecord(output.connection)
    ? output.connection
    : undefined;
  const connectionString = connection
    ? readString(connection.connectionString)
    : undefined;

  return connectionString
    ? `Created rotating proxy connection: ${connectionString}`
    : "Created rotating proxy connection.";
}

function summarizeLocations(output: JsonObject): string {
  if (isRecord(output) && Array.isArray(output.items)) {
    return `Found ${output.items.length} rotating proxy countries for ${readString(output.type) ?? "the requested type"}.`;
  }

  return "Fetched rotating proxy locations.";
}

function summarizeProxyCheck(output: JsonObject): string {
  if (isRecord(output)) {
    const ip = readString(output.ip);
    const location = isRecord(output.location) ? output.location : undefined;
    const city = location ? readString(location.city) : undefined;
    const countryCode = location ? readString(location.countryCode) : undefined;

    if (ip && countryCode) {
      return `Proxy exit IP is ${ip}${city ? ` in ${city}` : ""}, ${countryCode}.`;
    }
  }

  return "Checked proxy.";
}

function summarizeStaticProxies(output: JsonObject): string {
  if (isRecord(output) && Array.isArray(output.items)) {
    const pendingCount =
      typeof output.pendingCount === "number" ? output.pendingCount : 0;

    return `Found ${output.items.length} static proxies and ${pendingCount} pending proxies.`;
  }

  return "Fetched static proxies.";
}

function summarizeBrowserSession(output: JsonObject): string {
  const id = readString(output.id);
  const status = readString(output.status);

  if (!id || !status) {
    return "Fetched browser session.";
  }

  return readString(output.connectUrl)
    ? `Browser session ${id} is ${status}. Connect with Puppeteer or Playwright over connectUrl.`
    : `Browser session ${id} is ${status}.`;
}

function summarizeBrowserSessions(output: JsonObject): string {
  if (Array.isArray(output.items)) {
    const more = readString(output.nextCursor) ? " More are available via nextCursor." : "";
    return `Found ${output.items.length} browser sessions.${more}`;
  }

  return "Fetched browser sessions.";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
