"use client";

import { useEffect, useState } from "react";
import { differenceInSeconds } from "date-fns";
import { useT } from "@/lib/i18n/messages-provider";

export function QuoteExpiryCountdown({
  expiresAt,
}: {
  expiresAt: Date | string;
}) {
  const t = useT("events");
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, differenceInSeconds(target, now));
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  if (secs === 0)
    return (
      <span className="text-error font-medium">{t("tracking.expiry.expired")}</span>
    );
  if (days >= 2)
    return (
      <span>
        {t("tracking.expiry.prefix")}
        <strong>{t("tracking.expiry.days", { count: days, days })}</strong>
      </span>
    );
  if (days >= 1)
    return (
      <span>
        {t("tracking.expiry.prefix")}
        <strong>{t("tracking.expiry.dayHours", { days, hours })}</strong>
      </span>
    );
  return (
    <span className="text-amber-600 font-medium">
      {t("tracking.expiry.today", { hours })}
    </span>
  );
}
