"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

interface Item {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  new_event_request: "Cerere nouă",
  event_request_replied: "Răspuns nou",
  event_request_quoted: "Ofertă trimisă",
  quote_accepted: "Ofertă acceptată",
  quote_declined: "Ofertă refuzată",
  event_request_cancelled: "Cerere anulată",
};

export function PartnerNotificationBell() {
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
        aria-label="Notificări"
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
            <p className="text-sm text-zinc-500 p-3">Nimic nou.</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className="text-sm p-2 hover:bg-zinc-50">
                <span className="font-medium">
                  {KIND_LABEL[n.kind] ?? n.kind}
                </span>{" "}
                · {new Date(n.createdAt).toLocaleString("ro-RO")}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
