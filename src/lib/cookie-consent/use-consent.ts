"use client";
import { useState, useEffect } from "react";

export function useCookieConsent(): { analytics: boolean; marketingTracking: boolean } {
  const [state, setState] = useState({ analytics: false, marketingTracking: false });
  useEffect(() => {
    if (typeof document === "undefined") return;
    const match = document.cookie.match(/(?:^|; )tv_cookie_consent_choice=([^;]*)/);
    if (!match) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1]));
      setState({ analytics: !!parsed.analytics, marketingTracking: !!parsed.marketing });
    } catch {}
  }, []);
  return state;
}
