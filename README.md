# MotherSMM AI Chatbot — Vercel Deployment

## File Structure
```
smm-chatbot/
├── api/chat.js         ← Edge Function: all API routes + Claude AI + SMM API
├── public/widget.js    ← Embeddable widget (add to website)
├── admin/index.html    ← Admin panel (open in browser)
├── vercel.json         ← Routes all /api/* to chat.js
└── package.json
```

## Quick Deploy

```bash
npm install -g vercel
vercel login
vercel --prod
```

## Required Environment Variables (Vercel Dashboard → Settings → Env Vars)

| Variable | Required | Example |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | `sk-ant-api03-...` |
| `SMM_API_KEY` | ✅ | your MotherSMM admin API key |
| `ADMIN_PASSWORD` | ✅ | `MySecurePassword123` |

## Optional Environment Variables

| Variable | Default |
|---|---|
| `BOT_NAME` | MotherSMM AI Assistant |
| `SITE_NAME` | MotherSMM |
| `WIDGET_COLOR` | #7C3AED |
| `AVATAR_EMOJI` | 🤖 |
| `SUGGESTIONS` | Check order,Payment history,Support tickets,Instagram followers price |
| `CUSTOM_INSTRUCTIONS` | (empty) |
| `ALLOWED_ORIGINS` | * |

## Website Embed

```html
<script src="https://YOUR-URL.vercel.app/widget.js"></script>
```
Add before `</body>` on your site.

## Admin Panel
Open: `https://YOUR-URL.vercel.app/admin/`

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings` | Widget config (public) |
| POST | `/api/chat` | Send message, get AI reply |
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/settings` | Get all settings |
| POST | `/api/admin/settings` | Save settings |

## Tools Available to AI

- `getOrder(order_id)` — status, charge, link, remains
- `listOrders({user, status, limit})` — recent orders
- `getPayments({username, status, limit})` — payment history
- `getTicket(ticket_id)` — full ticket + messages
- `listTickets({user, status})` — ticket list
- `createTicket({username, subject, message})` — open new ticket
- `replyTicket({ticket_id, message})` — reply to ticket
- `getUser({username})` — balance, status, custom rates
- `getServicePricing({query})` — search services with price/1000
- `calculateOrderCost({service_id, quantity})` — cost estimate
