import type { Config } from "../config.js";
import type { ClientCaps } from "./client-caps.js";

/** How a write tool is allowed to run for this call. */
export type ConfirmMode = "direct" | "elicit" | "refuse";

/** Pure choice of confirmation channel from the config and what the client declared. */
export function chooseMode(config: Pick<Config, "confirmWrites">, caps: ClientCaps): ConfirmMode {
  if (!config.confirmWrites) return "direct";
  const elicitation = caps.elicitation;
  if (elicitation && typeof elicitation === "object") {
    const keys = Object.keys(elicitation);
    // `{}` means form mode (spec backward compatibility); url-only can't show our yes/no form.
    if (keys.length === 0 || keys.includes("form")) return "elicit";
  }
  return "refuse";
}
