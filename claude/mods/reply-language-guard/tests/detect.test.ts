import { describe, expect, test } from 'claude-code/testing'
import { isMostlyEnglish } from '../hooks/detect'

describe('isMostlyEnglish', () => {
  test('a plain English reply is English', async () => {
    expect(isMostlyEnglish('I updated the configuration file and ran the tests. Everything passes now.')).toBe(true)
  })

  test('a Japanese reply is not English', async () => {
    expect(isMostlyEnglish('設定ファイルを更新し、テストを実行しました。すべて成功しています。')).toBe(false)
  })

  test('Japanese with a few English terms is not English', async () => {
    expect(isMostlyEnglish('mise bootstrap を実行して symlink を作成しました。fallback の動作も確認済みです。')).toBe(false)
  })

  test('English only inside code, links, URLs and emails is not English', async () => {
    const text = [
      '次のコマンドで確認できます。',
      '```bash',
      'git log --oneline --decorate --graph --all | head -n 20',
      'echo "this is a long English sentence inside a code block"',
      '```',
      '`npm run build --workspace packages/something-long` を実行してください。',
      '詳細は [the official documentation for this feature](https://example.com/docs/feature) を参照。',
      'https://github.com/example/repository/blob/main/README.md',
      '連絡先: someone.with.a.long.name@example.com',
    ].join('\n')
    expect(isMostlyEnglish(text)).toBe(false)
  })

  test('the katakana long vowel mark counts as Japanese', async () => {
    expect(isMostlyEnglish('abcdefghij abcdefghij abcdefghij abcdefghij ' + 'ー'.repeat(14))).toBe(false)
  })

  test('a short English reply is not English', async () => {
    expect(isMostlyEnglish('Done.')).toBe(false)
    expect(isMostlyEnglish('OK')).toBe(false)
  })

  test('a JSON object or array is not English', async () => {
    expect(isMostlyEnglish('{"status": "completed", "message": "All the tests passed successfully without errors"}')).toBe(false)
    expect(isMostlyEnglish('[{"name": "first item"}, {"name": "second item with a longer description"}]')).toBe(false)
    expect(isMostlyEnglish('```json\n{"summary": "The build finished and every check passed as expected"}\n```')).toBe(false)
  })

  test('text that only starts like JSON is still judged', async () => {
    expect(isMostlyEnglish('{ not json } but this is a long English explanation of the change')).toBe(true)
  })
})
