# Floppydata MCP

Floppydata MCP lets agents use the Floppydata Client API v2 (Web Data, proxies, and Cloud Browser) directly from an MCP-compatible client.

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

### Cloud Browser

Start a cloud browser that already has a Floppydata proxy attached, then drive it from your own Puppeteer or Playwright code.

#### `create_browser_session`

Creates and starts a browser. The smallest request is `{}`: a burner browser on a residential proxy that runs for 10 minutes.

The most important value in the response is:

```text
connectUrl
```

Pass it to `puppeteer.connect({ browserWSEndpoint: connectUrl })` or `chromium.connectOverCDP(connectUrl)`.

Example input:

```json
{
  "proxy": {
    "type": "residential",
    "location": { "countryCode": "US", "city": "New York" },
    "rotation": { "mode": "sticky" }
  },
  "browser": {
    "viewport": { "width": 1440, "height": 900 },
    "fingerprint": { "os": "windows", "locale": "en-US", "timezone": "auto" }
  },
  "runtime": { "timeoutSeconds": 1800, "keepAlive": true },
  "persist": { "ttlSeconds": 900 },
  "startUrl": "https://example.com"
}
```

- Use `"proxy": { "type": "static", "ip": "123.45.67.89" }` to browse through one of your static IPs from `list_static_proxies`.
- Add `persist.ttlSeconds` to keep `settings.id` reusable after the session ends. Pass `"settings": { "id": "..." }` on a later call to come back with the same cookies and fingerprint.
- `storage.cookies` loads cookies before the session starts.

#### `list_browser_sessions`

List session history. Optional inputs: `status` (`running`, `stopped`, `timedOut`, `failed`), `cursor`, `limit`.

#### `get_browser_session`

Get one session by `sessionId`. Returns a freshly signed `connectUrl` while the session is running.

#### `stop_browser_session`

Stop a session by `sessionId` and save its persistent state. Stop sessions when you are done with them.

#### `create_browser_live_view`

Get a `liveViewUrl` a human can open to watch and control a running session. It is rejected while a Puppeteer or Playwright client is connected.

#### `delete_browser_session`

Delete an ended session from history by `sessionId`. Saved settings are kept.

#### `delete_browser_settings`

Permanently delete saved settings and browser state by `settingsId`.

## Security

The server reads the API key from `FLOPPYDATA_API_KEY` and sends it as `X-Api-Key`.

API keys and passwords are redacted from errors and logs. Proxy passwords and signed browser `connectUrl` tokens are still returned in successful responses because those credentials are the output customers need to use. Tokens in error messages are redacted.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).
