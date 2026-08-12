import { readImpersonationReturnCookie } from "@/lib/auth/impersonation-cookie";
import { stopImpersonationSession } from "@/lib/auth/impersonation-session";
import { SubmitButton } from "@/components/submit-button";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, type AdminUsersMessages } from "@/lib/i18n/messages";
import { type Locale } from "@/lib/i18n/locale";
import { interpolate, translate } from "@/lib/i18n/t";

function relativeTime(
  iso: string,
  locale: Locale,
  m: AdminUsersMessages["impersonationBanner"],
): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return m.justNow;
  if (mins < 60) return translate(locale, m.minAgo, { count: mins });
  const hours = Math.floor(mins / 60);
  return translate(locale, m.hrAgo, { count: hours });
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

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "admin.users").impersonationBanner;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={m.ariaLabel}
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
          <span>{interpolate(m.viewingAs, { email: cookie.adminEmail })}</span>
          <span className="opacity-70">·</span>
          <span>{interpolate(m.actingAs, { email: cookie.targetEmail })}</span>
          <span className="opacity-70">·</span>
          <span>
            {interpolate(m.started, {
              time: relativeTime(cookie.startedAt, locale, m),
            })}
          </span>
        </div>
        <form
          action={async () => {
            "use server";
            await stopImpersonationSession();
          }}
        >
          {/* Ending the session tears down cookies and redirects, so the wait
              is visible. The `!` modifiers keep the banner's pill styling on
              top of the shared Button's own utilities. */}
          <SubmitButton
            variant="ghost"
            className="rounded-full! border-white/50! px-3! py-1! text-sm! font-medium text-white! hover:bg-white/10! focus-visible:ring-white!"
          >
            {m.stop}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
