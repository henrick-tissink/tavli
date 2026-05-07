import { render, screen } from "@testing-library/react";
import { PrintQrButton } from "@/app/partner/(dashboard)/menu/PrintQrButton";

describe("PrintQrButton", () => {
  test("when menuItemCount is 0, renders disabled state with tooltip", () => {
    render(<PrintQrButton menuItemCount={0} />);
    const root = screen.getByTestId("print-qr-button");
    expect(root).toHaveAttribute("data-disabled", "true");
    expect(root.tagName).not.toBe("A");
    expect(root).toHaveAttribute(
      "title",
      "Adaugă cel puțin un fel de mâncare înainte de a tipări",
    );
  });

  test("when menuItemCount is >= 1, renders an enabled link to /partner/menu/qr", () => {
    render(<PrintQrButton menuItemCount={1} />);
    const link = screen.getByRole("link", { name: /tipărește qr/i });
    expect(link).toHaveAttribute("href", "/partner/menu/qr");
    expect(link).toHaveAttribute("data-disabled", "false");
  });
});
