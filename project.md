# CA Firm CRM

**Live:** https://ca-0s.vercel.app  ·  **Code:** https://github.com/kansalakshat/CA

## What it is

CA Firm CRM is a web app that helps Chartered Accountant firms run their daily work in one place: clients, invoices and fees, GST and other filings, client documents, new enquiries, team tasks, and client questions.

Any CA firm can sign up and get its own private workspace. A firm's data is visible only to that firm's team.

Optionally, it connects to **n8n** (an automation tool) to send reminders by email, WhatsApp and AI voice calls automatically, and to answer client questions with an AI agent.

## Who it is for

| Person | What they do |
|---|---|
| **Partner** (firm owner / admin) | Signs up the firm, adds the team, approves big invoices, manages settings |
| **Staff** (team member) | Day-to-day work: clients, invoices, documents, filings, leads, tasks, chat |

## Getting started

### A new firm
1. Open the site and click **Sign up your firm**, or **Continue with Google**.
2. With email and password: enter firm name, your name, email and password, then click the confirmation link that arrives by email.
3. With Google: pick your Google account, then type your firm name.
4. You are now the firm's **partner**. A one-time **Set up your firm** screen asks for the firm's phone/WhatsApp number and email (or click **Skip for now**). They appear at the end of the WhatsApp and email reminders you send to clients.

### Joining an existing firm
You can't join a firm by yourself. Ask your firm's partner to add you in **Settings → Team Users**. They set a starting password and share it with you. You can change it in Settings after logging in.

### Logging in
Use your email and password, or **Continue with Google** if your Google account uses the same email.

## The screens

### Dashboard
A one-page overview: total clients, pending deadlines, fees collected this month, fees still pending, upcoming filing deadlines, automation activity, the lead pipeline, and recently added clients.

### Clients
Your client list with PAN/GSTIN, contact details, services (GST, ITR, TDS, ROC, Audit, Bookkeeping), pending documents, and money outstanding.
**Add a client:** the **+ New client** button (top right, on every screen).

### Invoice & Fees
- **Create an invoice:** **+ New invoice** → client, service, amount before GST, GST rate, days to pay. GST and the total are calculated for you, and invoice numbers (INV-2026-001, 002, ...) are assigned per firm.
- **Big invoices:** above ₹50,000 (including GST), an invoice waits for a partner to click **Approve** before it goes to the client.
- **Reminders:** the green WhatsApp button opens WhatsApp with a ready-written message, the envelope opens your email app, the phone starts a call.
- **Paid:** click **Paid** when the money arrives.
- **Status** follows how late an invoice is: 1 to 7 days gentle reminder, 8 to 15 firm reminder, 16 to 30 final notice, 30+ escalated to partner.

### Document Hub
For each client, the documents you need from them (Form 16, bank statement, purchase bills...).
- **Request a document:** type its name under the client and click **Request**.
- **Update status:** click a document to cycle **Missing → Pending Verify → Received**.
- **Remind the client:** WhatsApp or Email buttons. After 3 reminders, a "call the client" task is created automatically.
- **Filters** show clients with missing documents, documents waiting for checking, or complete sets.

### Compliance
GST, TDS, ITR and ROC returns per client, grouped by due date and coloured by urgency.
- **Add a return:** **+ Add filing** → client, return type, period, due date.
- **Fill in the figures:** tick **Data received** when the client's data arrives, then enter output tax and input tax credit. **Net payable** is calculated, or shown as ITC carried forward.
- **Mark filed:** click **Filed**. Filed returns move to "Recently filed" (the undo arrow reverses it).

### Lead Pipeline
New enquiries as cards in four columns: **New Enquiry → Qualifying → Proposal Sent → Won**.
**Add a lead:** **+ Add lead** with name, service, source, expected value and score. Move a card with the **←** and **→** buttons.

