"use client";

import { useState } from "react";
import { Button } from "./button";
import {
  EventRequestSheet,
  EventRequestSheetProps,
} from "./event-request-sheet";
import { useT } from "@/lib/i18n/messages-provider";

interface Props extends Omit<EventRequestSheetProps, "open" | "onClose"> {
  enabled: boolean;
}

export function EventRequestCta({ enabled, ...sheetProps }: Props) {
  const t = useT("events");
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        onClick={() => setOpen(true)}
      >
        {t("cta.organise")}
      </Button>
      <EventRequestSheet
        {...sheetProps}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
