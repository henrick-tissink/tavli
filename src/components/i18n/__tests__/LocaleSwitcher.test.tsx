import { render, screen } from "@testing-library/react";
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
});
