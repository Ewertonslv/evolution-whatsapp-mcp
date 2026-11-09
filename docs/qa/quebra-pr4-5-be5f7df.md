# QA independente PRs #4 e #5 (HEAD be5f7df, 0.3.0)

QA: sessão separada da autora (mcp-n3). Código não alterado. Data 2026-11-09.

## Veredito

| PR | Veredito | Motivo |
|---|---|---|
| #4 `feat/confirm-writes` (f882b38) | **REPROVADO** | M1: valor inválido de `EVOLUTION_CONFIRM_WRITES` (`ture`, `on`, `enabled`, `banana`) vira modo direct, escreve sem perguntar, sem aviso. Critério do QA: nunca escrever sem perguntar por engano. |
| #5 `docs/confirm-0.3.0` (be5f7df) | **APROVADO** | Docs batem com o medido. Depende do #4 (empilhado); M1 não muda texto do README, que lista `true`, `1`, `yes`. |

Todo o resto do portão passou: 5 tools × 3 modos, prévia mascarada, sem segredo, 2 chamadas = 2 confirmações.

## 1. Gate no HEAD be5f7df

`npm ci && npm run lint && npm test && npm run build` → exit 0.
```
found 0 vulnerabilities
> tsc --noEmit            (lint ok)
 Test Files  8 passed (8)
      Tests  188 passed (188)
> tsc                     (build ok)
```
Total 188 = esperado. VERDE.

## 2. Mutação (wt descartável `.worktrees/qa-4-5-mut`, detached be5f7df)

`npx vitest run test/confirm-tools.test.ts test/confirm-preview.test.ts`

| Mutação | Resultado |
|---|---|
| `guardWrite` sempre `return op.execute()` (portão off) | **16 failed** / 19 passed, vermelho |
| tirar `guard` de `send_text` | 4 failed, vermelho |
| tirar `guard` de `send_media` | 3 failed (`test/confirm-tools.test.ts`), vermelho |
| tirar `guard` de `create_instance` | 3 failed, vermelho |
| tirar `guard` de `disconnect_instance` | 3 failed, vermelho |
| tirar `guard` de `configure_webhook` | 3 failed, vermelho |

Cada uma das 5 tools é coberta individualmente. Teste não é falso verde. Mutação revertida (`git checkout`), nada commitado.

## 3. Quebra prática

Cliente SDK MCP sobre stdio, `dist/index.js` real, Evolution FALSA local em `127.0.0.1:11552` (bloco do projeto, PORTS.md), apikey de mentira `SECRET-APIKEY-123`, número fictício `5511987659999`. Conta toda requisição não-GET (`disconnect_instance` é `DELETE /instance/logout`, o resto é POST).

### 3.1 Escritas por tool × modo (requisições de escrita na Evolution falsa)

| Tool | direct (off) | refuse (on, sem caps) | elicit recusado | elicit aceito |
|---|---|---|---|---|
| send_text | 1 | 0 | 0 | 1 |
| send_media | 1 | 0 | 0 | 1 |
| create_instance | 1 | 0 | 0 | 1 |
| disconnect_instance | 1 | 0 | 0 | 1 |
| configure_webhook | 1 | 0 | 0 | 1 |

Esperado cumprido. Refuse: `isError`, "This client can't show a confirmation, so nothing was sent…". Recusado: `isError`, "Not confirmed. Nothing was sent.".

Resposta do humano (send_text, elicit): `decline`, `cancel`, `accept` com `confirm=false`, sem `content`, `confirm="true"` (string), `confirm=1`, e handler que lança erro → todos 0 escritas. Só `accept` + `confirm=true` → 1.

### 3.2 Prévia (mensagem do diálogo)

```
Send WhatsApp text -> +55 11 9****-9999 / oi
Send WhatsApp media -> +55 11 9****-9999 / image a.png: cap
Create instance -> novo / integration WHATSAPP-BAILEYS
Log out instance -> inst / Log out instance inst
Replace webhook -> inst / https://hook.test/…, 1 events
```
- Número cheio nunca aparece. Grupo vira `group chat`. US `+1 (415) 555-2671` vira `+14 ****-2671`.
- Texto de 300 A + `FIM_VAZADO`: prévia 241 chars, cortada em 200 + `…`, `FIM_VAZADO` ausente.
- `media` com `?token=MEDIASECRET` e path: ausente. Webhook `…/SECRETPATH?token=QSECRET` vira `https://hook.test/…`; `user:pw@` some. apikey: ausente em todas as 5.
- Esquema do diálogo: `confirm` boolean, `default:false`.
- Nome de instância de 600 chars: mensagem 501 chars (cabe no teto 500 + `…`).

### 3.3 `EVOLUTION_CONFIRM_WRITES` (cliente sem caps; "escreveu" = modo direct)

