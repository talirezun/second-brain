import { randomUUID } from 'crypto';
import { generateText } from './llm.js';
import {
  readSchema,
  readWikiPages,
  listConversations,
  readConversation,
  writeConversation,
  deleteConversation,
} from './files.js';

export { listConversations, readConversation, deleteConversation };

function buildPrompt(domain, pages, history, userMessage) {
  const wikiContext = pages
    .map(p => `--- FILE: ${p.path} ---\n${p.content}`)
    .join('\n\n');

  const historyText = history.length > 0
    ? '[Conversation so far]\n' +
      history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n') +
      '\n\n'
    : '';

  return `The user is having a conversation about the "${domain}" domain wiki.

Wiki contents (${pages.length} pages):
${wikiContext.slice(0, 90000)}

---
${historyText}[New message from user]
${userMessage}

Instructions:
- Answer using ONLY information found in the wiki above.
- If the answer is not in the wiki, say so honestly.
- Cite pages inline using [source: path/to/page.md] format.
- Synthesize across pages; do not quote large blocks verbatim.
- Be conversational — this is a multi-turn chat, not a one-shot Q&A.
- Keep answers focused and concise.`;
}

export async function sendMessage(domain, conversationId, userMessage) {
  const schema = await readSchema(domain);
  const pages = await readWikiPages(domain);

  if (pages.length === 0) {
    return {
      conversationId: null,
      isNew: false,
      title: null,
      answer: "This domain's wiki is empty. Ingest some sources first.",
      citations: [],
    };
  }

  // Load or create conversation
  let conversation = null;
  let isNew = false;

  if (conversationId) {
    conversation = await readConversation(domain, conversationId);
  }

  if (!conversation) {
    isNew = true;
    conversation = {
      id: randomUUID(),
      title: userMessage.length > 60 ? userMessage.slice(0, 57).trimEnd() + '…' : userMessage.trim(),
      createdAt: new Date().toISOString(),
      domain,
      messages: [],
    };
  }

  // Use up to last 20 messages (10 turns) for context
  const history = conversation.messages.slice(-20);

  const prompt = buildPrompt(domain, pages, history, userMessage);
  const answer = await generateText(schema, prompt, 4096);

  const citations = [...answer.matchAll(/\[source:\s*([^\]]+)\]/g)].map(m => m[1].trim());
  const uniqueCitations = [...new Set(citations)];

  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.messages.push({ role: 'assistant', content: answer, citations: uniqueCitations });
  await writeConversation(domain, conversation);

  return {
    conversationId: conversation.id,
    isNew,
    title: conversation.title,
    answer,
    citations: uniqueCitations,
  };
}
