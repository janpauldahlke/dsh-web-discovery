/**
 * Ambient type shims for the harness host packages.
 *
 * Out-of-tree plugins reference harness types via type-only imports that only
 * resolve inside the real harness. Declaring a minimal surface here (pinned to
 * dsh 0.2.1-alpha.2, see ENV.md) lets `tsc --noEmit` type-check our own code;
 * esbuild erases these type imports at build time. Mirrors the dsh-memento /
 * dsh-web-missions baseline (trimmed: the companion is tool-only, no routes,
 * no client slots).
 *
 * Hard rule: the built bundle may request only platform-baseline modules at
 * runtime. Harness VALUES must never be value-imported (unresolvable from an
 * out-of-tree install location); harness behavior that must be reproduced is
 * implemented locally.
 */
declare module '@deepseek-ai/cordis' {
  export interface Logger {
    debug: (format: unknown, ...params: unknown[]) => void
    info: (format: unknown, ...params: unknown[]) => void
    warn: (format: unknown, ...params: unknown[]) => void
    error: (format: unknown, ...params: unknown[]) => void
  }
  export interface Context {
    tools: {
      register: (def: Record<string, unknown>) => () => void
    }
    effect: (dispose: () => void, tag?: string) => void
    inject: (deps: string[], fn: (ctx: Context) => void) => void
    on: (
      name: string,
      listener: (...args: any[]) => any,
      options?: boolean | { prepend?: boolean; global?: boolean },
    ) => () => void
    logger?: (name: string) => Logger
    [key: string]: unknown
  }
}
