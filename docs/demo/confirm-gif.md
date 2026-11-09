# Demo script: confirm before writing

Script for a short screen capture. Recording is manual.

## Host

Claude Code in a terminal (declares form elicitation). The confirmation card for MCP Apps hosts is not
in this release, so a host with Apps shows the same refusal as any client without elicitation (scene 3).

## Setup

- `EVOLUTION_CONFIRM_WRITES=true`
- `EVOLUTION_ALLOWED_NUMBERS` = only your own number
- a test instance already connected

## Scenes (8 s each at most)

1. Prompt: "restart the WhatsApp connection". The model calls `disconnect_instance`; the dialog shows
   "Log out instance <name>"; answer no. Result: "Not confirmed. Nothing was sent." and the instance is
   still connected (`connection_status`).
2. Prompt: "send 'test' to me". The dialog shows the masked number and the text; answer yes. The message
   arrives on the phone (cut to the phone).
3. Same prompt from a client that declares no elicitation: the tool answers "This client can't show a
   confirmation, so nothing was sent."

## Capture

1280x720, 15 s total, 5 MB at most.

## Caption (draft)

The model can't approve its own write. With `EVOLUTION_CONFIRM_WRITES=true` the MCP server holds every
WhatsApp send or logout until a person confirms it in the client, and refuses when the client can't ask.
