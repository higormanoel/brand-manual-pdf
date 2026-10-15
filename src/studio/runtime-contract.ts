import type { BrandProject, AssetRecord } from "../core/project";
import type { AssetImportInput } from "../core/assets";
import type { CommandBatch, SaveAck } from "../core/commands";
import type { AssetResolver } from "../render/NodeRenderer";
export interface StudioRuntime {
  mode: "local" | "browser-only";
  project: BrandProject;
  resolveAsset: AssetResolver;
  commit(batch: CommandBatch): Promise<SaveAck>;
  importAsset(
    input: AssetImportInput,
    batch: Pick<CommandBatch, "commandId" | "expectedRevision">,
  ): Promise<{
    asset: AssetRecord;
    ack: SaveAck;
  }>;
  reload?(): Promise<BrandProject>;
  exportPdf?(revision: number): Promise<{
    blob: Blob;
    revision: number;
    pages: number;
  }>;
  exportPortable(revision: number): Promise<Uint8Array>;
  exportRecovery?(project: BrandProject): Promise<Uint8Array>;
  checkpoint?(input: {
    project: BrandProject;
    pending: CommandBatch[];
    confirmedRevision: number;
  }): Promise<void>;
  close?(): void;
}
