import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import {
  FloppydataApiClient,
  FloppydataApiError,
  getApiKeyFromEnv,
  redactSecrets
} from "./api.js";
import { toolDefinitions } from "./tool-definitions.js";
import type { FetchLike, JsonObject } from "./types.js";

export interface CreateFloppydataMcpServerOptions {
  apiKey?: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
}

export function createFloppydataMcpServer(
  options: CreateFloppydataMcpServerOptions = {}
): McpServer {
  const apiKey = options.apiKey ?? getApiKeyFromEnv();
  const client = new FloppydataApiClient({
    apiKey,
    fetcher: options.fetcher,
    timeoutMs: options.timeoutMs
  });
  const server = new McpServer({
    name: "floppydata",
    version: "0.1.0"
  });

  for (const definition of toolDefinitions) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputShape
      },
      async (rawInput) => {
        try {
          const input = definition.inputSchema.parse(rawInput);
          const output = await definition.execute(client, input);
          const summary = definition.summarize(output);

          return formatToolResult(summary, output);
        } catch (error) {
          throw toSafeToolError(error, apiKey);
        }
      }
    );
  }

  return server;
}

export function formatToolResult(
  summary: string,
  output: JsonObject
): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: `${summary}\n\n${JSON.stringify(output, null, 2)}`
      }
    ],
    structuredContent: output
  };
}

export function toSafeToolError(error: unknown, apiKey?: string): Error {
  if (error instanceof ZodError) {
    return new Error(
      `Invalid tool input: ${error.issues.map((issue) => issue.message).join("; ")}`
    );
  }

  if (error instanceof FloppydataApiError) {
    const context = [
      error.status ? `status ${error.status}` : undefined,
      error.code ? `code ${error.code}` : undefined
    ]
      .filter(Boolean)
      .join(", ");

    const suffix = context ? ` (${context})` : "";
    return new Error(`${error.message}${suffix}`);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new Error(redactSecrets(message, apiKey));
}
