import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuEditor, type MenuSectionData } from "../MenuEditor";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roMenu from "@/messages/ro/partner.menu.json";
import roCommon from "@/messages/ro/partner.common.json";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/app/(app)/partner/(dashboard)/menu/actions", () => ({
  saveItem: jest.fn(async () => ({ ok: true })),
  createSection: jest.fn(async () => ({ ok: true })),
  updateSection: jest.fn(async () => ({ ok: true })),
  deleteSection: jest.fn(async () => ({ ok: true })),
  deleteItem: jest.fn(async () => ({ ok: true })),
}));

const SECTION: MenuSectionData = {
  id: "00000000-0000-0000-0000-0000000000aa",
  name: "Aperitive",
  intro: null,
  sortOrder: 0,
  items: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Pâine de casă",
      description: "Cu unt afumat",
      priceCents: 2200,
      dietaryTags: ["vegetarian"],
      isChefPick: false,
      isAvailable: true,
      sortOrder: 0,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Burrată de Andria",
      description: "Cu sfeclă coaptă",
      priceCents: 4800,
      dietaryTags: ["vegetarian", "gluten_free"],
      isChefPick: true,
      isAvailable: true,
      sortOrder: 1,
    },
  ],
};

function renderEditor() {
  return render(
    <MessagesProvider
      locale="ro"
      bundle={{ "partner.menu": roMenu, "partner.common": roCommon }}
    >
      <MenuEditor sections={[SECTION]} />
    </MessagesProvider>,
  );
}

describe("MenuEditor edit-dialog", () => {
  it("pre-fills the dialog with the clicked dish (not a blank New dish form)", async () => {
    const user = userEvent.setup();
    renderEditor();

    // Click edit on the SECOND dish.
    const editButtons = screen.getAllByRole("button", { name: roMenu.editor.editItem });
    await user.click(editButtons[1]!);

    const nameInput = screen.getByLabelText(roMenu.itemDialog.nameLabel) as HTMLInputElement;
    expect(nameInput.value).toBe("Burrată de Andria");
  });

  it("shows the right dish after editing a different one (no stale state)", async () => {
    const user = userEvent.setup();
    renderEditor();

    const editButtons = screen.getAllByRole("button", { name: roMenu.editor.editItem });
    // Edit dish A, close, then edit dish B.
    await user.click(editButtons[0]!);
    expect((screen.getByLabelText(roMenu.itemDialog.nameLabel) as HTMLInputElement).value).toBe(
      "Pâine de casă",
    );
    await user.click(screen.getByRole("button", { name: roMenu.itemDialog.cancel }));

    const editButtonsAfter = screen.getAllByRole("button", { name: roMenu.editor.editItem });
    await user.click(editButtonsAfter[1]!);
    expect((screen.getByLabelText(roMenu.itemDialog.nameLabel) as HTMLInputElement).value).toBe(
      "Burrată de Andria",
    );
  });

  it("Add dish opens a blank form even right after editing a dish", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getAllByRole("button", { name: roMenu.editor.editItem })[0]!);
    await user.click(screen.getByRole("button", { name: roMenu.itemDialog.cancel }));
    await user.click(screen.getByRole("button", { name: roMenu.editor.addItem }));

    expect((screen.getByLabelText(roMenu.itemDialog.nameLabel) as HTMLInputElement).value).toBe("");
  });
});
