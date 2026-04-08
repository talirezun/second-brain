import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import domainsRouter from './routes/domains.js';
import ingestRouter from './routes/ingest.js';
import queryRouter from './routes/query.js';
import wikiRouter from './routes/wiki.js';
import { getProviderInfo } from './brain/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/domains', domainsRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/query', queryRouter);
app.use('/api/wiki', wikiRouter);

// Catch-all: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  try {
    const { provider, model } = getProviderInfo();
    const providerLabel = provider === 'gemini' ? '🟦 Gemini' : '🟣 Anthropic';
    console.log(`Second Brain running at http://localhost:${PORT}`);
    console.log(`LLM provider: ${providerLabel}  |  model: ${model}`);
  } catch (err) {
    console.log(`Second Brain running at http://localhost:${PORT}`);
    console.warn(`⚠️  ${err.message}`);
  }
});
