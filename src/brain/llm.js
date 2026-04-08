/**
 * LLM abstraction layer — supports Anthropic Claude and Google Gemini.
 *
 * Provider selection (automatic, based on which key is set in .env):
 *   GEMINI_API_KEY      → Google Gemini  (default model: gemini-2.5-flash-lite)
 *   ANTHROPIC_API_KEY   → Anthropic Claude (default model: claude-sonnet-4-6)
 *
 * Optional override:
 *   LLM_MODEL=<model-id>   override the default model for whichever provider is active
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULTS = {
  gemini: 'gemini-2.5-flash-lite',
  anthropic: 'claude-sonnet-4-6',
};

export function getProviderInfo() {
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      model: process.env.LLM_MODEL || DEFAULTS.gemini,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: process.env.LLM_MODEL || DEFAULTS.anthropic,
    };
  }
  throw new Error(
    'No LLM API key found. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in your .env file.'
  );
}

/**
 * Call the active LLM with a system prompt and user message.
 * Returns the model's response as a plain string.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} maxTokens
 * @param {'text'|'json'} responseFormat - 'json' enables native JSON mode (Gemini only; Claude ignores it)
 * @returns {Promise<string>}
 */
export async function generateText(systemPrompt, userPrompt, maxTokens = 8192, responseFormat = 'text') {
  const { provider, model } = getProviderInfo();

  // ── Google Gemini ────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    });
    const generationConfig = { maxOutputTokens: maxTokens };
    if (responseFormat === 'json') {
      // Forces Gemini to output structurally valid JSON, preventing
      // unescaped markdown characters (backticks, quotes) from breaking parsing.
      generationConfig.responseMimeType = 'application/json';
    }
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig,
    });
    return result.response.text();
  }

  // ── Anthropic Claude ─────────────────────────────────────────────────────
  const client = new Anthropic();
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return message.content[0].text;
}
