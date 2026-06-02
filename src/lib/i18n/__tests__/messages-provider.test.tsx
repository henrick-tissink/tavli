import { render, screen } from "@testing-library/react";
import { MessagesProvider, useT, useLocale } from "@/lib/i18n/messages-provider";

function Probe() {
  const t = useT("common");
  return <span>{t("switchLanguage")}</span>;
}

describe("useLocale", () => {
  it("returns the locale from the provider context", () => {
    function LocaleProbe() {
      const locale = useLocale();
      return <span data-testid="locale">{locale}</span>;
    }
    render(
      <MessagesProvider locale="de" bundle={{ common: { switchLanguage: "Sprache ändern" } }}>
        <LocaleProbe />
      </MessagesProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("de");
  });
});

describe("MessagesProvider + useT", () => {
  it("resolves a key from the provided bundle in the active locale", () => {
    render(
      <MessagesProvider
        locale="de"
        bundle={{ common: { switchLanguage: "Sprache ändern" } }}
      >
        <Probe />
      </MessagesProvider>,
    );
    expect(screen.getByText("Sprache ändern")).toBeInTheDocument();
  });

  it("resolves a plural form via useT (count=20 → 'other' form)", () => {
    function PluralProbe() {
      const t = useT("common");
      return <span>{t("tables", { count: 20 })}</span>;
    }
    render(
      <MessagesProvider
        locale="ro"
        bundle={{
          common: {
            tables: { one: "{count} masă", few: "{count} mese", other: "{count} de mese" },
          },
        }}
      >
        <PluralProbe />
      </MessagesProvider>,
    );
    expect(screen.getByText("20 de mese")).toBeInTheDocument();
  });

  it("returns the key itself when missing, and interpolates vars", () => {
    function Probe2() {
      const t = useT("common");
      return (
        <>
          <span data-testid="missing">{t("nope")}</span>
          <span data-testid="interp">{t("hi", { name: "Ana" })}</span>
        </>
      );
    }
    render(
      <MessagesProvider locale="ro" bundle={{ common: { hi: "Salut {name}" } }}>
        <Probe2 />
      </MessagesProvider>,
    );
    expect(screen.getByTestId("missing")).toHaveTextContent("nope");
    expect(screen.getByTestId("interp")).toHaveTextContent("Salut Ana");
  });
});
