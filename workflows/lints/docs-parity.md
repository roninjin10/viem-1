# Docs parity lint

Scope: the diff only.

The site is part of the public surface: every exported action, account
utility, or public utility has a docs page with a twoslash code snippet.

For each newly exported public symbol in the diff (src/actions/**,
src/accounts/**, src/utils/**):

- A page must exist under site/pages covering it: what it does, its
  parameters, its return type, and one runnable twoslash example.
- An existing page must be updated when the diff changes a signature,
  a parameter default, or an error the symbol throws.

Internal helpers (not re-exported from an index.ts) are exempt.

Report each missing or stale page with the symbol and the expected page
path. In fix mode, write the page following the structure of the sibling
pages in the same directory.
