# AGENTS.md

## Project Overview

JockCloud is a Node.js/Express/MySQL private cloud drive (file upload, download, sharing, sync, user/group management). Single-package app — no monorepo, no build step, no TypeScript.

## Quick Commands

```bash
npm run dev          # Start dev server (same as production: node server.js)
npm run lint         # Syntax check only: node --check server.js
npm run typecheck    # Same as lint (no real typecheck)
npm start            # Production start: node server.js
```

No test suite exists. No test framework is installed.

## Architecture

- **Entry**: `server.js` → `src/app.js` (Express init, DB init, all wiring, scheduled jobs)
- **Routes**: `src/routes/*.js`, registered via `src/routes/register-all-routes.js` (single massive function call passing all dependencies)
- **Services**: `src/services/*.js` — business logic (auth, uploads, sync, archives, monitoring)
- **Middlewares**: `src/middlewares/` — auth (`auth.js`), rate-limit (`rate-limit.js`), error handling
- **Utils**: `src/utils/` — constants, config, helpers, permissions, settings DB, crypto, logging
- **Jobs**: `src/jobs/` — scheduled tasks (recycle cleanup, runtime cleanup, sync scheduler)
- **Views**: `views/js/` = source JS; `views/*.html` = templates with `<!-- INCLUDE: component -->` directives; `views/components/` = HTML snippets
- **Public**: `public/js/` = minified JS (auto-generated at startup and on JIT request from `views/js/`)
- **DB**: `src/db.js` — MySQL connection pool, auto-creates tables on first start

## Key Patterns

### Dependency Injection

`app.js` creates ALL service instances with their dependencies and passes them as a single `deps` object to `registerAllRoutes()`. Every route file receives dependencies via destructuring. No DI framework — pure manual wiring.

### Frontend JS Build (JIT)

`public/js/` is gitignored and auto-built. Two paths:
1. **Startup**: `buildJsFiles()` minifies all `views/js/*.js` → `public/js/`
2. **JIT (per-request)**: Express middleware checks `views/js/*.js` mtime vs `public/js/*.js` and re-minifies if source is newer

You edit `views/js/` — never edit `public/js/` directly.

### HTML Templates

Templates in `views/` use `<!-- INCLUDE: components/foo.html -->` directives, resolved at request time. Compression and ETag caching applied.

### Configuration Priority

1. `.env` (startup only)
2. Database `settings` table (runtime, admin UI)
3. `src/utils/default-settings.js` (fallback defaults)
4. `src/utils/constants.js` (hardcoded limits)

### Auth/Session

- Cookie-based sessions (`cloud_sid`), stored in DB `sessions` table
- RSA keypair generated fresh each startup for password decryption
- Login passwords RSA-encrypted client-side

## Gotchas

- **No `.env` → no start**: App calls `requireEnv()` for DB credentials; missing values crash on startup
- **DB auto-migration**: Tables created on first run — no migration files or CLI
- **Default admin**: `admin`/`admin` created on first DB init
- **uploads/ and hidden-uploads/**: gitignored, created at startup; must exist and be writable
- **logs/**: gitignored, created at startup
- **`public/js/*.js`**: gitignored; always regenerated from source
- **Global console.log is patched**: `installConsoleLogLevel()` replaces `console.log/info/warn/error` with a controlled logger that respects `LOG_LEVEL` env var
- **multer v2**: Uses `multer@^2.0.2` which has a different API than v1 (middleware factories, not single instance)
- **Rate limiting**: Global middleware on all requests; configurable via settings UI

## File Conventions

- All source is CommonJS (`require`/`module.exports`)
- Route files export a function that receives `(app, deps)`
- Service files export factory functions like `createXxxRuntime(deps)` returning an object of methods
- Frontend JS: vanilla ES6+, no framework, no bundler — just UglifyJS minification
- Chinese comments and UI text throughout (this is a Chinese-language project)
- `.gitignore` excludes `uploads/`, `hidden-uploads/`, `public/js/*.js`, `logs/`, `.env`
