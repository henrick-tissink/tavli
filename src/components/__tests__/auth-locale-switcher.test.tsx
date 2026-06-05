/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

const refreshMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const useLocaleMock = jest.fn();
jest.mock("@/lib/i18n/messages-provider", () => ({
  useLocale: () => useLocaleMock(),
}));

import { AuthLocaleSwitcher } from "../auth-locale-switcher";

describe("AuthLocaleSwitcher", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    useLocaleMock.mockReturnValue("ro");
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  });

  it("renders all three locale options", () => {
    render(<AuthLocaleSwitcher />);
    expect(screen.getByText("Română")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Deutsch")).toBeInTheDocument();
  });

  it("marks the active locale as current and not clickable", () => {
    render(<AuthLocaleSwitcher />);
    expect(screen.getByText("Română").closest("button")).toBeNull();
    expect(screen.getByText("English").closest("button")).not.toBeNull();
  });

  it("sets the NEXT_LOCALE cookie and refreshes on selection", async () => {
    const user = userEvent.setup();
    render(<AuthLocaleSwitcher />);
    await user.click(screen.getByText("English"));
    expect(document.cookie).toContain("NEXT_LOCALE=en");
    expect(refreshMock).toHaveBeenCalled();
  });
});
