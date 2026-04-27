import { render } from "@testing-library/react";
import { PartnerCancelledEmail } from "../PartnerCancelledEmail";
import { CANCEL_REASONS, type CancelReasonKey } from "@/lib/cancel-reasons";

const baseProps = {
  restaurantName: "Casa Veche",
  restaurantCitySlug: "bucuresti",
  restaurantSlug: "casa-veche",
  reservationDate: "2026-05-01",
  reservationTime: "19:30",
  partySize: 4,
  guestName: "Maria",
};

function renderEmail(reasonKey: CancelReasonKey) {
  return render(
    <PartnerCancelledEmail
      {...baseProps}
      guestMessage={CANCEL_REASONS[reasonKey].guestMessage}
    />,
  );
}

describe("PartnerCancelledEmail", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tavli.ro";
  });

  afterAll(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  test("greets the guest by first name and names the restaurant", () => {
    const { container } = renderEmail("overbooked");
    expect(container.textContent).toContain("Hi Maria");
    expect(container.textContent).toContain("Casa Veche");
  });

  test("renders the formatted date and time", () => {
    const { container } = renderEmail("overbooked");
    expect(container.textContent).toContain("19:30");
    expect(container.textContent).toContain("4"); // party size
    // Date is rendered with a long weekday/month — assert weekday from May 1, 2026 = Friday
    expect(container.textContent).toMatch(/Friday|May/);
  });

  test.each(Object.keys(CANCEL_REASONS) as CancelReasonKey[])(
    "renders the guestMessage for reason key %s",
    (key) => {
      const { container } = renderEmail(key);
      expect(container.textContent).toContain(CANCEL_REASONS[key].guestMessage);
    },
  );

  test("CTA points at the restaurant detail URL on the configured site origin", () => {
    const { container } = renderEmail("overbooked");
    const link = container.querySelector('a[href="https://tavli.ro/bucuresti/casa-veche"]');
    expect(link).not.toBeNull();
  });

  test("does not include any partner-only language in the body", () => {
    const { container } = renderEmail("overbooked");
    const text = container.textContent ?? "";
    expect(text.toLowerCase()).not.toContain("partner");
    expect(text.toLowerCase()).not.toContain("internal");
  });
});
