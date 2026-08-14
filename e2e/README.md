# Acceptance smoke tests

Credential-free Playwright tests that confirm the app is served and that its
authentication gate works. They need no account: they check the login page
renders and that protected routes redirect a signed-out visitor to `/login`.

## Run against a local build

```bash
npm run build
npx next start -p 3000 &
BASE_URL=http://localhost:3000 npm run test:e2e
```

## Run against a deployed URL (preview or production)

```bash
BASE_URL=https://deploy-preview-<n>--tuv-training-portal.netlify.app npm run test:e2e
```

## Browsers

`npm run test:e2e` uses Playwright's Chromium. On a fresh machine install it
once with `npx playwright install chromium`. In an environment that already has
a Chromium build, point the config at it with
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome`.

## What they cover today

- The login page renders its title, sign-in button, and email field.
- The root path resolves to a known screen.
- `/orders`, `/calendar`, `/worklist`, `/clients`, and `/data-quality` each
  redirect to `/login` when signed out.

## Signed-in flows

Set `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` to enable the authenticated setup
project. It signs in once, stores browser state in the gitignored `e2e/.auth`
directory, and runs the role-home plus authenticated accessibility checks.
Keep these values in CI secrets, never in the repository.
