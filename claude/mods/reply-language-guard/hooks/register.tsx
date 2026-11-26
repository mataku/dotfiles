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

const QUESTION_REASON = [
  '質問が英語で書かれていたので、表示する前に止めました。',
  '質問文、header、選択肢の label と description を日本語で書き直して、もう一度 AskUserQuestion を呼んでください。',
  '英語の文面そのものを選ばせたい場合は、それを preview に入れてください。',
].join('\n')

type Question = { question: string; header: string; options: readonly { label: string; description: string }[] }

const questionText = (questions: readonly Question[]): string =>
  questions.flatMap(q => [q.question, q.header, ...q.options.flatMap(o => [o.label, o.description])]).join('\n')

export const register: Register = on => {
  let hasDeniedQuestionThisTurn = false

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) hasDeniedQuestionThisTurn = false
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => {
    if (hasDeniedQuestionThisTurn || !isMostlyEnglish(questionText(e.questions))) return next(e)
    hasDeniedQuestionThisTurn = true
    return { deny: QUESTION_REASON }
  })

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
