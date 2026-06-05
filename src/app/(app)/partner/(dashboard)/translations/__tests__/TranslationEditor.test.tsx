/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { TranslationEditor } from "../_components/TranslationEditor";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roSettings from "@/messages/ro/partner.settings.json";

const saveTranslationsMock = jest.fn(async (_payload?: unknown) => ({ ok: true }));
jest.mock("../actions", () => ({
  saveTranslations: (payload: unknown) => saveTranslationsMock(payload),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/components/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

function renderEditor() {
  return render(
    <MessagesProvider locale="ro" bundle={{ "partner.settings": roSettings }}>
      <TranslationEditor
        initial={{
          en: { tagline: "", heroSubtitle: "EN hero", descriptionShort: "", descriptionLong: "", chefBio: "", ambience: "" },
          de: { tagline: "", heroSubtitle: "DE hero", descriptionShort: "", descriptionLong: "", chefBio: "", ambience: "" },
        }}
        roReference={{
          tagline: null,
          heroSubtitle: "RO hero",
          descriptionShort: "RO scurt",
          descriptionLong: null,
          chefBio: null,
          ambience: null,
        }}
      />
    </MessagesProvider>,
  );
}

describe("TranslationEditor (trilingual)", () => {
  beforeEach(() => saveTranslationsMock.mockClear());

  it("shows the Romanian source where it exists", () => {
    renderEditor();
    expect(screen.getByText("RO hero")).toBeInTheDocument();
    expect(screen.getByText("RO scurt")).toBeInTheDocument();
  });

  it("shows the 'no Romanian' note for fields without an RO source", () => {
    renderEditor();
    // tagline, descriptionLong, chefBio, ambience → 4 fields with no RO
    expect(screen.getAllByText(roSettings.translations.noRomanian)).toHaveLength(4);
  });

  it("renders editable EN and DE fields for every field (no tabs)", () => {
    renderEditor();
    expect(screen.getByDisplayValue("EN hero")).toBeInTheDocument();
    expect(screen.getByDisplayValue("DE hero")).toBeInTheDocument();
    // 6 fields × 2 editable locales = 12 EN/DE inputs
    expect(document.querySelectorAll("input, textarea")).toHaveLength(12);
  });

  it("saves EN and DE together via one action call", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText(/Engleză|English/i, { selector: "#en-tagline" }), "Hi");
    await user.click(screen.getByRole("button", { name: roSettings.translations.saveAll }));
    expect(saveTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        en: expect.objectContaining({ tagline: "Hi" }),
        de: expect.objectContaining({ heroSubtitle: "DE hero" }),
      }),
    );
  });
});
