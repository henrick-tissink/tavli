import { render, screen, fireEvent } from "@testing-library/react";
import { MenuQrPreview } from "@/app/(app)/partner/(dashboard)/menu/qr/MenuQrPreview";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roMenu from "@/messages/ro/partner.menu.json";

jest.mock("qr-code-styling");
import QRCodeStyling from "qr-code-styling";

function renderPreview(ui: React.ReactElement) {
  return render(
    <MessagesProvider locale="ro" bundle={{ "partner.menu": roMenu }}>
      {ui}
    </MessagesProvider>,
  );
}

beforeEach(() => {
  (QRCodeStyling as unknown as jest.Mock).mockReset();
  (QRCodeStyling as unknown as jest.Mock).mockImplementation(() => ({
    append: jest.fn(),
  }));
});

describe("MenuQrPreview", () => {
  const props = {
    restaurant: {
      name: "Trattoria Roma",
      slug: "trattoria-roma",
      citySlug: "bucuresti",
    },
    menuUrl: "https://tavli.ro/bucuresti/trattoria-roma/menu",
  };

  test("defaults to single-card mode with one MenuQrCard", () => {
    renderPreview(<MenuQrPreview {...props} />);
    const cards = screen.getAllByTestId("menu-qr-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-size", "single");
  });

  test("toggling to sticker sheet renders 12 tile cards", () => {
    renderPreview(<MenuQrPreview {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /coală cu stickere/i }));
    const cards = screen.getAllByTestId("menu-qr-card");
    expect(cards).toHaveLength(12);
    cards.forEach((card) => expect(card).toHaveAttribute("data-size", "tile"));
  });

  test("toggling back to single mode returns to one card", () => {
    renderPreview(<MenuQrPreview {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /coală cu stickere/i }));
    fireEvent.click(screen.getByRole("radio", { name: /card individual/i }));
    const cards = screen.getAllByTestId("menu-qr-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-size", "single");
  });

  test("Print button calls window.print()", () => {
    const printSpy = jest.spyOn(window, "print").mockImplementation(() => {});
    renderPreview(<MenuQrPreview {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^tipărește$/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  test("renders the restaurant name in single mode", () => {
    renderPreview(<MenuQrPreview {...props} />);
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
  });
});
