// Manual Telegram smoke test (not part of the app). Run from codeAlong/:
//
//   node --env-file=.env.telegram.local scripts/telegram-ping.mjs chat-id
//       lists the chats that have messaged your bot, so you can find your TELEGRAM_CHAT_ID
//   node --env-file=.env.telegram.local scripts/telegram-ping.mjs ping
//       sends a sample in-person help ping to TELEGRAM_CHAT_ID
//
// .env.telegram.local holds TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. It is git-ignored
// (*.local) and must never be committed or put in a VITE_ variable, which would ship to the browser.
import { createTelegramSender, formatInPersonPing, sendWithRetry } from '../shared/telegram.js'

const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_CHAT_ID
const command = process.argv[2]

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!token) fail('TELEGRAM_BOT_TOKEN is not set. Put it in .env.telegram.local (see the header of this file).')

if (command === 'chat-id') {
  // getUpdates only works while no webhook is registered for this bot.
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
  const body = await res.json()
  if (!body.ok) fail(`Telegram refused: ${body.description ?? res.status}`)

  const chats = new Map()
  for (const update of body.result) {
    const chat = update.message?.chat
    if (chat) chats.set(chat.id, chat.first_name ?? chat.username ?? '(no name)')
  }
  if (chats.size === 0) fail('No messages found. Open your bot in Telegram, send it "hi", then run this again.')
  for (const [id, name] of chats) console.log(`chat id ${id}  (${name})`)
} else if (command === 'ping') {
  if (!chatId) fail('TELEGRAM_CHAT_ID is not set. Run the "chat-id" command first.')

  const text = formatInPersonPing({
    courseLabel: 'IS216 G2',
    lessonTitle: 'Mini Cart',
    studentName: 'Test Student',
    seat: 'C4',
    stepTitle: 'Step 4: Emit add-to-cart',
    message: 'This is a test ping from CodeAlong',
    link: 'https://example.com/help/test',
  })
  const result = await sendWithRetry(createTelegramSender(fetch, token), chatId, text)
  console.log(result.ok ? 'Sent. Check your phone.' : `Failed (status ${result.status}).`)
  process.exit(result.ok ? 0 : 1)
} else {
  fail('Usage: telegram-ping.mjs chat-id | ping')
}
