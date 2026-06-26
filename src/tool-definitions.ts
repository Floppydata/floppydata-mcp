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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
