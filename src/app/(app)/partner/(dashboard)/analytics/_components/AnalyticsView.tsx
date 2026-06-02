"use client";

/**
 * AnalyticsView — the composed Base + Pro analytics dashboard (client).
 * Receives already-fetched, already-shaped data from the RSC page and renders
 * the charts. Pro charts are tier-gated to an upgrade CTA for Base orgs.
 */
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarCheck, Users, CheckCircle2, XCircle, Download, Sparkles } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { usePartnerDateLabels } from "@/lib/i18n/use-date-labels";
import { ACCENT, AXIS, GRID, SERIES, ChartCard, ChartTooltip, EmptyChart } from "./chart-kit";
import { ExportModal } from "./ExportModal";

export interface AnalyticsViewData {
  scopeLabel: string;
  organizationId: string;
  restaurantIds: string[];
  tier: "base" | "pro";
  hasAnyData: boolean;
  overview: { bookings: number; covers: number; completed: number; noShows: number; bookingsDelta: number; coversDelta: number };
  coversPerService: { label: string; covers: number }[];
  noShowTrend: { date: string; rate: number }[];
  partyMix: { bucket: string; count: number }[];
  cancellations: { label: string; count: number }[];
  heatMap: (number | null)[][];
  cohort: { cohort_month: string; month_offset: number; retention_rate: number | null }[];
  leadTime: { date: string; p50: number; p90: number }[];
  channel: { label: string; count: number }[];
  forecast: { date: string; predicted: number; low: number; high: number; confirmed: number }[];
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function delta(t: Translator, n: number): string {
  return n > 0 ? t("view.delta.up", { n }) : n < 0 ? t("view.delta.down", { n }) : t("view.delta.unchanged");
}

export function AnalyticsView({ data }: { data: AnalyticsViewData }) {
  const t = useT("partner.analytics");
  const [exportOpen, setExportOpen] = useState(false);
  const isPro = data.tier === "pro";
  const empty = !data.hasAnyData;

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      {/* Masthead */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">{t("view.eyebrow")}</p>
          <h1 className="font-display text-[34px] font-bold leading-tight text-text-primary">{data.scopeLabel}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isPro ? t("view.subtitlePro") : t("view.subtitleBase")}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setExportOpen(true)}>
          <span className="flex items-center gap-2">
            <Download size={16} /> {t("view.exportData")}
          </span>
        </Button>
      </header>

