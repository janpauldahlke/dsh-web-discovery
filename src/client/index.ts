/**
 * Browser half: intentional no-op. The M7 companion is tool-only (no pane).
 * Cordis still requires `name` + `apply` on every loaded plugin face —
 * `export {}` alone → "invalid plugin, expect … apply method".
 */
export const name = 'dsh-web-discovery'

export function apply(_ctx: unknown): void {
  // no UI — host tools only
}
