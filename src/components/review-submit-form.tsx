"use client";

import { useState } from "react";
import { submitReviewByToken } from "@/app/reviews/[token]/actions";

interface Props {
  token: string;
  initialRating: number; // 1..5; 0 means none preselected
}

const MAX_COMMENT = 500;

export function ReviewSubmitForm({ token, initialRating }: Props) {
  const [rating, setRating] = useState<number>(
    initialRating >= 1 && initialRating <= 5 ? initialRating : 0,
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError("Pick a star first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const r = await submitReviewByToken(token, { rating, comment });
    setSubmitting(false);
    if (r.ok) {
      setDone(true);
    } else {
      setError(r.error ?? "Could not save review.");
    }
  }

  if (done) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-card bg-brand-primary-soft p-6 text-center"
      >
        <p className="font-display text-xl font-bold text-brand-primary-dark">
          Thanks — your review is in.
        </p>
        <p className="text-sm text-text-secondary mt-2">
          Verified diners help everyone choose better.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-text-primary mb-2">
          Your rating
        </legend>
        <div className="flex items-center gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only peer"
              />
              <span
                className={`text-3xl rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-primary ${
                  n <= rating ? "text-brand-primary" : "text-text-muted"
                }`}
              >
                ★
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-sm font-semibold text-text-primary">
          Comment <span className="text-text-muted font-normal">(optional)</span>
        </span>
        <textarea
          value={comment}
          maxLength={MAX_COMMENT}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          aria-describedby="review-comment-count"
          className="mt-2 block w-full rounded-lg border border-border p-3 text-sm"
          placeholder="What stood out?"
        />
        <span id="review-comment-count" className="text-xs text-text-muted">
          {comment.length}/{MAX_COMMENT}
        </span>
      </label>
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="w-full bg-brand-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
