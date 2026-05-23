"use client";
import { useState, useEffect, useTransition } from "react";

const SESSION_COOKIE = "tv_visitor_session";
const CHOICE_COOKIE = "tv_cookie_consent_choice";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}

export function CookieBanner() {
  const [show, setShow] = useState(false);
  const [showCustomise, setShowCustomise] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (getCookie(CHOICE_COOKIE)) return;
    let session = getCookie(SESSION_COOKIE);
    if (!session) {
      session = crypto.randomUUID();
      setCookie(SESSION_COOKIE, session, 395);
    }
    setShow(true);
  }, []);

  async function submit(choice: { analytics: boolean; marketing: boolean }) {
    const session = getCookie(SESSION_COOKIE)!;
    startTransition(async () => {
      await fetch("/api/cookie-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorSessionId: session,
          analytics: choice.analytics,
          marketingTracking: choice.marketing,
        }),
      });
      setCookie(CHOICE_COOKIE, JSON.stringify(choice), 395);
      setShow(false);
      setShowCustomise(false);
    });
  }

  if (!show) return null;

  if (showCustomise) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-300 bg-white p-4 shadow-lg">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-base font-semibold">Cookie preferences</h2>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2 opacity-60">
              <input type="checkbox" checked disabled />
              Essential (always on)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              Analytics (anonymised page views)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              Marketing tracking
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => submit({ analytics, marketing })} disabled={pending} className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white">Save</button>
            <button type="button" onClick={() => setShowCustomise(false)} className="rounded-md border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-300 bg-white p-4 shadow-lg">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-700">
          We use cookies for essential site features and (with your permission) analytics.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => submit({ analytics: true, marketing: true })} disabled={pending} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white">Accept all</button>
          <button type="button" onClick={() => submit({ analytics: false, marketing: false })} disabled={pending} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm">Essentials only</button>
          <button type="button" onClick={() => setShowCustomise(true)} disabled={pending} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm">Customise</button>
        </div>
      </div>
    </div>
  );
}
