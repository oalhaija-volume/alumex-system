# Alumex Quotation System

Local development instructions for the Alumex quotation system.

## Technology Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Vercel

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3003](http://localhost:3003) in your browser.

## Available Scripts

```bash
npm run dev
```

Starts the local development server on port `3003`.

```bash
npm run build
```

Creates a production build.

```bash
npm run start
```

Starts the production server on port `3003` after a successful build.

```bash
npm run lint
```

Runs the project lint command.

## Development URL

Use this URL for local testing:

[http://localhost:3003](http://localhost:3003)

## Notes

- Keep development changes scoped to this repository.
- Do not commit secrets or environment-specific credentials.
- Use Alumex branding colors and a professional enterprise UI for product work.

## Supabase Environment

Create local environment values from `.env.example` without committing secrets:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is also supported instead of `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Vercel Deployment

Set these environment variables in Vercel Project Settings before deploying:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the default Vercel Next.js build command:

```bash
npm run build
```

Run these checks before deployment:

```bash
npm run lint
npm run build
```

Apply Supabase migrations before using the production app.
