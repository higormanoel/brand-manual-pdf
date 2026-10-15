import { describe, it, expect } from "vitest";
import { SaveQueue } from "../../src/studio/editor/saveQueue";
import { createProject } from "../../src/core/project";
import { applyCommands, type CommandBatch } from "../../src/core/commands";
describe("serialized editor save queue", () => {
  it("assigns latest confirmed revision at dispatch and retains undo snapshots", async () => {
    let stored = createProject("A");
    const batches: CommandBatch[] = [];
    const queue = new SaveQueue(0, async (batch) => {
      batches.push(batch);
      stored = {
        ...applyCommands(stored, batch.commands),
        revision: stored.revision + 1,
      };
      return {
        commandId: batch.commandId,
        revision: stored.revision,
        project: stored,
      };
    });
    const old = structuredClone(stored);
    queue.enqueue([{ type: "project.update", patch: { title: "B" } }]);
    queue.enqueue([{ type: "project.restore", project: old }]);
    await queue.flush();
    expect(batches.map((b) => b.expectedRevision)).toEqual([0, 1]);
    expect(queue.revision).toBe(2);
    expect(stored.title).toBe("A");
  });
  it("serializes a delayed import between edits and advances the next expected revision", async () => {
    const revisions: number[] = [];
    const queue = new SaveQueue(0, async (batch) => {
      revisions.push(batch.expectedRevision);
      return {
        commandId: batch.commandId,
        revision: batch.expectedRevision + 1,
        project: createProject("A"),
      };
    });
    queue.enqueue([{ type: "project.update", patch: { title: "B" } }]);
    let release!: () => void;
    const delay = new Promise<void>((resolve) => {
      release = resolve;
    });
    const imported = queue.barrier(async (revision) => {
      expect(revision).toBe(1);
      await delay;
      return { result: "asset", revision: 2 };
    });
    queue.enqueue([{ type: "project.update", patch: { title: "C" } }]);
    await Promise.resolve();
    expect(revisions).toEqual([0]);
    release();
    expect(await imported).toBe("asset");
    await queue.flush();
    expect(revisions).toEqual([0, 2]);
    expect(queue.revision).toBe(3);
  });
  it("retains failed batches and blocks later writes until explicit retry", async () => {
    let fail = true;
    let stored = createProject("A");
    const queue = new SaveQueue(0, async (batch) => {
      if (fail) throw new Error("conflict");
      stored = {
        ...applyCommands(stored, batch.commands),
        revision: stored.revision + 1,
      };
      return {
        commandId: batch.commandId,
        revision: stored.revision,
        project: stored,
      };
    });
    queue.enqueue([{ type: "project.update", patch: { title: "B" } }]);
    queue.enqueue([{ type: "project.update", patch: { title: "C" } }]);
    await expect(queue.flush()).rejects.toThrow("conflict");
    expect(queue.pending).toHaveLength(2);
    expect(queue.revision).toBe(0);
    fail = false;
    queue.retry();
    await queue.flush();
    expect(stored.title).toBe("C");
    expect(queue.revision).toBe(2);
  });
});

it("does not block future editing when a read-only export fails", async () => {
  const queue = new SaveQueue(0, async (batch) => ({
    commandId: batch.commandId,
    revision: batch.expectedRevision + 1,
    project: createProject("A"),
  }));
  await expect(
    queue.barrier(
      async () => {
        throw new Error("PDF preflight");
      },
      { haltOnError: false },
    ),
  ).rejects.toThrow("PDF preflight");
  queue.enqueue([{ type: "project.update", patch: { title: "B" } }]);
  await queue.flush();
  expect(queue.error).toBeUndefined();
  expect(queue.revision).toBe(1);
});
