# SafeNest

SafeNest is a family pickup coordination app built with Expo, React Native, TypeScript, and Expo Router. It brings together a family's pickup plan, trusted helpers, pickup status, and account settings.

The app includes both Supabase-backed features and clearly marked demo behavior. Backend readiness varies by feature: do not assume that invitations, approvals, pickup permissions, or broadcast requests are production-ready. See [AGENTS.md](AGENTS.md) for the project's coordination and safety rules.

## Requirements

- Node.js and npm
- Expo Go or a configured iOS, Android, or web development environment
- Supabase project URL and a public anon/publishable key for the connected account features

## Set up

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root with the values for your team's Supabase project:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

You can copy `.env.example` to `.env`, then replace both placeholders with your team's values. In PowerShell:

```powershell
Copy-Item .env.example .env
```

Use the project URL itself; do not append `/rest/v1/`. The app reads these variables when Expo starts, so restart the dev server after changing `.env`.

`.env` is ignored by Git. `EXPO_PUBLIC_` values are included in the client app and are not secrets. Use only the project's public anon/publishable key. Never use or commit a service-role key or other secret.

Start Expo and clear its cache:

```bash
npx expo start --clear
```

If the default port is already in use, choose another one:

```bash
npx expo start --clear --port 8082
```

Platform shortcuts are also available:

```bash
npm run android
npm run ios
npm run web
```

## App structure

- `src/app/` contains the Expo Router layout and routes for Today, Circle, Plan, and Settings.
- `src/components/` contains screen-specific and reusable UI, account, onboarding, pickup, and Supabase integration code.
- `src/lib/supabase.ts` configures the Supabase client from the local environment.
- `design_reference/` contains historical HTML prototype material. Use it for product context when helpful; the current app design and approved improvements take precedence.
- `supabase/` contains SQL schema and migration files. Their presence does not mean they have been approved or applied to the shared project.
- `tests/` and `supabase/tests/` contain local logic and database-related checks.

## Development guidance

- Read [AGENTS.md](AGENTS.md) before making changes. It covers design references, team file ownership, backend boundaries, and the required review workflow.
- Preserve existing Expo Router routes and styling conventions. Keep screen-specific components with their screen and shared components in the shared area.
- Use local mock state for demo flows and label it clearly. Verify the status of a backend feature before wiring UI to it.
- Do not change Trusted Circle database functions, apply migrations, or run `supabase db push` / `supabase db reset` without coordinating with the project owner.
- Run the TypeScript check before completing implementation work:

  ```bash
  npm run typecheck
  ```

- Run the local app-side logic checks with `npm test`. These do not connect to Supabase. SQL/PGlite tests have separate instructions in [`supabase/tests/README.md`](supabase/tests/README.md) and must use a throwaway local test database.
- Review [`BACKEND_STATUS.md`](BACKEND_STATUS.md) for the repository's current integration and deployment evidence. Do not infer that a migration has been applied because its SQL file exists.

Test affected screens and navigation in Expo Go when available, and report checks and remaining simulated behavior accurately.
