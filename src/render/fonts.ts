import type { BrandProject, AssetRecord } from "../core/project";
import { fontAvailable } from "./textMeasurement";
export interface FontLoadResult {
  typographyId: string;
  assetId?: string;
  family: string;
  weight: number;
  status: "loaded" | "substituted";
  fallback: string;
  source?: "asset" | "system";
  message?: string;
}
const loadedFaces = new Map<string, FontFace>();
/** Load manifest-backed client fonts or verify available system families. Call before DOM measurement.
 * Missing/corrupt files are explicit substitutions, never successful generation. */
export async function loadProjectFonts(
  project: BrandProject,
  resolveAsset: (asset: AssetRecord) => string | undefined,
): Promise<FontLoadResult[]> {
  const results: FontLoadResult[] = [];
  for (const typography of project.brand.typography) {
    const asset = project.assets.find(
      (asset) => asset.id === typography.assetId,
    );
    for (const weight of typography.weights.length
      ? typography.weights
      : [400]) {
      const result: FontLoadResult = {
        typographyId: typography.id,
        assetId: typography.assetId,
        family: typography.family,
        weight,
        fallback: typography.fallback,
        status: "substituted",
      };
      const key = `${typography.family}\u0000${weight}`;
      try {
        if (typeof FontFace === "undefined" || typeof document === "undefined")
          throw new Error("Carregamento de fontes requer um navegador.");
        const previous = loadedFaces.get(key);
        if (previous) {
          document.fonts.delete(previous);
          loadedFaces.delete(key);
        }
        if (!typography.assetId) {
          const available = await fontAvailable({
            fontFamily: typography.family,
            fontWeight: weight,
            fontStyle: "normal",
            fontSize: 16,
            lineHeight: 1.5,
            letterSpacing: 0,
            color: "#000000",
            align: "left",
            verticalAlign: "top",
          });
          if (!available)
            throw new Error(
              "Família indisponível neste sistema. Envie um arquivo de fonte ou escolha uma substituta.",
            );
          result.status = "loaded";
          result.source = "system";
          results.push(result);
          continue;
        }
        if (!asset)
          throw new Error("Nenhum arquivo de fonte fornecido no manifesto.");
        const source = resolveAsset(asset);
        if (!source)
          throw new Error(
            "Arquivo de fonte indisponível. Importe ou selecione o arquivo novamente.",
          );
        const face = new FontFace(
          typography.family,
          `url(${JSON.stringify(source)})`,
          { weight: String(weight) },
        );
        await face.load();
        document.fonts.add(face);
        loadedFaces.set(key, face);
        result.status = "loaded";
        result.source = "asset";
      } catch (error) {
        result.message = `${typography.family} (${weight}) substituída por ${typography.fallback}. ${error instanceof Error ? error.message : String(error)}`;
      }
      results.push(result);
    }
  }
  if (typeof document !== "undefined") await document.fonts.ready;
  return results;
}
