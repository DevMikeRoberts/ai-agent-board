# Contributing

Thanks for your interest in contributing to AI Agent Board!

## Getting Started

See the [README](README.md) for setup instructions. The quickest path is:

```bash
npm install
npm run dev:server   # Terminal 1
npm run dev:client   # Terminal 2
```

## Running Tests

```bash
# E2E tests (requires both client and server running)
npm test
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run the E2E tests to make sure nothing is broken
4. Submit a pull request

### Pull Request Guidelines

- Keep the scope focused — one concern per PR
- Describe what changed and why in the PR description
- If adding a new feature, include test coverage where practical

### Code Style

- TypeScript with `strict` mode enabled
- Shared types live in `shared/` — both client and server import from there
- Server uses the repository pattern (`repositories/`) and provider pattern (`agents/`)
- Follow existing patterns in the codebase rather than introducing new ones

## Project Structure

```
packages/
  client/    # React 19 + Vite + Tailwind CSS 4
  server/    # Express + multi-agent SDKs + SQLite/PostgreSQL
  e2e/       # Playwright tests
shared/      # Shared TypeScript types and validation constants
```
