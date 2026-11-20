---
applyTo: "**"
---

# Token Efficiency Rules

## Response & Code Output

- **Be concise and direct**: Do not repeat the request or unchanged code
- **Show only relevant snippets**: Identify the file/function
- **Output full files only** when explicitly requested
- **Explain the change once**, then show it

## Investigation & Implementation

- **Limit investigation** to relevant files
- **Prefer the smallest correct implementation** without unnecessary:
  - Helpers
  - Services
  - Components
  - Utilities
  - Abstractions
  - Dependencies

## After Changes

Keep final reports strictly to:

1. **Changed**: What was modified
2. **Why**: The reason for the change
3. **Files**: Which files were affected
4. **Test steps**: What to verify

**Never skip** safety warnings or hide uncertainty for brevity.
