# Deploying RBP apps

How a change reaches a live app. Per app: a Supabase project (database, auth, storage, Edge Functions) and a Cloudflare
Pages project (frontend). They deploy separately.

| App | Supabase project | Ref | Pages |
| --- | --- | --- | --- |
| RADAR (`apps/npm`) | NPM | `svxmvwdbyhnnpjxnqgiv` | live since the cutover of 2026-11-14 |
| COMPASS (`apps/compass`) | Wilckens COMPASS | `jnkebwhffuadbrnmxabe` | live since the cutover of 2026-11-15, on its `pages.dev` address (no custom domain yet); built from the mirror repository, see below |

## Where the Supabase CLI is logged in

**The Supabase CLI login lives in WSL2 (Ubuntu), not on Windows.** Run every `supabase` command there. Use the Node path
from CLAUDE.md in non-interactive shells (`export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"`). `supabase projects
list` shows the projects the login can reach; if it fails, `supabase login` again. Database passwords and the service role
key are never put into a chat, a file or a commit: the CLI needs none for the steps below (it logs in with the account), and
anything else is typed at a hidden prompt (`read -rs`).

## 1. Frontend (Cloudflare Pages)

Each Pages project is connected to the GitHub repository: **every push to `main` builds and deploys the app by itself**
(no manual deploy). The build is `npm ci && npm run build:pages:<app>`; a build whose output check
(`tools/pages/check-pages-output.mjs`) fails is not deployed, so read the Pages build log after a push.

### Pages project setup

The platform repo needs its own GitHub repository; each app gets its own Pages project built from it (a Pages project
cannot switch to another repository, and the domain move is the rollback). Settings of the RADAR project (COMPASS:
`compass` instead of `npm`):
- **The COMPASS project is connected to a private mirror repository, not to this one.** A second Pages project could not be
  connected to the same repository, so `.github/workflows/mirror-compass.yml` force-pushes every push to `main` here to
  the mirror (repository variable `COMPASS_MIRROR_REPO`, secret `COMPASS_MIRROR_DEPLOY_KEY` = a deploy key with write
  access on the mirror). Nobody commits to the mirror; if COMPASS did not deploy after a push, look at the Actions run
  `mirror-compass` first, then at the Pages build log of the mirror.
- Root directory: the repo root (npm workspaces). Build command: `npm ci && npm run build:pages:npm`. Output directory:
  `apps/npm/dist`. Variable `NODE_VERSION=24`.
- Build variables (baked into the bundle): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the anon or publishable key,
  never the service role key: the build fails then), `VITE_VAPID_PUBLIC_KEY`. Never `VITE_MFA_ENFORCED`.
- `build:pages:<app>` builds the app, writes `dist/_headers` (`tools/pages/write-pages-config.mjs`: CSP naming the Supabase
  origin, HSTS, frame and referrer rules, cache rules for `/static/*` and `sw.js`; COMPASS's script, RADAR adds
  `img-src https:` for received e-mails and `frame-src blob:` for PDFs) and checks the output
  (`tools/pages/check-pages-output.mjs`: header policy, no secrets, no source maps or TypeScript output, SPA fallback
  intact). After the first deployment: `node tools/pages/check-pages-output.mjs npm --url https://<pages address>`.
