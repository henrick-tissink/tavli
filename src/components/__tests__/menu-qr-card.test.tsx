import { render, screen } from "@testing-library/react";
import { MenuQrCard } from "@/components/menu-qr-card";

// Auto-mock: jest replaces the module with a jest.fn() automatically.
// We then drive the constructor's behaviour per test via mockImplementation.
// Avoids the variable-hoist gotcha you'd hit with a factory function that
// closes over names not prefixed with `mock`.
jest.mock("qr-code-styling");

import QRCodeStyling from "qr-code-styling";
const MockedCtor = QRCodeStyling as unknown as jest.Mock;
const mockAppend = jest.fn();

beforeEach(() => {
  MockedCtor.mockReset();
  mockAppend.mockReset();
  MockedCtor.mockImplementation(() => ({ append: mockAppend }));
});

describe("MenuQrCard", () => {
  test("renders restaurant name, decorative mark, caption, and credit", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
      />,
    );
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
    expect(screen.getByText("✦")).toBeInTheDocument();
    expect(screen.getByText(/scanează pentru a vedea meniul nostru/i)).toBeInTheDocument();
    expect(screen.getByText("tavli.ro")).toBeInTheDocument();
  });

  test("instantiates QRCodeStyling with the encoded URL and Style-B config", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
      />,
    );
    expect(MockedCtor).toHaveBeenCalledTimes(1);
    const opts = MockedCtor.mock.calls[0][0];
    expect(opts.data).toBe("https://tavli.ro/bucuresti/trattoria-roma/menu");
    expect(opts.dotsOptions).toEqual({ type: "dots", color: "#F97316" });
    expect(opts.cornersSquareOptions).toEqual({
      type: "extra-rounded",
      color: "#C2410C",
    });
    expect(opts.backgroundOptions).toEqual({ color: "#FEF0DC" });
    expect(opts.qrOptions).toEqual({ errorCorrectionLevel: "H" });
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  test("size='single' uses the larger 280px QR", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
        size="single"
      />,
    );
    const opts = MockedCtor.mock.calls[0][0];
    expect(opts.width).toBe(280);
    expect(opts.height).toBe(280);
    const root = screen.getByTestId("menu-qr-card");
    expect(root).toHaveAttribute("data-size", "single");
  });

  test("size='tile' uses the smaller 140px QR", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
        size="tile"
      />,
    );
    const opts = MockedCtor.mock.calls[0][0];
    expect(opts.width).toBe(140);
    expect(opts.height).toBe(140);
    const root = screen.getByTestId("menu-qr-card");
    expect(root).toHaveAttribute("data-size", "tile");
  });
});
