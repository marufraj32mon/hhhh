// api/chat.js — MotherSMM AI Chatbot Backend (Vercel Edge Function)
// Env vars needed: ANTHROPIC_API_KEY, SMM_API_KEY, ADMIN_PASSWORD
// Optional: BOT_NAME, SITE_NAME, WIDGET_COLOR, ALLOWED_ORIGINS

export const config = { runtime: 'edge' };

const SMM_BASE = 'https://mothersmm.com/adminapi/v2';

// ═══════════════════════════════════════════════════════════
// SMM API LAYER
// ═══════════════════════════════════════════════════════════

function smmHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.SMM_API_KEY || '',
  };
}

async function smmGet(path, params = {}) {
  const url = new URL(SMM_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { headers: smmHeaders() });
  if (!res.ok) return { error: `SMM API error ${res.status}`, error_code: res.status };
  return res.json();
}

async function smmPost(path, body) {
  const res = await fetch(SMM_BASE + path, {
    method: 'POST',
    headers: smmHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: `SMM API error ${res.status}`, error_code: res.status };
  return res.json();
}

// ═══════════════════════════════════════════════════════════
// TOOL DEFINITIONS (Claude sees these)
// ═══════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: 'getOrder',
    description: 'Fetch full details of a single order by ID: status, charge, link, remains, service name, created date, available actions.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'integer', description: 'The numeric order ID' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'listOrders',
    description: 'List recent orders. Filter by username, order status, or date range. Returns id, status, service_name, charge, remains, link, created.',
    input_schema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Filter by username' },
        order_status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'processing', 'completed', 'partial', 'canceled', 'error', 'fail'],
        },
        created_from: { type: 'integer', description: 'UNIX timestamp lower bound' },
        created_to: { type: 'integer', description: 'UNIX timestamp upper bound' },
        limit: { type: 'integer', description: 'Max results 1-100, default 10' },
      },
    },
  },
  {
    name: 'getPayments',
    description: 'Get payment / transaction history for a user. Filter by username, email, or payment status.',
    input_schema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Filter by username' },
        user_email: { type: 'string', description: 'Filter by email' },
        payment_status: {
          type: 'string',
          enum: ['waiting', 'completed', 'pending', 'fail', 'expired', 'hold', 'underpaid'],
        },
        limit: { type: 'integer', description: 'Max results, default 10' },
      },
    },
  },
  {
    name: 'getTicket',
    description: 'Get full details of a support ticket including all messages and replies.',
    input_schema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'integer', description: 'The ticket ID' },
      },
      required: ['ticket_id'],
    },
  },
  {
    name: 'listTickets',
    description: 'List support tickets. Filter by username or status.',
    input_schema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Filter by username' },
        status: {
          type: 'string',
          enum: ['pending', 'answered', 'closed', 'locked'],
        },
        limit: { type: 'integer', description: 'Max results, default 10' },
      },
    },
  },
  {
    name: 'createTicket',
    description: 'Create a new support ticket for a user on their behalf.',
    input_schema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username of the user' },
        user_email: { type: 'string', description: 'Email of the user (alternative to username)' },
        subject: { type: 'string', description: 'Ticket subject' },
        message: { type: 'string', description: 'Ticket message body' },
        staff_name: { type: 'string', description: 'Name shown as sender, e.g. "AI Assistant"', default: 'AI Assistant' },
      },
      required: ['subject', 'message'],
    },
  },
  {
    name: 'replyTicket',
    description: 'Reply to an existing support ticket with an admin message.',
    input_schema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'integer', description: 'The ticket ID to reply to' },
        message: { type: 'string', description: 'The reply message' },
        staff_name: { type: 'string', description: 'Staff name shown on reply', default: 'AI Assistant' },
      },
      required: ['ticket_id', 'message'],
    },
  },
  {
    name: 'getUser',
    description: 'Look up a user account by username or email. Returns balance, status, registration date, custom rates.',
    input_schema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username to look up' },
        email: { type: 'string', description: 'Email to look up (alternative)' },
      },
    },
  },
  {
    name: 'getServicePricing',
    description: 'Get list of available SMM services with pricing per 1000 units. Can filter by platform or keyword. Returns service_id, name, category, rate, min, max.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword: platform name like "Instagram", "TikTok", "YouTube", or service type like "followers", "likes", "views"' },
        limit: { type: 'integer', description: 'Max results to return, default 20', default: 20 },
      },
    },
  },
  {
    name: 'calculateOrderCost',
    description: 'Calculate the cost of ordering a specific service for a given quantity using the service rate.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'integer', description: 'Service ID from getServicePricing' },
        quantity: { type: 'integer', description: 'Number of units to order' },
      },
      required: ['service_id', 'quantity'],
    },
  },
];

