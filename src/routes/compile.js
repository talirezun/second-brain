/**
 * POST /api/compile/conversation — v2.5.0
 *
 * Compiles a saved conversation into wiki pages. Streams progress as
 * Server-Sent Events (mirrors the ingest route so the frontend can reuse
 * the same streaming primitive).
 *
 * Request body: { domain, conversationId }
 * Stream events:
 *   { type: 'progress', pct, message }
 *   { type: 'wait', pct, message }     — emitted during slow LLM waits
 *   { type: 'done', title, pagesWritten, changes }
 *   { type: 'error', message }
 *   { type: 'refused', reason }        — short conversation, missing data, etc.
 */

import { Router } from 'express';
import { compileConversation } from '../brain/compile.js';
import { listDomains } from '../brain/files.js';

const router = Router();

// Conversation IDs are server-generated UUIDs (see brain/chat.js). Reject
// anything that doesn't match the canonical 8-4-4-4-12 hex shape — defends
// against path-traversal via crafted IDs reaching readConversation().
const CONVERSATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/conversation', async (req, res) => {
  const { domain, conversationId } = req.body || {};

  if (!domain) return res.status(400).json({ error: 'domain is required' });
  if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });
  if (!CONVERSATION_ID_RE.test(conversationId)) {
    return res.status(400).json({ error: 'Invalid conversationId' });
  }

  const domains = await listDomains();
  if (!domains.includes(domain)) {
    return res.status(400).json({ error: `Unknown domain: ${domain}` });
  }

  // ── Switch to Server-Sent Events streaming ───────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const emit = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await compileConversation(domain, conversationId, ({ pct, message }) => {
      emit({ type: 'progress', pct, message });
    });

    if (!result.ok) {
      // Refusals (too-short conversation, not found) are not errors — they're
      // the normal "nothing to compile" outcome. Errors come from LLM failures.
      if (result.reason) {
        emit({ type: 'refused', reason: result.reason });
      } else {
        emit({ type: 'error', message: result.error || 'Compilation failed' });
      }
      return;
    }

    emit({
      type: 'done',
      title: result.title,
      pagesWritten: result.pagesWritten,
      changes: result.changes,
    });
  } catch (err) {
    console.error('Compile error:', err);
    emit({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

export default router;
