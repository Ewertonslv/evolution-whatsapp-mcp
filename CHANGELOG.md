# Changelog

## [Unreleased]

### Added
- `EVOLUTION_READ_ONLY`: hides `send_text`, `send_media`, `create_instance`, `disconnect_instance` and `configure_webhook`.
- `EVOLUTION_ALLOWED_NUMBERS`: limits `send_text` and `send_media` to a list of numbers (Brazilian ninth-digit variants match).
- `limit` (1-200, default 50) on `find_chats` and `find_messages`; responses over 100000 characters are truncated with a notice; `get_qrcode` drops an oversized base64 and keeps the pairing code.
- Input validation for `number` (8-15 digits or a JID), `text` (not blank) and `delay` (>= 0).
- Warning on stderr when `EVOLUTION_API_URL` is neither https nor localhost.
- `server.json` for the official MCP registry, `smithery.yaml`, `mcpName`, `homepage`, `bugs`.

### Changed
- `configure_webhook` requires https; http is accepted only for `localhost`, `127.0.0.1` and `[::1]`.

## [0.1.2]

- Tool descriptions now say when not to call the state-changing tools.

## [0.1.1]

- Hardened the Evolution client (timeouts, error bodies) and fixed `find_messages` paging.

## [0.1.0]

- First release: nine tools to send and read WhatsApp messages, send media and manage instances.
