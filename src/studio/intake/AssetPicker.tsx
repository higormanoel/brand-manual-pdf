import { useState } from "react";
import type { AssetRecord } from "../../core/project";
export interface AssetPickerProps {
  assets: AssetRecord[];
  value?: string;
  label: string;
  uploadLabel: string;
  accept?: string;
  onSelect: (id: string | undefined, asset?: AssetRecord) => void;
  onImportAsset: (file: File) => Promise<AssetRecord>;
}
export function AssetPicker({
  assets,
  value,
  label,
  uploadLabel,
  accept,
  onSelect,
  onImportAsset,
}: AssetPickerProps) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="intake-asset-picker">
      <label>
        {label}
        <select
          aria-label={label}
          value={value ?? ""}
          onChange={(event) =>
            onSelect(
              event.target.value || undefined,
              assets.find((asset) => asset.id === event.target.value),
            )
          }
        >
          <option value="">Sem arquivo</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      <label className="intake-upload">
        {busy ? "Importando…" : uploadLabel}
        <input
          aria-label={uploadLabel}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={async (event) => {
            const input = event.currentTarget,
              file = input.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const asset = await onImportAsset(file);
              onSelect(asset.id, asset);
            } catch (error) {
              setError(
                `Arquivo não importado. Tente novamente: ${error instanceof Error ? error.message : String(error)}`,
              );
            } finally {
              setBusy(false);
              input.value = "";
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
