import { useState } from "react";
import type { BrandProject } from "../../core/project";
import type { DocumentCommand } from "../../core/commands";
import { importSuggestion } from "./suggestions";
export function Review({
  project,
  onCommands,
}: {
  project: BrandProject;
  onCommands: (commands: DocumentCommand[]) => void;
}) {
  const [response, setResponse] = useState(""),
    [error, setError] = useState("");
  function approveItem(key: "colors" | "typography" | "logos", id: string) {
    const items = project.brand[key].map((item) =>
      item.id === id
        ? {
            ...item,
            approval: {
              status: "approved" as const,
              at: new Date().toISOString(),
            },
          }
        : item,
    );
    onCommands([
      { type: "project.update", patch: { brand: { [key]: items } } },
    ]);
  }
  return (
    <section className="intake-review">
      <h3>Revisar sugestões</h3>
      <p>
        Importe a resposta de um agente externo. Revise o texto antes de
        aprovar; nenhuma geração está conectada.
      </p>
      <label>
        Resposta estruturada
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={7}
        />
      </label>
      <button
        onClick={() => {
          try {
            onCommands(importSuggestion(project, response));
            setError("");
            setResponse("");
          } catch (error) {
            setError(
              `Resposta inválida. Corrija o JSON e as referências antes de importar. ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }}
      >
        Importar sugestão
      </button>
      {error && <p role="alert">{error}</p>}
      <h3>Texto e regras das seções</h3>
      {project.sections
        .filter(
          (s) =>
            ["suggested", "provided"].includes(s.status) &&
            s.approval.status === "pending",
        )
        .map((section) => (
          <article key={section.id}>
            <h4>
              {section.title} ·{" "}
              {section.origin.kind === "suggested" ? "Sugerido" : "Fornecido"},
              pendente
            </h4>
            <p>{section.content?.summary}</p>
            {section.content?.paragraphs.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
            {section.content?.rules.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
            <button
              onClick={() =>
                onCommands([
                  {
                    type: "section.update",
                    sectionId: section.id,
                    patch: {
                      status: "approved",
                      approval: {
                        status: "approved",
                        at: new Date().toISOString(),
                      },
                    },
                  },
                ])
              }
            >
              Aprovar {section.title}
            </button>
          </article>
        ))}
      {!project.sections.some((s) => s.status === "suggested") && (
        <p>Nenhuma sugestão pendente.</p>
      )}
      <h3>Itens da identidade</h3>
      <p>
        A aprovação de uma seção não aprova automaticamente cores, fontes ou
        assinaturas. A origem de cada item é preservada.
      </p>
      {project.brand.colors.map((color) => (
        <article key={color.id}>
          <h4>
            {color.name} · {color.hex}
          </h4>
          <p>
            {color.usage} · Origem: {color.origin.kind} ·{" "}
            {color.approval.status === "approved" ? "Aprovada" : "Pendente"}
          </p>
          {color.approval.status === "pending" && (
            <button onClick={() => approveItem("colors", color.id)}>
              Aprovar cor {color.name}
            </button>
          )}
        </article>
      ))}
      {project.brand.typography.map((font) => (
        <article key={font.id}>
          <h4>
            {font.family} · {font.weights.join(", ")}
          </h4>
          <p>
            Substituta: {font.fallback} ·{" "}
            {font.assetId
              ? project.assets.find((a) => a.id === font.assetId)?.name
              : "Sem arquivo; disponibilidade no sistema verificada ao gerar"}{" "}
            · Origem: {font.origin.kind} ·{" "}
            {font.approval.status === "approved" ? "Aprovada" : "Pendente"}
          </p>
          {font.approval.status === "pending" && (
            <button onClick={() => approveItem("typography", font.id)}>
              Aprovar tipografia {font.family}
            </button>
          )}
        </article>
      ))}
      {project.brand.logos.map((logo) => (
        <article key={logo.id}>
          <h4>
            {logo.name} · {logo.variant}
          </h4>
          <p>
            {project.assets.find((a) => a.id === logo.assetId)?.name} · Origem:{" "}
            {logo.origin.kind} ·{" "}
            {logo.approval.status === "approved" ? "Aprovada" : "Pendente"}
          </p>
          {logo.approval.status === "pending" && (
            <button onClick={() => approveItem("logos", logo.id)}>
              Aprovar logo {logo.name}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
