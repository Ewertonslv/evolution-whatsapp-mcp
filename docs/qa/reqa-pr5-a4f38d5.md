# Re-QA delta do PR #5 (3602c54..a4f38d5)

QA: sessão separada da autora. Código não alterado. Data 2026-11-09. Laudos anteriores: `docs/qa/quebra-pr4-5-be5f7df.md`, `docs/qa/reqa-pr4-5-f124d97-7168315.md`.
Delta: f0a45d8 (3 correções em `src/confirm/gate.ts` e `src/confirm/preview.ts`, +testes) e a4f38d5 (só `docs/reviews/`). Docs de usuário (README, CHANGELOG, `.env.example`, `server.json`) não mudaram no delta.

## Veredito

**#5 a4f38d5: APROVADO.** As 3 correções funcionam na prática, a mutação de cada uma deixa os testes vermelhos, gate 202 verdes. Sem achado novo. O #4 vai junto (o #5 contém o #4): o delta é só do #5 e não reabre nada do #4.

## Gate

`npm ci && npm run lint && npm test && npm run build` em a4f38d5 (worktree descartável `.worktrees/qa-4-5-re`): exit 0, `found 0 vulnerabilities`, **Tests 202 passed (202)** (195 + 7 novos).

## Prova prática (cliente SDK, `dist/index.js` real, Evolution falsa :11552)

1. **Texto de recusa sem "MCP Apps"** (`EVOLUTION_CONFIRM_WRITES=true`, cliente sem caps), as 5 tools: `w=0`, `isError=true`, texto `"This client can't show a confirmation, so nothing was sent. Use a client that supports elicitation, or unset EVOLUTION_CONFIRM_WRITES."`, `citaMCPApps=false` nas 5.
2. **Pergunta por ação** (campo `confirm.title` do formulário, `default=false` em todas):

   | Tool | title | recusado | aceito |
   |---|---|---|---|
   | send_text | `Send it?` | 0 escritas | 1 |
   | send_media | `Send it?` | 0 | 1 |
   | create_instance | `Create it?` | 0 | 1 |
   | disconnect_instance | `Log out?` | 0 | 1 |
   | configure_webhook | `Replace webhook?` | 0 | 1 |

   A troca do rótulo não afetou o fail-closed: recusado = 0, aceito = 1.
3. **`configure_webhook` achata e corta a instância em 60** (B2b antigo, fechado):
   - 100 `z` → `Replace webhook -> zzz…(60)…\nhttps://h.test/…, 0 events` (2 linhas, `…` no fim).
   - `"a\nb\r\nc\t"+80×d` → `a b c ddd……` numa linha só (2 linhas no total: cabeçalho e corpo).
   - sem `instance` (usa a padrão) → `Replace webhook -> inst`.
   - Path/query do webhook continuam ocultos (`https://h.test/…`).

## Mutação (1 por correção, todas revertidas, árvore limpa)

| Mutação | Resultado |
|---|---|
| texto de recusa volta a "Use a client with MCP Apps or" | 1 failed: `refuse: does not point the user to an Apps-only client` |
| `title` volta a `"Send it?"` fixo | 3 failed: create "Create it?", disconnect "Log out?", webhook "Replace webhook?" |
| `configure_webhook` volta a `str(args.instance)` | 1 failed: `instance name is flattened and cut like the others` |

## Sem conferir

- Cartão MCP App e elicitation em Claude Code real (NOT RUN da autora).
- Timeout de 120 s do diálogo.
- Evolution real e WhatsApp real: nunca tocados.
- Os arquivos de `docs/reviews/` (volta 2, placar) só em termos de existência; não auditei o conteúdo do review.
- Não repeti a quebra completa 5×3 nem a tabela de valores da env: `config.ts` não mudou no delta.

Harness fora do repo: `/home/ewerton/.claude/torre/state/tmp/qa45/delta.mjs`, saída `delta.txt` na mesma pasta. Processos: 0 `dist/index.js`, porta 11552 livre.
