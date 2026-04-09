// ── Stop server ───────────────────────────────────────────────────────────────
document.getElementById('stop-btn').addEventListener('click', async () => {
  const btn = document.getElementById('stop-btn');
  btn.disabled = true;
  btn.textContent = 'Stopping…';
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch {
    // Expected — the server closes before it can finish the response
  }
  btn.textContent = '✓ Stopped';
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100vh;gap:16px;font-family:system-ui;color:#e2e8f0;background:#0f1117;">
      <div style="font-size:48px;">🧠</div>
      <div style="font-size:20px;font-weight:600;">Second Brain stopped</div>
      <div style="font-size:14px;color:#64748b;">Click the app icon to start it again.</div>
    </div>`;
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const tabs = document.querySelectorAll('.tab');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
    tabs.forEach(t => {
      t.classList.toggle('active', t.id === `tab-${target}`);
      t.classList.toggle('hidden', t.id !== `tab-${target}`);
    });
  });
});

// ── Domain loading ─────────────────────────────────────────────────────────────
const domainSelects = ['ingest-domain', 'wiki-domain'];

async function loadDomains() {
  const res = await fetch('/api/domains');
  const { domains } = await res.json();
  domainSelects.forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = domains
      .map(d => `<option value="${d}">${formatDomain(d)}</option>`)
      .join('');
  });
}

function formatDomain(slug) {
  return slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' / ');
}

// ── INGEST TAB ────────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('ingest-file');
const fileNameEl = document.getElementById('file-name');
const ingestBtn = document.getElementById('ingest-btn');
const ingestStatus = document.getElementById('ingest-status');
const ingestResult = document.getElementById('ingest-result');

let selectedFile = null;

function setFile(file) {
  if (!file) return;
  const allowed = ['.txt', '.md', '.pdf'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showStatus(ingestStatus, 'error', `Unsupported file type: ${ext}. Use .txt, .md, or .pdf`);
    return;
  }
  selectedFile = file;
  fileNameEl.textContent = file.name;
  ingestBtn.disabled = false;
  hideEl(ingestStatus);
  hideEl(ingestResult);
}

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  setFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => setFile(fileInput.files[0]));

ingestBtn.addEventListener('click', () => submitIngest(false));

async function submitIngest(overwrite) {
  if (!selectedFile) return;

  const domain = document.getElementById('ingest-domain').value;
  ingestBtn.disabled = true;
  hideEl(ingestResult);
  hideDuplicateBanner();
  showStatus(ingestStatus, 'loading', 'Ingesting — Second Brain is reading your source and updating the wiki...');

  const formData = new FormData();
  formData.append('domain', domain);
  formData.append('file', selectedFile);
  if (overwrite) formData.append('overwrite', 'true');

  try {
    const res = await fetch('/api/ingest', { method: 'POST', body: formData });
    const data = await res.json();

    // ── Duplicate detected ──────────────────────────────────────────────────
    if (res.status === 409 && data.duplicate) {
      hideEl(ingestStatus);
      showDuplicateBanner(data.filename, domain);
      ingestBtn.disabled = false;
      return;
    }

    if (!res.ok) throw new Error(data.error || 'Ingest failed');

    hideEl(ingestStatus);
    showIngestResult(data);

    // Reset
    selectedFile = null;
    fileNameEl.textContent = '';
    fileInput.value = '';
    ingestBtn.disabled = true;
  } catch (err) {
    showStatus(ingestStatus, 'error', err.message);
    ingestBtn.disabled = false;
  }
}

function showDuplicateBanner(filename, domain) {
  let banner = document.getElementById('duplicate-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'duplicate-banner';
    banner.className = 'duplicate-banner';
    ingestResult.parentNode.insertBefore(banner, ingestResult);
  }
  banner.innerHTML = `
    <div class="dup-icon">⚠️</div>
    <div class="dup-body">
      <strong>${escHtml(filename)}</strong> has already been ingested into this domain.
      <div class="dup-actions">
        <button class="btn dup-overwrite">Re-ingest &amp; update wiki</button>
        <button class="btn dup-cancel">Cancel</button>
      </div>
    </div>`;
  showEl(banner);

  banner.querySelector('.dup-overwrite').addEventListener('click', () => {
    hideDuplicateBanner();
    submitIngest(true);
  });
  banner.querySelector('.dup-cancel').addEventListener('click', () => {
    hideDuplicateBanner();
    ingestBtn.disabled = false;
  });
}

function hideDuplicateBanner() {
  const banner = document.getElementById('duplicate-banner');
  if (banner) banner.remove();
}

function showIngestResult(data) {
  const label = data.wasOverwrite ? 'Re-ingested &amp; updated:' : 'Ingested:';
  ingestResult.innerHTML = `
    <h3>${label} ${escHtml(data.title)}</h3>
    <ul>
      ${data.pagesWritten.map(p => `<li><span>${escHtml(p)}</span></li>`).join('')}
    </ul>
  `;
  showEl(ingestResult);
}

// ── CHAT TAB ──────────────────────────────────────────────────────────────────
const chatDomainEl   = document.getElementById('chat-domain');
const newChatBtn     = document.getElementById('new-chat-btn');
const convListEl     = document.getElementById('conversation-list');
const chatEmptyEl    = document.getElementById('chat-empty');
const chatThreadEl   = document.getElementById('chat-thread');
const chatInputEl    = document.getElementById('chat-input');
const chatSendBtn    = document.getElementById('chat-send-btn');

let activeConvId   = null;   // currently open conversation ID
let chatDomain     = null;   // currently selected domain
let chatBusy       = false;  // prevents double-sends

// ── Domain selector ───────────────────────────────────────────────────────────
async function loadChatDomains() {
  const res = await fetch('/api/domains');
  const { domains } = await res.json();
  chatDomainEl.innerHTML = domains
    .map(d => `<option value="${d}">${formatDomain(d)}</option>`)
    .join('');
  if (domains.length) {
    chatDomain = domains[0];
    await refreshConversationList();
  }
}

chatDomainEl.addEventListener('change', async () => {
  chatDomain = chatDomainEl.value;
  activeConvId = null;
  showChatEmpty();
  await refreshConversationList();
});

// ── Conversation list ─────────────────────────────────────────────────────────
async function refreshConversationList() {
  if (!chatDomain) return;
  const res = await fetch(`/api/chat/${chatDomain}`);
  const { conversations } = await res.json();

  if (conversations.length === 0) {
    convListEl.innerHTML = `<div class="conv-empty">No conversations yet.<br>Start a new chat above.</div>`;
    return;
  }

  convListEl.innerHTML = conversations.map(c => `
    <div class="conv-item${c.id === activeConvId ? ' active' : ''}" data-id="${escHtml(c.id)}">
      <span class="conv-title">${escHtml(c.title)}</span>
      <span class="conv-count">${Math.floor(c.messageCount / 2)} msg${Math.floor(c.messageCount / 2) !== 1 ? 's' : ''}</span>
      <button class="conv-delete" data-id="${escHtml(c.id)}" title="Delete">✕</button>
    </div>
  `).join('');

  convListEl.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', () => openConversation(el.dataset.id));
  });

  convListEl.querySelectorAll('.conv-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await deleteConversation(btn.dataset.id);
    });
  });
}

async function openConversation(id) {
  if (id === activeConvId) return;
  activeConvId = id;

  const res = await fetch(`/api/chat/${chatDomain}/${id}`);
  if (!res.ok) return;
  const conv = await res.json();

  renderThread(conv.messages);
  highlightActiveConv(id);
}

function highlightActiveConv(id) {
  convListEl.querySelectorAll('.conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

async function deleteConversation(id) {
  await fetch(`/api/chat/${chatDomain}/${id}`, { method: 'DELETE' });
  if (id === activeConvId) {
    activeConvId = null;
    showChatEmpty();
  }
  await refreshConversationList();
}

// ── Thread rendering ──────────────────────────────────────────────────────────
function showChatEmpty() {
  showEl(chatEmptyEl);
  hideEl(chatThreadEl);
  chatThreadEl.innerHTML = '';
}

function renderThread(messages) {
  hideEl(chatEmptyEl);
  showEl(chatThreadEl);
  chatThreadEl.innerHTML = '';
  for (const msg of messages) appendMessage(msg.role, msg.content, msg.citations || []);
  chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
}

function appendMessage(role, content, citations = []) {
  hideEl(chatEmptyEl);
  showEl(chatThreadEl);

  const formatted = escHtml(content).replace(
    /\[source:\s*([^\]]+)\]/g,
    (_, p) => `<span class="citation-tag">[source: ${escHtml(p)}]</span>`
  );

  const citHtml = citations.length
    ? `<div class="chat-citations">${citations.map(c =>
        `<span class="citation-tag">${escHtml(c)}</span>`).join('')}</div>`
    : '';

  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="chat-bubble">${formatted}</div>
    ${citHtml}
  `;
  chatThreadEl.appendChild(div);
  chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
}

function appendSpinner() {
  const div = document.createElement('div');
  div.id = 'chat-thinking';
  div.className = 'chat-msg assistant';
  div.innerHTML = `<div class="chat-spinner"><span class="spinner"></span><span>Thinking…</span></div>`;
  chatThreadEl.appendChild(div);
  chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
  return div;
}

// ── Send message ──────────────────────────────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  activeConvId = null;
  showChatEmpty();
  highlightActiveConv(null);
  chatInputEl.focus();
});

chatInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    chatSendBtn.click();
  }
});

// Auto-grow textarea
chatInputEl.addEventListener('input', () => {
  chatInputEl.style.height = 'auto';
  chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 160) + 'px';
});

chatSendBtn.addEventListener('click', async () => {
  if (chatBusy) return;
  const message = chatInputEl.value.trim();
  if (!message || !chatDomain) return;

  chatBusy = true;
  chatSendBtn.disabled = true;
  chatInputEl.value = '';
  chatInputEl.style.height = 'auto';

  appendMessage('user', message);
  const spinner = appendSpinner();

  try {
    const res = await fetch(`/api/chat/${chatDomain}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId: activeConvId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chat failed');

    spinner.remove();
    appendMessage('assistant', data.answer, data.citations);

    if (data.conversationId && data.conversationId !== activeConvId) {
      activeConvId = data.conversationId;
      await refreshConversationList();
    }
  } catch (err) {
    spinner.remove();
    appendMessage('assistant', `Error: ${err.message}`);
  } finally {
    chatBusy = false;
    chatSendBtn.disabled = false;
    chatInputEl.focus();
  }
});

// ── WIKI TAB ──────────────────────────────────────────────────────────────────
const wikiLoadBtn = document.getElementById('wiki-load-btn');
const wikiBrowser = document.getElementById('wiki-browser');
const wikiSidebar = document.getElementById('wiki-sidebar');
const wikiContent = document.getElementById('wiki-content');
const wikiEmpty = document.getElementById('wiki-empty');

wikiLoadBtn.addEventListener('click', loadWiki);

async function loadWiki() {
  const domain = document.getElementById('wiki-domain').value;
  wikiLoadBtn.disabled = true;
  hideEl(wikiBrowser);
  hideEl(wikiEmpty);

  try {
    const res = await fetch(`/api/wiki/${domain}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (data.pages.length === 0) {
      showEl(wikiEmpty);
    } else {
      renderWikiSidebar(data.pages);
      showEl(wikiBrowser);
    }
  } catch (err) {
    alert(err.message);
  } finally {
    wikiLoadBtn.disabled = false;
  }
}

function renderWikiSidebar(pages) {
  // Group by folder
  const groups = {};
  for (const page of pages) {
    const parts = page.path.split('/');
    const group = parts.length > 1 ? parts[0] : 'root';
    if (!groups[group]) groups[group] = [];
    groups[group].push(page);
  }

  wikiSidebar.innerHTML = Object.entries(groups).map(([group, items]) => `
    <div class="wiki-group-label">${group}</div>
    ${items.map((p, i) => {
      const name = p.path.split('/').pop().replace('.md', '');
      return `<div class="wiki-page-link" data-path="${escHtml(p.path)}">${escHtml(name)}</div>`;
    }).join('')}
  `).join('');

  wikiSidebar.querySelectorAll('.wiki-page-link').forEach(link => {
    link.addEventListener('click', () => {
      wikiSidebar.querySelectorAll('.wiki-page-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const page = pages.find(p => p.path === link.dataset.path);
      if (page) renderMarkdown(page.content);
    });
  });

  // Auto-select first
  const first = wikiSidebar.querySelector('.wiki-page-link');
  if (first) first.click();
}

function renderMarkdown(md) {
  // Lightweight markdown renderer (no external deps)
  let html = escHtml(md)
    // headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // bold/italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // wiki links
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="citation-tag">$1</span>')
    // bullet lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // horizontal rule
    .replace(/^---$/gm, '<hr style="border-color:var(--border);margin:14px 0"/>')
    // table rows (basic)
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    // paragraphs
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hltup])(.+)$/gm, '$1');

  // Wrap orphan li tags
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  wikiContent.innerHTML = `<p>${html}</p>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showEl(el) { el.classList.remove('hidden'); }
function hideEl(el) { el.classList.add('hidden'); }

function showStatus(el, type, msg) {
  el.className = `status ${type}`;
  el.innerHTML = type === 'loading'
    ? `<span class="spinner"></span><span>${escHtml(msg)}</span>`
    : escHtml(msg);
  showEl(el);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadDomains();
loadChatDomains();
