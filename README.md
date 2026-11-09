# evolution-whatsapp-mcp

**An [MCP](https://modelcontextprotocol.io) server that lets Claude (and any MCP client) use WhatsApp.**
It sends and reads messages, sends media, and manages connections through the
[Evolution API](https://doc.evolution-api.com/). Add it to Claude Desktop/Code and your agent can
connect a WhatsApp number and talk to people.

[![CI](https://github.com/Ewertonslv/evolution-whatsapp-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ewertonslv/evolution-whatsapp-mcp/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> The client code comes from the WhatsApp integration of a multi-tenant clinic SaaS. All nine tools
> were last checked against a real Evolution API 2.3.7 server in October 2026.

## Architecture & where it runs

```
Claude (Desktop/Code)        evolution-whatsapp-mcp          Evolution API        WhatsApp
     [MCP client]   ──stdio──►   (this package)    ──HTTP──►   (gateway)  ──────►  (phone)
```

- **This MCP server runs locally, on demand. You don't host it.** Your MCP client (Claude Desktop/Code)
  spawns it as a child process over stdio (`npx evolution-whatsapp-mcp`); it starts when the client
  needs it and exits when the client closes. No open ports, no deployment.
- **The Evolution API is the part that must stay running**, because it holds the WhatsApp session
  (like WhatsApp Web: if it goes down, the number disconnects). Run it **locally via Docker** to try
  things out, or on a **small VPS** if you need it online 24/7 (e.g. to receive messages via webhook).
  This server only needs its URL + API key.
- The server is **stateless**. It has no database and stores no messages. It only forwards calls from
  your MCP client to the Evolution API.

## Tools

| Tool | Description |
|---|---|
| `send_text` | Send a text message to a phone number |
| `send_media` | Send an image / video / document / audio (URL or base64) |
| `find_chats` | List the conversations on the instance (`limit`, default 50, max 200) |
| `find_messages` | Read a chat's message history (by phone or JID), with `limit` (default 50, max 200) and `page` |
| `create_instance` | Create a new instance (a WhatsApp connection slot) |
| `get_qrcode` | Get the QR code (base64) to link a WhatsApp number |
| `connection_status` | Check whether the instance is connected |
| `disconnect_instance` | Log the WhatsApp number out of the instance |
| `configure_webhook` | Point the instance webhook to a public URL |

Every tool takes an optional `instance` argument; if omitted it falls back to `EVOLUTION_DEFAULT_INSTANCE`.

Tools carry MCP annotations: the read tools are marked read-only, and `disconnect_instance` and
`configure_webhook` are marked destructive so clients can ask for confirmation first.

`find_messages` accepts a Brazilian number with or without the ninth digit. WhatsApp stores some chats
under the short form, so the tool tries the other form when the first one has no messages.

## Prerequisites

A running [Evolution API](https://doc.evolution-api.com/) server (v2.x) and its API key. The quickest way
to run one locally is the example [`docker-compose.yml`](docker-compose.yml) (Evolution API v2 with the
Postgres and Redis it needs). Use **local Docker to try it out**, or a **VPS for 24/7** operation:

```bash
EVOLUTION_API_KEY=my-secret-key docker compose up -d
```

It listens on `http://localhost:8080`. Use the same value for `EVOLUTION_API_KEY` when you plug in the
MCP server (see above). The compose file is a starting point, not a production setup.

## Install & configure

One line for **Claude Code**:

```bash
claude mcp add evolution-whatsapp \
  -e EVOLUTION_API_URL=http://localhost:8080 \
  -e EVOLUTION_API_KEY=your-evolution-api-key \
  -- npx -y evolution-whatsapp-mcp
```

For other clients, add it to the MCP client config. For **Claude Desktop** / **Claude Code** (`mcpServers` config):

```jsonc
{
  "mcpServers": {
    "whatsapp": {
      "command": "npx",
      "args": ["-y", "evolution-whatsapp-mcp"],
      "env": {
        "EVOLUTION_API_URL": "http://localhost:8080",
        "EVOLUTION_API_KEY": "your-evolution-api-key",
        "EVOLUTION_DEFAULT_INSTANCE": "my-whatsapp"
      }
    }
  }
}
```

| Env var | Required | Description |
|---|---|---|
| `EVOLUTION_API_URL` | yes | Base URL of your Evolution API server |
| `EVOLUTION_API_KEY` | yes | Evolution API key (sent as the `apikey` header) |
| `EVOLUTION_DEFAULT_INSTANCE` | no | Default instance when a tool omits `instance` |
| `EVOLUTION_TIMEOUT_MS` | no | Per-request timeout in milliseconds (default `30000`) |
| `EVOLUTION_READ_ONLY` | no | `true`, `1` or `yes` (any case) hides `send_text`, `send_media`, `create_instance`, `disconnect_instance` and `configure_webhook`. Anything else leaves them on |
| `EVOLUTION_CONFIRM_WRITES` | no | `true`, `1` or `yes` (any case) makes `send_text`, `send_media`, `create_instance`, `disconnect_instance` and `configure_webhook` wait for a human to confirm. A client that can show no confirmation is refused and nothing is sent. `false`, `0`, `no` or empty is off (default). Any other value (a typo such as `ture` or `on`) counts as on and prints a warning on stderr |
| `EVOLUTION_ALLOWED_NUMBERS` | no | Comma-separated numbers `send_text` and `send_media` may reach (e.g. `5511999999999,5521988887777`). Empty means no restriction. Brazilian numbers match with or without the ninth digit; group JIDs are refused when the list is set |

Because an LLM drives these tools, a prompt injected through a received message could ask it to send
something. `EVOLUTION_READ_ONLY` and `EVOLUTION_ALLOWED_NUMBERS` limit what it can do.

Built-in limits: `find_chats` and `find_messages` take `limit` (1-200, default 50); any response over
100,000 characters is truncated with a notice; `get_qrcode` drops an oversized base64 image and keeps
the pairing code. `configure_webhook` only accepts `https` URLs (plain `http` is allowed for `localhost`,
`127.0.0.1` and `[::1]`). The server prints a warning on stderr if `EVOLUTION_API_URL` is neither
`https` nor localhost, since the API key would travel unencrypted.

## Example flow (end to end)

Ask Claude:

1. *"Create a WhatsApp instance called `my-whatsapp` and show me the QR code."* → `create_instance` + `get_qrcode` (scan it with your phone).
2. *"Is it connected?"* → `connection_status`.
3. *"Send 'Your appointment is confirmed' to +55 11 99999-9999."* → `send_text`.
4. *"What did they reply?"* → `find_messages`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `HTTP 401` / `Unauthorized` | `EVOLUTION_API_KEY` does not match the server's `AUTHENTICATION_API_KEY`. |
| Timeout / `fetch failed` | The URL is wrong or the Evolution API is down. Open `EVOLUTION_API_URL` in a browser; raise `EVOLUTION_TIMEOUT_MS` for slow servers. |
| Sends fail, instance not `open` | The instance is not connected. Run `connection_status`, then `get_qrcode` and scan it from the phone (WhatsApp > Linked devices). |
| `find_messages` returns nothing for a Brazilian number | WhatsApp may store the chat with or without the ninth digit. The tool tries both; check the number has the country code (`55`). |
| `number must be a phone with 8 to 15 digits` | Pass the full number with country code, or a JID containing `@`. |
| Webhook URL refused | `configure_webhook` requires `https` (http only for `localhost`, `127.0.0.1`, `[::1]`). Look-alike hosts such as `localhost.evil.com` are refused. |
| `send_text` is missing from the tool list | `EVOLUTION_READ_ONLY` is on. Unset it or set it to `false`. |
| `Recipient is not in EVOLUTION_ALLOWED_NUMBERS` | The number is not on the allowlist. Add it, or leave the variable empty. |
| Response ends with `truncated: use limit/page` | The payload was over 100,000 characters. Lower `limit` or read page by page. |

## Directory listings

Metadata for the [official MCP registry](https://github.com/modelcontextprotocol/registry) is in
[`server.json`](server.json) and for [Smithery](https://smithery.ai) in [`smithery.yaml`](smithery.yaml).
[Glama](https://glama.ai/mcp/servers) indexes public GitHub MCP servers from this README and
`package.json`, so keep both accurate.

## Development

```bash
npm install
npm run build      # tsc → dist/
npm test           # vitest (mocks the Evolution API; no server needed)
npm run lint       # tsc --noEmit
```

Inspect the server locally with the MCP Inspector:

```bash
EVOLUTION_API_URL=http://localhost:8080 EVOLUTION_API_KEY=key \
  npx @modelcontextprotocol/inspector node dist/index.js
```

## How it works

A thin REST client (`src/evolution.ts`) wraps the Evolution endpoints and authenticates with the `apikey`
header. `src/tools.ts` registers each operation as an MCP tool with a [zod](https://zod.dev) input schema;
`src/index.ts` serves them over stdio.

## License

MIT © Ewerton Silva
