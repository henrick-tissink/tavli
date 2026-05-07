import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemDialog, type EditableItem } from "../ItemDialog";

jest.mock("@/app/partner/(dashboard)/menu/actions", () => ({
  saveItem: jest.fn(async (payload) => ({ ok: true, payload })),
}));

import { saveItem } from "@/app/partner/(dashboard)/menu/actions";

function blankItem(overrides: Partial<EditableItem> = {}): EditableItem {
  return {
    sectionId: "00000000-0000-0000-0000-000000000001",
    name: "",
    description: "",
    priceLei: 0,
    dietaryTags: [],
    isChefPick: false,
    isAvailable: true,
    ...overrides,
  };
}

describe("ItemDialog price input", () => {
  beforeEach(() => {
    (saveItem as jest.Mock).mockClear();
  });

  it("price input uses inputMode=decimal (not type=number)", () => {
    render(
      <ItemDialog open onClose={jest.fn()} onSaved={jest.fn()} item={blankItem()} />,
    );
    const input = screen.getByLabelText("Preț (lei)") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("decimal");
  });

  it("starts empty when initial price is 0 (no stuck '0')", () => {
    render(
      <ItemDialog open onClose={jest.fn()} onSaved={jest.fn()} item={blankItem()} />,
    );
    const input = screen.getByLabelText("Preț (lei)") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("typing 1 then 5 yields '15'", async () => {
    const user = userEvent.setup();
    render(
      <ItemDialog open onClose={jest.fn()} onSaved={jest.fn()} item={blankItem()} />,
    );
    const input = screen.getByLabelText("Preț (lei)") as HTMLInputElement;
    await user.type(input, "15");
    expect(input.value).toBe("15");
  });

  it("clearing field saves priceLei = 0", async () => {
    const user = userEvent.setup();
    render(
      <ItemDialog
        open
        onClose={jest.fn()}
        onSaved={jest.fn()}
        item={blankItem({ name: "Mestechetura", priceLei: 12 })}
      />,
    );
    const input = screen.getByLabelText("Preț (lei)") as HTMLInputElement;
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: /adaugă fel|salvează modificările/i }));
    expect(saveItem).toHaveBeenCalledWith(expect.objectContaining({ priceLei: 0 }));
  });

  it("typing '1.5' saves priceLei = 1.5", async () => {
    const user = userEvent.setup();
    render(
      <ItemDialog
        open
        onClose={jest.fn()}
        onSaved={jest.fn()}
        item={blankItem({ name: "Soup" })}
      />,
    );
    const input = screen.getByLabelText("Preț (lei)") as HTMLInputElement;
    await user.type(input, "1.5");
    await user.click(screen.getByRole("button", { name: /adaugă fel/i }));
    expect(saveItem).toHaveBeenCalledWith(expect.objectContaining({ priceLei: 1.5 }));
  });

  it("typing '1,5' (Romanian comma) saves priceLei = 1.5", async () => {
    const user = userEvent.setup();
    render(
      <ItemDialog
        open
        onClose={jest.fn()}
        onSaved={jest.fn()}
        item={blankItem({ name: "Soup" })}
      />,
    );
    const input = screen.getByLabelText("Preț (lei)") as HTMLInputElement;
    await user.type(input, "1,5");
    await user.click(screen.getByRole("button", { name: /adaugă fel/i }));
    expect(saveItem).toHaveBeenCalledWith(expect.objectContaining({ priceLei: 1.5 }));
  });
});
