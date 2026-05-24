/**
 * §15 §5.1 — parse the BNR nbrfxrates.xml for the EUR/RON reference rate.
 * Pure (no fetch). Structure: <DataSet><Body><Cube date="YYYY-MM-DD">
 * <Rate currency="EUR">4.9725</Rate>…</Cube></Body></DataSet>.
 */
import { XMLParser } from "fast-xml-parser";

export interface BnrRate {
  rate: number;
  effectiveDate: string; // YYYY-MM-DD
}

export function parseBnrXml(xml: string): BnrRate {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const cube = doc?.DataSet?.Body?.Cube;
  if (!cube) throw new Error("TV1302 bnr_rate_parse: no Cube in BNR XML");
  const effectiveDate: string = cube["@_date"];
  const rates = Array.isArray(cube.Rate) ? cube.Rate : [cube.Rate];
  const eur = rates.find((r: { "@_currency"?: string }) => r?.["@_currency"] === "EUR");
  if (!eur) throw new Error("TV1302 bnr_rate_parse: no EUR rate in BNR XML");
  // <Rate currency="EUR" multiplier?> value lives in #text (or the node itself).
  const raw = typeof eur === "object" ? eur["#text"] : eur;
  const multiplier = typeof eur === "object" && eur["@_multiplier"] ? Number(eur["@_multiplier"]) : 1;
  const rate = Number(raw) / multiplier;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("TV1302 bnr_rate_parse: invalid EUR rate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("TV1302 bnr_rate_parse: invalid date");
  return { rate, effectiveDate };
}