      {empty ? (
        <div className="rounded-card border border-dashed border-border bg-surface-bg/60 p-12 text-center">
          <h2 className="font-display text-2xl font-bold text-text-primary">{t("view.emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary leading-relaxed">
            {t("view.emptyBody")}
          </p>
        </div>
      ) : (
        <>
          {/* Overview */}
          <section className="mb-8 grid grid-cols-2 gap-4 desktop:grid-cols-4">
            <StatCard label={t("view.stats.bookings")} value={data.overview.bookings} icon={CalendarCheck} hint={delta(t, data.overview.bookingsDelta)} />
            <StatCard label={t("view.stats.covers")} value={data.overview.covers} icon={Users} hint={delta(t, data.overview.coversDelta)} />
            <StatCard label={t("view.stats.completed")} value={data.overview.completed} icon={CheckCircle2} tone="success" />
            <StatCard label={t("view.stats.noShows")} value={data.overview.noShows} icon={XCircle} tone={data.overview.noShows > 0 ? "warning" : "muted"} />
          </section>

          <div className="grid grid-cols-1 gap-5 desktop:grid-cols-2">
            {/* Covers per service */}
            <ChartCard kicker={t("charts.coversPerService.kicker")} title={t("charts.coversPerService.title")}>
              {data.coversPerService.length === 0 ? (
                <EmptyChart message={t("charts.coversPerService.empty")} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.coversPerService} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F9731611" }} />
                    <Bar dataKey="covers" name={t("charts.coversPerService.seriesCovers")} fill={ACCENT} radius={[6, 6, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* No-show trend */}
            <ChartCard kicker={t("charts.noShowTrend.kicker")} title={t("charts.noShowTrend.title")}>
              {data.noShowTrend.length === 0 ? (
                <EmptyChart message={t("charts.noShowTrend.empty")} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.noShowTrend} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} minTickGap={32} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                    <Tooltip content={<ChartTooltip unit="" />} />
                    <Line type="monotone" dataKey="rate" name={t("charts.noShowTrend.seriesRate")} stroke={ACCENT} strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Party size mix */}
            <ChartCard kicker={t("charts.partyMix.kicker")} title={t("charts.partyMix.title")}>
              {data.partyMix.every((p) => p.count === 0) ? (
                <EmptyChart message={t("charts.partyMix.empty")} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.partyMix} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F9731611" }} />
                    <Bar dataKey="count" name={t("charts.partyMix.seriesBookings")} radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {data.partyMix.map((_, i) => (
                        <Cell key={i} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Cancellation reasons */}
            <ChartCard kicker={t("charts.cancellations.kicker")} title={t("charts.cancellations.title")}>
              {data.cancellations.length === 0 ? (
                <EmptyChart message={t("charts.cancellations.empty")} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.cancellations} dataKey="count" nameKey="label" innerRadius={52} outerRadius={84} paddingAngle={2}>
                      {data.cancellations.map((_, i) => (
                        <Cell key={i} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Pro section */}
          <div className="mt-10">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles size={18} className="text-brand-primary" />
              <h2 className="font-display text-2xl font-bold text-text-primary">{t("view.proTitle")}</h2>
            </div>
            {isPro ? (
              <ProPanels data={data} />
            ) : (
              <div className="rounded-card border border-border bg-gradient-to-br from-brand-primary-soft to-surface-white p-8">
                <h3 className="font-display text-xl font-bold text-text-primary">{t("view.proGate.title")}</h3>
                <p className="mt-2 max-w-lg text-sm text-text-secondary leading-relaxed">
                  {t("view.proGate.body")}
                </p>
                <Button className="mt-4">{t("view.proGate.cta")}</Button>
              </div>
            )}
          </div>
        </>
      )}

      {exportOpen && (
        <ExportModal organizationId={data.organizationId} restaurantIds={data.restaurantIds} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

function ProPanels({ data }: { data: AnalyticsViewData }) {
  const t = useT("partner.analytics");
  const { weekdaysShort } = usePartnerDateLabels();
  const heatHasData = data.heatMap.some((row) => row.some((c) => c !== null));
  return (
    <div className="grid grid-cols-1 gap-5 desktop:grid-cols-2">
      {/* Heat map */}
      <ChartCard kicker={t("charts.heatMap.kicker")} title={t("charts.heatMap.title")} span="full">
        {!heatHasData ? (
          <EmptyChart message={t("charts.heatMap.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="flex">
                <div className="w-10" />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-[10px] text-text-muted">
                    {h % 3 === 0 ? h : ""}
                  </div>
                ))}
              </div>
              {data.heatMap.map((row, dow) => (
                <div key={dow} className="flex items-center">
                  <div className="w-10 text-xs font-semibold text-text-secondary">{weekdaysShort[dow]}</div>
                  {row.map((rate, h) => (
                    <div
                      key={h}
                      title={rate == null ? t("charts.heatMap.noData") : t("charts.heatMap.cellTitle", { day: weekdaysShort[dow], hour: h, pct: Math.round(rate * 100) })}
                      className="m-[1px] aspect-square flex-1 rounded-sm"
                      style={{
                        backgroundColor: rate == null ? "#F5F5F4" : `rgba(234, 88, 12, ${0.12 + Math.min(rate, 1) * 0.88})`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      {/* Cohort retention */}
      <ChartCard kicker={t("charts.cohort.kicker")} title={t("charts.cohort.title")}>
        {data.cohort.length === 0 ? (
          <EmptyChart message={t("charts.cohort.empty")} />
        ) : (
          <CohortTriangle cohort={data.cohort} />
        )}
      </ChartCard>

      {/* Lead time */}
      <ChartCard kicker={t("charts.leadTime.kicker")} title={t("charts.leadTime.title")}>
        {data.leadTime.length === 0 ? (
          <EmptyChart message={t("charts.leadTime.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.leadTime} margin={{ left: -8 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} minTickGap={32} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} tickFormatter={(v) => `${Math.round(v / 60)}h`} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="p50" name={t("charts.leadTime.seriesMedian")} stroke={ACCENT} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="p90" name={t("charts.leadTime.seriesP90")} stroke="#C2410C" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Channel attribution */}
      <ChartCard kicker={t("charts.channel.kicker")} title={t("charts.channel.title")}>
        {data.channel.every((c) => c.count === 0) ? (
          <EmptyChart message={t("charts.channel.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart layout="vertical" data={data.channel} margin={{ left: 24 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
              <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={84} tick={{ fontSize: 11, fill: AXIS }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F9731611" }} />
              <Bar dataKey="count" name={t("charts.channel.seriesBookings")} radius={[0, 6, 6, 0]} maxBarSize={22}>
                {data.channel.map((_, i) => (
                  <Cell key={i} fill={SERIES[i % SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Forecast */}
      <ChartCard kicker={t("charts.forecast.kicker")} title={t("charts.forecast.title")} span="full">
        {data.forecast.length === 0 ? (
          <EmptyChart message={t("charts.forecast.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.forecast} margin={{ left: -16 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: AXIS }} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F9731611" }} />
              <Bar dataKey="predicted" name={t("charts.forecast.seriesPredicted")} fill={ACCENT} radius={[5, 5, 0, 0]} maxBarSize={20} />
              <Bar dataKey="confirmed" name={t("charts.forecast.seriesConfirmed")} fill="#9A3412" radius={[5, 5, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function CohortTriangle({ cohort }: { cohort: AnalyticsViewData["cohort"] }) {
  const t = useT("partner.analytics");
  const months = [...new Set(cohort.map((c) => c.cohort_month))].sort().slice(-8);
  const maxOffset = Math.min(6, Math.max(...cohort.map((c) => c.month_offset)));
  const lookup = new Map(cohort.map((c) => [`${c.cohort_month}:${c.month_offset}`, c.retention_rate]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr>
            <th className="text-left font-semibold text-text-secondary">{t("charts.cohort.header")}</th>
            {Array.from({ length: maxOffset + 1 }, (_, o) => (
              <th key={o} className="font-semibold text-text-muted">+{o}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m}>
              <td className="text-left font-medium text-text-secondary">{m.slice(0, 7)}</td>
              {Array.from({ length: maxOffset + 1 }, (_, o) => {
                const rate = lookup.get(`${m}:${o}`);
                return (
                  <td
                    key={o}
                    className="rounded-sm py-1 font-semibold text-text-primary"
                    style={{ backgroundColor: rate == null ? "transparent" : `rgba(249, 115, 22, ${0.1 + Number(rate) * 0.9})` }}
                  >
                    {rate == null ? "" : `${Math.round(Number(rate) * 100)}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
