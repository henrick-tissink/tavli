/**
 * The repo layer's mock/db switch, shared by every service-client data module
 * (translations loaders, telemetry, overview stats, sign-in locale sync).
 *
 * In mock mode the repos serve fixtures with integer ids — any service-client
 * query against uuid columns would crash — so these modules no-op when this
 * returns false. Read lazily (not a module-level const) so tests can vary env.
 */
export function dbEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_DB === "true";
}
