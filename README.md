# Assess-to-Intervene Colleague

The app workspace uses Node.js, Express, React and Vite. It is being assembled against the team plan's shared contracts and event protocol.

## Requirements

- Node.js 20+
- npm 10+

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The web app runs at `http://localhost:5173`; the API health check is at `http://localhost:3001/api/health`.

The UI shell is available without model or email credentials. To enable those integrations, fill the relevant values in `.env` locally. Never commit `.env` or send credentials in chat.

## Checks

```powershell
npm test
npm run build
```

Learner records in `data/learners.csv` are fictional. `TEAM_INBOX_1`–`TEAM_INBOX_3` are placeholders and are not valid email destinations.
