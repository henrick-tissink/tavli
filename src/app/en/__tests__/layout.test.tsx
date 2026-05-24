import { render } from "@testing-library/react";
import EnLayout from "../layout";
import DeLayout from "../../de/layout";

describe("locale segment layouts (audit #17)", () => {
  it("wraps the English route tree in lang=en", () => {
    const { container } = render(<EnLayout>hello</EnLayout>);
    expect(container.querySelector("[lang='en']")).not.toBeNull();
  });

  it("wraps the German route tree in lang=de", () => {
    const { container } = render(<DeLayout>hallo</DeLayout>);
    expect(container.querySelector("[lang='de']")).not.toBeNull();
  });
});
