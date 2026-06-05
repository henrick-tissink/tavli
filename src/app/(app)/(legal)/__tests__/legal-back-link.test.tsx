/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockUsePathname = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

import { LegalBackLink } from "../legal-back-link";

describe("LegalBackLink", () => {
  it.each([
    ["/cookie-uri", "← Înapoi la Tavli", "/"],
    ["/en/cookies", "← Back to Tavli", "/en"],
    ["/de/cookies", "← Zurück zu Tavli", "/de"],
  ])("on %s renders %p linking to %s", (pathname, label, href) => {
    mockUsePathname.mockReturnValue(pathname);
    render(<LegalBackLink />);
    const link = screen.getByRole("link", { name: label });
    expect(link).toHaveAttribute("href", href);
  });
});
