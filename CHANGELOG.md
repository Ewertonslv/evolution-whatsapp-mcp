# Changelog

## [Unreleased]

## [0.3.1] - 2026-11-09

### Fixed
- MCP Registry name now uses the exact GitHub owner casing (`io.github.Ewertonslv/evolution-whatsapp-mcp`); the registry rejected the lowercase namespace.

## [0.3.0] - 2026-11-09

### Added
- `EVOLUTION_CONFIRM_WRITES` (default off): `send_text`, `send_media`, `create_instance`, `disconnect_instance` and `configure_webhook` wait for a human to confirm. Clients with form elicitation get a yes/no dialog (default no, 120 s); clients that can show no confirmation are refused and nothing is sent.
- An unrecognised `EVOLUTION_CONFIRM_WRITES` value (a typo such as `ture` or `on`) keeps confirmation on and prints a warning on stderr.
- The confirmation preview masks the number and never shows media content or webhook paths and query strings.

## [0.2.0] - 2026-11-09

### Added
- `EVOLUTION_READ_ONLY`: hides `send_text`, `send_media`, `create_instance`, `disconnect_instance` and `configure_webhook`.
- `EVOLUTION_ALLOWED_NUMBERS`: limits `send_text` and `send_media` to a list of numbers (Brazilian ninth-digit variants match).
- `limit` (1-200, default 50) on `find_chats` and `find_messages`; responses over 100000 characters are truncated with a notice; `get_qrcode` drops an oversized base64 and keeps the pairing code.
- Input validation for `number` (8-15 digits or a JID), `text` (not blank) and `delay` (>= 0).
- Warning on stderr when `EVOLUTION_API_URL` is neither https nor localhost.
- `server.json` for the official MCP registry, `smithery.yaml`, `mcpName`, `homepage`, `bugs`.

### Changed
- Upgraded `zod` to 4.x (fixes GHSA-mrhx-c7xc-m3w5). Tool input schemas keep the same properties.
- `configure_webhook` requires https; http is accepted only for `localhost`, `127.0.0.1` and `[::1]`.

## [0.1.2]

- Tool descriptions now say when not to call the state-changing tools.

## [0.1.1]

- Hardened the Evolution client (timeouts, error bodies) and fixed `find_messages` paging.

## [0.1.0]

- First release: nine tools to send and read WhatsApp messages, send media and manage instances.
