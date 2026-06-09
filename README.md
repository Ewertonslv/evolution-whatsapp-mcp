# evolution-whatsapp-mcp

**An [MCP](https://modelcontextprotocol.io) server that gives Claude (and any MCP client) hands on WhatsApp** —
send and read messages, send media, and manage connections through the
[Evolution API](https://doc.evolution-api.com/). Wire it into Claude Desktop/Code and your AI agent can
connect a WhatsApp number and have real conversations.

[![CI](https://github.com/Ewertonslv/evolution-whatsapp-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ewertonslv/evolution-whatsapp-mcp/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Extracted and generalized from a production WhatsApp integration (a multi-tenant clinic SaaS), so the
> messaging/instance layer is battle-tested — not a toy.

## Tools

| Tool | Description |
|---|---|
| `send_text` | Send a text message to a phone number |
| `send_media` | Send an image / video / document / audio (URL or base64) |
| `find_chats` | List the conversations on the instance |
| `find_messages` | Read a chat's message history (by phone or JID) |
| `create_instance` | Create a new instance (a WhatsApp connection slot) |
| `get_qrcode` | Get the QR code (base64) to link a WhatsApp number |
| `connection_status` | Check whether the instance is connected |
| `disconnect_instance` | Log the WhatsApp number out of the instance |
| `configure_webhook` | Point the instance webhook to a public URL |

Every tool takes an optional `instance` argument; if omitted it falls back to `EVOLUTION_DEFAULT_INSTANCE`.

## Prerequisites

A running [Evolution API](https://doc.evolution-api.com/) server (v2.x) and its API key. The quickest way
to run one locally is the official Docker image:

```bash
docker run -d --name evolution -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=your-evolution-api-key \
  atendai/evolution-api:latest
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
| `EVOLUTION_API_URL` | ✅ | Base URL of your Evolution API server |
| `EVOLUTION_API_KEY` | ✅ | Evolution API key (sent as the `apikey` header) |
| `EVOLUTION_DEFAULT_INSTANCE` | — | Default instance when a tool omits `instance` |

## Example flow (end to end)

Ask Claude:

1. *"Create a WhatsApp instance called `my-whatsapp` and show me the QR code."* → `create_instance` + `get_qrcode` (scan it with your phone).
2. *"Is it connected?"* → `connection_status`.
3. *"Send 'Your appointment is confirmed ✅' to +55 11 99999-9999."* → `send_text`.
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
`src/index.ts` serves them over stdio. No business logic, no database — just a clean bridge between an MCP
client and the Evolution API.

## License

MIT © Ewerton Silva
