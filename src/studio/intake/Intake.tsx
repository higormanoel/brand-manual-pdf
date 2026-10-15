import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { BrandProject, AssetRecord } from "../../core/project";
import type { DocumentCommand } from "../../core/commands";
import { SectionForm } from "./SectionForm";
import { Review } from "./Review";
import { suggestionRequest } from "./suggestions";
import "./intake.css";
export interface IntakeProps {
  project: BrandProject;
  onCommands: (commands: DocumentCommand[]) => void;
  onImportAsset: (file: File) => Promise<AssetRecord>;
  onGenerate: () => Promise<void> | void;
  onClose: () => void;
}
const statuses = {
  "not-started": "Não iniciada",
  provided: "Fornecida",
  suggested: "Sugestão pendente",
  skipped: "Pulada",
  approved: "Aprovada",
};
export function Intake({
  project,
  onCommands,
  onImportAsset,
  onGenerate,
  onClose,
}: IntakeProps) {
  const [activeId, setActiveId] = useState(project.sections[0]?.id ?? "review");
  const [showRequest, setShowRequest] = useState(false),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const flush = useRef<(() => boolean) | undefined>(undefined);
  const generate = useRef(onGenerate);
  generate.current = onGenerate;
  function flushDraft() {
    let valid = true;
    flushSync(() => {
      valid = flush.current?.() ?? true;
    });
    return valid;
  }
  function navigate(id: string) {
    if (!flushDraft()) return;
    flush.current = undefined;
    setActiveId(id);
    setShowRequest(false);
  }
  const section = project.sections.find((s) => s.id === activeId);
  const request = section ? suggestionRequest(project, section) : "";
  return (
    <div
      className="marquio-intake"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intake-title"
    >
      <header>
        <div>
          <h2 id="intake-title">Briefing da marca</h2>
          <p>{project.title} · preencha, pule ou retome quando quiser</p>
        </div>
        <button
          onClick={() => {
            if (flushDraft()) onClose();
          }}
          aria-label="Fechar briefing"
        >
          Fechar
        </button>
      </header>
      <div className="intake-workspace">
        <nav aria-label="Seções do briefing">
          {project.sections.map((item) => (
            <button
              key={item.id}
              aria-label={item.title}
              aria-current={activeId === item.id ? "step" : undefined}
              onClick={() => navigate(item.id)}
            >
              <span>{item.title}</span>
              <small>{statuses[item.status]}</small>
            </button>
          ))}
          <button
            aria-current={activeId === "review" ? "step" : undefined}
            onClick={() => navigate("review")}
          >
            Revisar sugestões
          </button>
        </nav>
        <main>
          {section ? (
            <>
              <SectionForm
                key={section.id}
                project={project}
                section={section}
                onCommands={onCommands}
                onImportAsset={onImportAsset}
                onFlushReady={(callback) => {
                  flush.current = callback;
                }}
              />
              <div className="intake-suggestion-request">
                <button
                  onClick={() => {
                    if (!flushDraft()) return;
                    setShowRequest(!showRequest);
                    setNotice("");
                  }}
                >
                  Preparar pedido de texto para agente
                </button>
                {showRequest && (
                  <>
                    <p>
                      Copie para o agente de sua escolha e importe a resposta em
                      Revisar sugestões.
                    </p>
                    <label>
                      Pedido estruturado
                      <textarea
                        aria-label="Pedido estruturado"
                        readOnly
                        rows={7}
                        value={request}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(request);
                          setNotice("Pedido copiado.");
                        } catch {
                          setNotice(
                            "Selecione o pedido acima e copie com o teclado.",
                          );
                        }
                      }}
                    >
                      Copiar pedido
                    </button>
                    {notice && <p role="status">{notice}</p>}
                  </>
                )}
              </div>
            </>
          ) : (
            <Review project={project} onCommands={onCommands} />
          )}
        </main>
      </div>
      <footer>
        <p>
          Geração parcial é válida. Sem logo, aplicações dependentes são
          omitidas.
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          disabled={busy}
          onClick={async () => {
            if (!flushDraft()) return;
            setBusy(true);
            setError("");
            try {
              await generate.current();
            } catch (error) {
              setError(
                `Não foi possível gerar. Seus dados continuam disponíveis. ${error instanceof Error ? error.message : String(error)}`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Gerando manual…" : "Gerar manual e abrir editor"}
        </button>
      </footer>
    </div>
  );
}
