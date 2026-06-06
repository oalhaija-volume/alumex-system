# AGENTS.md

## Repository Boundary

You are working only inside this repository:

`/Users/macbook/alumex-quotation-system`

Do not read, modify, delete, move, rename, or reference files outside this repository.

Never modify or interact with:

- Sarh
- Click ERP
- Any other project

Never change:

- Global VS Code settings
- Global Git settings
- Global npm settings

Never delete files without explicit approval.

Never change environment variables without explicit approval.

## Project Stack

This project uses:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Vercel

## Next.js Version Warning

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Before changing any Next.js code, read the relevant documentation in `node_modules/next/dist/docs/` for the API, convention, route type, or configuration being changed.

## Development Server

Use this local development URL:

`http://localhost:3003`

If a development server is needed, run it for this repository only and use port `3003` unless the user explicitly approves another port.

## Design Direction

Build a professional enterprise UI.

Design should be:

- Mobile-first
- Responsive on desktop
- Clear, efficient, and suitable for business workflows
- Consistent with Alumex branding colors

Use restrained enterprise styling, readable typography, strong layout hierarchy, and accessible contrast. Avoid decorative or consumer-style UI that does not support quotation-system workflows.

## Implementation Guidelines

- Keep changes scoped to the user request.
- Prefer existing project patterns and file structure.
- Use TypeScript types intentionally and avoid unnecessary `any`.
- Use Tailwind CSS for styling unless the project already uses another local convention for the target component.
- Keep Supabase integration isolated to appropriate data-access or server-side code.
- Do not introduce new dependencies unless they are clearly needed and approved when the risk or footprint is significant.
- Do not commit secrets, tokens, keys, credentials, or environment-specific values.
- Do not modify deployment settings unless the user asks.

## File Safety

- Do not delete files without approval.
- Do not rename or move files unless required by the task.
- Do not overwrite user work.
- If unrelated changes already exist, leave them alone.
- If a requested change conflicts with existing user changes, preserve the user changes and adapt around them.

## Verification

When practical, verify changes with the project’s existing checks, such as:

- Type checking
- Linting
- Build checks
- Focused manual testing at `http://localhost:3003`

Report what was verified and mention any checks that could not be run.
