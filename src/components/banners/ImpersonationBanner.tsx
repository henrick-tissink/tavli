import { readImpersonationReturnCookie } from "@/lib/auth/impersonation-cookie";
import { stopImpersonationSession } from "@/lib/auth/impersonation-session";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ago`;
}

/**
 * Persistent red banner shown when an impersonation session is active.
 * Renders in the admin's hijacked session (read from the encrypted return
 * cookie). Partner's own concurrent sessions do not see this banner — see
 * §5a.3 spec divergence note in the design doc.
 */
export async function ImpersonationBanner() {
  const cookie = await readImpersonationReturnCookie();
  if (!cookie) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Impersonation session active"
      className="fixed top-0 inset-x-0 z-50 h-12 bg-red-600 text-white"
    >
      <div className="flex items-center justify-between h-full px-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm font-medium">
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>
            Tavli support viewing this account as {cookie.adminEmail}
          </span>
          <span className="opacity-70">·</span>
          <span>Acting as {cookie.targetEmail}</span>
          <span className="opacity-70">·</span>
          <span>Started {relativeTime(cookie.startedAt)}</span>
        </div>
        <form
          action={async () => {
            "use server";
            await stopImpersonationSession();
          }}
        >
          <button
            type="submit"
            className="rounded-full border border-white/50 px-3 py-1 text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Stop impersonating →
          </button>
        </form>
      </div>
    </div>
  );
}