- Preview deployments off or behind Cloudflare Access. Supabase Auth URL configuration: the domain stays, so nothing
  changes; add the `pages.dev` address only while testing there. Entra: nothing (the redirect is Supabase's).
- Tested locally: both builds pass the check; the RADAR build served with its headers signs in and shows the main pages
  and a specification PDF without a CSP refusal (pdf.js's optional WebAssembly decoder from a `data:` URL is refused, as
  under NPM's CSP; it falls back).

### Captcha (Cloudflare Turnstile) on password sign-in

Off until switched on, per app, in this order (the sign-in form shows the check only when the build has the key, and Supabase
refuses a sign-in without a token only when its secret is set; with the key but without the secret the check is shown and
ignored, so nobody is locked out while the steps are done):

1. Cloudflare dashboard > Turnstile: one widget per app, mode Managed, hostname of the app. Note site key and secret key.
2. Pages project: variable `VITE_TURNSTILE_SITE_KEY` = the **site key** (public), then redeploy (variables are baked into the
   build). The build then adds `https://challenges.cloudflare.com` to `script-src`, `frame-src` and `connect-src`, and
   `check-pages-output.mjs` requires it. Open the sign-in page: the check must appear.
3. Supabase dashboard of the app > Authentication > Attack Protection: Turnstile, paste the **secret key**, enable. From now
   on `signInWithPassword` needs a token. To switch it off again: disable it there (takes effect at once).

It covers the sign-in form, the activation page and the current-password check on the profile page. Microsoft sign-in,
`login-help` (forgot password, activation code) and the recovery link do not pass through it; `login-help` has its own
per-address rate limit. To go back: disable it in Supabase first, then remove the variable. Locally: `apps/<app>/supabase/config.toml`
shows how to try it with Cloudflare's test keys.

### Sign-in throttle (growing waits per account)

The migration `platform_login_throttle` only adds the table and the hook function; Supabase Auth calls the function once the
hook is switched on, per app: Supabase dashboard > Authentication > Hooks > **Password verification attempt** > Postgres
function `public.hook_password_verification_attempt` (the `config.toml` of each app shows the local form). Availability of
this hook depends on the Supabase plan; without it nothing throttles and nothing breaks.

Behaviour: five wrong passwords are free, then waits of 30 s, 1 min, 2 min, 5 min, 15 min and 30 min (cap). While an account
waits, every attempt is refused with the text of a wrong password, a right one too, and refused attempts do not count. The
count resets after a right password or 24 hours after the last wrong one. A fault inside the hook lets the sign-in through.
Admins get a bell notice per account (`login_lockout`, at the first wait and at 15 minutes) and, when five accounts wait within
an hour, `login_attack` (bell, push and the daily mail, at most one per 30 minutes). Admin > Users shows a waiting account and
lets a login manager clear it. After switching the hook on, check it once: five wrong passwords, a sixth, then the right
password must answer like a wrong one, and the sign-in page must show nothing else.

## 2. Database migrations

The pipeline does not touch the database. A change with a new migration under `modules/<key>/sql/migrations` or
`platform/sql/migrations` is pushed to Cloud by hand:

```bash
npm run compose                      # writes apps/<app>/supabase/migrations (generated, git-ignored)
cd apps/<app>
supabase link --project-ref <ref>    # once per checkout
supabase migration list --linked     # expect exactly the new migration with an empty remote column
supabase db push --linked            # asks to confirm; --dry-run first if unsure
```

- If the CLI says `Found local migration files to be inserted before the last migration on remote`, an already applied
  migration has a later timestamp than the new one. When the list shows only the new file as pending, rerun with
  `--include-all`; it applies just the missing files.
- Compare the list first: anything else pending (a file of another change in your working tree) would be pushed too.
- Seeds are never pushed to Cloud (`apps/<app>/supabase/seed` is for the local stack).
- Order: push the migration first or right after the code. A frontend that needs a new migration (or a removed one the old
  frontend still calls) should not be live long before / after it.
- Check afterwards: `supabase migration list --linked` shows local = remote, and a query for what the migration made, e.g.
  `supabase db query --linked "select key from public.permissions where key = 'mail.access'"`.
- A new grant (permission literal) is given to no role by the migration: assign it on Admin > Roles (RADAR keeps its
  roles' grants in the live database, not in the seed).
- Rollback: write a new migration that undoes the change; do not edit an applied one.

## 3. Edge Functions

Only when a file under `platform/functions` or `modules/<key>/functions` changed (`npm run compose` copies them to
`apps/<app>/supabase/functions`):

```bash
cd apps/<app> && supabase functions deploy --project-ref <ref> --use-api
```

`verify_jwt` comes from `apps/<app>/supabase/config.toml`: a function called without a session (the mail webhook, the OAuth
callbacks) must be off there. Secrets: `supabase secrets list --project-ref <ref>`; set them with `supabase secrets set`
(values typed or read from a local file, never committed). Which secrets which function needs: the function's header.

## 4. Checklist for a change

1. `npm run lint`, `npm run typecheck`, `npm run check`, the SQL tests of the app (`npm run test:sql -- <app>`).
2. Commit, push to `main` (Pages builds).
3. Migration (section 2), then Edge Functions if changed (section 3).
4. Check on the live app: sign in, the changed page, one user with and one without the grant.

### GoTrue's own mails reach the contact address

A password account with a contact address has that address as its GoTrue address (`expected_login_email`), so what GoTrue itself
mails (magic link / e-mail code, "password changed", "second factor enrolled" and the other notifications in `config.toml`) goes to
the person's real inbox; for an account without a contact address it still goes nowhere. The app mails its own links through
`login-help` and `person-grant-login` and does not use GoTrue's mail. Check Authentication > Emails (SMTP, templates) of each
app: without an SMTP server of its own, GoTrue's built-in sender only mails team members. A magic link signs in without the
password but never past the second factor (the database refuses a session below aal2), so it is an accepted way in; if it should
not exist, turn off GoTrue's mail instead.

Migration `platform_login_by_email`: it trims the stored contact addresses first; two people whose addresses differ only by blanks
stop it with a unique violation, fix them in the data and run it again. `login-help` and the migration can be deployed in either
order (`login_reset_target` keeps its parameter name).
