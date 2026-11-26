declare module 'claude-code' {
  interface PluginState {
    'reply-language-guard': { sentBack: readonly string[] }
  }
}
