# Contributing

Thank you for helping Tonight’s Movie. Open an issue for a substantial change so the data source, accessibility and product impact can be discussed first. Small bug fixes and documentation improvements can go directly to a pull request.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), never in a public issue. Contributions are licensed under the project’s [MIT license](LICENSE).

## Local setup

Requires Node.js 22 (20.9+ is supported by the dependencies).

```bash
npm ci
cp .env.example .env.local   # then set TMDB_API_KEY
npm run dev
```

The film routes need a free TMDB API read access token in `TMDB_API_KEY`; see [Run locally](README.md#run-locally) for how to get one. `npm ci` also runs `scripts/install-git-hooks.sh` (the `prepare` script), which enables the [local hooks](#local-hooks). Open <http://localhost:3000>; use `PORT=3047 npm run dev` if the port is busy.

## Checks

Run these before opening a pull request, from the repository root:

```bash
npm run format:check   # npm run format fixes formatting
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

CI runs the same commands, plus a Conventional Commits check on the pull request title, a secret scan and a container image scan, and aggregates them in a required `CI gate` job.

Add tests for import parsing or availability rules when behavior changes; avoid snapshot tests that merely mirror markup. Use the existing design tokens in `app/base.css` and reusable components in `components/`. Preserve keyboard access, focus visibility, labels and reduced motion behavior. Do not commit API secrets, user data, personal Letterboxd identifiers or Letterboxd exports. Do not imply that a failed availability lookup proves a film is unavailable.

External data integrations require a documented source, usage rights, country coverage, update policy and attribution. TMDB is the single data source, and the app never scrapes a third party site. See the data sources section of the [README](README.md#data-sources).

## Branches

- `main` is the only long-lived branch; always branch from an up-to-date `main`.
- Name branches `feat/short-description`, `fix/short-description`, `docs/short-description` or `chore/short-description`.
- One branch and one pull request per coherent capability; never mix unrelated changes.

## Commits and pull requests

Follow [Conventional Commits](https://www.conventionalcommits.org/) in English:

```text
feat: add duration filter to the draw panel
fix: handle an empty watchlist
ci: pin the image scan action
```

Pull requests target `main` and are **squash-merged** only, so the pull request title alone becomes the final commit message (no body); keep the details in the pull request. CI validates the title; fill in the pull request template. A pull request is done when:

- `CI gate` is green and conversations are resolved;
- tests cover changed import or availability behavior;
- the description states how the change was verified and what it risks;
- documentation is updated where behavior changed.

```bash
gh pr merge <number> --squash --delete-branch
```

## Local hooks

[Lefthook](https://lefthook.dev) and a plain shell hook are installed by `npm ci`, which points `core.hooksPath` at `.githooks`:

- `pre-commit` runs ESLint with `--fix` then Prettier on staged files, sequentially, because both rewrite the same files.
- `commit-msg` runs commitlint (`commitlint.config.js`).
- `pre-push` blocks direct pushes to `main` on the official remote only; forks and other remotes are left alone.

Run `sh scripts/install-git-hooks.sh` to enable them manually. The hooks are a client-side convenience: `--no-verify` or a clone without hooks bypasses them, so CI remains the authority. Hooks do not duplicate the full CI.

## Branch protection

`main` is never pushed to directly. The target rules are versioned in `.github/rulesets/main.json`: pull request required, a green `CI gate`, branch up to date before merge, resolved conversations, squash merge only, linear history, no deletion or force-push, and no permanent bypass. A versioned file does not enable anything: check the repository settings to see which rules are actually active.

## Releases

The version in `package.json` is authoritative. The repository owner releases from a clean, up-to-date `main`:

```bash
git switch main
git pull --ff-only
npm run release -- 0.3.0
```

Before any remote change the script checks the version format, a clean worktree, that `main` matches `origin/main`, GitHub CLI authentication as the owner, that the version is not older than the current one, and that the branch and tag do not exist. After confirmation it opens a `chore/release-vX.Y.Z` pull request bumping `package.json` and `package-lock.json`, waits for the checks, squash-merges it, waits for `CI gate` on the merged commit, then creates and pushes the signed annotated tag `vX.Y.Z`.

The tag triggers the `Release` workflow, which validates the tag format, that it equals the `package.json` version, that the commit belongs to `main` and that its `CI gate` succeeded, then creates a GitHub Release with generated notes. Tags are immutable: never move a published tag.
