// Mock @react-email/render to avoid the dynamic `import("react-dom/server")`
// inside the library's node entry — jsdom (no --experimental-vm-modules) cannot
// handle it. We render via renderToStaticMarkup and emit the same doctype
// prefix the real implementation produces.
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return {
    render: async (node: React.ReactElement) => {
      const html = renderToStaticMarkup(node);
      return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">${html.replace(/<!DOCTYPE.*?>/, "")}`;
    },
  };
});

import { render } from "@react-email/render";
import { DataDeletionConfirmedEmail, getSubject } from "../DataDeletionConfirmedEmail";

describe("DataDeletionConfirmedEmail", () => {
  const props = {
    dsrId: "11111111-1111-1111-1111-111111111111",
    completedAt: new Date("2026-05-23T10:00:00Z"),
    createdAt: new Date("2026-05-20T10:00:00Z"),
  };

  it("renders RO copy", async () => {
    const html = await render(<DataDeletionConfirmedEmail {...props} locale="ro" />);
    expect(html).toContain("șterse"); // "deleted" in Romanian
    expect(html).toContain(props.dsrId);
  });

  it("renders EN copy", async () => {
    const html = await render(<DataDeletionConfirmedEmail {...props} locale="en" />);
    expect(html).toContain("deleted");
    expect(html).toContain(props.dsrId);
  });

  it("renders DE copy", async () => {
    const html = await render(<DataDeletionConfirmedEmail {...props} locale="de" />);
    expect(html).toContain("gelöscht"); // "gelöscht" in German
    expect(html).toContain(props.dsrId);
  });

  it("getSubject returns locale-specific subject", () => {
    expect(getSubject("ro", props)).toContain("șterse");
    expect(getSubject("en", props)).toContain("deleted");
    expect(getSubject("de", props)).toContain("gelöscht");
  });
});