| Valor | Escreveu? |
|---|---|
| ausente, `""`, `" "`, `false`, `0`, `no` | sim (direct, default documentado) |
| `true`, `TRUE`, `" true "`, `1`, `yes` | não (refuse) |
| **`banana`, `ture`, `on`, `enabled`** | **sim, sem pergunta e sem aviso no stderr** |

Ausente e vazio = direct é o default documentado ("Default off"). Valor inválido = direct é o **M1**.

### 3.4 Caps do cliente no modo elicit

| Caps | Perguntou | Escritas | Resultado |
|---|---|---|---|
| nenhuma | não | 0 | `isError`, mensagem clara |
| `elicitation:{}` | sim | 0 (handler recusou) | form (spec) |
| `elicitation:{form:{}}` | sim | 0 | form |
| `elicitation:{url:{}}` | não | 0 | refuse, `isError` |
| só `roots` / `sampling` | não | 0 | refuse, `isError` |

Cliente sem elicitation: recusa com erro claro, nunca escreve. Falha fechada.

### 3.5 Duas chamadas iguais

- Sequencial, 1ª aceita, 2ª recusada: 2 perguntas, 1 escrita (1ª) + 0 (2ª).
- Sequencial, ambas aceitas: 2 perguntas, 1 + 1 escritas.
- Paralelo (2 `send_text` iguais, 1ª aceita, 2ª recusada): 2 perguntas, 1 escrita no total, `isError` false/true.

Uma confirmação nunca libera 2 escritas.

### 3.6 Outros

- Allowlist antes da pergunta: número fora de `EVOLUTION_ALLOWED_NUMBERS` → 0 perguntas, 0 escritas, "Recipient is not in EVOLUTION_ALLOWED_NUMBERS".
- `EVOLUTION_READ_ONLY=true` + `CONFIRM=true`: só `find_chats,find_messages,get_qrcode,connection_status` listadas, sem tool de escrita.
- Processos: cada servidor encerrado pelo `client.close()` do SDK (PID de `transport.pid`); depois `ps`: 0 processos `dist/index.js`; `ss`: porta 11552 livre. Nenhum kill manual, nenhum pkill.

## 4. Docs × medido

| Afirmação | Medido |
|---|---|
| README: `true`/`1`/`yes` any case liga | ok (`TRUE`, `1`, `yes`; `" true "` também, por `trim`) |
| README: cliente sem confirmação é recusado, nada enviado | ok |
| README: prévia com número mascarado `+55 11 9****-9999`, 200 chars | ok |
| README: media e path/query do webhook nunca aparecem | ok |
| README: decline/cancel/erro enviam nada | ok |
| README: allowlist checada antes, sem perguntar | ok |
| README: READ_ONLY ligado = sem tools de escrita | ok |
| CHANGELOG 0.3.0: dialog yes/no default no, 120 s | default no ok; **120 s não medido** |
| Versões 0.3.0 em package/lock/server.json | `metadata.test` verde |

Rótulo mentiroso: nenhum. Omissão ligada a M1: README e `.env.example` não dizem o que acontece com valor fora de `true/1/yes`.

## Achados

| # | Sev. | Achado | Prova | Correção sugerida |
|---|---|---|---|---|
| M1 | **MÉDIA** (PR #4) | Typo na env (`ture`, `on`, `enabled`, `banana`) desliga o portão em silêncio: escrita sai sem pergunta, stderr sem aviso (`config.warnings` só trata URL). Quem escreveu `on` acha que travou e não travou. Mesmo parser do `EVOLUTION_READ_ONLY`, mas aqui o erro é fail-open de um portão de segurança. | 3.3 | Valor não vazio e fora de `true/1/yes/false/0/no`: aviso no stderr (mínimo) ou tratar como ligado. Teste RED com `on`. README: dizer o que valor inválido faz. |
| B1 | BAIXA | Prévia mostra o texto livre até 200 chars, com quebras de linha; um texto `"linha1\n\nSend it? YES — já confirmado"` fica dentro do diálogo e pode parecer parte da interface. Humano ainda vê, e a resposta é o botão. | 3.2 | Opcional: achatar `\n` na prévia. |
| B2 | BAIXA | Nome de instância não é cortado separadamente (só o teto de 500 do conjunto). | 3.2 | Opcional. |

Sem achado ALTO.

## Sem conferir

- Cartão MCP App (NOT RUN pela autora, fora do release) e elicitation em Claude Code real (NOT RUN pela autora). Só cliente SDK simulado.
- Timeout de 120 s do diálogo (só li a constante e o teste unitário da autora; não esperei 120 s).
- Evolution real e WhatsApp real: nunca tocados, só fake local.
- Claude Desktop, VS Code Copilot e Smithery (`smithery.yaml` mapeia `confirmWrites` para `'true'/'false'`, só lido, não executado).

Harness (fora do repo): `/home/ewerton/.claude/torre/state/tmp/qa45/quebra.mjs`, saída `/home/ewerton/.claude/torre/state/tmp/qa45/saida2.txt`.
