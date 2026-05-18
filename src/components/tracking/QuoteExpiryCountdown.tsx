"use client";

import { useEffect, useState } from "react";
import { differenceInSeconds } from "date-fns";

export function QuoteExpiryCountdown({
  expiresAt,
}: {
  expiresAt: Date | string;
}) {
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
    return <span className="text-error font-medium">Oferta a expirat</span>;
  if (days >= 2)
    return (
      <span>
        Expiră în <strong>{days} zile</strong>
      </span>
    );
  if (days >= 1)
    return (
      <span>
        Expiră în{" "}
        <strong>
          {days} zi {hours} ore
        </strong>
      </span>
    );
  return (
    <span className="text-amber-600 font-medium">
      Expiră astăzi (în {hours}h)
    </span>
  );
}
