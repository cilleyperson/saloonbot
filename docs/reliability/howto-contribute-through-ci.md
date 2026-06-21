# How to contribute through the CI gate

This guide shows how to get a change merged to `master` given the required CI gate
and the Dependabot auto-merge flow. For the config surface, see
[reference-ci-security-pipeline.md](./reference-ci-security-pipeline.md); for why
the gate exists, see
[explanation-ci-security-pipeline.md](./explanation-ci-security-pipeline.md).

## Prerequisites
- Node 24 locally (`nvm use` reads `.nvmrc`).
- `gh` CLI authenticated to the repo owner's account.
- Docker running locally if you want to reproduce the Docker job before pushing
  (optional — CI runs it regardless).

## Get a change merged

1. **Branch off master.** `master` is protected; you cannot push to it directly
   (admin bypass aside).

   ```bash
   git checkout -b fix/my-change
   ```

2. **Reproduce the gate locally before pushing** (faster than waiting on CI):

   ```bash
   nvm use                                   # Node 24 from .nvmrc
   npm ci
   npm test
   npm audit --omit=dev --audit-level=low    # GATE A: 0 prod vulns
   npm audit --audit-level=high              # GATE B: 0 highs anywhere
   ```

   Expected: tests green, both audit commands exit 0.

3. **Push and open a PR against master.**

   ```bash
   git push -u origin fix/my-change
   gh pr create --base master --fill
   ```

4. **Wait for the two required checks** — `Test + audit` and `Docker build + boot`.
   You can watch them:

   ```bash
   gh pr checks --watch
   ```

5. **Merge once green.** A repo ruleset requires a PR review, so on a solo repo
   merge with admin bypass:

   ```bash
   gh pr merge <number> --squash --admin --delete-branch
   ```

### Verification
`gh pr view <number> --json state` returns `MERGED`; `git log` on `master` shows
your squash commit.

## Understand what each check means

- **Test + audit** red on tests → a unit/integration test failed; run `npm test`
  locally.
- **Test + audit** red on audit → you introduced (or a transitive pulled in) a
  prod vulnerability or a high anywhere. Run the two `npm audit` commands above to
  see which package; bump it or add a targeted `overrides` entry in
  `package.json`.
- **Docker build + boot** red on *build* → a native module fails to compile/resolve
  in the glibc image, or the lockfile doesn't install. Reproduce:
  `docker build -f docker/Dockerfile -t saloonbot:ci .`.
- **Docker build + boot** red on *boot smoke* → the container starts but `/healthz`
  never goes healthy, usually a startup crash. Check `docker logs` from the CI run.

## How Dependabot updates flow

You usually don't touch these, but to understand the queue:

- Dependabot opens **grouped weekly PRs**: patch+minor batched per ecosystem,
  majors individual.
- **Patch/minor PRs auto-merge** once the CI gate passes
  (`.github/workflows/dependabot-automerge.yml`). You don't need to do anything.
- **Major PRs** wait for a human — review the changelog, check for breaking
  changes, then merge like any PR.

## Troubleshooting

- **"Required status checks have not passed."** One of the two CI jobs is red or
  still running. Open the run from the PR checks tab.
- **Audit gate fails only in CI, not locally.** Your local `node_modules` is stale
  — run `npm ci` (not `npm install`) to match the committed lockfile.
- **Docker job fails but `npm test` passed.** The bug is image-specific (native
  module / musl-glibc / lockfile-on-Linux). The Docker job exists precisely to
  catch these; reproduce with a local `docker build`.
- **A Dependabot patch PR didn't auto-merge.** Either CI is red on it, or the
  "Allow auto-merge" repo setting / branch protection check requirement got
  changed. Re-run CI or merge manually.

## Related
- [reference-ci-security-pipeline.md](./reference-ci-security-pipeline.md) — config surface
- [explanation-ci-security-pipeline.md](./explanation-ci-security-pipeline.md) — why the gate exists
