/**
 * @jest-environment node
 */
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return { render: async (node: unknown) => renderToStaticMarkup(node as never) };
});

import { makeRunExport } from "@/lib/analytics/run-export";

interface JobRow {
  id: string;
  organization_id: string;
  requested_by_user_id: string;
  requested_restaurants: string[];
  tables: string[];
  date_from: string | null;
  date_to: string | null;
  bypass_tier_limit_reason: string | null;
  requester_email: string | null;
  requester_locale: string;
}

function makeDeps(job: JobRow | null, opts: { uploadError?: boolean } = {}) {
  let call = 0;
  const execCalls: unknown[][] = [];
  const db = {
    execute: jest.fn(async (...args: unknown[]) => {
      call++;
      execCalls.push(args);
      if (call === 1) return job ? [job] : []; // loadJob
      if (job && /reservations|diners|reviews/.test("table-fetch")) {
        /* per-table fetch + status writes return [] */
      }
      // Per-table fetches return a single row; status writes return [].
      return [{ id: "x", note: "row" }];
    }),
  };
  const upload = jest.fn(async () => ({ error: opts.uploadError ? { message: "boom" } : null }));
  const createSignedUrl = jest.fn(async () => ({ data: { signedUrl: "https://signed/export.zip" }, error: null }));
  const storage = { from: jest.fn(() => ({ upload, createSignedUrl })) };
  const sendEmail = jest.fn(async (_input: { to: string; html: string }) => ({ status: "sent" }));
  const recordAudit = jest.fn(async (_input: { action: string }) => {});
  const loadTier = jest.fn(async () => "base" as const);
  return { db, storage, upload, createSignedUrl, sendEmail, recordAudit, loadTier, execCalls };
}

const baseJob: JobRow = {
  id: "job1",
  organization_id: "org1",
  requested_by_user_id: "user1",
  requested_restaurants: [],
  tables: ["reservations"],
  date_from: null,
  date_to: null,
  bypass_tier_limit_reason: null,
  requester_email: "owner@example.com",
  requester_locale: "ro",
};

describe("makeRunExport", () => {
  test("throws TV503 when the job row is missing", async () => {
    const d = makeDeps(null);
    const run = makeRunExport(d as never);
    await expect(run({ jobId: "missing" })).rejects.toThrow(/TV503/);
  });

  test("happy path: uploads, signs, audits (pii + export_run), emails the requester", async () => {
    const d = makeDeps(baseJob);
    const run = makeRunExport(d as never);
    await run({ jobId: "job1" });

    expect(d.storage.from).toHaveBeenCalledWith("exports");
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.createSignedUrl).toHaveBeenCalledTimes(1);
    // Two audit rows: diner.pii_accessed + analytics.export_run.
    expect(d.recordAudit).toHaveBeenCalledTimes(2);
    const actions = d.recordAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("diner.pii_accessed");
    expect(actions).toContain("analytics.export_run");
    // Email carries the signed URL.
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
    const emailArg = d.sendEmail.mock.calls[0][0];
    expect(emailArg.to).toBe("owner@example.com");
    expect(emailArg.html).toContain("https://signed/export.zip");
  });

  test("upload failure → marks failed and rethrows, no email", async () => {
    const d = makeDeps(baseJob, { uploadError: true });
    const run = makeRunExport(d as never);
    await expect(run({ jobId: "job1" })).rejects.toThrow();
    expect(d.sendEmail).not.toHaveBeenCalled();
  });
});
