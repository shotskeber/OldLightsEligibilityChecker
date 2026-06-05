# Old Lights Eligibility Checker

A simple client-side web app that signs in with Bungie, fetches Destiny 2 activity history, and checks whether an account has any recorded playtime in each Old Lights eligibility period.

## Required environment variables

Create a Bungie public application and configure:

- `NEXT_PUBLIC_BUNGIE_CLIENT_ID`
- `NEXT_PUBLIC_BUNGIE_API_KEY`
- `NEXT_PUBLIC_APP_URL`

For local development, `NEXT_PUBLIC_APP_URL` should usually be `http://localhost:4173`.

For production, set it to your deployed site URL and add the same redirect URL to the Bungie application settings.

## Local development

```bash
node scripts/dev-server.mjs
```

Open `http://localhost:4173`.

## Tests

```bash
node --test tests/*.test.mjs
```

## Build

```bash
node scripts/build.mjs
```

The build output is written to `dist/`.

## Vercel deployment

1. Import this repo or run `vercel` from the project directory.
2. Set the three public environment variables in Vercel.
3. Ensure the Bungie application redirect URL matches the deployed site root.
4. Redeploy after env vars are added.
