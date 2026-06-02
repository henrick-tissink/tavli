import { render, screen, fireEvent } from "@testing-library/react";
import { EventRequestSheet } from "../event-request-sheet";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";

jest.mock("@/app/api/event-requests/actions", () => ({
  submitEventRequestDraft: jest.fn().mockResolvedValue({ ok: true, trackingToken: "abc" }),
}));

function renderSheet() {
  return render(
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
      <EventRequestSheet
        open
        onClose={() => {}}
        restaurantId="r1"
        restaurantName="Test"
        acceptedOccasions={["wedding", "birthday", "corporate_dinner", "product_launch", "other"]}
      />
    </MessagesProvider>,
  );
}

describe("EventRequestSheet", () => {
  it("walks through steps and submits with form data", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /nuntă|wedding/i }));
    fireEvent.click(screen.getByRole("button", { name: /continuă|next/i }));
    // date step
    fireEvent.change(screen.getByLabelText(/dată|date/i), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: /continuă|next/i }));
    // party + time
    fireEvent.change(screen.getByLabelText(/persoane|guests/i), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /continuă|next/i }));
    // identity step
    fireEvent.change(screen.getByLabelText(/nume|name/i), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "sara@test.co" } });
    fireEvent.click(screen.getByRole("button", { name: /trimite|submit/i }));
    expect(await screen.findByText(/verifică emailul|check your email/i)).toBeInTheDocument();
    const { submitEventRequestDraft } = await import("@/app/api/event-requests/actions");
    expect(submitEventRequestDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: "r1",
        occasion: "wedding",
        partySize: 30,
        guestEmail: "sara@test.co",
      }),
    );
  });
});
