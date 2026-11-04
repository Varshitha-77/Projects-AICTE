# 📚 Library AI Agent

> **AICTE Problem Statement No.21** — An intelligent library assistant powered by **IBM Granite** (watsonx.ai)

---

## Overview

The Library AI Agent helps students find learning materials, check book availability, get personalized recommendations aligned with their courses, and manage reservations — all through natural language conversation.

```
Student Query  →  Guardrails  →  Intent Classifier  →  DB Lookup  →  IBM Granite  →  Sanitized Response
```

---

## Architecture

```
aicte-library-agent/
├── src/
│   ├── server.js       # Express REST API + routing
│   ├── agent.js        # Core agent pipeline orchestrator
│   ├── granite.js      # IBM Granite / watsonx.ai integration
│   ├── guardrails.js   # Input/output safety & guardrails
│   ├── auth.js         # Authentication & authorization
│   ├── database.js     # Library database operations
│   └── logger.js       # Winston structured logging
├── public/
│   └── index.html      # Web UI (dark-theme chat interface)
├── data/
│   └── library_db.json # Library database (books, students, borrows)
├── tests/
│   └── test-agent.js   # Test suite (no IBM API key required)
├── logs/               # Runtime logs (auto-created)
├── .env                # Environment configuration
└── package.json
```

---

## IBM Cloud Setup

### Step 1 — Create an IBM Cloud Lite account
1. Go to [https://cloud.ibm.com/registration](https://cloud.ibm.com/registration)
2. Register for a **free Lite account**

### Step 2 — Create an API Key
1. Navigate to **Manage → Access (IAM) → API keys**
2. Click **Create an IBM Cloud API key**
3. Copy the key — you'll only see it once

### Step 3 — Set up watsonx.ai
1. Search for **"watsonx.ai"** in the IBM Cloud catalog
2. Create a **Lite plan** instance in `us-south`
3. Open the instance → Go to **Projects → New Project**
4. Copy the **Project ID** from Manage → General

### Step 4 — Configure `.env`
```bash
IBM_API_KEY=<your IBM Cloud API key>
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_PROJECT_ID=<your watsonx.ai project ID>
GRANITE_MODEL_ID=ibm/granite-13b-chat-v2
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Run tests (no IBM API key needed)
npm test

# Start the server
npm start
# or for development with auto-reload:
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Demo Credentials

| Roll Number | PIN  | Department       |
|-------------|------|-----------------|
| CS2021001   | 1234 | Computer Science |
| DS2022045   | 5678 | Data Science     |
| EC2021078   | 9012 | Electronics      |

---

## API Reference

| Method | Endpoint              | Description                        | Auth Required |
|--------|-----------------------|------------------------------------|---------------|
| GET    | `/api/health`         | Server health check                | No            |
| POST   | `/api/auth/login`     | Student login                      | No            |
| POST   | `/api/auth/logout`    | Logout                             | No            |
| GET    | `/api/auth/me`        | Get authenticated student profile  | Yes           |
| POST   | `/api/chat`           | Send query to AI agent             | Optional      |
| DELETE | `/api/chat/:convId`   | Clear conversation history         | No            |
| GET    | `/api/books`          | List/search books                  | No            |
| GET    | `/api/books/:id`      | Get book details + availability    | No            |
| POST   | `/api/reservations`   | Reserve a book                     | Yes           |
| GET    | `/api/reservations`   | Get my reservations                | Yes           |
| GET    | `/api/my/borrows`     | Get my active borrows              | Yes           |

---

## Guardrails

The agent enforces 10 guardrails at every step:

| # | Guardrail            | Implementation |
|---|----------------------|----------------|
| 1 | Relevant responses   | Scope checker with out-of-scope pattern matching |
| 2 | Accuracy             | Responses grounded in real DB data — no hallucinations |
| 3 | Book availability    | Live DB check before every availability response |
| 4 | Data privacy         | Privacy risk pattern detector + PII output sanitization |
| 5 | Authentication       | JWT-style session required for personal records |
| 6 | Authorization        | Role-based access (student / admin) |
| 7 | Prompt injection     | 10+ regex patterns detect and block injection attempts |
| 8 | Recommendations      | Filtered by student's enrolled courses |
| 9 | Uncertainty handling | Fallback responses when data is unavailable |
| 10| Safe responses       | Professional tone enforced via system prompt |

---

## IBM Granite Model Details

- **Default model**: `ibm/granite-13b-chat-v2`
- **Available alternatives**: `ibm/granite-3-8b-instruct`, `ibm/granite-20b-multilingual`
- **Temperature**: 0.3 (conservative — factual, consistent responses)
- **Max tokens**: 800 per response
- **Auth**: IAM API Key (IBM Cloud Lite — free tier)

---

## Technology Stack

| Component       | Technology                      |
|-----------------|---------------------------------|
| AI Model        | IBM Granite (watsonx.ai)        |
| Backend         | Node.js + Express               |
| Authentication  | bcryptjs + in-memory sessions   |
| Database        | JSON file (production: PostgreSQL/MongoDB) |
| Logging         | Winston                         |
| Security        | Helmet, CORS, Rate limiting     |
| Frontend        | Vanilla HTML/CSS/JS             |

---

## License

MIT — AICTE Internship Project
