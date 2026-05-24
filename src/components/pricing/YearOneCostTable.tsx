/**
 * §15 §10 + §10a — the "Year one, plainly" table. Totals are derived
 * (yearOneRows) and zipped to localised labels by key, so the maths can't drift
 * from the headline prices. WCAG: real <table> with <th scope>, two columns so
 * it never needs horizontal scroll on mobile. The frequency toggle de-emphasises
 * the off-cadence rows via the `data-freq` attribute (see globals.css).
 */
import type { PricingMessages, Locale } from "@/lib/i18n/load-messages";
import { yearOneRows, formatEur } from "@/lib/pricing/display";

export function YearOneCostTable({
  messages,
  locale,
}: {
  messages: PricingMessages;
  locale: Locale;
}) {
  const { yearOne } = messages;
  const totals = new Map<string, number>(yearOneRows().map((r) => [r.key, r.totalEurCents]));

  return (
    <section className="mx-auto mt-20 max-w-3xl px-6">
      <h2 className="font-display text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
        {yearOne.heading}
      </h2>
      <p className="mt-3 max-w-xl text-text-secondary">{yearOne.intro}</p>

      <table className="mt-8 w-full border-collapse text-left">
        <caption className="sr-only">{yearOne.heading}</caption>
        <thead>
          <tr className="border-b-2 border-text-primary/15">
            <th scope="col" className="pb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {yearOne.planHeader}
            </th>
            <th scope="col" className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
              {yearOne.yearHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {yearOne.rows.map((row) => {
            const cadence = row.key.endsWith("annual") ? "annual" : "monthly";
            const total = totals.get(row.key) ?? 0;
            return (
              <tr key={row.key} data-freq={cadence} className="border-b border-border">
                <th scope="row" className="py-4 pr-4 align-top font-normal">
                  <span className="block font-semibold text-text-primary">{row.plan}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{row.detail}</span>
                </th>
                <td className="py-4 text-right align-top font-display text-xl font-bold tabular-nums text-text-primary">
                  {formatEur(total, locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-5 text-xs leading-relaxed text-text-muted">{yearOne.footnote}</p>
    </section>
  );
}
