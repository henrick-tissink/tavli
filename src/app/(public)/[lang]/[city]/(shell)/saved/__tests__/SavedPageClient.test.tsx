import { render, screen } from "@testing-library/react";
import { SavedProvider } from "@/lib/saved-context";
import { SavedPageClient } from "../SavedPageClient";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { buildBundle } from "@/lib/i18n/messages";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
});

function renderWithProviders(ui: React.ReactElement) {
  const bundle = buildBundle("ro", ["ui", "profile"]);
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <SavedProvider>
        {ui}
      </SavedProvider>
    </MessagesProvider>
  );
}

describe("SavedPageClient empty states", () => {
  it("renders the saved EmptyState when no places are saved", () => {
    renderWithProviders(<SavedPageClient city="bucuresti" allRestaurants={[]} />);
    expect(screen.getByRole("img", { name: /Niciun loc salvat/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descoperă restaurante/i })).toHaveAttribute(
      "href",
      "/bucuresti",
    );
  });

  it("renders the bookings EmptyState (no action) when no bookings exist", () => {
    renderWithProviders(<SavedPageClient city="bucuresti" allRestaurants={[]} />);
    expect(screen.getByRole("img", { name: /Nicio rezervare/i })).toBeInTheDocument();
  });
});
