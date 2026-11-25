# Repository Guidelines

## Project Structure & Module Organization

Astro Fanblog is a German-language Astro 7 blog backed by Supabase. Routes live
in `src/pages/`, reusable UI in `src/components/`, layouts in `src/layouts/`,
and business/data helpers in `src/lib/`. Shared CSS is under `src/styles/`;
Panda configuration is in `panda.config.ts`. Migrations and local data belong
in `supabase/migrations/` and `supabase/seed.sql`. Unit tests are colocated as
`src/**/*.test.ts`; Playwright scenarios live in `e2e/`. Static assets belong
in `public/`. Do not edit generated directories including `dist/`, `.astro/`,
`coverage/`, and `styled-system/`.

## Build, Test, and Development Commands

- `npm run dev`: generate Panda styles and start Astro on port 4321.
- `npm run build`: create the standalone production build.
- `npm test`: run Vitest unit tests once.
- `npm run test:coverage`: run unit tests and enforce coverage thresholds.
- `npm run test:e2e`: run Playwright tests in Chromium on port 4330.
- `npm run lint`: check JavaScript, TypeScript, and Astro files with ESLint.
- `npm run check`: regenerate styles and run Astro type checks.
- `npm run supabase:start`: start local Supabase.
- `npm run supabase:reset`: reapply migrations and seed data; this destroys
  local database changes.

## Coding Style & Naming Conventions

Use TypeScript strict mode, two-space indentation, single quotes, and Prettier
(`npm run format`). Follow ESLint. Name Astro components in PascalCase
(`ArticleCard.astro`) and routes with lowercase German slugs. Keep user-facing
copy in German. Reuse tokens from `design.md`, preserve both themes, and favor
semantic HTML, accessible names, and visible keyboard focus.

## Testing Guidelines

Use Vitest and `*.test.ts` for isolated logic. Use Playwright and `*.spec.ts`
for rendered behavior; select UI by accessible role and name. Coverage requires
85% statements, functions, and lines, plus 80% branches for configured
`src/lib/` modules. Add regression tests with behavior changes.

## Commit & Pull Request Guidelines

Git history is unavailable in this workspace. Use concise, imperative commits
with an optional scope, for example `fix(admin): validate publication date`.
Keep commits focused. Pull requests should explain the problem and solution,
list verification commands, link relevant issues, and include screenshots for
visual changes. Call out migrations, seed changes, and breaking configuration.

## Security & Configuration

Copy `.env.example` to `.env.local`; never commit secrets or service-role keys.
Keep authorization in trusted `app_metadata`, maintain RLS on exposed tables,
and regenerate `src/lib/database.types.ts` with `npm run supabase:types` after
schema changes rather than editing it manually.
