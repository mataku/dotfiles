import type { Register } from 'claude-code'

const HIDDEN_PARTS = [/^\d+ shells?$/, /^← for agents$/]

const trim = (hint: string) =>
  hint
    .split(' · ')
    .filter(part => !HIDDEN_PARTS.some(pattern => pattern.test(part)))
    .join(' · ')

export const register: Register = on => {
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const hint = trim(e.props.hint)
    return hint === e.props.hint ? next(e) : next({ ...e, props: { ...e.props, hint } })
  })
}
