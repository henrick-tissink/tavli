import { render, screen, fireEvent } from "@testing-library/react";
import { ReservationConfirmed } from "../reservation-confirmed";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

// Mock next/image to avoid SSR issues in jsdom
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock the cancel form since it's a client component with server actions
jest.mock("../reservation-cancel-form", () => ({
  ReservationCancelForm: ({ token, restaurantName }: { token: string; restaurantName: string }) => (
    <div data-testid="cancel-form">
      Cancel form for {restaurantName} (token: {token})
    </div>
  ),
}));

const bundle = { booking: roBooking };

function renderConfirmed(props: React.ComponentProps<typeof ReservationConfirmed>) {
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <ReservationConfirmed {...props} />
    </MessagesProvider>,
  );
}

const baseProps = {
  token: "tok-abc123",
  restaurantName: "Caru' cu Bere",
  restaurantSlug: "caru-cu-bere",
  date: "2026-06-15",
  time: "19:30",
  partySize: 4,
  zone: null,
  guestName: "Ion Popescu",
  address: "Strada Stavropoleos 3, București",
  lat: 44.4268,
  lng: 26.0979,
};

describe("ReservationConfirmed", () => {
  it("renders venue name and confirmation eyebrow", () => {
    renderConfirmed(baseProps);
    expect(screen.getByText("Caru' cu Bere")).toBeInTheDocument();
    expect(screen.getByText("CONFIRMAT")).toBeInTheDocument();
  });

  it("renders party size", () => {
    renderConfirmed(baseProps);
    expect(screen.getByText(/4 persoane/)).toBeInTheDocument();
  });

  it("renders singular for party size 1", () => {
    renderConfirmed({ ...baseProps, partySize: 1 });
    expect(screen.getByText(/1 persoană/)).toBeInTheDocument();
  });

  it("renders guest name", () => {
    renderConfirmed(baseProps);
    expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
  });

  it("renders address", () => {
    renderConfirmed(baseProps);
    expect(screen.getByText("Strada Stavropoleos 3, București")).toBeInTheDocument();
  });

  it("renders Google Maps link when lat/lng provided", () => {
    renderConfirmed(baseProps);
    const link = screen.getByText("Indicații rutiere →");
    expect(link).toHaveAttribute("href", expect.stringContaining("google.com/maps"));
  });

  it("does NOT render Google Maps link when lat/lng are null", () => {
    renderConfirmed({ ...baseProps, lat: null, lng: null });
    expect(screen.queryByText("Indicații rutiere →")).not.toBeInTheDocument();
  });

  it("renders phone link when phone provided", () => {
    renderConfirmed({ ...baseProps, phone: "+40212345678" });
    const link = screen.getByText("+40212345678");
    expect(link).toHaveAttribute("href", "tel:+40212345678");
  });

  it("does NOT render phone section when phone absent", () => {
    renderConfirmed(baseProps);
    expect(screen.queryByText("Telefon")).not.toBeInTheDocument();
  });

  it("renders hero note pull-quote section when heroNote provided", () => {
    renderConfirmed({ ...baseProps, heroNote: "Un loc cu poveste." });
    expect(screen.getByText("CE TE AȘTEAPTĂ")).toBeInTheDocument();
    expect(screen.getByText("Un loc cu poveste.")).toBeInTheDocument();
  });

  it("does NOT render hero note section when heroNote absent", () => {
    renderConfirmed(baseProps);
    expect(screen.queryByText("CE TE AȘTEAPTĂ")).not.toBeInTheDocument();
  });

  it("cancel form is hidden by default", () => {
    renderConfirmed(baseProps);
    expect(screen.queryByTestId("cancel-form")).not.toBeInTheDocument();
  });

  it("reveals cancel form when 'Anulează rezervarea' is clicked", () => {
    renderConfirmed(baseProps);
    const toggleBtn = screen.getByRole("button", { name: /Anulează rezervarea/ });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("cancel-form")).toBeInTheDocument();
  });

  it("calendar download link has data:text/calendar href", () => {
    renderConfirmed(baseProps);
    const calLink = screen.getByRole("link", { name: /Descarcă fișier calendar/i });
    expect(calLink.getAttribute("href")).toMatch(/^data:text\/calendar/);
    expect(calLink).toHaveAttribute("download", "rezervare-tavli.ics");
  });

  it("renders venue photo when photoUrl provided", () => {
    renderConfirmed({
      ...baseProps,
      photoUrl: "https://images.unsplash.com/photo-test",
    });
    const img = screen.getByRole("img", { name: "Caru' cu Bere" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", expect.stringContaining("unsplash.com"));
  });

  it("renders zone in subline when provided", () => {
    renderConfirmed({ ...baseProps, zone: "Terasa" });
    expect(screen.getByText(/Terasa/)).toBeInTheDocument();
  });

  it("handles time in HH:MM:SS format", () => {
    renderConfirmed({ ...baseProps, time: "19:30:00" });
    // Should display 19:30 (sliced to 5 chars)
    const allMatches = screen.getAllByText(/19:30/);
    expect(allMatches.length).toBeGreaterThan(0);
  });
});
