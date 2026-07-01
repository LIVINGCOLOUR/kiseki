# Security

## Credentials

Do not publish production admin keys, login passwords, Cloudflare secrets, `.dev.vars`, or private key files in this repository.

The visible maker IDs are:

- `id-01`
- `id-02`
- `id-03`
- `id-04`
- `id-05`

The matching admin keys are intentionally not documented in GitHub. Store production values only in Cloudflare Pages Secrets and a private record outside the repository.

`.dev.vars.example` contains local dummy values only. Do not reuse them as production or public demo credentials.

## Public Repository Rule

Before making the repository public, confirm that:

- `.dev.vars` is not tracked.
- Real admin keys are not present in README, docs, issues, pull requests, or commit history.
- Cloudflare secrets are stored only in Cloudflare.
- Any public demo credentials are disposable and separate from production.
