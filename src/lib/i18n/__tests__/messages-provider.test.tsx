import { render, screen } from "@testing-library/react";
import { MessagesProvider, useT } from "@/lib/i18n/messages-provider";

function Probe() {
  const t = useT("common");
  return <span>{t("switchLanguage")}</span>;
}

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