### Tasks
The team's to-do list: add a task, link a client, assign a person, set a due date and priority, tick it when done. Filter by open, assigned to me, done, or all.
Some tasks appear on their own:
- **From chat:** a client question the AI couldn't answer.
- **From documents:** a client reminded 3 times who still hasn't sent their documents.

### AI Support Agent
A chat window per client. Type the client's question and the agent replies:
- **Without n8n:** basic answers (GSTR-1 and GSTR-3B due dates, fee guidance, the status of any invoice number you mention).
- **With n8n:** n8n's AI agent answers in Hindi, English or Hinglish.

Questions the agent can't handle are marked **Escalated to CA** and become tasks. The side panel shows the auto-resolve rate, response time, monthly volume and the most common question topics.

### Reports
Billed vs collected for the last 6 months, on-time filing rate, share of documents received, lead conversion, average days clients take to pay, clients by service, and pipeline value by stage.

### Settings
- **Firm & n8n** (partners): firm name, firm phone/WhatsApp and email (shown in client reminders), and the n8n webhook address.
- **Team Users:** see the team. Partners can add or remove people and choose Partner or Staff.
- **Password:** change it, or set one if you only use Google.

### Everywhere
- **Search** (top bar): find clients, invoices, tasks and leads by name, PAN, GSTIN, phone or invoice number.
- **Bell** (top bar): invoices waiting for your approval, invoices 30+ days overdue, filings due within 7 days, and tasks due today.
- **Logout:** bottom left.

## Automations with n8n (optional)

The file `n8n/n8n-workflow.json` is a ready-made n8n workflow with 5 automations. They read and update this CRM using your firm's API key, which is kept in the database (Supabase → `firms` table) and not shown in the app:

| Automation | When | What it does |
|---|---|---|
| 1. Invoice | When you create or approve an invoice | Emails and WhatsApps the invoice to the client; above ₹50,000 asks the partner first |
| 2. Payment recovery | Daily, 10:00 | Overdue invoices get email, WhatsApp and an AI voice call, more firmly as days pass; 30+ days goes to the partner |
| 3. GST compliance | 1st of each month | Data received: sends the net GST summary. Data missing: asks the client for sales and purchase registers |
| 4. Document chase | Mondays, 10:00 | Reminds clients about missing documents; after 3 reminders alerts the team to call |
| 5. AI support | Any time | One AI agent answers clients on web chat, WhatsApp and voice, and can look up invoice status |

To set it up, see "Connecting n8n" in `README.md`. You'll need n8n plus Gmail, WhatsApp Business, Sarvam (voice) and OpenAI accounts for the parts you want.

## Security and privacy

- **Isolation:** each firm sees only its own data. Every database query is limited to the logged-in user's firm, and automated tests check that one firm can't read or change another's.
- **Passwords** are stored as salted scrypt hashes, never as plain text.
- **Lockouts:** 10 wrong passwords block that network for 15 minutes, and sign-ups are limited to 10 attempts per hour per network.
- **Email:** new email sign-ups must confirm their address before logging in.
- **Database:** data is in Supabase (Postgres) with Row Level Security switched on, so Supabase's public API can't read it.

## How it is built (for developers)

| Part | Technology | Where |
|---|---|---|
| Frontend | React + Vite | `client/src/` (one file per screen in `views/`) |
| Backend | Node.js (built-in `http`), no framework | `server.js`; on Vercel via `api/index.js` |
| Database | Supabase Postgres | `db/schema.sql` |
| Email | Any SMTP service (Gmail now) | `nodemailer` |
| Hosting | Vercel (frontend + serverless API, Mumbai region) | `vercel.json` |
| Tests | Whole API against an in-memory Postgres | `test.js` (`npm test`) |

Setup, commands and environment variables are in **`README.md`**.

## Not built yet

- **"Forgot password" by email:** for now a partner can remove and re-add a teammate.
- **Invite emails** for new team members: the partner shares a starting password instead.
- **Uploading document files:** the Document Hub tracks status, not the files themselves.
- **Billing or plans** for firms.
- **Editing or deleting clients, invoices and filings** after they're created.
