#!/usr/bin/env node
/**
 * Becker Drupal MCP Server
 * Exposes Drupal 10 (dev.becker.com) as MCP tools for Claude.
 *
 * Usage: node src/drupal-mcp-server.js
 * Or add to claude_desktop_config.json (see README)
 *
 * Requires env vars (or .env):
 *   DRUPAL_BASE_URL   https://www.dev.becker.com
 *   DRUPAL_USER       sam.chaudhary@colibrigroup.com
 *   DRUPAL_PASS       <password>
 *   RFI_FORM_URL      https://becker-rfi-agent-production.up.railway.app  (iframe src)
 */

require('dotenv').config();
const readline = require('readline');

const BASE   = process.env.DRUPAL_BASE_URL || 'https://www.dev.becker.com';
const USER   = process.env.DRUPAL_USER     || 'sam.chaudhary@colibrigroup.com';
const PASS   = process.env.DRUPAL_PASS     || '';
const FORM_URL = process.env.RFI_FORM_URL  || 'https://becker-rfi-agent-production.up.railway.app';

const AUTH = Buffer.from(`${USER}:${PASS}`).toString('base64');

// ─── Drupal API helpers ───────────────────────────────────────────────────────

let _session = null; // { cookie, csrf }

async function getSession() {
  if (_session) return _session;
  const r = await fetch(`${BASE}/user/login?_format=json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: USER, pass: PASS }),
  });
  if (!r.ok) {
    // Fall back to basic auth session token
    const csrf = await fetch(`${BASE}/session/token`, { headers: { Authorization: `Basic ${AUTH}` } }).then(r => r.text());
    _session = { cookie: null, csrf: csrf.trim(), basic: true };
    return _session;
  }
  const data = await r.json();
  _session = { cookie: r.headers.get('set-cookie'), csrf: data.csrf_token, basic: false };
  return _session;
}

async function jsonapi(path, method = 'GET', body = null) {
  const session = await getSession();
  const headers = {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  };

  if (session.basic) {
    headers['Authorization'] = `Basic ${AUTH}`;
  } else {
    headers['Cookie'] = session.cookie;
  }

  if (method !== 'GET') {
    headers['X-CSRF-Token'] = session.csrf;
  }

  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await r.text();
  if (!r.ok) {
    const err = (() => { try { return JSON.parse(text); } catch { return text; } })();
    const detail = err?.errors?.[0]?.detail || (typeof err === 'string' ? err.slice(0, 300) : JSON.stringify(err).slice(0, 300));
    if (r.status === 405 && detail.includes('read operations')) {
      throw new Error('WRITE_DISABLED: JSON:API is read-only. Ask Diogo to go to /admin/config/services/jsonapi and check "Allow all JSON:API create, read, update, and delete operations."');
    }
    throw new Error(`${r.status}: ${detail}`);
  }

  return text ? JSON.parse(text) : null;
}

// ─── Tool implementations ─────────────────────────────────────────────────────

const TOOLS = {

  drupal_get_page: {
    description: 'Get a Drupal page by its URL path alias (e.g. /contact-us) or node UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'URL path alias like /contact-us, or UUID' },
      },
      required: ['path'],
    },
    async run({ path }) {
      const isUuid = /^[0-9a-f-]{36}$/.test(path);
      let data;
      if (isUuid) {
        data = await jsonapi(`/jsonapi/node/page/${path}`);
        return formatNode(data.data);
      }
      // Search by title or path
      const title = path.replace(/^\//, '').replace(/-/g, ' ');
      const pages = await jsonapi(`/jsonapi/node/page?filter[title]=${encodeURIComponent(title)}&page[limit]=5`);
      const match = pages.data?.find(n => n.attributes.path?.alias === path || n.attributes.path?.alias?.toLowerCase() === path.toLowerCase());
      const node = match || pages.data?.[0];
      if (!node) return { found: false, searched: path };
      return formatNode(node);
    },
  },

  drupal_list_pages: {
    description: 'List published pages on the Drupal site.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
        search: { type: 'string', description: 'Filter by title keyword' },
      },
    },
    async run({ limit = 20, search } = {}) {
      const filter = search ? `&filter[title]=${encodeURIComponent(search)}` : '';
      const d = await jsonapi(`/jsonapi/node/page?filter[status]=true${filter}&page[limit]=${limit}&fields[node--page]=title,path,status,changed`);
      return d.data?.map(n => ({
        id: n.id,
        nid: n.attributes.drupal_internal__nid,
        title: n.attributes.title,
        path: n.attributes.path?.alias,
        changed: n.attributes.changed,
      }));
    },
  },

  drupal_update_page_body: {
    description: 'Update the body/content of a Drupal page. Use format "full_html" to allow iframe embeds.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string', description: 'Node UUID (get from drupal_get_page)' },
        body_html: { type: 'string', description: 'HTML content for the body field' },
        format: { type: 'string', description: 'Text format: full_html, basic_html, headline. Default: full_html' },
      },
      required: ['uuid', 'body_html'],
    },
    async run({ uuid, body_html, format = 'full_html' }) {
      const payload = {
        data: {
          type: 'node--page',
          id: uuid,
          attributes: {
            body: { value: body_html, format },
            moderation_state: 'published',
          },
        },
      };
      const r = await jsonapi(`/jsonapi/node/page/${uuid}`, 'PATCH', payload);
      return {
        success: true,
        id: r.data.id,
        title: r.data.attributes.title,
        path: r.data.attributes.path?.alias,
        body_format: r.data.attributes.body?.format,
      };
    },
  },

  drupal_embed_rfi_form: {
    description: 'Embeds the Becker RFI contact form iframe into the /contact-us page. This is the one-click deployment action.',
    inputSchema: {
      type: 'object',
      properties: {
        form_url: { type: 'string', description: 'URL of the hosted RFI form (defaults to Railway URL from env)' },
        height: { type: 'number', description: 'iframe height in px (default 850)' },
        include_intro: { type: 'boolean', description: 'Keep existing headline text above the iframe (default true)' },
      },
    },
    async run({ form_url = FORM_URL, height = 850, include_intro = true } = {}) {
      // 1. Get the current contact-us page
      const pages = await jsonapi(`/jsonapi/node/page?filter[title]=Contact%20Us&page[limit]=3`);
      const node = pages.data?.find(n => n.attributes.path?.alias === '/contact-us');
      if (!node) throw new Error('Contact Us page not found at /contact-us');

      const uuid = node.id;
      const existingBody = node.attributes.body?.value || '';

      // 2. Build the new body
      const iframe = `<div class="rfi-form-container" style="width:100%;margin:0 auto;">
  <iframe
    src="${form_url}"
    width="100%"
    height="${height}"
    frameborder="0"
    style="border:none;width:100%;min-height:${height}px;display:block;"
    title="Becker Contact Us Form"
    allow="payment"
    loading="lazy">
  </iframe>
</div>`;

      const body_html = include_intro && existingBody && !existingBody.includes('<iframe')
        ? `<p>${existingBody}</p>\n${iframe}`
        : iframe;

      // 3. PATCH the node
      const payload = {
        data: {
          type: 'node--page',
          id: uuid,
          attributes: {
            body: { value: body_html, format: 'full_html' },
            moderation_state: 'published',
          },
        },
      };

      const r = await jsonapi(`/jsonapi/node/page/${uuid}`, 'PATCH', payload);
      return {
        success: true,
        message: `RFI form embedded at ${BASE}/contact-us`,
        node_id: r.data.id,
        nid: r.data.attributes.drupal_internal__nid,
        path: r.data.attributes.path?.alias,
        form_url,
        iframe_height: height,
        preview_url: `${BASE}/contact-us`,
      };
    },
  },

  drupal_create_block: {
    description: 'Create a custom block content entity with HTML body (for iframe embeds, rich text, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Admin label for the block' },
        html: { type: 'string', description: 'HTML content of the block body' },
        block_type: { type: 'string', description: 'Block bundle type. Default: component_richtext' },
        format: { type: 'string', description: 'Text format. Default: full_html' },
      },
      required: ['label', 'html'],
    },
    async run({ label, html, block_type = 'component_richtext', format = 'full_html' }) {
      const payload = {
        data: {
          type: `block_content--${block_type}`,
          attributes: {
            info: label,
            status: true,
            body: { value: html, format },
          },
        },
      };
      const r = await jsonapi(`/jsonapi/block_content/${block_type}`, 'POST', payload);
      return {
        success: true,
        uuid: r.data.id,
        label,
        block_type,
        next_step: 'Use drupal_place_block with this UUID to make it visible on a page',
      };
    },
  },

  drupal_get_contact_us: {
    description: 'Get the current state of the /contact-us page — body content, metadata, and whether the RFI form is already embedded.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const pages = await jsonapi('/jsonapi/node/page?filter[title]=Contact%20Us&page[limit]=3');
      const node = pages.data?.find(n => n.attributes.path?.alias === '/contact-us');
      if (!node) return { found: false };
      const body = node.attributes.body?.value || '';
      return {
        found: true,
        uuid: node.id,
        nid: node.attributes.drupal_internal__nid,
        title: node.attributes.title,
        path: node.attributes.path?.alias,
        body_format: node.attributes.body?.format,
        body_preview: body.slice(0, 300),
        rfi_form_embedded: body.includes('<iframe') || body.includes(FORM_URL),
        last_changed: node.attributes.changed,
        preview_url: `${BASE}/contact-us`,
      };
    },
  },

  drupal_list_block_types: {
    description: 'List all available block content types on the Drupal site.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const d = await jsonapi('/jsonapi');
      const blockTypes = Object.keys(d.links || {})
        .filter(k => k.startsWith('block_content--'))
        .map(k => k.replace('block_content--', ''));
      return { block_content_types: blockTypes };
    },
  },

  drupal_site_overview: {
    description: 'Get a high-level overview of the Drupal site: page count, key pages, available content types.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const [pages, nodeTypes, paraTypes] = await Promise.all([
        jsonapi('/jsonapi/node/page?filter[status]=true&page[limit]=5&fields[node--page]=title,path'),
        jsonapi('/jsonapi/node_type/node_type?page[limit]=20'),
        jsonapi('/jsonapi/paragraphs_type/paragraphs_type?page[limit]=50'),
      ]);

      return {
        drupal_version: 10,
        base_url: BASE,
        environment: 'dev (Acquia)',
        node_types: nodeTypes.data?.map(t => t.attributes.name || t.id),
        paragraph_types_count: paraTypes.data?.length,
        sample_pages: pages.data?.map(p => ({
          title: p.attributes.title,
          path: p.attributes.path?.alias,
        })),
        jsonapi_write_enabled: false,
        write_enabled_instructions: 'Diogo: go to /admin/config/services/jsonapi → check "Allow all JSON:API create, read, update, and delete operations" → Save',
      };
    },
  },
};

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatNode(n) {
  const a = n.attributes;
  return {
    uuid: n.id,
    nid: a.drupal_internal__nid,
    title: a.title,
    path: a.path?.alias,
    status: a.status ? 'published' : 'unpublished',
    body_format: a.body?.format,
    body_preview: (a.body?.value || '').slice(0, 400),
    rfi_form_embedded: (a.body?.value || '').includes('<iframe'),
    changed: a.changed,
  };
}

// ─── MCP stdio protocol ───────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { id, method, params } = msg;

  try {
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'becker-drupal-mcp', version: '1.0.0' },
      }});
      return;
    }

    if (method === 'notifications/initialized') return;

    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }});
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const tool = TOOLS[name];
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      const result = await tool.run(args || {});
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }});
      return;
    }

    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });

  } catch (err) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});
