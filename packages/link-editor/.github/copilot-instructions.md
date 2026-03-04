# Copilot Instructions for Link Editor

## Project Overview
This is a **Raycast extension** built with React and TypeScript that provides a form-based interface for editing link parameters. The extension follows Raycast's extension architecture patterns and uses their official APIs.

## Key Architecture Patterns

### Raycast Extension Structure
- **Single command extension**: `edit-link.tsx` defines the main (and only) command
- **Package.json schema**: Uses Raycast's extension schema (`"$schema": "https://www.raycast.com/schemas/extension.json"`)
- **Command registration**: Commands are defined in `package.json` under the `commands` array with `mode: "view"`

### Component Patterns
- **Form-based UI**: Primary interface uses `@raycast/api` Form components
- **Action Panel pattern**: Always include `<ActionPanel>` with `<Action.SubmitForm onSubmit={handleSubmit} />`
- **Form element structure**: Use semantic IDs and include proper titles/placeholders for all form elements

## Development Workflow

### Essential Commands
```bash
# Development mode (hot reload)
npm run dev

# Build for production
npm run build

# Linting and formatting
npm run lint
npm run fix-lint

# Publishing to Raycast Store
npm run publish
```

### Key Dependencies
- `@raycast/api`: Core Raycast APIs (Forms, Actions, Toast notifications)
- `@raycast/utils`: Additional utilities for Raycast extensions
- Uses Raycast's own ESLint config (`@raycast/eslint-config`)

## Project-Specific Conventions

### Form Handling
- Form submission uses `showToast()` for user feedback
- Form values are typed with explicit interfaces (see `Values` type)
- Console logging for debugging form submissions
- Use `Form.Separator` to group related form elements

### Code Style
- Prettier config: 120 char line width, double quotes
- TypeScript strict mode enabled
- React JSX transform (`"jsx": "react-jsx"`)
- ES2023 target with CommonJS modules

### File Organization
- Single source file: `src/edit-link.tsx` (currently shows example form, needs implementation for actual link editing)
- Assets in `assets/` directory (extension icon)
- No tests directory currently present

## Current State & TODOs
⚠️ **Note**: The current implementation shows a demo form with various Raycast form elements, but doesn't actually implement link parameter editing functionality yet. The core link editing logic needs to be implemented.

## Integration Points
- Raycast API for UI components and user interactions
- No external service integrations currently
- Extension publishes to Raycast Store via their CLI tools
