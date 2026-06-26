# Floppydata MCP

Floppydata MCP lets agents use the Floppydata Client API v2 directly from an MCP-compatible client.

It is intentionally small: install it with `npx`, provide `FLOPPYDATA_API_KEY`, and the server talks to `https://api.floppydata.net`.

## Setup

Create a Client API key in the Floppydata dashboard:

https://app.floppydata.com/api-keys

Add this server to your MCP client:

```json
{
  "mcpServers": {
    "floppydata": {
      "command": "npx",
      "args": ["-y", "@floppydata/mcp"],
      "env": {
        "FLOPPYDATA_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

That is the whole setup. There is no hosted service, no extra CLI, and no base URL configuration.

## Tools

### `fetch_web_data`

Fetch a public page through Web Data.

Useful when an agent needs page HTML and the target site should be fetched through Floppydata infrastructure.

Required input:

```json
{
  "url": "https://example.com"
}
```

Optional inputs: `countryCode`, `city`, `difficulty`, `cacheMaxAgeDays`.

### `create_rotating_proxy_connection`

Build one rotating proxy connection.

The most important value in the response is:

```text
connection.connectionString
```

Example input:

```json
{
  "type": "residential",
  "country": "US",
  "city": "New York",
  "rotation": 15,
  "protocol": "http"
}
```

### `list_rotating_proxy_locations`

List available rotating proxy countries, cities, and states for a proxy type.

Example input:

```json
{
  "type": "residential"
}
```

### `check_proxy`

Check the exit IP and location for a proxy.

Example input:

```json
{
  "connectionString": "http://USERNAME:PASSWORD@geo.g-w.info:10080"
}
```

The response shape is:

```json
{
  "ip": "123.45.67.89",
  "location": {
    "countryCode": "US",
    "country": "United States",
    "state": "California",
    "city": "San Francisco"
  }
}
```

### `list_static_proxies`

List static proxies on the account.

Use `items[n].connection.connectionString` as the copy-paste proxy URL.

### `get_account_balances`

Check account balances across Web Data, rotating proxy traffic, and static proxies.

Optional input:

```json
{
  "product": "proxy-rotating"
}
```

Allowed products: `web-data`, `proxy-rotating`, `proxy-static`.

### `get_account_usage`

Check account usage rollups.

Responses include:

- `yesterday`
- `last7Days`
- `last30Days`
- optional `requestedRange` when `from` or `to` is provided
- `lastUpdatedAt`

Example input:

```json
{
  "product": "proxy-rotating",
  "from": "2026-06-01T00:00:00Z",
  "to": "2026-06-26T23:59:59Z",
  "countryCode": "US",
  "proxyType": "residential"
}
```

## Security

The server reads the API key from `FLOPPYDATA_API_KEY` and sends it as `X-Api-Key`.

API keys and passwords are redacted from errors and logs. Proxy passwords are still returned in successful proxy connection responses because those credentials are the output customers need to use.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
npm pack --dry-run
```
