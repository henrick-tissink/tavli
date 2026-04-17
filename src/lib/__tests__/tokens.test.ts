import { colors, spacing, radii, shadows, breakpoints, typography } from "@/lib/tokens";

describe("Design Tokens", () => {
  test("colors has all required tokens", () => {
    expect(colors.brandPrimary).toBe("#F97316");
    expect(colors.brandPrimarySoft).toBe("#FFF7ED");
    expect(colors.brandPrimaryDark).toBe("#EA580C");
    expect(colors.surfaceWhite).toBe("#FFFFFF");
    expect(colors.surfaceBg).toBe("#FAFAF9");
    expect(colors.surfaceWarm).toBe("#FEF3C7");
    expect(colors.textPrimary).toBe("#1C1917");
    expect(colors.textSecondary).toBe("#78716C");
    expect(colors.textMuted).toBe("#A8A29E");
    expect(colors.border).toBe("#E7E5E4");
    expect(colors.success).toBe("#16A34A");
    expect(colors.error).toBe("#DC2626");
    expect(colors.info).toBe("#0EA5E9");
  });

  test("spacing base unit is 4", () => {
    expect(spacing.base).toBe(4);
    expect(spacing[1]).toBe("4px");
    expect(spacing[2]).toBe("8px");
    expect(spacing[4]).toBe("16px");
  });

  test("radii match spec", () => {
    expect(radii.card).toBe("16px");
    expect(radii.button).toBe("10px");
    expect(radii.avatar).toBe("50%");
  });

  test("breakpoints match spec", () => {
    expect(breakpoints.tablet).toBe(768);
    expect(breakpoints.desktop).toBe(1024);
  });
});
