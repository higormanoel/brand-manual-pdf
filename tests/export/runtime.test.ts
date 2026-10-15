import { test, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createBrowserRuntime,
  resumeBrowserRuntime,
  createLocalRuntime,
} from "../../src/studio/runtime";
import { RecoveryStore } from "../../src/storage/recovery";
import { createProject } from "../../src/core/project";
import { createSnapshot } from "../../src/storage/snapshot";
import { importPortable } from "../../src/storage/portable";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    setItem: (k: string, v: string) => values.set(k, v),
    getItem: (k: string) => values.get(k) ?? null,
  });
});
test("browser acknowledgment waits for durable canonical project and reload restores original bytes", async () => {
  const runtime = await createBrowserRuntime();
  const ack = await runtime.commit({
    commandId: "edit",
    expectedRevision: 0,
    commands: [{ type: "project.update", patch: { title: "Durable browser" } }],
  });
  expect(ack.revision).toBe(1);
  const bytes = new TextEncoder().encode("<svg/>");
  const imported = await runtime.importAsset(
    {
      name: "original.svg",
      mimeType: "image/svg+xml",
      bytes,
      origin: { kind: "provided" },
    },
    { commandId: "import", expectedRevision: 1 },
  );
  runtime.close?.();
  const next = await resumeBrowserRuntime();
  expect(next.runtime.project.title).toBe("Durable browser");
  expect(next.runtime.project.revision).toBe(2);
  const portable = await importPortable(await next.runtime.exportPortable(2));
  expect(portable.assets[imported.asset.path]).toEqual(bytes);
  next.runtime.close?.();
});
test("failed IndexedDB commit rejects and does not claim a new browser revision", async () => {
  const runtime = await createBrowserRuntime();
  const spy = vi
    .spyOn(RecoveryStore.prototype, "save")
    .mockRejectedValue(new Error("Quota exceeded"));
  try {
    await expect(
      runtime.commit({
        commandId: "fail",
        expectedRevision: 0,
        commands: [{ type: "project.update", patch: { title: "Unsaved" } }],
      }),
    ).rejects.toThrow("Quota exceeded");
    expect((await runtime.reload!()).revision).toBe(0);
  } finally {
    spy.mockRestore();
    runtime.close?.();
  }
});
test("old history revision checkpoints normalize detached recovery without overwriting confirmed browser state at startup", async () => {
  const runtime = await createBrowserRuntime();
  const first = await runtime.commit({
    commandId: "edit",
    expectedRevision: 0,
    commands: [{ type: "project.update", patch: { title: "Confirmed" } }],
  });
  const old = structuredClone(first.project);
  old.revision = 0;
  old.title = "Visible pending";
  const pending = [
    {
      commandId: "pending",
      expectedRevision: 1,
      commands: [
        {
          type: "project.update" as const,
          patch: { title: "Visible pending" },
        },
      ],
    },
  ];
  await runtime.checkpoint!({ project: old, pending, confirmedRevision: 1 });
  expect(old.revision).toBe(0);
  runtime.close?.();
  const resumed = await resumeBrowserRuntime();
  expect(resumed.runtime.project.title).toBe("Confirmed");
  expect(resumed.recovery?.project.title).toBe("Visible pending");
  expect(resumed.recovery?.project.revision).toBe(1);
  const store = await RecoveryStore.open();
  expect((await store.load(old.id))?.pending).toHaveLength(1);
  store.close();
  resumed.runtime.close?.();
});
test("recovery backup packages visible unconfirmed manifest and every original byte without flushing commands", async () => {
  const runtime = await createBrowserRuntime();
  const bytes = new TextEncoder().encode("<svg/>");
  const imported = await runtime.importAsset(
    {
      name: "art.svg",
      mimeType: "image/svg+xml",
      bytes,
      origin: { kind: "provided" },
    },
    { commandId: "asset", expectedRevision: 0 },
  );
  const visible = structuredClone(imported.ack.project);
  visible.title = "Visible conflict";
  const portable = await importPortable(await runtime.exportRecovery!(visible));
  expect(portable.project.title).toContain("não confirmada");
  expect(portable.assets[imported.asset.path]).toEqual(bytes);
  expect((await runtime.reload!()).title).not.toBe("Visible conflict");
  runtime.close?.();
});
test("local disk project remains editable if browser recovery storage cannot open, with checkpoint error exposed", async () => {
  const project = createProject("Local");
  const snap = await createSnapshot(project, {});
  const spy = vi
    .spyOn(RecoveryStore, "open")
    .mockRejectedValue(new Error("IDB unavailable"));
  try {
    const result = await createLocalRuntime({
      getProject: async () => project,
      snapshot: async () => snap,
      assetUrl: (id) => id,
      commit: async () => {
        throw new Error("unused");
      },
      importAsset: async () => {
        throw new Error("unused");
      },
      portable: async () => new Uint8Array(),
    });
    expect(result.runtime.mode).toBe("local");
    await expect(
      result.runtime.checkpoint!({
        project,
        pending: [],
        confirmedRevision: 0,
      }),
    ).rejects.toThrow("IDB unavailable");
    result.runtime.close?.();
  } finally {
    spy.mockRestore();
  }
});
test("invalid asset metadata is rejected before durable browser publication", async () => {
  const runtime = await createBrowserRuntime();
  try {
    const original = await runtime.importAsset(
      {
        name: "original.svg",
        mimeType: "image/svg+xml",
        bytes: new TextEncoder().encode("<svg/>"),
        origin: { kind: "provided" },
      },
      { commandId: "asset", expectedRevision: 0 },
    );
    await expect(
      runtime.commit({
        commandId: "bad-hash",
        expectedRevision: 1,
        commands: [
          {
            type: "asset.update",
            assetId: original.asset.id,
            patch: { hash: "0".repeat(64) },
          },
        ],
      }),
    ).rejects.toThrow("integrity");
    expect((await runtime.reload!()).revision).toBe(1);
    const canonical = await RecoveryStore.open({
      name: "marquio-browser-confirmed-v1",
    });
    expect(
      (await canonical.load(original.ack.project.id))?.project.revision,
    ).toBe(1);
    canonical.close();
  } finally {
    runtime.close?.();
  }
});
