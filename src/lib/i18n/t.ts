import { type Locale } from "./locale";
import { pluralCategory } from "./format";

/** A message is either a plain string or a plural-form bag keyed by CLDR category. */
export type MessageValue = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Vars = Record<string, string | number>;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

/** Resolve a message value to a final string for `locale`, applying plurals + interpolation. */
export function translate(
  locale: Locale,
  value: MessageValue,
  vars?: Vars,
): string {
  if (typeof value === "string") return interpolate(value, vars);
  const count = typeof vars?.count === "number" ? vars.count : 0;
  const category = pluralCategory(locale, count);
  const chosen =
    value[category] ?? value.other ?? Object.values(value)[0] ?? "";
  return interpolate(chosen, vars);
}
