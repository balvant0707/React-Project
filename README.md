# React Business Platform

Modular platform for COMPASS and RADAR (NPM tool). See `CLAUDE.md` for the layout and commands and `docs/architecture.md` for the design.

```bash
npm install
npm run dev:compass   # http://localhost:5273
npm run dev:npm       # http://localhost:5274
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `apps/<app>/.env.local` (see `.env.example`).
