# Contributing

Thank you for helping Tonight’s Movie. Open an issue for a substantial change so the data source, accessibility and product impact can be discussed first. Small bug fixes and documentation improvements can go directly to a pull request.

## Local setup

Use Node.js 22, run `npm ci`, then `npm run dev`. Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` before submitting. Keep changes focused and describe how they were verified. Add tests for import parsing or availability rules when behavior changes; avoid snapshot tests that merely mirror markup.

Use the existing design tokens in `app/base.css` and reusable components in `components/`. Preserve keyboard access, focus visibility, labels and reduced motion behavior. Do not commit API secrets, user data or cached imports. Do not imply that a failed availability lookup proves a film is unavailable.

External data integrations require a documented source, usage rights, country coverage, update policy and attribution. See [data sources](docs/data-sources.md). Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are licensed under the project’s MIT license.
