import { z } from "zod";
import {
  sectionContentSchema,
  type BrandProject,
  type SectionRecord,
} from "../../core/project";
import { applyCommands, type DocumentCommand } from "../../core/commands";

const responseSchema = z
  .object({
    sectionId: z.string().min(1),
    content: sectionContentSchema.strict(),
  })
  .strict();
export function importSuggestion(
  project: BrandProject,
  text: string,
): DocumentCommand[] {
  const response = responseSchema.parse(JSON.parse(text));
  if (!project.sections.some((section) => section.id === response.sectionId))
    throw new Error("Seção desconhecida. Use o ID do pedido copiado.");
  const commands: DocumentCommand[] = [
    {
      type: "section.update",
      sectionId: response.sectionId,
      patch: {
        content: response.content,
        status: "suggested",
        enabled: true,
        origin: {
          kind: "suggested",
          description: "Resposta estruturada importada pelo designer",
        },
        approval: { status: "pending" },
      },
    },
  ];
  applyCommands(project, commands); // Validate references before handing anything to the host.
  return commands;
}
export function suggestionRequest(
  project: BrandProject,
  section: SectionRecord,
): string {
  return `Prepare uma sugestão para ${section.title} da marca ${project.brand.name}. Não invente regras, fontes, arquivos, responsáveis ou procedência. Indique lacunas no texto. Isto é um pedido para um agente externo; não há geração conectada neste formulário.\nContexto fornecido: ${JSON.stringify({ brief: project.brief, brand: project.brand, content: section.content })}\nResponda somente JSON: ${JSON.stringify({ sectionId: section.id, content: { summary: "", paragraphs: [], rules: [], assetIds: [], colorIds: [], typographyIds: [] } })}`;
}
