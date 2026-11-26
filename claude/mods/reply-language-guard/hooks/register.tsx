import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { firstLine, isMostlyEnglish } from './detect'

const sentBack = atom({ plugin: 'reply-language-guard', key: 'sentBack' } as const, [] as readonly string[])

const sendBackReason = (reply: string): string =>
  [
    '直前の返答が英語で書かれていました。',
    `該当する返答の冒頭: 「${firstLine(reply)}」`,
    'この英語の返答は画面から消えるので、日本語で書けていた部分も含めて、返答全体を日本語で書き直してください。',
    '謝罪や経緯の説明は不要です。以降も日本語で回答してください。',
  ].join('\n')

export const register: Register = on => {
  on('classic.Stop', async ($, e, next) => {
    const reply = e.last_assistant_message
    if (e.stop_hook_active || e.agent_id !== undefined || reply === undefined || !isMostlyEnglish(reply)) {
      return next(e)
    }
    await update($, sentBack, replies => [...replies, reply.trim()])
    return { block: sendBackReason(reply) }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = e.props.text.trim()
    if (text.length === 0) return next(e)
    const replies = await read($, sentBack)
    if (!replies.some(reply => reply.includes(text))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
