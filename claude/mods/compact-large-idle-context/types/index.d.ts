export type DigestLines = string[]

declare module 'claude-code' {
  interface PluginState {
    'compact-large-idle-context': { digest: DigestLines }
  }
}
