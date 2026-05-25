import { classifyInboundSms } from "../inbound-keyword";

describe("classifyInboundSms", () => {
  it.each(["STOP", "stop", " Stop ", "STOP.", "unsubscribe", "CANCEL", "Quit", "dezabonare", "STOP please"])(
    "classifies %p as opt_out",
    (b) => expect(classifyInboundSms(b)).toBe("opt_out"),
  );
  it.each(["START", "yes", "UNSTOP", "da", "abonare"])("classifies %p as opt_in", (b) =>
    expect(classifyInboundSms(b)).toBe("opt_in"),
  );
  it.each(["HELP", "info", "ajutor"])("classifies %p as help", (b) =>
    expect(classifyInboundSms(b)).toBe("help"),
  );
  it.each(["", null, undefined, "hello there", "table for 2?"])("classifies %p as none", (b) =>
    expect(classifyInboundSms(b)).toBe("none"),
  );
});
