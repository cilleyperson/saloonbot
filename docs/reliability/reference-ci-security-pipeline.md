# Reference: CI & Security Pipeline

The CI/security pipeline gates every change to `master` and keeps dependencies
patched automatically. It runs tests, two `npm audit` gates, and a real Docker
build + boot on each PR; Dependabot opens grouped update PRs that auto-merge once
the gate passes. This page is the factual surface. For *why* the gate exists and
how it's scoped, see
[explanation-ci-security-pipeline.md](./explanation-ci-security-pipeline.md). To
work with it as a contributor, see
[howto-contribute-through-ci.md](./howto-contribute-through-ci.md).

## CI workflow (`.github/workflows/ci.yml`)

Triggers: `pull_request` targeting `master`, and `push` to `master`.
Node version comes from `.nvmrc` (Node 24). Uses `actions/checkout@v5` and
`actions/setup-node@v5` (Node 24 runtime).

### Job: `Test + audit` (ubuntu-latest)
1. `npm ci`
2. `npm test` (Jest)
3. **GATE A** — `npm audit --omit=dev --audit-level=low`: fails on *any* vulnerability in production dependencies.
4. **GATE B** — `npm audit --audit-level=high`: fails on any high/critical vulnerability anywhere (including dev deps).

### Job: `Docker build + boot` (ubuntu-latest)
1. `docker build -f docker/Dockerfile -t saloonbot:ci .` — builds the real production image.
2. **Native + sharp-musl acceptance** — runs `node -e` in the image that loads `bcrypt`, `better-sqlite3`, `onnxruntime-node`, and runs a real `sharp` encode. Proves native modules resolve in the deployed image (the Ubuntu runner alone can't).
3. **Boot smoke** — starts the container and asserts the `/healthz` healthcheck reports `healthy`.

Both jobs are **required status checks** on `master` (see Branch protection).

## Branch protection (master)

Configured via the GitHub API (not in-repo). Requires the two CI check contexts —
`Test + audit` and `Docker build + boot` — to pass before merge. `strict: true`
(branch must be up to date). `enforce_admins: false` (the owner can bypass for
admin merges). No required PR reviews. A separate repo ruleset requires a PR
review, which is why solo merges use `gh pr merge --admin`.

## Dependabot (`.github/dependabot.yml`)

Weekly grouped updates:
- **npm** ecosystem — patch + minor batched into one PR (`npm-minor-patch` group); majors come as individual PRs for human review. `open-pull-requests-limit: 10`.
- **github-actions** ecosystem — patch + minor grouped.

## Dependabot auto-merge (`.github/workflows/dependabot-automerge.yml`)

Triggers on `pull_request` from `dependabot[bot]`. Permissions: `contents: write`,
`pull-requests: write`. Uses `dependabot/fetch-metadata@v2`; for
`version-update:semver-patch` and `:semver-minor` updates it runs
`gh pr merge --auto --squash`. `--auto` only merges after the required CI checks
pass — branch protection is the safety net, so the repo setting "Allow auto-merge"
must be enabled (it is). Major updates are not auto-merged.

## Production Docker image (`docker/Dockerfile`)

- Base: **`node:24-bookworm-slim`** (glibc) for both build and production stages.
  NOT Alpine/musl — `onnxruntime-node` ships glibc-only prebuilts.
- Build deps (`python3 make g++`) via `apt-get` for native module compilation.
- Production stage installs with `npm ci --omit=dev`.
- Non-root `botuser` (uid 1001).
- `HEALTHCHECK` hits `/healthz` on `$PORT` (default 3000) — not `/`, which is
  behind auth and 302-redirects.

## Node version pinning

Node 24 is pinned in three places that must agree: `.nvmrc` (`24`),
`package.json` `engines` (`">=24"`), and the Dockerfile base image
(`node:24-bookworm-slim`).

## Known tolerated findings

`npm audit` reports ~17 moderate vulnerabilities in the dev-only `js-yaml` leaf
pulled by Jest's coverage tooling (`@istanbuljs/load-nyc-config`). These do not
ship to production and the only fix breaks `jest --coverage`, so they are
tolerated. GATE A (`--omit=dev`) and GATE B (`high+`) both ignore them.

## Related
- [explanation-ci-security-pipeline.md](./explanation-ci-security-pipeline.md) — why the gate exists
- [howto-contribute-through-ci.md](./howto-contribute-through-ci.md) — passing the gate
- [reference-auth-resilience.md](./reference-auth-resilience.md) — auth resilience
