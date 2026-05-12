import { render, screen, fireEvent } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { CookieFootnote } from "@/components/legal/cookie-footnote";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;

describe("<CookieFootnote>", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders RO copy on non-/en routes", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<CookieFootnote />);
    expect(screen.getByText(/cookie-uri esențiale/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Detalii/ })).toHaveAttribute(
      "href",
      "/cookie-uri",
    );
  });

  it("renders EN copy on /en routes", () => {
    usePathnameMock.mockReturnValue("/en/restaurants");
    render(<CookieFootnote />);
    expect(screen.getByText(/essential cookies/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Details/ })).toHaveAttribute(
      "href",
      "/en/cookies",
    );
  });

  it("hides after the user acknowledges", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<CookieFootnote />);
    fireEvent.click(screen.getByRole("button", { name: /OK/i }));
    expect(screen.queryByText(/cookie-uri esențiale/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("tavli_cookies_ack")).not.toBeNull();
  });

  it("does not render on legal policy routes", () => {
    usePathnameMock.mockReturnValue("/confidentialitate");
    const { container } = render(<CookieFootnote />);
    expect(container).toBeEmptyDOMElement();
  });
});
