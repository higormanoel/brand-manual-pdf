import { beforeEach, test, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createBrowserRuntime,
  resumeBrowserRuntime,
} from "../../src/studio/runtime";
import { RecoveryStore } from "../../src/storage/recovery";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
});
test("two browser sessions cannot acknowledge the same durable revision and stale imports retain conflict bytes for backup", async () => {
  const a = await createBrowserRuntime();
  const b = (await resumeBrowserRuntime()).runtime;
  try {
    const ack = await a.commit({
      commandId: "A",
      expectedRevision: 0,
      commands: [{ type: "project.update", patch: { title: "A confirmed" } }],
    });
    expect(ack.revision).toBe(1);
    await expect(
      b.commit({
        commandId: "B",
        expectedRevision: 0,
        commands: [{ type: "project.update", patch: { title: "B stale" } }],
      }),
    ).rejects.toMatchObject({ code: "revision-conflict", currentRevision: 1 });
    await expect(
      b.importAsset(
        {
          name: "stale.svg",
          mimeType: "image/svg+xml",
          bytes: new TextEncoder().encode("<svg>B</svg>"),
          origin: { kind: "provided" },
        },
        { commandId: "B-asset", expectedRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: "revision-conflict", currentRevision: 1 });
    expect((await b.reload!()).title).toBe("A confirmed");
    const imported = await a.importAsset(
      {
        name: "new.svg",
        mimeType: "image/svg+xml",
        bytes: new TextEncoder().encode("<svg>A</svg>"),
        origin: { kind: "provided" },
      },
      { commandId: "A-asset", expectedRevision: 1 },
    );
    expect((await b.reload!()).revision).toBe(2);
    expect(await (await fetch(b.resolveAsset(imported.asset))).text()).toBe(
      "<svg>A</svg>",
    );
  } finally {
    a.close?.();
    b.close?.();
  }
});
test("recovery-cache failure after canonical publication still returns its durable ack and surfaces checkpoint health", async () => {
  const original = RecoveryStore.open.bind(RecoveryStore);
  let cache: RecoveryStore | undefined;
  const opening = vi
    .spyOn(RecoveryStore, "open")
    .mockImplementation(async (options) => {
      const store = await original(options);
      if (!options?.name) cache = store;
      return store;
    });
  const runtime = await createBrowserRuntime();
  opening.mockRestore();
  const failing = vi
    .spyOn(cache!, "save")
    .mockRejectedValue(new Error("recovery quota"));
  try {
    const ack = await runtime.commit({
      commandId: "published",
      expectedRevision: 0,
      commands: [
        { type: "project.update", patch: { title: "Published once" } },
      ],
    });
    expect(ack.revision).toBe(1);
    expect((await runtime.reload!()).revision).toBe(1);
    await expect(
      runtime.checkpoint!({
        project: ack.project,
        pending: [],
        confirmedRevision: 1,
      }),
    ).rejects.toThrow("recovery quota");
    const resumed = await resumeBrowserRuntime();
    expect(resumed.runtime.project.title).toBe("Published once");
    resumed.runtime.close?.();
    await expect(
      runtime.commit({
        commandId: "stale-after-error",
        expectedRevision: 0,
        commands: [
          { type: "project.update", patch: { title: "must not overwrite" } },
        ],
      }),
    ).rejects.toMatchObject({ code: "revision-conflict" });
  } finally {
    failing.mockRestore();
    runtime.close?.();
  }
});
test("failed localStorage index after publication cannot split live and durable state or lose last-project discovery", async () => {
  const runtime = await createBrowserRuntime();
  const failing = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("index unavailable");
  });
  try {
    const ack = await runtime.commit({
      commandId: "index-error",
      expectedRevision: 0,
      commands: [
        {
          type: "project.update",
          patch: { title: "Durable despite index error" },
        },
      ],
    });
    expect(ack.revision).toBe(1);
    expect((await runtime.reload!()).revision).toBe(1);
    await expect(
      runtime.checkpoint!({
        project: ack.project,
        pending: [],
        confirmedRevision: 1,
      }),
    ).rejects.toThrow("index unavailable");
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("index unavailable");
    });
    const resumed = await resumeBrowserRuntime();
    expect(resumed.runtime.project.title).toBe("Durable despite index error");
    resumed.runtime.close?.();
  } finally {
    failing.mockRestore();
    runtime.close?.();
  }
});
test("URL cache follows path/hash/MIME identity while old history URLs stay valid until close", async () => {
  const runtime = await createBrowserRuntime();
  const revoked = vi.spyOn(URL, "revokeObjectURL");
  let old = "";
  let replacement = "";
  try {
    const a = await runtime.importAsset(
      {
        name: "a.svg",
        mimeType: "image/svg+xml",
        bytes: new TextEncoder().encode("<svg>A</svg>"),
        origin: { kind: "provided" },
      },
      { commandId: "a", expectedRevision: 0 },
    );
    const b = await runtime.importAsset(
      {
        name: "b.svg",
        mimeType: "image/svg+xml",
        bytes: new TextEncoder().encode("<svg>B</svg>"),
        origin: { kind: "provided" },
      },
      { commandId: "b", expectedRevision: 1 },
    );
    old = runtime.resolveAsset(a.asset);
    const ack = await runtime.commit({
      commandId: "replace",
      expectedRevision: 2,
      commands: [
        {
          type: "asset.update",
          assetId: a.asset.id,
          patch: {
            path: b.asset.path,
            hash: b.asset.hash,
            mimeType: "image/svg+xml",
          },
        },
      ],
    });
    const changed = ack.project.assets.find((x) => x.id === a.asset.id)!;
    replacement = runtime.resolveAsset(changed);
    expect(replacement).not.toBe(old);
    expect(await (await fetch(replacement)).text()).toBe("<svg>B</svg>");
    expect(await (await fetch(old)).text()).toBe("<svg>A</svg>");
    expect(runtime.resolveAsset(a.asset)).toBe(old);
    const mimeAck = await runtime.commit({
      commandId: "mime",
      expectedRevision: 3,
      commands: [
        {
          type: "asset.update",
          assetId: a.asset.id,
          patch: { mimeType: "image/png" },
        },
      ],
    });
    const mimeUrl = runtime.resolveAsset(
      mimeAck.project.assets.find((x) => x.id === a.asset.id)!,
    );
    expect(mimeUrl).not.toBe(replacement);
    expect((await fetch(mimeUrl)).headers.get("content-type")).toBe(
      "image/png",
    );
  } finally {
    runtime.close?.();
    expect(revoked.mock.calls.some(([url]) => url === old)).toBe(true);
    if (replacement)
      expect(revoked.mock.calls.some(([url]) => url === replacement)).toBe(
        true,
      );
    revoked.mockRestore();
  }
});
test("command and asset retries return original receipts while runtime reload stays at latest durable revision", async () => {
  const runtime = await createBrowserRuntime();
  try {
    const batch = {
      commandId: "edit-once",
      expectedRevision: 0,
      commands: [
        { type: "project.update" as const, patch: { title: "First" } },
      ],
    };
    const first = await runtime.commit(batch);
    const input = {
      name: "retry.svg",
      mimeType: "image/svg+xml",
      bytes: new TextEncoder().encode("<svg/>"),
      origin: { kind: "provided" as const },
    };
    const imported = await runtime.importAsset(input, {
      commandId: "asset-once",
      expectedRevision: 1,
    });
    await runtime.commit({
      commandId: "later",
      expectedRevision: 2,
      commands: [{ type: "project.update", patch: { title: "Latest" } }],
    });
    expect(await runtime.commit(batch)).toEqual(first);
    expect(
      await runtime.importAsset(input, {
        commandId: "asset-once",
        expectedRevision: 1,
      }),
    ).toEqual(imported);
    expect((await runtime.reload!()).revision).toBe(3);
    expect((await runtime.reload!()).title).toBe("Latest");
    await expect(
      runtime.commit({
        ...batch,
        commands: [
          { type: "project.update", patch: { title: "Different payload" } },
        ],
      }),
    ).rejects.toMatchObject({ code: "command-id-reused" });
  } finally {
    runtime.close?.();
  }
});
test("unavailable recovery database does not hide an existing canonical browser project", async () => {
  const original = await createBrowserRuntime();
  const ack = await original.commit({
    commandId: "saved",
    expectedRevision: 0,
    commands: [
      { type: "project.update", patch: { title: "Canonical readable" } },
    ],
  });
  original.close?.();
  const open = RecoveryStore.open.bind(RecoveryStore);
  const failing = vi
    .spyOn(RecoveryStore, "open")
    .mockImplementation((options) =>
      options?.name
        ? open(options)
        : Promise.reject(new Error("Recovery database unavailable")),
    );
  try {
    const result = await resumeBrowserRuntime();
    expect(result.runtime.project.title).toBe("Canonical readable");
    await expect(
      result.runtime.checkpoint!({
        project: ack.project,
        pending: [],
        confirmedRevision: 1,
      }),
    ).rejects.toThrow("Recovery database unavailable");
    result.runtime.close?.();
  } finally {
    failing.mockRestore();
  }
});
