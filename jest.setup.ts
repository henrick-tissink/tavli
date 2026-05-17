import "@testing-library/jest-dom";
import { config as loadDotenv } from "dotenv";
import path from "path";

// Jest sets NODE_ENV=test, which makes next/jest's loadEnvConfig skip
// `.env.local`. Repos and integration tests still need real connection
// strings (DATABASE_URL, SUPABASE_*), so load `.env.local` manually here
// without overriding anything Next already set.
loadDotenv({ path: path.resolve(__dirname, ".env.local"), override: false, quiet: true });
