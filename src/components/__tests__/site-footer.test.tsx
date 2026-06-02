import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;

describe("<SiteFooter>", () => {
  it("renders on consumer routes", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText(/Confidențialitate/)).toBeInTheDocument();
  });

  it("does not render on /admin/* routes", () => {
    usePathnameMock.mockReturnValue("/admin/restaurants");
    const { container } = render(<SiteFooter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render on /partner/* routes", () => {
    usePathnameMock.mockReturnValue("/partner/reservations");
    const { container } = render(<SiteFooter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders ANPC and EU ODR external links with rel='noopener noreferrer'", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<SiteFooter />);
    const anpc = screen.getByRole("link", { name: /ANPC SAL/i });
    const odr = screen.getByRole("link", { name: /EU ODR/i });
    expect(anpc).toHaveAttribute("href", "https://anpc.ro/ce-este-sal/");
    expect(anpc).toHaveAttribute("rel", "noopener noreferrer");
    expect(anpc).toHaveAttribute("target", "_blank");
    expect(odr).toHaveAttribute("href", "https://ec.europa.eu/consumers/odr");
    expect(odr).toHaveAttribute("rel", "noopener noreferrer");
    expect(odr).toHaveAttribute("target", "_blank");
  });

  it("language switcher offers the other locales (3-way) on RO routes", () => {
    usePathnameMock.mockReturnValue("/confidentialitate");
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: /English/i })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("link", { name: /Deutsch/i })).toHaveAttribute("href", "/de");
    expect(screen.queryByRole("link", { name: /Română/i })).not.toBeInTheDocument();
  });

  it("renders German copy and locale-aware legal hrefs when locale='de'", () => {
    // A partner/app pathname has no /de segment; the locale prop must win.
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<SiteFooter locale="de" />);
    expect(screen.getByText(/Finden Sie Ihren Tisch\./)).toBeInTheDocument();
    expect(screen.getByText("Datenschutz")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Datenschutz" })).toHaveAttribute("href", "/de/privacy");
    expect(screen.getByRole("link", { name: /Română/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /English/i })).toHaveAttribute("href", "/en");
  });
});
