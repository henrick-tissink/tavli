import { render, screen } from "@testing-library/react";
import { PrintQrButton } from "@/app/(app)/partner/(dashboard)/menu/PrintQrButton";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roMenu from "@/messages/ro/partner.menu.json";

function renderButton(ui: React.ReactElement) {
  return render(
    <MessagesProvider locale="ro" bundle={{ "partner.menu": roMenu }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("PrintQrButton", () => {
  test("when menuItemCount is 0, renders disabled state with tooltip", () => {
    renderButton(<PrintQrButton menuItemCount={0} />);
    const root = screen.getByTestId("print-qr-button");
    expect(root).toHaveAttribute("data-disabled", "true");
    expect(root.tagName).not.toBe("A");
    expect(root).toHaveAttribute(
      "title",
      "Adaugă cel puțin un fel de mâncare înainte de a tipări",
    );
  });

  test("when menuItemCount is >= 1, renders an enabled link to /partner/menu/qr", () => {
    renderButton(<PrintQrButton menuItemCount={1} />);
    const link = screen.getByRole("link", { name: /tipărește qr/i });
    expect(link).toHaveAttribute("href", "/partner/menu/qr");
    expect(link).toHaveAttribute("data-disabled", "false");
  });
});
