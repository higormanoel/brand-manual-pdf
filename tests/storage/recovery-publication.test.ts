import { beforeEach, test, expect, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { RecoveryStore, type RecoveryInput } from "../../src/storage/recovery";
import { createProject } from "../../src/core/project";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
const record = (project: ReturnType<typeof createProject>): RecoveryInput => ({
  project,
  assets: {},
  pending: [],
  confirmedRevision: project.revision,
  mode: "browser-only",
});
const receipt = (
  commandId: string,
  expectedRevision: number,
  fingerprint = "a".repeat(64),
) => ({ commandId, expectedRevision, fingerprint });
test("independent connections race one revision, with project/receipt/index committed together", async () => {
  const a = await RecoveryStore.open({ name: "canonical" });
  const b = await RecoveryStore.open({ name: "canonical" });
  const initial = createProject("Initial");
  try {
    await a.publish(record(initial), null);
    const outcomes = await Promise.allSettled([
      a.publish(
        record({ ...initial, title: "A", revision: 1 }),
        0,
        receipt("A", 0),
      ),
      b.publish(
        record({ ...initial, title: "B", revision: 1 }),
        0,
        receipt("B", 0),
      ),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
    const rejected = outcomes.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({
      code: "revision-conflict",
      currentRevision: 1,
    });
    const winner = outcomes.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<RecoveryStore["publish"]>>>;
    expect((await a.load(initial.id))?.project).toEqual(
      winner.value.record.project,
    );
    expect(await b.lastProjectId()).toBe(initial.id);
    const acknowledged = await b.publication(
      initial.id,
      receipt(winner.value.ack!.commandId, 0),
    );
    expect(acknowledged?.ack).toEqual(winner.value.ack);
  } finally {
    a.close();
    b.close();
  }
});
test("receipts replay after later edits without rolling authority backward and reject reused IDs", async () => {
  const store = await RecoveryStore.open({ name: "canonical" });
  const initial = createProject("Initial");
  try {
    await store.publish(record(initial), null);
    const first = await store.publish(
      record({ ...initial, title: "First", revision: 1 }),
      0,
      receipt("first", 0),
    );
    await store.publish(
      record({ ...initial, title: "Second", revision: 2 }),
      1,
      receipt("second", 1),
    );
    const replay = await store.publish(
      record({ ...initial, title: "First", revision: 1 }),
      0,
      receipt("first", 0),
    );
    expect(replay.ack).toEqual(first.ack);
    expect(replay.record.project).toMatchObject({
      title: "Second",
      revision: 2,
    });
    await expect(
      store.publish(
        record({ ...initial, title: "changed", revision: 1 }),
        0,
        receipt("first", 0, "b".repeat(64)),
      ),
    ).rejects.toMatchObject({ code: "command-id-reused", currentRevision: 2 });
    expect((await store.load(initial.id))?.project.revision).toBe(2);
    const different = { ...initial, id: crypto.randomUUID(), revision: 1 };
    await expect(
      store.publish(record(different), 0, receipt("wrong-project", 0)),
    ).rejects.toMatchObject({ code: "revision-conflict" });
  } finally {
    store.close();
  }
});
test("failed index write aborts the entire transaction rather than leaving a published project", async () => {
  const store = await RecoveryStore.open({ name: "canonical" });
  const initial = createProject("Existing");
  await store.publish(record(initial), null);
  const next = createProject("New");
  const original = IDBObjectStore.prototype.put;
  const failing = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      if (key === "last-browser-project:v1")
        throw new DOMException("index quota", "QuotaExceededError");
      return original.call(this, value, key);
    });
  try {
    await expect(store.publish(record(next), null)).rejects.toThrow(
      "index quota",
    );
    expect(await store.load(next.id)).toBeUndefined();
    expect(await store.lastProjectId()).toBe(initial.id);
    expect((await store.load(initial.id))?.project.title).toBe("Existing");
  } finally {
    failing.mockRestore();
    store.close();
  }
});
test("publication rejects a stored record whose project ID differs from its key inside the transaction", async () => {
  const store = await RecoveryStore.open({ name: "canonical" });
  const original = createProject("Original");
  const initial = await store.publish(record(original), null);
  const open = indexedDB.open("canonical", 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(
        {
          ...initial.record,
          project: { ...original, id: "different-project" },
        },
        `project:${original.id}:schema:1`,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await expect(
      store.publish(
        record({ ...original, title: "Attempt", revision: 1 }),
        0,
        receipt("attempt", 0),
      ),
    ).rejects.toThrow("Canonical project ID mismatch");
  } finally {
    db.close();
    store.close();
  }
});
