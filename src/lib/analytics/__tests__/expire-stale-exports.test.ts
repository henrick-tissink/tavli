import { makeExpireStaleExports } from "@/lib/analytics/expire-stale-exports";

function deps(rows: Array<{ id: string; storage_path: string | null }>) {
  let call = 0;
  const remove = jest.fn(async () => ({ error: null }));
  const db = {
    execute: jest.fn(async () => {
      call++;
      if (call === 1) return rows; // select expired ready jobs
      return []; // per-row status update
    }),
  };
  const storage = { from: jest.fn(() => ({ remove })) };
  return { db, storage, remove };
}

describe("makeExpireStaleExports", () => {
  test("no expired exports → only the selection query", async () => {
    const d = deps([]);
    await makeExpireStaleExports(d as never)();
    expect(d.db.execute).toHaveBeenCalledTimes(1);
    expect(d.remove).not.toHaveBeenCalled();
  });

  test("deletes the object and marks each row expired", async () => {
    const d = deps([
      { id: "j1", storage_path: "org/o1/j1.zip" },
      { id: "j2", storage_path: "org/o1/j2.zip" },
    ]);
    await makeExpireStaleExports(d as never)();
    expect(d.storage.from).toHaveBeenCalledWith("exports");
    expect(d.remove).toHaveBeenCalledTimes(2);
    // 1 selection + 2 status updates.
    expect(d.db.execute).toHaveBeenCalledTimes(3);
  });
});
