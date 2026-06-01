import { render, screen } from "@testing-library/react";
import { CityShell } from "../CityShell";

let mockPathname = "/bucuresti";
const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

jest.mock("@/lib/db/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  }),
}));

// locale-action uses next/headers (server-only); mock it for jsdom.
jest.mock("@/app/(app)/locale-action", () => ({
  setAppLocale: jest.fn(),
}));

const commonBundle = {
  languageName: "Română",
  switchLanguage: "Schimbă limba",
  locales: { ro: "Română", en: "English", de: "Deutsch" },
  cities: {},
};

const baseProps = {
  lang: "ro" as const,
  bundle: { common: commonBundle },
  city: "bucuresti",
  displayCity: "București",
  restaurants: [],
  children: <div>feed</div>,
};

describe("CityShell — MapFab visibility", () => {
  beforeEach(() => {
    mockPathname = "/bucuresti";
  });

  it("renders MapFab on the feed", () => {
    mockPathname = "/bucuresti";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Deschide harta")).toBeInTheDocument();
  });

  it("renders MapFab on saved", () => {
    mockPathname = "/bucuresti/saved";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Deschide harta")).toBeInTheDocument();
  });

  it("hides MapFab on a restaurant detail page", () => {
    mockPathname = "/bucuresti/casa-veche";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Deschide harta")).not.toBeInTheDocument();
  });

  it("hides MapFab on a restaurant menu page", () => {
    mockPathname = "/bucuresti/casa-veche/menu";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Deschide harta")).not.toBeInTheDocument();
  });

  it("hides MapFab on the map page (already there)", () => {
    mockPathname = "/bucuresti/map";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Deschide harta")).not.toBeInTheDocument();
  });
});

describe("CityShell — LocaleSwitcher", () => {
  it("renders the three locale links for lang=ro", () => {
    mockPathname = "/bucuresti";
    render(<CityShell {...baseProps} lang="ro" />);
    // LocaleSwitcher in path mode renders links for all three locales
    expect(screen.getByRole("link", { name: /Română/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /English/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deutsch/i })).toBeInTheDocument();
  });

  it("marks the current locale as aria-current=true for lang=en", () => {
    mockPathname = "/en/bucuresti";
    render(<CityShell {...baseProps} lang="en" />);
    expect(
      screen.getByRole("link", { name: /English/i })
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("link", { name: /Română/i })
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("link", { name: /Deutsch/i })
    ).not.toHaveAttribute("aria-current");
  });
});

describe("CityShell — locale-aware internal navigation", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("prefixes router.push with /en/ for lang=en on map tab", () => {
    mockPathname = "/en/bucuresti";
    const { getByLabelText } = render(
      <CityShell {...baseProps} lang="en" />
    );
    // Click the map tab (TabBar renders buttons with aria-label for each tab)
    const mapTab = getByLabelText("Hartă");
    mapTab.click();
    expect(mockPush).toHaveBeenCalledWith("/en/bucuresti/map");
  });

  it("does NOT prefix router.push for lang=ro (default locale)", () => {
    mockPathname = "/bucuresti";
    const { getByLabelText } = render(
      <CityShell {...baseProps} lang="ro" />
    );
    const mapTab = getByLabelText("Hartă");
    mapTab.click();
    expect(mockPush).toHaveBeenCalledWith("/bucuresti/map");
  });

  it("prefixes router.push with /de/ for lang=de on discover tab", () => {
    mockPathname = "/de/bucuresti/saved";
    const { getByLabelText } = render(
      <CityShell {...baseProps} lang="de" />
    );
    const discoverTab = getByLabelText("Descoperă");
    discoverTab.click();
    expect(mockPush).toHaveBeenCalledWith("/de/bucuresti");
  });
});
