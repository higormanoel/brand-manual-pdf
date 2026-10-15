import type {
  CommandBatch,
  DocumentCommand,
  SaveAck,
} from "../../core/commands";
type Operation = {
  kind: "operation";
  haltOnError: boolean;
  run: (revision: number) => Promise<{
    result: unknown;
    revision?: number;
  }>;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
};
type Task =
  | {
      kind: "commands";
      batch: CommandBatch;
    }
  | Operation;
/** One serial lane for commits, uploads and exports. History snapshots retain
 * their old revisions; only validated storage acknowledgements advance this. */
export class SaveQueue {
  revision: number;
  error: unknown;
  private tasks: Task[] = [];
  private running?: Promise<void>;
  constructor(
    revision: number,
    private commit: (batch: CommandBatch) => Promise<SaveAck>,
    private onChange: () => void = () => {},
  ) {
    this.revision = revision;
  }
  get pending(): CommandBatch[] {
    return structuredClone(
      this.tasks.flatMap((task) =>
        task.kind === "commands" ? [task.batch] : [],
      ),
    );
  }
  enqueue(commands: DocumentCommand[]) {
    this.tasks.push({
      kind: "commands",
      batch: {
        commandId: crypto.randomUUID(),
        expectedRevision: this.revision,
        commands: structuredClone(commands),
      },
    });
    this.onChange();
    this.start();
  }
  private start() {
    if (this.running || this.error || !this.tasks.length) return;
    this.running = this.drain().finally(() => {
      this.running = undefined;
      this.onChange();
      if (!this.error && this.tasks.length) this.start();
    });
  }
  private async drain() {
    while (this.tasks.length && !this.error) {
      const task = this.tasks[0];
      try {
        if (task.kind === "commands") {
          task.batch.expectedRevision = this.revision;
          const ack = await this.commit(structuredClone(task.batch));
          if (
            ack.commandId !== task.batch.commandId ||
            ack.revision <= this.revision
          )
            throw new Error("Confirmação de revisão inválida.");
          this.revision = ack.revision;
        } else {
          const value = await task.run(this.revision);
          if (value.revision !== undefined) {
            if (value.revision <= this.revision)
              throw new Error("Confirmação de importação inválida.");
            this.revision = value.revision;
          }
          task.resolve(value.result);
        }
        this.tasks.shift();
        this.onChange();
      } catch (error) {
        if (task.kind === "commands" || task.haltOnError) this.error = error;
        if (task.kind === "operation") {
          task.reject(error);
          this.tasks.shift();
        }
        if (!this.error) {
          this.onChange();
          continue;
        }
        this.tasks = this.tasks.filter((pending) => {
          if (pending.kind === "operation") {
            pending.reject(error);
            return false;
          }
          return true;
        });
        this.onChange();
      }
    }
  }
  async flush() {
    while (this.running || this.tasks.length) {
      if (this.error) throw this.error;
      this.start();
      await this.running;
    }
    if (this.error) throw this.error;
  }
  retry() {
    this.error = undefined;
    this.onChange();
    this.start();
  }
  barrier<T>(
    operation: (revision: number) => Promise<{
      result: T;
      revision?: number;
    }>,
    options: { haltOnError?: boolean } = {},
  ): Promise<T> {
    if (this.error) return Promise.reject(this.error);
    return new Promise<T>((resolve, reject) => {
      this.tasks.push({
        kind: "operation",
        haltOnError: options.haltOnError ?? true,
        run: operation,
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.start();
    });
  }
}
