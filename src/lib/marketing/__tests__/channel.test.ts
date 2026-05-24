import { marketingConsentChannel, suppressionChannel } from "@/lib/marketing/channel";

describe("channel bridges", () => {
  test("consent channel maps to {x}_marketing; in_confirmation→email_marketing", () => {
    expect(marketingConsentChannel("email")).toBe("email_marketing");
    expect(marketingConsentChannel("sms")).toBe("sms_marketing");
    expect(marketingConsentChannel("whatsapp")).toBe("whatsapp_marketing");
    expect(marketingConsentChannel("in_confirmation")).toBe("email_marketing");
  });

  test("suppression channel is the base; in_confirmation→email", () => {
    expect(suppressionChannel("email")).toBe("email");
    expect(suppressionChannel("sms")).toBe("sms");
    expect(suppressionChannel("whatsapp")).toBe("whatsapp");
    expect(suppressionChannel("in_confirmation")).toBe("email");
  });
});
