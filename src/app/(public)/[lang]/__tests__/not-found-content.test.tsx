import { render, screen } from "@testing-library/react";
import { NotFoundContent, type NotFoundCopy } from "../NotFoundContent";
import type { Locale } from "@/lib/i18n/locale";

const mockParams = jest.fn();
jest.mock("next/navigation", () => ({ useParams: () => mockParams() }));

const COPY: Record<Locale, NotFoundCopy> = {
  ro: { eyebrow: "Eroare 404", title: "Masa asta nu există.", body: "ro-body", cta: "Vezi restaurantele" },
  en: { eyebrow: "Error 404", title: "This table doesn't exist.", body: "en-body", cta: "Browse restaurants" },
  de: { eyebrow: "Fehler 404", title: "Diesen Tisch gibt es nicht.", body: "de-body", cta: "Restaurants ansehen" },
};

describe("NotFoundContent", () => {
  afterEach(() => mockParams.mockReset());

  // The regression: the first cut negotiated the locale from cookie /
  // Accept-Language, which rendered a German headline above the Romanian
  // footer that [lang]/layout had already committed to. The route wins.
  it.each([
    ["ro", "Masa asta nu există.", "/"],
    ["en", "This table doesn't exist.", "/en"],
    ["de", "Diesen Tisch gibt es nicht.", "/de"],
  ])("renders %s copy and home link from the route param", (lang, title, href) => {
    mockParams.mockReturnValue({ lang, city: "bucuresti" });
    render(<NotFoundContent copy={COPY} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole("link")).toHaveAttribute("href", href);
  });

  it("falls back to RO when the segment is not a locale", () => {
    mockParams.mockReturnValue({ lang: "not-a-locale" });
    render(<NotFoundContent copy={COPY} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Masa asta nu există.");
  });

  it("falls back to RO when there are no params at all", () => {
    mockParams.mockReturnValue(null);
    render(<NotFoundContent copy={COPY} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Masa asta nu există.");
  });
});
