/**
 * @jest-environment node
 */

import { ingestWebhook, type WebhookExecutor } from "../handle";

function makeRequest(): Request {
  return new Request("http://localhost/api/webhooks/test", { method: "POST" });
}

function makeExecutor(insertedRows: { id: string }[]) {
  const insertReturning = jest.fn().mockResolvedValue(insertedRows);
  const insertOnConflict = jest.fn().mockReturnValue({ returning: insertReturning });
  const insertValues = jest.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
  const insert = jest.fn().mockReturnValue({ values: insertValues });

  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  return {
    executor: { insert, update } as unknown as WebhookExecutor,
    insert,
    update,
    updateSet,
  };
}

describe("ingestWebhook", () => {
  it("returns 400 on signature failure and never touches DB", async () => {
    const { executor, insert, update } = makeExecutor([]);
    const handle = jest.fn();

    const res = await ingestWebhook(
      {
        provider: "stripe",
        request: makeRequest(),
        verifySignature: async () => ({ ok: false }),
        handle,
      },
      executor,
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("signature_invalid");
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("returns 200 + skips handler when (provider, event_id) duplicates", async () => {
    const { executor, update } = makeExecutor([]); // empty = unique conflict
    const handle = jest.fn();

    const res = await ingestWebhook(
      {
        provider: "stripe",
        request: makeRequest(),
        verifySignature: async () => ({
          ok: true,
          eventId: "evt_1",
          eventType: "customer.subscription.updated",
          payload: { foo: "bar" },
        }),
        handle,
      },
      executor,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("duplicate");
    expect(handle).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("inserts, runs handler, stamps processed_at, returns 200", async () => {
    const { executor, update, updateSet } = makeExecutor([{ id: "row-1" }]);
    const handle = jest.fn().mockResolvedValue(undefined);

    const res = await ingestWebhook(
      {
        provider: "resend",
        request: makeRequest(),
        verifySignature: async () => ({
          ok: true,
          eventId: "evt_99",
          eventType: "email.bounced",
          payload: { recipient: "x@y.com" },
        }),
        handle,
      },
      executor,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(handle).toHaveBeenCalledWith({
      id: "evt_99",
      type: "email.bounced",
      payload: { recipient: "x@y.com" },
    });
    expect(update).toHaveBeenCalledTimes(1);
    // Set call should include processedAt = now()
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ processedAt: expect.anything() }),
    );
  });

  it("returns 500 + records error when handler throws", async () => {
    const { executor, update, updateSet } = makeExecutor([{ id: "row-2" }]);
    const handle = jest.fn().mockRejectedValue(new Error("downstream boom"));

    const res = await ingestWebhook(
      {
        provider: "twilio",
        request: makeRequest(),
        verifySignature: async () => ({
          ok: true,
          eventId: "SM_xxx",
          eventType: "message.status.delivered",
          payload: { sid: "SM_xxx" },
        }),
        handle,
      },
      executor,
    );

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("handler_failed");
    expect(update).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        processError: "downstream boom",
        processAttempts: expect.anything(),
      }),
    );
  });
});
