import { Router } from 'express';
import {
  sendMessage,
  listConversations,
  readConversation,
  deleteConversation,
} from '../brain/chat.js';
import { listDomains } from '../brain/files.js';

const router = Router();

// List conversations for a domain
router.get('/:domain', async (req, res) => {
  try {
    const conversations = await listConversations(req.params.domain);
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Load a full conversation
router.get('/:domain/:id', async (req, res) => {
  try {
    const conversation = await readConversation(req.params.domain, req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message (creates conversation if conversationId omitted)
router.post('/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { message, conversationId } = req.body;

    if (!message) return res.status(400).json({ error: 'message is required' });

    const domains = await listDomains();
    if (!domains.includes(domain)) {
      return res.status(400).json({ error: `Unknown domain: ${domain}` });
    }

    const result = await sendMessage(domain, conversationId || null, message);
    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a conversation
router.delete('/:domain/:id', async (req, res) => {
  try {
    await deleteConversation(req.params.domain, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
