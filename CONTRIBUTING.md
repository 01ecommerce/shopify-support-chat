# Contributing

Thanks for helping. This package is small on purpose: one chat bubble, no runtime dependencies. This
page is also how we work, so it is short and specific.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). By contributing you agree your
work is licensed under the [MIT License](LICENSE).

## Development is Docker-only

There is no host Node in the workflow. Tests run in a pinned `node:22-alpine` container (22 is the development version; the supported floor is Node 20, see `engines`), so every
contributor and CI run the same Node and nothing depends on what is installed on your machine.

```sh
make test     # run the tests in Docker
make check    # the full gate (today the same as make test); run it before every push
make clean    # remove leftover test containers
```

You need Docker and `make`. The test target uses no ports, volumes or networks outside the checkout.

## Test-driven, with mutation checks

1. Write a failing test first, and watch it fail for the right reason.
2. Write the smallest code that makes it pass.
3. For anything that guards behaviour (escaping, an empty-id check, a packaging rule), run a mutation
   check: break the guard on purpose, see a test fail, then revert. A guard no test notices is not
   guarded.

The tests use `node:test` and `node:assert`. Do not add a test framework.

## Zero runtime dependencies

`dependencies` stays empty. React is an optional peer dependency and is not installed here, so
`react.js` is covered by a source-level test. A change that needs a runtime dependency needs an issue
and a reason first.

## Keep it generic

Examples and tests use placeholders (`example-app`, `demo.myshopify.com`). No real widget ids, shop
domains, emails, app names or internal paths, in code, tests, docs or issues.

## Commits

- An imperative subject, 72 characters or fewer: `Escape line separators in the inline script`.
- The body says what changed, why, and what you verified (for example the `make check` counts).
- One logical change per commit.
- No AI attribution lines (no `Co-Authored-By` for a tool, no "generated with").

## Pull requests

1. Open an issue first for anything beyond a small fix.
2. Branch from `main`; keep the pull request to one change.
3. Fill in the template: what and why, the test that failed first, the `make check` output.
4. Update `CHANGELOG.md` (under an unreleased heading) and the README if behaviour changed.
5. CI runs `npm test` on Node 20, 22 and 24. A maintainer reviews and merges.

## Releasing (maintainers)

1. Move the `CHANGELOG.md` entries under the new version heading, and bump `version` in `package.json`
   (semantic versioning; a change consumers must react to is a major version).
2. Run `make check`.
3. Commit, then tag `vX.Y.Z` and push the commit and the tag.
4. Create the GitHub release from the tag, with the changelog entry as its notes.

Consumers install the tag tarball, so the tag is the release.
