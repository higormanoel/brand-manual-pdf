import { z } from 'zod';
import { idSchema, originSchema } from './nodes';

// Manifest paths use portable forward slashes and stay inside the project bundle.
export const relativeAssetPathSchema = z.string().min(1).refine(path =>
  !path.startsWith('/') && !path.includes('\\') && !path.includes(':') &&
  !/[\u0000-\u001f]/.test(path) && path.split('/').every(part => part !== '..' && part !== '.' && part !== ''),
  'O caminho do asset deve ser relativo e permanecer dentro do projeto.',
);
export const assetRecordSchema = z.object({
  id: idSchema, mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/), name: z.string().min(1),
  path: relativeAssetPathSchema, hash: z.string().regex(/^[a-f\d]{64}$/i, 'Use um hash SHA-256 hexadecimal.'),
  origin: originSchema,
  width: z.number().positive().optional(), height: z.number().positive().optional(),
  license: z.string().optional(),
});
export type AssetRecord = z.infer<typeof assetRecordSchema>;

export interface AssetImportInput { name: string; mimeType: string; bytes: Uint8Array; origin: AssetRecord['origin'] }
/** Implementations persist bytes outside project/history JSON and return their manifest record. */
export interface AssetImporter { importAsset(input: AssetImportInput): Promise<AssetRecord> }
