import { render, screen } from "@testing-library/react";
import { CityShell } from "../CityShell";

let mockPathname = "/bucuresti";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
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

const baseProps = {
  city: "bucuresti",
  displayCity: "București",
  restaurants: [],
  children: <div>feed</div>,
};

describe("CityShell — MapFab visibility", () => {
  it("renders MapFab on the feed", () => {
    mockPathname = "/bucuresti";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Open map")).toBeInTheDocument();
  });

  it("renders MapFab on saved", () => {
    mockPathname = "/bucuresti/saved";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Open map")).toBeInTheDocument();
  });

  it("hides MapFab on a restaurant detail page", () => {
    mockPathname = "/bucuresti/casa-veche";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Open map")).not.toBeInTheDocument();
  });

  it("hides MapFab on a restaurant menu page", () => {
    mockPathname = "/bucuresti/casa-veche/menu";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Open map")).not.toBeInTheDocument();
  });

  it("hides MapFab on the map page (already there)", () => {
    mockPathname = "/bucuresti/map";
    render(<CityShell {...baseProps} />);
    expect(screen.queryByLabelText("Open map")).not.toBeInTheDocument();
  });
});
