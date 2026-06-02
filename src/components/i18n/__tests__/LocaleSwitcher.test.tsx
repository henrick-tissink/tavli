import { render, screen, fireEvent } from "@testing-library/react";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

// locale-action uses next/headers (server-only); mock it for the jsdom environment.
jest.mock("@/app/(app)/locale-action", () => ({
  setAppLocale: jest.fn(),
}));

describe("LocaleSwitcher (consumer)", () => {
  it("renders the three locale options with the active one marked", () => {
    render(<LocaleSwitcher mode="path" current="en" pathname="/en/bucuresti" />);
    expect(screen.getByRole("link", { name: /Română/i })).toHaveAttribute("href", "/bucuresti");
    expect(screen.getByRole("link", { name: /Deutsch/i })).toHaveAttribute("href", "/de/bucuresti");
    expect(screen.getByRole("link", { name: /English/i })).toHaveAttribute("aria-current", "true");
  });

  it("writes NEXT_LOCALE cookie when a path-mode locale link is clicked", () => {
    // Reset document.cookie before the test.
    // jsdom allows setting and reading document.cookie.
    document.cookie = "NEXT_LOCALE=ro; path=/";

    render(<LocaleSwitcher mode="path" current="ro" pathname="/bucuresti" />);

    const deLink = screen.getByRole("link", { name: /Deutsch/i });
    fireEvent.click(deLink);

    // jsdom accumulates cookies; the most recently set value should be present.
    expect(document.cookie).toContain("NEXT_LOCALE=de");
  });

  it("writes NEXT_LOCALE cookie when switching to English via path-mode", () => {
    document.cookie = "NEXT_LOCALE=ro; path=/";

    render(<LocaleSwitcher mode="path" current="ro" pathname="/bucuresti" />);

    const enLink = screen.getByRole("link", { name: /English/i });
    fireEvent.click(enLink);

    expect(document.cookie).toContain("NEXT_LOCALE=en");
  });
});

describe("LocaleSwitcher (preference)", () => {
  it("renders 3 buttons and marks the active locale with aria-current", () => {
    render(<LocaleSwitcher mode="preference" current="ro" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    const roButton = screen.getByRole("button", { name: /Română/i });
    expect(roButton).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /English/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /Deutsch/i })).not.toHaveAttribute("aria-current");
  });
});
