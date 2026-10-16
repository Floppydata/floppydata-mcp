# Contributing

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm build
npm pack --dry-run
```

CI runs the same checks on every pull request and on `main`.

Releases use [release-please](https://github.com/googleapis/release-please): commit
with [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`,
`feat!:`), merge the release PR it opens, and the release workflow stages the
version on npm with provenance through trusted publishing. A maintainer then
publishes it with 2FA: `npm stage list @floppydata/mcp`, then
`npm stage approve <stage-id>` (npm >= 11.19).

release-please bumps the version in `package.json` and in `src/server.ts` (the line
marked `x-release-please-version`); do not bump it by hand.

If the release workflow tagged a release but failed before staging it, stage
the existing tag by hand: `gh workflow run release.yml -f publish_tag=vX.Y.Z`.
