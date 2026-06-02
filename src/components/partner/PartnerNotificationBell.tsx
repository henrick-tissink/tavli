"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { BCP47 } from "@/lib/i18n/locale";

interface Item {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function PartnerNotificationBell() {
  const t = useT("partner.common");
  const locale = useLocale();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const res = await fetch("/api/partner-notifications", {
          cache: "no-store",
        });
        if (!mounted || !res.ok) return;
        const data = await res.json();
        setCount(data.count);
        setItems(data.items);
      } catch {
        // network errors swallowed — next interval will retry
      }
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  async function onBellClick() {
    setOpen((o) => !o);
    if (count > 0) {
      try {
        const res = await fetch("/api/partner-notifications", {
          method: "POST",
        });
        if (res.ok) setCount(0);
      } catch (e) {
        console.error(e);
      }
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("bell.ariaLabel")}
        onClick={onBellClick}
        className="relative p-2 rounded-lg hover:bg-surface-bg text-text-secondary"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded shadow-lg p-2 z-10">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500 p-3">{t("bell.empty")}</p>
          ) : (
            items.map((n) => {
              const label = t(`bell.kinds.${n.kind}`);
              return (
                <div key={n.id} className="text-sm p-2 hover:bg-zinc-50">
                  <span className="font-medium">
                    {label === `bell.kinds.${n.kind}` ? n.kind : label}
                  </span>{" "}
                  · {new Date(n.createdAt).toLocaleString(BCP47[locale])}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
