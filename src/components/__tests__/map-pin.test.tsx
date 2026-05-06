import { render } from "@testing-library/react";
import { MapPin } from "../map-pin";

describe("MapPin", () => {
  it("renders rating text", () => {
    const { container } = render(<MapPin rating={4.8} />);
    expect(container.firstChild?.textContent).toBe("4.8");
  });

  it("default pin is 28px with orange bg", () => {
    const { container } = render(<MapPin rating={4.5} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("28px");
    expect(el.style.backgroundColor).toBe("rgb(249, 115, 22)");
    expect(el.style.color).toBe("rgb(255, 255, 255)");
  });

  it("selected pin is 36px with white border", () => {
    const { container } = render(<MapPin rating={4.5} selected />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("36px");
    expect(el.style.border).toBe("3px solid rgb(255, 255, 255)");
  });

  it("unavailable pin is 24px with grey bg", () => {
    const { container } = render(<MapPin rating={3.2} unavailable />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("24px");
    expect(el.style.backgroundColor).toBe("rgb(212, 212, 212)");
    expect(el.style.color).toBe("rgb(102, 102, 102)");
  });

  it("cluster pin shows count number", () => {
    const { container } = render(<MapPin rating={0} count={5} />);
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe("5");
    expect(el.style.width).toBe("36px");
  });
});
