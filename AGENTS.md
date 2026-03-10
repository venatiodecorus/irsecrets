# AGENTS.md

## Project Overview

IRC chat simulation game built with **Vite + React 19 + TypeScript**. Players infiltrate a hacktivist group by chatting with AI-powered characters (driven by Claude Haiku). Deployed on **Vercel** with a serverless function (`api/claude.ts`) proxying requests to the Anthropic API.

## Build / Lint / Test Commands

```bash
# Development (use vercel dev, NOT vite, to enable the /api/claude serverless function)
vercel dev

# Type-check
npx tsc --noEmit

# Build (type-check + bundle)
npm run build        # tsc -b && vite build

# Lint
npm run lint         # eslint .

# Preview production build
npm run preview
```

**No test framework is configured.** There are no test files or test commands.

## Project Structure

```
api/
  claude.ts                  # Vercel serverless function (Anthropic API proxy)
src/
  characters/                # Character data (JSON files, loaded via import.meta.glob)
    alice.json, bob.json, charlie.json
  components/
    chat.tsx                 # Main Chat UI component
    chat.css                 # Chat styles
  services/
    characters.ts            # Character loading, state management, types
    chat.ts                  # useChatService hook, message orchestration
    claude.ts                # ClaudeService class (client-side fetch wrapper)
    characterPrompt.ts       # System prompt builder for AI characters
  App.tsx                    # Root component
  main.tsx                   # Entry point
```

## TypeScript Configuration

Strict mode is enabled with these enforced settings (from `tsconfig.app.json`):

- `strict: true`
- `noUnusedLocals: true` — no unused variables
- `noUnusedParameters: true` — prefix unused params with `_`
- `noFallthroughCasesInSwitch: true`
- `verbatimModuleSyntax: true` — type-only imports MUST use `import type` or inline `type` keyword
- `erasableSyntaxOnly: true`

## Code Style

### Formatting

- **Indentation**: 2 spaces
- **Semicolons**: Always
- **Quotes**: Double quotes for all strings and imports
- **Trailing commas**: Yes, in multi-line objects, arrays, function parameters, and argument lists
- No Prettier or formatter is configured — follow existing patterns manually

### Imports

Order imports in this sequence, separated by blank lines where natural:

1. CSS imports (`import "./chat.css"`)
2. React/library imports (`import { useState, useEffect } from "react"`)
3. Local module imports (`import { useChatService } from "../services/chat"`)

Type-only imports must use the `type` keyword (required by `verbatimModuleSyntax`):

```ts
// Standalone type import
import type { Character } from "./characters";

// Mixed value + type import (inline type keyword)
import { getAllCharacters, type CharacterDebugInfo } from "./characters";
```

### Naming Conventions

| Kind | Convention | Examples |
|---|---|---|
| Variables, functions | camelCase | `lastGroupSpeaker`, `sendMessage` |
| React components | PascalCase | `Chat`, `App` |
| Interfaces, types, classes | PascalCase | `Character`, `TrustTier`, `ClaudeService` |
| Constants | UPPER_SNAKE_CASE | `GROUP_CHANNEL_ID`, `MAX_INTERVAL_MS` |
| Files | lowercase kebab-case | `chat.tsx`, `characterPrompt.ts` |
| Unused parameters | Underscore prefix | `_character` |

### Types

- Use `interface` for object shapes (`interface Character { ... }`)
- Use `type` for unions and aliases (`type Mood = "neutral" | "annoyed"`)
- Extract and export types at the top of the file — don't use inline type literals for shared shapes
- Never use `any` — prefer `unknown` with type narrowing if the type is uncertain

### Exports

- **React components**: default export (`export default Chat`)
- **Services, types, utilities**: named exports (`export function getAllCharacters()`)
- **API handlers**: default export (`export default async function handler`)

### React Patterns

- Function components only (no class components)
- Standard React hooks: `useState`, `useEffect`, `useRef`, `useCallback`
- Use `useRef` to avoid stale closures in callbacks (see `channelsRef`, `playerHandleRef` patterns in `chat.ts`)
- Module-level `let` variables for mutable state that doesn't need to trigger re-renders
- Fragment shorthand `<>...</>` (not `<React.Fragment>`)
- No state management library — pure React state + refs + module-level state

### Error Handling

- `try/catch` with `console.error` for logging
- Safe error message extraction: `err instanceof Error ? err.message : "Unknown error"`
- Functions return `undefined` or result objects for missing/invalid state rather than throwing
- API handlers return appropriate HTTP status codes

### File Organization

Within a service file, organize sections in this order:

```
// --- Types ---
// --- Constants ---
// --- Module-level state ---
// --- Helper functions ---
// --- Main export (hook, class, handler) ---
```

Use `// --- Section Name ---` comments to delimit major sections.

## Architecture Notes

- **Client-side**: `ClaudeService` calls `fetch("/api/claude", ...)` to send messages
- **Server-side**: `api/claude.ts` proxies to Anthropic using `@anthropic-ai/sdk`
- **Character data**: JSON files in `src/characters/`, loaded eagerly via Vite's `import.meta.glob`
- **Character state**: Managed in a module-level `Map<string, CharacterState>` (trust, mood, irritation)
- **Trust system**: cold (0-2) -> cautious (3-5) -> warm (6-7) -> trusted (8-10); each tier unlocks behaviors in the AI prompt
- **Chat orchestration**: `useChatService` hook manages channels, message sending, AI response generation, idle chatter intervals, and DM sessions
- **CSS**: Plain CSS files + `terminal.css` library for retro terminal aesthetic. No Tailwind, no CSS modules, no CSS-in-JS.
- **No routing**: Single-page app with channel tabs, no React Router

## Task Tracking

`TODO.md` is the project's feature and task backlog. Follow these rules:

- **When you complete a task** that appears in `TODO.md`, mark it done by changing `- [ ]` to `- [x]`.
- **When the developer explicitly confirms a new feature requirement** during conversation, add it to the appropriate section in `TODO.md` as an unchecked item (`- [ ]`).
- Do **not** add speculative or unconfirmed ideas — only requirements that the developer has explicitly agreed to.

## Environment Variables

- `ANTHROPIC_API_KEY` — required in `.env` (gitignored), used server-side by the Anthropic SDK
