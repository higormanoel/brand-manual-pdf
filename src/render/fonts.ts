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
// Own every registered face, including repeated families/weights, so none can
// survive a later project snapshot merely because its old request disappeared.
const loadedFaces = new Set<FontFace>();
/** Load manifest-backed client fonts or verify available system families. Call before DOM measurement.
 * Missing/corrupt files are explicit substitutions, never successful generation. */
export async function loadProjectFonts(
  project: BrandProject,
  resolveAsset: (asset: AssetRecord) => string | undefined,
): Promise<FontLoadResult[]> {
  const results: FontLoadResult[] = [];
  const requests = project.brand.typography.flatMap((typography) =>
    (typography.weights.length ? typography.weights : [400]).map((weight) => ({
      typography,
      weight,
      key: `${typography.family}\u0000${weight}`,
    })),
  );
  const browserAvailable =
    typeof FontFace !== "undefined" && typeof document !== "undefined";
  const systemAvailability = new Map<string, boolean>();
  if (browserAvailable) {
    for (const face of loadedFaces) document.fonts.delete(face);
    loadedFaces.clear();
    // Resolve all system-only requests before adding any current upload. An
    // uploaded 400 face must not masquerade as a system 700 face of that family.
    for (const { typography, weight, key } of requests) {
      if (typography.assetId || systemAvailability.has(key)) continue;
      systemAvailability.set(
        key,
        await fontAvailable({
          fontFamily: typography.family,
          fontWeight: weight,
          fontStyle: "normal",
          fontSize: 16,
          lineHeight: 1.5,
          letterSpacing: 0,
          color: "#000000",
          align: "left",
          verticalAlign: "top",
        }),
      );
    }
  }
  for (const { typography, weight, key } of requests) {
    const asset = project.assets.find(
      (asset) => asset.id === typography.assetId,
    );
    const result: FontLoadResult = {
      typographyId: typography.id,
      assetId: typography.assetId,
      family: typography.family,
      weight,
      fallback: typography.fallback,
      status: "substituted",
    };
    try {
      if (!browserAvailable)
        throw new Error("Carregamento de fontes requer um navegador.");
      if (!typography.assetId) {
        const available = systemAvailability.get(key);
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
      loadedFaces.add(face);
      result.status = "loaded";
      result.source = "asset";
    } catch (error) {
      result.message = `${typography.family} (${weight}) substituída por ${typography.fallback}. ${error instanceof Error ? error.message : String(error)}`;
    }
    results.push(result);
  }
  if (typeof document !== "undefined") await document.fonts.ready;
  return results;
}
