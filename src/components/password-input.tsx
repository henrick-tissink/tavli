"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...rest }: Props) {
  const t = useT("ui");
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const toggle = () => {
    setVisible((v) => !v);
    // Restore focus to the input so the user can keep typing without
    // tapping back into the field.
    ref.current?.focus();
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={
          className ??
          "w-full rounded-lg border border-border pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        }
        {...rest}
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={visible}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-2 text-text-muted hover:text-text-primary"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
