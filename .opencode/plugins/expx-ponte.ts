/**
 * Ponte Expx — plugin do OpenCode instalado em <repo>/.opencode/plugins/expx-ponte.ts pela torre
 * (bin/expx-instalar.sh). Toda a lógica está em ~/.claude/torre/bin/expx-ponte-core.mjs; aqui só
 * o mecanismo do harness: bloquear = lançar em tool.execute.before; avisar = anexar ao resultado
 * em tool.execute.after (o OpenCode não tem "permite mas avisa" no before).
 * Verificado por Thulio no binário 1.18.23: before recebe args em `output.args`, after em `input.args`.
 * Spec: ~/.claude/torre/docs/specs/2026-09-03-glm-braco-expx-design.md §4.1.
 */
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

type Resultado = { bloqueia?: string; avisos: string[] }
type Core = { executar: (x: Record<string, unknown>) => Resultado }

// A raiz da torre vinha fixa no caminho padrão: quem instalou noutro caminho
// (TORRE_DESTINO_INSTALACAO) tinha o import falhando e a frente GLM nascia sem ponte nenhuma.
// O expx-instalar.sh grava a raiz real no marcador ao copiar; homedir() é o último recurso.
function torreRaiz(): string {
  return process.env.TORRE_RAIZ || "__TORRE_RAIZ__".replace(/^__.*__$/, "") || join(homedir(), ".claude", "torre")
}

function raizDoRepo(inicio: string): string {
  let d = inicio
  while (d && d !== "/") { if (existsSync(join(d, ".git"))) return d; const p = dirname(d); if (p === d) break; d = p }
  return inicio
}

export default async ({ directory }: { directory?: string }) => {
  const raiz = raizDoRepo(directory || process.cwd())
  // O despachante mora na TORRE, não dentro do repo (decisão D2, 11/09/2026). Um `git checkout`
  // que apaga o `.expx` do repo derrubava os hooks — e, quando o registro global também apontava
  // pra lá, barrava Bash/Edit/Write em TODAS as sessões da máquina. A cópia fixa vem primeiro; a
  // do repo continua servindo de fallback para quem ainda não migrou.
  const dirPlugin = [
    join(torreRaiz(), "expx-fontes", "marketplace", "plugins", "expx"),
    join(raiz, ".expx", "marketplace", "plugins", "expx"),
  ].find((d) => existsSync(d)) || join(raiz, ".expx", "marketplace", "plugins", "expx")
  const torre = torreRaiz()
  const core: Core = await import(join(torre, "bin", "expx-ponte-core.mjs"))
  const pendentes = new Map<string, string[]>()

  return {
    "tool.execute.before": async (input: any, output: any) => {
      const r = core.executar({ raiz, dirPlugin, evento: "PreToolUse", tool: input.tool, args: output?.args ?? input?.args ?? {} })
      if (r.bloqueia) throw new Error(`[expx-ponte] ${r.bloqueia}`)
      if (r.avisos.length) pendentes.set(input.callID, r.avisos)
    },
    "tool.execute.after": async (input: any, output: any) => {
      const r = core.executar({ raiz, dirPlugin, evento: "PostToolUse", tool: input.tool, args: input?.args ?? {}, resposta: output?.output })
      const avisos = [...(pendentes.get(input.callID) ?? []), ...r.avisos]
      pendentes.delete(input.callID)
      if (avisos.length && typeof output?.output === "string") {
        output.output += "\n\n[expx-ponte — aviso, a ação NÃO foi bloqueada]\n" + avisos.map((a) => `- ${a}`).join("\n")
      }
    },
  }
}
