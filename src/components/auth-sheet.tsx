"use client";

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { useAuth } from "@/lib/auth-context";

interface AuthSheetProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

export function AuthSheet({ open, onClose, onAuthenticated }: AuthSheetProps) {
  const { login } = useAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const phoneValid = phone.replace(/\s/g, "").length >= 9;

  const handleContinue = () => {
    if (phoneValid) setStep("otp");
  };

  const handleVerify = () => {
    if (otp.length === 6) {
      login(phone);
      onAuthenticated();
      onClose();
      // Reset for next use
      setStep("phone");
      setPhone("");
      setOtp("");
    }
  };

  const handleClose = () => {
    onClose();
    setStep("phone");
    setPhone("");
    setOtp("");
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="Sign in">
      {step === "phone" && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Enter your phone number to continue
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary font-medium">+40</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              aria-label="Phone number"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <Button fullWidth disabled={!phoneValid} onClick={handleContinue}>
            Continue
          </Button>
        </div>
      )}

      {step === "otp" && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Enter the 6-digit code sent to +40 {phone}
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            aria-label="Verification code"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <Button fullWidth disabled={otp.length !== 6} onClick={handleVerify}>
            Verify
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
