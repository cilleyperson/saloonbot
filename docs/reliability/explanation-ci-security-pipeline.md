# Explanation: Why the CI & Security Gate Exists

This page explains why the pipeline is shaped the way it is — the failure it
prevents, why the gates are scoped the way they are, and why the Docker base
image is glibc. For the factual config, see
[reference-ci-security-pipeline.md](./reference-ci-security-pipeline.md).

## The problem

Dependencies drifted until the repo had 24 known vulnerabilities (3 high). The
only automation was a workflow that posted a commit notification to Discord —
nothing ran tests or `npm audit` before a merge. Security PRs were merged by hand
one at a time. Nothing proved the production Docker image even built or booted.
The result is predictable: vulnerabilities pile up because nobody is forced to
look, and breakage reaches production because nothing checks the deployed artifact.

## The approach

### A required gate, not a suggestion
`ci.yml` runs on every PR and is a *required* status check on `master`. You can't
merge red. That single change is what stops the pileup — the gate makes "is this
safe" a precondition of merge instead of a thing someone might check later.

### Two audit gates with different jobs
- **Production deps, any severity** (`--omit=dev --audit-level=low`): nothing that
  ships to users may carry *any* known vulnerability. This is the strict one,
  because it's the one that matters.
- **All deps, high+** (`--audit-level=high`): a high/critical anywhere — even in
  dev tooling — blocks. Moderate dev-only issues don't, because they don't ship
  and chasing them can break the toolchain.

This split is deliberate: it's strict where exposure is real and lenient where it
isn't, so the gate stays green-able without lying about what's actually at risk.
The ~17 tolerated `js-yaml` moderates (Jest coverage tooling) are exactly the
"dev-only, don't ship, no clean fix" case the split is designed to pass.

### Build AND boot the real image in CI
A green test run on GitHub's Ubuntu runner does not prove the production Alpine/
glibc image installs or boots. Native modules (`bcrypt`, `better-sqlite3`,
`onnxruntime-node`, `sharp`) compile and link against the base image's libc — that
only fails *in the image*. So CI builds the actual Dockerfile, loads every native
module inside it, runs a real `sharp` encode, and boots the container until
`/healthz` is healthy. This caught two real bugs that unit tests could not:
onnxruntime failing to load on musl, and a container crash-loop on a missing
`data/uploads` directory.

### Auto-merge the boring updates, gate the risky ones
Patch and minor Dependabot PRs auto-merge once CI passes — they're low-risk and
high-toil. Majors stay individual and human-reviewed. Auto-merge is only safe
*because* branch protection requires the CI checks first; `gh pr merge --auto`
waits for them. The safety net (the gate) is what makes the automation acceptable.

## Trade-offs

- **The Docker job is slower** than tests alone (~50s vs ~25s) because it builds
  and boots a real image. Worth it: it's the only check that proves the deployable
  artifact works.
- **glibc base image is larger than Alpine** (~30-40MB more). Non-negotiable:
  `onnxruntime-node` ships only glibc prebuilts, so object detection cannot load
  on musl. Alpine would silently disable a feature.
- **Tolerating the dev-only moderates** means `npm audit` (unscoped) is never
  zero. Accepted: the alternative is downgrading Jest or breaking coverage to
  satisfy a number that doesn't reflect real exposure.
- **enforce_admins is off** so the solo owner can admin-merge past the review
  ruleset. This weakens the gate for the owner specifically, in exchange for not
  deadlocking a single-maintainer repo.

## Alternatives considered

- **`npm audit fix --force`** — rejected: it pulls breaking majors silently and
  npm suggested a destructive Jest downgrade. Fixes were applied non-force, with
  targeted handling for the rest.
- **Alpine base + skip onnxruntime** — rejected: that ships a broken feature
  quietly. glibc keeps detection actually working.
- **Audit only production deps** — rejected: a high in dev tooling is still worth
  knowing about; hence the second high+ gate across all deps.

## Related
- [reference-ci-security-pipeline.md](./reference-ci-security-pipeline.md) — config surface
- [howto-contribute-through-ci.md](./howto-contribute-through-ci.md) — passing the gate
