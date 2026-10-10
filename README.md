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
| `find_chats` | List the conversations on the instance |
| `find_messages` | Read a chat's message history (by phone or JID), with `limit` and `page` |
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
to run one locally is the official Docker image. Use **local Docker to try it out**, or a **VPS for 24/7**
operation:

```bash
docker run -d --name evolution -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=your-evolution-api-key \
  evoapicloud/evolution-api:latest
```

## Install & configure

Add it to your MCP client. For **Claude Desktop** / **Claude Code** (`mcpServers` config):

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

## Example flow (end to end)

Ask Claude:

1. *"Create a WhatsApp instance called `my-whatsapp` and show me the QR code."* → `create_instance` + `get_qrcode` (scan it with your phone).
2. *"Is it connected?"* → `connection_status`.
3. *"Send 'Your appointment is confirmed' to +55 11 99999-9999."* → `send_text`.
4. *"What did they reply?"* → `find_messages`.

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