// ═══════════════════════════════════════════════════════════
// TOOL EXECUTOR
// ═══════════════════════════════════════════════════════════

async function executeTool(name, input) {
  try {
    switch (name) {

      case 'getOrder': {
        const data = await smmGet(`/orders/${input.order_id}`);
        if (data.error_code && data.error_code !== 0) {
          return JSON.stringify({ found: false, message: data.error_message || 'Order not found' });
        }
        const o = data.data || data;
        return JSON.stringify({
          found: true,
          id: o.id,
          status: o.status,
          service_name: o.service_name,
          service_id: o.service_id,
          quantity: o.quantity,
          remains: o.remains,
          charge: o.charge?.formatted || o.charge?.value,
          link: o.link,
          created: o.created,
          last_update: o.last_update,
          mode: o.mode,
          user: o.user,
          can_cancel: o.actions?.request_cancel || o.actions?.cancel_and_refund,
          can_refill: o.actions?.refill,
        });
      }

      case 'listOrders': {
        const data = await smmGet('/orders', {
          user: input.user,
          order_status: input.order_status,
          created_from: input.created_from,
          created_to: input.created_to,
          limit: Math.min(input.limit || 10, 50),
          sort: 'date-desc',
        });
        const list = data.data?.list || [];
        return JSON.stringify({
          total: data.data?.count || list.length,
          orders: list.map(o => ({
            id: o.id,
            status: o.status,
            service_name: o.service_name,
            quantity: o.quantity,
            remains: o.remains,
            charge: o.charge?.formatted || o.charge?.value,
            link: o.link,
            created: o.created,
            user: o.user,
          })),
        });
      }

      case 'getPayments': {
        const data = await smmGet('/payments', {
          username: input.username,
          user_email: input.user_email,
          payment_status: input.payment_status,
          limit: Math.min(input.limit || 10, 50),
          sort: 'created-at-desc',
        });
        const list = data.data?.list || [];
        return JSON.stringify({
          total: data.data?.count || list.length,
          payments: list.map(p => ({
            payment_id: p.payment_id,
            amount: p.amount?.formatted || p.amount?.value,
            method: p.method,
            status: p.status,
            memo: p.memo,
            created: p.created,
            user: p.user?.username,
          })),
        });
      }

      case 'getTicket': {
        const data = await smmGet(`/tickets/${input.ticket_id}`);
        if (data.error_code && data.error_code !== 0) {
          return JSON.stringify({ found: false, message: data.error_message || 'Ticket not found' });
        }
        const t = data.data || data;
        return JSON.stringify({
          found: true,
          id: t.id,
          subject: t.subject,
          status: t.status,
          user: t.user?.username,
          assignee: t.assignee,
          created: t.created,
          last_update: t.last_update,
          messages: (t.messages || []).map(m => ({
            sender: m.sender_name,
            is_staff: m.is_staff,
            message: m.message,
            created: m.created,
          })),
        });
      }

      case 'listTickets': {
        const data = await smmGet('/tickets', {
          user: input.user,
          status: input.status,
          limit: Math.min(input.limit || 10, 50),
        });
        const list = data.data?.list || [];
        return JSON.stringify({
          total: data.data?.count || list.length,
          tickets: list.map(t => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
            user: t.user?.username,
            created: t.created,
            last_update: t.last_update,
            is_read: t.is_read,
          })),
        });
      }

      case 'createTicket': {
        const body = {
          subject: input.subject,
          message: input.message,
          staff_name: input.staff_name || 'AI Assistant',
        };
        if (input.username) body.username = input.username;
        else if (input.user_email) body.user_email = input.user_email;
        const data = await smmPost('/tickets/add', body);
        return JSON.stringify({
          success: !data.error_code || data.error_code === 0,
          ticket_id: data.data?.id,
          message: data.error_message || 'Ticket created successfully',
        });
      }

      case 'replyTicket': {
        const data = await smmPost(`/tickets/${input.ticket_id}/reply`, {
          message: input.message,
          staff_name: input.staff_name || 'AI Assistant',
        });
        return JSON.stringify({
          success: !data.error_code || data.error_code === 0,
          message: data.error_message || 'Reply sent successfully',
        });
      }

      case 'getUser': {
        const params = {};
        if (input.username) params.username = input.username;
        else if (input.email) params.email = input.email;
        const data = await smmGet('/users', { ...params, limit: 1 });
        const list = data.data?.list || [];
        if (!list.length) return JSON.stringify({ found: false, message: 'User not found' });
        const u = list[0];
        return JSON.stringify({
          found: true,
          id: u.id,
          username: u.username,
          email: u.email,
          balance: u.balance?.formatted || u.balance,
          status: u.status,
          registered: u.registered,
          total_spent: u.total_spent?.formatted || u.total_spent,
          total_orders: u.total_orders,
          discount: u.discount?.formatted,
          custom_rates: u.custom_rates?.slice(0, 5),
        });
      }

      case 'getServicePricing': {
        const data = await smmGet('/services');
        let services = data.data || data || [];
        if (!Array.isArray(services)) services = Object.values(services);

        const q = (input.query || '').toLowerCase();
        if (q) {
          services = services.filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.category || '').toLowerCase().includes(q) ||
            (s.type || '').toLowerCase().includes(q)
          );
        }

        return JSON.stringify({
          total: services.length,
          services: services.slice(0, input.limit || 20).map(s => ({
            service_id: s.id || s.service_id,
            name: s.name,
            category: s.category,
            rate_per_1000: s.rate,
            min: s.min,
            max: s.max,
            type: s.type,
            refill: s.refill,
            cancel: s.cancel,
          })),
        });
      }

      case 'calculateOrderCost': {
        // First fetch the service to get rate
        const data = await smmGet('/services');
        let services = data.data || data || [];
        if (!Array.isArray(services)) services = Object.values(services);

        const service = services.find(s =>
          (s.id || s.service_id) === input.service_id
        );

        if (!service) {
          return JSON.stringify({ found: false, message: `Service ID ${input.service_id} not found` });
        }

        const rate = parseFloat(service.rate) || 0;
        const qty = parseInt(input.quantity) || 0;
        const cost = (rate * qty) / 1000;

        return JSON.stringify({
          found: true,
          service_id: input.service_id,
          service_name: service.name,
          category: service.category,
          quantity: qty,
          rate_per_1000: rate,
          estimated_cost: cost.toFixed(4),
          currency: 'USD',
          min_order: service.min,
          max_order: service.max,
          valid: qty >= service.min && qty <= service.max,
          validation_message: qty < service.min
            ? `Minimum order is ${service.min}`
            : qty > service.max
              ? `Maximum order is ${service.max}`
              : 'Valid quantity',
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════

function buildSystemPrompt(settings) {
  return `You are ${settings.botName || 'MotherSMM AI Assistant'}, the intelligent support assistant for ${settings.siteName || 'MotherSMM'} — a leading SMM panel.

PERSONALITY: ${settings.personality || 'Friendly, fast, and professional. Always respond in the same language the user writes in (auto-detect Bengali, English, Arabic, etc).'}

YOUR CAPABILITIES (via tools):
1. Order lookup — getOrder(id) or listOrders({user, status})
2. Payment history — getPayments({username, status})
3. Support tickets — getTicket(id), listTickets({user}), createTicket(...), replyTicket(...)
4. User account info — getUser({username or email})
5. Service pricing — getServicePricing({query}) — search by platform or type
6. Cost calculator — calculateOrderCost({service_id, quantity})

RULES:
- ALWAYS use tools to fetch real data. Never fabricate order/payment details.
- When user mentions an order number, call getOrder immediately.
- When user mentions a username, call getUser to verify account.
- If user asks about "my orders" but gives no username, ask for their username or order ID first.
- Format responses cleanly with emojis and clear structure.
- For sensitive issues (refund disputes, account bans), always offer to create/check a support ticket.
- If a tool returns "not found", apologize and suggest alternatives.
- Keep responses concise but complete.
- Detect user language automatically and reply in that language.

${settings.customInstructions ? 'EXTRA INSTRUCTIONS:\n' + settings.customInstructions : ''}

Today: ${new Date().toUTCString()}`;
}

// ═══════════════════════════════════════════════════════════
// SETTINGS STORE (env-based, admin panel overrides via KV)
// ═══════════════════════════════════════════════════════════

function getDefaultSettings() {
  return {
    botName: process.env.BOT_NAME || 'MotherSMM AI Assistant',
    siteName: process.env.SITE_NAME || 'MotherSMM',
    welcomeMessage: process.env.WELCOME_MSG || '👋 Welcome to MotherSMM AI Assistant!\n\nI can help you with:\n• Order status & history\n• Payment transactions\n• Support tickets\n• Service pricing & cost calculator\n\nJust type your question!',
    widgetColor: process.env.WIDGET_COLOR || '#7C3AED',
    buttonShape: process.env.BUTTON_SHAPE || 'circle',
    avatarEmoji: process.env.AVATAR_EMOJI || '🤖',
    position: 'bottom-right',
    personality: process.env.BOT_PERSONALITY || 'Friendly, fast, and professional. Auto-detect and respond in user\'s language.',
    customInstructions: process.env.CUSTOM_INSTRUCTIONS || '',
    suggestions: (process.env.SUGGESTIONS || 'Check order status,Payment history,Support tickets,Instagram followers price').split(',').map(s => s.trim()),
    staffName: process.env.STAFF_NAME || 'AI Assistant',
  };
}

// ═══════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════

function corsHeaders(origin) {
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const allow = allowed.includes('*') || allowed.includes(origin) ? (origin || '*') : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ═══════════════════════════════════════════════════════════
// ADMIN AUTH
// ═══════════════════════════════════════════════════════════

function isAdmin(req) {
  const auth = (req.headers.get('authorization') || '').replace('Bearer ', '');
  return auth === 'smm-admin-' + (process.env.ADMIN_PASSWORD || 'admin123');
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  // Strip /api prefix for path matching
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';

  // ── GET /settings — public widget config ──────────────────
  if (req.method === 'GET' && path === '/settings') {
    const s = getDefaultSettings();
    return json({
      botName: s.botName,
      siteName: s.siteName,
      welcomeMessage: s.welcomeMessage,
      widgetColor: s.widgetColor,
      buttonShape: s.buttonShape,
      avatarEmoji: s.avatarEmoji,
      position: s.position,
      suggestions: s.suggestions,
    }, 200, cors);
  }

  // ── POST /chat — main AI chat endpoint ────────────────────
  if (req.method === 'POST' && path === '/chat') {
    let body;
    try { body = await req.json(); } catch {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages array required' }, 400, cors);
    }

    const settings = getDefaultSettings();

    // Agentic loop — Claude calls tools, we run them, repeat up to 6 rounds
    let loopMessages = messages.map(m => ({ role: m.role, content: m.content }));
    let finalText = '';

    for (let round = 0; round < 6; round++) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: buildSystemPrompt(settings),
          tools: TOOLS,
          messages: loopMessages,
        }),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        return json({ error: 'AI error', detail: err }, 500, cors);
      }

      const claudeData = await claudeRes.json();

      if (claudeData.stop_reason === 'end_turn') {
        finalText = claudeData.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');
        break;
      }

      if (claudeData.stop_reason === 'tool_use') {
        const toolBlocks = claudeData.content.filter(b => b.type === 'tool_use');
        loopMessages.push({ role: 'assistant', content: claudeData.content });

        // Run all tools in parallel
        const results = await Promise.all(
          toolBlocks.map(async tb => ({
            type: 'tool_result',
            tool_use_id: tb.id,
            content: await executeTool(tb.name, tb.input),
          }))
        );
        loopMessages.push({ role: 'user', content: results });
        continue;
      }

      // Fallback
      finalText = claudeData.content
        ?.filter(b => b.type === 'text').map(b => b.text).join('')
        || 'Sorry, I could not process that.';
      break;
    }

    return json({ reply: finalText }, 200, cors);
  }

  // ── POST /admin/login ─────────────────────────────────────
  if (req.method === 'POST' && path === '/admin/login') {
    const { password } = await req.json().catch(() => ({}));
    if (password === (process.env.ADMIN_PASSWORD || 'admin123')) {
      return json({ token: 'smm-admin-' + (process.env.ADMIN_PASSWORD || 'admin123') }, 200, cors);
    }
    return json({ error: 'Invalid password' }, 401, cors);
  }

  // ── GET /admin/settings ───────────────────────────────────
  if (req.method === 'GET' && path === '/admin/settings') {
    if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401, cors);
    return json(getDefaultSettings(), 200, cors);
  }

  // ── POST /admin/settings — save (echo back; use Vercel KV for persistence) ─
  if (req.method === 'POST' && path === '/admin/settings') {
    if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401, cors);
    const newSettings = await req.json().catch(() => ({}));
    // NOTE: To persist, add Vercel KV: await kv.set('chatbot:settings', newSettings)
    return json({ ok: true, note: 'To persist settings across deployments, add Vercel KV storage and uncomment the kv.set call.', settings: newSettings }, 200, cors);
  }

  return json({ error: 'Not found' }, 404, cors);
}
