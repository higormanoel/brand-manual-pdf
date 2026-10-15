import { useState } from "react";
import type { BrandProject, AssetRecord } from "../../core/project";
import "./AssetsPanel.css";
export interface AssetsPanelProps {
  project: BrandProject;
  resolveAsset: (id: string) => string | undefined;
  onImportAsset: (file: File) => Promise<AssetRecord>;
  onInsertImage: (asset: AssetRecord) => void;
}
export function AssetsPanel({
  project,
  resolveAsset,
  onImportAsset,
  onInsertImage,
}: AssetsPanelProps) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="marquio-assets" aria-label="Arquivos do projeto">
      <h2>Arquivos</h2>
      <label>
        Importar arquivo
        <input
          aria-label="Importar arquivo"
          type="file"
          disabled={busy}
          onChange={async (e) => {
            const input = e.currentTarget,
              file = input.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              await onImportAsset(file);
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
      {busy && <p role="status">Importando arquivo…</p>}
      {error && <p role="alert">{error}</p>}
      {!project.assets.length && (
        <p>Nenhum arquivo importado. Logos e fontes são opcionais.</p>
      )}
      <ul>
        {project.assets.map((asset) => {
          const url = resolveAsset(asset.id);
          const image = asset.mimeType.startsWith("image/");
          return (
            <li key={asset.id}>
              {image && url && <img src={url} alt={asset.name} />}
              <strong>{asset.name}</strong>
              <small>
                {asset.mimeType} ·{" "}
                {asset.origin.kind === "suggested"
                  ? "Sugerido"
                  : "Arquivo fornecido"}
              </small>
              <details>
                <summary>Manifesto e procedência</summary>
                <dl>
                  <dt>ID</dt>
                  <dd>{asset.id}</dd>
                  <dt>Caminho portátil</dt>
                  <dd>{asset.path}</dd>
                  <dt>SHA-256</dt>
                  <dd>{asset.hash}</dd>
                  <dt>Origem</dt>
                  <dd>
                    {asset.origin.kind}
                    {asset.origin.description &&
                      ` · ${asset.origin.description}`}
                  </dd>
                  {asset.license && (
                    <>
                      <dt>Licença</dt>
                      <dd>{asset.license}</dd>
                    </>
                  )}
                </dl>
              </details>
              {image && (
                <button onClick={() => onInsertImage(asset)}>
                  Inserir {asset.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p>
        Para substituir um logo ou uma fonte, envie o novo arquivo na seção e
        selecione a nova referência. O arquivo anterior é preservado.
      </p>
    </section>
  );
}
