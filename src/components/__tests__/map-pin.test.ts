import { createPinElement } from "../map-pin";

describe("createPinElement", () => {
  it("renders rating text", () => {
    const el = createPinElement({ rating: 4.8 });
    expect(el.textContent).toBe("4.8");
  });

  it("default pin is 28px with orange bg", () => {
    const el = createPinElement({ rating: 4.5 });
    expect(el.style.width).toBe("28px");
    expect(el.style.backgroundColor).toBe("rgb(249, 115, 22)");
    expect(el.style.color).toBe("rgb(255, 255, 255)");
  });

  it("selected pin is 36px with white border", () => {
    const el = createPinElement({ rating: 4.5, selected: true });
    expect(el.style.width).toBe("36px");
    expect(el.style.border).toBe("3px solid rgb(255, 255, 255)");
  });

  it("unavailable pin is 24px with grey bg", () => {
    const el = createPinElement({ rating: 3.2, unavailable: true });
    expect(el.style.width).toBe("24px");
    expect(el.style.backgroundColor).toBe("rgb(212, 212, 212)");
    expect(el.style.color).toBe("rgb(102, 102, 102)");
  });

  it("cluster pin shows count number", () => {
    const el = createPinElement({ rating: 0, count: 5 });
    expect(el.textContent).toBe("5");
    expect(el.style.width).toBe("36px");
  });
});
