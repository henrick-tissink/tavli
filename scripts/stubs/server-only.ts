// No-op stub for `import "server-only"` in the pg-boss WORKER process.
//
// This Next version vendors `server-only` internally (only exists at
// next/dist/compiled/server-only), so there is no top-level package to resolve.
// The web app is fine — Next's bundler aliases it during `next build`. But the
// worker runs the TypeScript directly via `tsx` (no Next build), where the many
// `import "server-only"` statements across src/lib would fail to resolve. The
// real published package additionally THROWS outside a react-server context, so
// it can't be used here either. tsconfig.worker.json maps `server-only` → this
// empty module so those imports become harmless no-ops in the worker.
export {};
