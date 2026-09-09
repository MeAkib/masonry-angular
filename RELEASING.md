# Releasing

Everything about getting this package onto npm, written for the state the project is actually in.

npm's publishing rules changed substantially through 2025 and 2026 — classic tokens were revoked,
authenticator-app 2FA was retired, and publishing from CI became the recommended path. Most advice
you will find online predates that. This document does not.

## Contents

- [Where things stand](#where-things-stand)
- [One-time account setup](#one-time-account-setup)
- [The first release](#the-first-release)
- [Every release after that](#every-release-after-that)
- [Choosing the version number](#choosing-the-version-number)
- [Publishing from CI instead](#publishing-from-ci-instead)
- [Errors you will actually see](#errors-you-will-actually-see)
- [Other commands worth knowing](#other-commands-worth-knowing)
- [Things not to do](#things-not-to-do)

---

## Where things stand

On npm right now:

| Version | Published | Note |
| ------- | --------- | ---- |
| `0.0.0` | 2026-09-07 | Accidental first publish. |
| `1.0.0` | 2026-09-07 | Currently the `latest` tag. |

Locally the library is at `0.0.1` and ready. Publishing it **will fail as things stand**, because npm
11 refuses to move `latest` backwards:

```
npm error Cannot implicitly apply the "latest" tag because previously published
version 1.0.0 is higher than the new version 0.0.1.
```

That is expected, and [the first release](#the-first-release) below clears it.

Two facts that shape everything here:

- **A published version number is spent forever.** `0.0.0` and `1.0.0` can never be published again
  under this name, whether or not they are unpublished. Unpublishing does not give them back.
- **Only `dist/masonry-angular` is publishable.** The workspace root is `"private": true` on purpose.

## One-time account setup

Do this once, before your first publish. It takes about ten minutes and it is the difference between
an account that can be phished and one that cannot.

**1. Add a passkey or security key.** npm 2FA is now WebAuthn only — Touch ID, Face ID, Windows
Hello, or a hardware key. New authenticator-app (TOTP) setups have been disabled since late 2025. If
you already have TOTP configured it still works, but move to a passkey.

**2. Save your recovery codes somewhere you will still have them if your laptop dies.** They are the
only route back into the account if you lose your second factor, and each one works once.

**3. Require 2FA for writes, not just for login:**

```bash
npm profile enable-2fa auth-and-writes
```

`auth-only` does not cover `npm publish`. `auth-and-writes` does.

**4. Link your GitHub account** in your npm profile. npm uses it to speed up account recovery.

**5. After the first publish**, set the package itself to require 2FA. On npmjs.com → package
settings → publishing access, choose **"Require two-factor authentication and disallow tokens."**
That is npm's recommended setting and it means nothing can publish without a human present. New
packages default to requiring 2FA already, but this is the stricter of the two options.

You do **not** need an access token to publish from your own machine. `npm login` gives you a
short-lived session instead, and long-lived write tokens now expire in 90 days maximum anyway.

## The first release

```bash
# 1. Make room for 0.0.1 by removing the version that is blocking it.
npm unpublish masonry-angular@1.0.0

# 2. Check what would go out.
npm run release:dry

# 3. Publish. Your browser will open for the passkey prompt.
npm run release

# 4. Confirm.
npm view masonry-angular version
npm view masonry-angular dist-tags
```

`0.0.0` stays on the registry and becomes the second-highest version. Leave it — it is an empty
placeholder and removing it too would delete the package entirely, locking the name for 24 hours for
no benefit.

If step 3 still complains about the `latest` tag, the unpublish has not propagated yet. Wait a minute,
or force it explicitly with `npm publish ./dist/masonry-angular --tag latest`.

Then tag the commit so the repository matches the registry:

```bash
git add -A && git commit -m "0.0.1"
git tag v0.0.1
git push --follow-tags
```

## Every release after that

```bash
# 1. Everything must be green first.
npm test                  # 185 tests
npm run build             # library and demo
npm run verify:ssr        # renders on a real server, no browser globals
npm run verify:native     # native CSS masonry in a real browser engine
npm run size              # bundle size, so a regression is noticed

# 2. Write the changelog entry BEFORE bumping. It is the last honest moment.
$EDITOR CHANGELOG.md

# 3. Bump. This edits the manifest, commits and tags in one step.
cd projects/masonry-angular
npm version patch          # or minor / major — see below
cd ../..

# 4. Publish and push.
npm run release
git push --follow-tags
```

The version that matters is in `projects/masonry-angular/package.json`. The root manifest's version
is never published.

`npm run release` runs the tests and the build itself, so a broken build cannot reach npm. It does
not run `verify:ssr` or `verify:native`, because those need optional tooling — run them yourself.

## Choosing the version number

While the library is on `0.x`, the convention is **shifted down one place**, and this is the part
people get wrong:

| Change | While on `0.x` | After `1.0.0` |
| ------ | -------------- | ------------- |
| Bug fix, docs, internal refactor | `npm version patch` → `0.1.**1**` | `patch` |
| New feature, backwards compatible | `npm version patch` → `0.1.**1**` | `minor` |
| **Breaking change** | `npm version minor` → `0.**2**.0` | `major` |

So on `0.x` a breaking change bumps the **minor**, not the major. Going to `1.0.0` is a separate,
deliberate decision that says "the API is settled" — not something to do by accident.

A reasonable path: publish `0.0.1`, use it in a real project for a week, go to `0.1.0` once you are
confident, then `1.0.1` when the API stops moving. (`1.0.0` is spent and unavailable.)

## Publishing from CI instead

Publishing from your laptop works, but it is now the least supported path. The alternative is
**trusted publishing** — GitHub Actions authenticates to npm over OIDC with a short-lived token that
cannot be stolen or reused, and no secret is stored anywhere.

The real reason to do it: **provenance**. A publish from CI carries a signed, public record linking
the tarball to the exact commit and workflow that built it, shown on your npm page. You cannot get
provenance publishing from a laptop, at all. For a new package nobody has heard of, it is a
meaningful credibility signal.

`.github/workflows/publish.yml` in this repository is ready to use. To turn it on:

1. Publish at least once manually — the package has to exist first.
2. On npmjs.com → package settings → **Trusted Publisher** → GitHub Actions.
3. Fill in your user (`MeAkib`), the repository (`masonry-angular`), and the workflow filename
   (`publish.yml` — filename only, not a path).
4. Push a tag: `git tag v0.1.0 && git push --follow-tags`.

The workflow runs the full suite before publishing, so a red test blocks the release.

Requirements, all of which this project already meets: npm CLI 11.5.1 or newer, Node 22.14 or newer,
a **public** repository, and a GitHub-hosted runner. Self-hosted runners are not supported.

If you would rather keep a human in the loop, npm also supports **staged publishing**: CI uploads the
tarball to a queue and it only becomes installable once you approve it with 2FA. Configure the
trusted publisher with "stage only" and change the workflow's last step to `npm stage publish`.

## Errors you will actually see

| Message | What it means | Fix |
| ------- | ------------- | --- |
| `Cannot implicitly apply the "latest" tag because previously published version X is higher` | You are publishing a version below the current `latest`. npm 11 blocks this. | Unpublish the higher version, or publish with `--tag <name>` deliberately. |
| `You cannot publish over the previously published versions` | That exact version already exists. | Bump the version. It can never be reused, even if unpublished. |
| `This package has been marked as private` | You ran `npm publish` from the workspace root. | Publish `./dist/masonry-angular`, or just use `npm run release`. |
| `You must be logged in to publish packages` | Your session expired — `npm login` sessions are short-lived now, not permanent. | `npm login` again. |
| `Two factor authentication required` | 2FA is on and this action needs it. | Complete the browser prompt. Do not disable 2FA to get around this. |
| `403 Forbidden` on a name you do not own | Someone else owns it. | Check with `npm view <name>`. |
| `ERESOLVE could not resolve` while installing Angular packages | Angular packages must all be the exact same version. | Pin them: `npm i @angular/core@22.1.5 @angular/common@22.1.5`, not `^22`. |

## Other commands worth knowing

```bash
# Who am I, and do I own this?
npm whoami
npm owner ls masonry-angular

# What is actually published?
npm view masonry-angular
npm view masonry-angular versions
npm view masonry-angular dist-tags

# Discourage a version without deleting it. Reversible, and the recommended
# alternative to unpublishing. Publish the replacement FIRST — deprecating every
# version drops the package from npm search.
npm deprecate masonry-angular@0.0.0 "Placeholder. Use the latest release."
npm deprecate masonry-angular@0.0.0 ""        # undo

# Move the `latest` tag without publishing anything.
npm dist-tag ls masonry-angular
npm dist-tag add masonry-angular@0.1.0 latest

# Ship a preview without moving `latest`.
npm publish ./dist/masonry-angular --tag next
# users then install it with: npm i masonry-angular@next

# Inspect the tarball without publishing.
npm run release:dry                            # runs the tests and build too
npm run pack:lib                               # writes masonry-angular-<version>.tgz
tar -tzf masonry-angular-*.tgz                 # list what is inside it
```

## Things not to do

- **Do not `npm publish` from the workspace root.** The root manifest lists Angular as a runtime
  dependency and declares no entry point, so it would rewrite the dependency tree of anyone who
  installed it. `"private": true` prevents this — leave it there.
- **Do not unpublish to "fix" a bad release.** Publish a patch instead. Unpublishing is irreversible,
  burns the version number permanently, and breaks anyone who pinned it.
- **Do not disable 2FA to make a script work.** If you need unattended publishing, use trusted
  publishing from CI.
- **Do not create a long-lived write token unless you genuinely need one.** They cap at 90 days,
  npm is progressively restricting what they can do, and trusted publishing removes the need.
- **Do not bump the root `package.json` version.** It is not the library's version and is never
  published.
