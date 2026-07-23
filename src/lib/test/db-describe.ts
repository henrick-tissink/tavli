/**
 * Guard for integration tests that hit a REAL Postgres via the unmocked
 * service-role client (dbAdmin / createSupabaseAdminClient).
 *
 * These tests write with no RLS and (mostly) no cleanup, so running them against
 * a production DATABASE_URL pollutes prod — the documented prod-DB hazard. There
 * is no CI, so `npm test` runs everything locally against whatever `.env.local`
 * points at. To make the default `npm test` SAFE (and green), integration suites
 * use `describeDb` instead of `describe`: they SKIP unless you explicitly opt in
 * with `RUN_DB_TESTS=1`, which you should only do with `.env`/`DATABASE_URL`
 * pointing at a local, seeded, throwaway database.
 *
 *   RUN_DB_TESTS=1 npm test -- corporate-clients-repo   # against a LOCAL db
 */
export const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;
