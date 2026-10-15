import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import {
  parseProject,
  ProjectValidationError,
  type BrandProject,
  type BrandData,
  type SectionRecord,
  type SectionContent,
} from "../../core/project";
import type { DocumentCommand } from "../../core/commands";
import type { AssetRecord } from "../../core/assets";
import { AssetPicker } from "./AssetPicker";
import {
  COLOR_NOTE_PREFIX,
  decodeColorNotes,
  encodeColorNotes,
} from "./colorNotes";

const lines = (text: string) => text.split("\n").filter((line) => line.trim());
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label>
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          rows={3}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
function LineField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  // Preserve the local text buffer while typing trailing newlines; normalize only on blur.
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    setText(value.join("\n"));
  }, [value]);
  return (
    <label>
      {label}
      <textarea
        aria-label={label}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(lines(text))}
      />
    </label>
  );
}
function Rows<T>({
  title,
  items,
  add,
  onChange,
  children,
}: {
  title: string;
  items: T[];
  add: () => T;
  onChange: (items: T[]) => void;
  children: (
    item: T,
    index: number,
    update: (patch: Partial<T>) => void,
  ) => ReactNode;
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {items.map((item, index) => (
        <div
          className="intake-row"
          key={
            typeof item === "object" && item !== null && "id" in item
              ? String(item.id)
              : index
          }
        >
          {children(item, index, (patch) =>
            onChange(
              items.map((value, i) =>
                i === index ? { ...value, ...patch } : value,
              ),
            ),
          )}
          <button
            type="button"
            aria-label={`Remover ${title} ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remover
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, add()])}>
        Adicionar {title.toLocaleLowerCase("pt-BR")}
      </button>
    </fieldset>
  );
}
const provided = {
  origin: { kind: "provided" as const },
  approval: { status: "pending" as const },
};
export interface SectionFormProps {
  project: BrandProject;
  section: SectionRecord;
  onCommands: (commands: DocumentCommand[]) => void;
  onImportAsset: (file: File) => Promise<AssetRecord>;
  onFlushReady?: (flush: () => boolean) => void;
}
export function SectionForm({
  project,
  section,
  onCommands,
  onImportAsset,
  onFlushReady,
}: SectionFormProps) {
  const [brand, setBrand] = useState(() => structuredClone(project.brand));
  const [brief, setBrief] = useState(() => structuredClone(project.brief));
  const [credits, setCredits] = useState(() =>
    structuredClone(project.credits),
  );
  const [colorNotes, setColorNotes] = useState(() =>
    decodeColorNotes(section.content?.paragraphs ?? [], project.brand.colors),
  );
  const [content, setContent] = useState<SectionContent>(() =>
    section.content
      ? {
          ...section.content,
          paragraphs:
            section.kind === "colors"
              ? section.content.paragraphs.filter(
                  (text) => !text.startsWith(COLOR_NOTE_PREFIX),
                )
              : section.content.paragraphs,
        }
      : {
          paragraphs: [],
          rules: [],
          assetIds: [],
          colorIds: [],
          typographyIds: [],
        },
  );
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const draftVersion = JSON.stringify({
    brand,
    brief,
    credits,
    content,
    colorNotes,
  });
  const [savedVersion, setSavedVersion] = useState(draftVersion);
  const dirty = savedVersion !== draftVersion;
  const patchBrand = (patch: Partial<BrandData>) =>
    setBrand((b) => ({ ...b, ...patch }));
  const patchContent = (patch: Partial<SectionContent>) =>
    setContent((c) => ({ ...c, ...patch }));
  const voice = brand.voice ?? { traits: [], do: [], avoid: [], modes: [] };
  const patchVoice = (patch: Partial<typeof voice>) =>
    patchBrand({ voice: { ...voice, ...patch } });
  const brandKeys: Partial<Record<SectionRecord["kind"], (keyof BrandData)[]>> =
    {
      introduction: ["name", "tagline", "description"],
      "brand-strategy": [
        "definitions",
        "narratives",
        "mantras",
        "dictionary",
        "values",
      ],
      voice: ["voice"],
      logo: ["logos"],
      colors: ["colors"],
      typography: ["typography"],
    };
  function save(
    status: "provided" | "skipped" = "provided",
    brandOverride = brand,
  ) {
    // Empty repeater rows are UI drafts, not invented brand rules or required data.
    brandOverride = {
      ...brandOverride,
      colors: brandOverride.colors.filter(
        (row) => row.name.trim() || row.hex.trim(),
      ),
      typography: brandOverride.typography.filter(
        (row) => row.family.trim() || row.assetId,
      ),
      logos: brandOverride.logos.filter(
        (row) => row.name.trim() || row.assetId,
      ),
    };
    for (const key of ["colors", "typography", "logos"] as const) {
      brandOverride = {
        ...brandOverride,
        [key]: brandOverride[key].map((item) => {
          const previous = project.brand[key].find(
            (value) => value.id === item.id,
          );
          const changed =
            previous &&
            JSON.stringify({ ...previous, approval: undefined }) !==
              JSON.stringify({ ...item, approval: undefined });
          return changed ? { ...item, approval: { status: "pending" } } : item;
        }),
      };
    }
    const keys = brandKeys[section.kind] ?? [];
    const brandPatch = Object.fromEntries(
      keys.map((key) => [key, brandOverride[key]]),
    );
    const patch = {
      ...(keys.length ? { brand: brandPatch } : {}),
      ...(section.kind === "brand-strategy" ? { brief } : {}),
      ...(section.kind === "credits" ? { credits } : {}),
    };
    const nextContent = {
      ...content,
      ...(section.kind === "colors"
        ? {
            paragraphs: encodeColorNotes(
              content.paragraphs,
              brandOverride.colors,
              colorNotes,
            ),
          }
        : {}),
      ...(section.kind === "colors"
        ? { colorIds: brandOverride.colors.map((c) => c.id) }
        : {}),
      ...(section.kind === "typography"
        ? { typographyIds: brandOverride.typography.map((t) => t.id) }
        : {}),
      ...(section.kind === "logo"
        ? { assetIds: brandOverride.logos.map((l) => l.assetId) }
        : {}),
    };
    const commands: DocumentCommand[] = [
      { type: "project.update", patch },
      {
        type: "section.update",
        sectionId: section.id,
        patch: {
          content: nextContent,
          status,
          enabled: status !== "skipped",
          origin: { kind: "provided" },
          approval: { status: "pending" },
        },
      },
    ];
    try {
      // Uploaded assets are already persisted by the host and may reach props one render later.
      parseProject({
        ...project,
        ...patch,
        brand: { ...project.brand, ...brandPatch },
      });
      onCommands(commands);
      setBrand(brandOverride);
      setSavedVersion(
        JSON.stringify({
          brand: brandOverride,
          brief,
          credits,
          content,
          colorNotes,
        }),
      );
      setError("");
      setNotice(
        status === "skipped"
          ? "Seção pulada. Seus dados foram preservados."
          : "Dados salvos.",
      );
      return true;
    } catch (error) {
      if (status === "skipped" && error instanceof ProjectValidationError) {
        // Skipping remains possible even when an optional draft is malformed.
        // Preserve the last validated data and identify the discarded draft.
        onCommands([
          {
            type: "section.update",
            sectionId: section.id,
            patch: { status: "skipped", enabled: false },
          },
        ]);
        setBrand(structuredClone(project.brand));
        setBrief(structuredClone(project.brief));
        setCredits(structuredClone(project.credits));
        const savedContent = section.content ?? {
          paragraphs: [],
          rules: [],
          assetIds: [],
          colorIds: [],
          typographyIds: [],
        };
        setContent(savedContent);
        const savedColorNotes = decodeColorNotes(
          savedContent.paragraphs,
          project.brand.colors,
        );
        setColorNotes(savedColorNotes);
        setSavedVersion(
          JSON.stringify({
            brand: project.brand,
            brief: project.brief,
            credits: project.credits,
            content: savedContent,
            colorNotes: savedColorNotes,
          }),
        );
        setError(
          `Seção pulada. O rascunho inválido não foi salvo; o último conteúdo válido foi preservado. Retome a seção para corrigir: ${error.message}`,
        );
        setNotice("Seção pulada. Seus dados foram preservados.");
        return true;
      }
      setError(
        `Revise ${section.title}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
  useLayoutEffect(() => {
    onFlushReady?.(() => !dirty || save());
  });
  const field = (
    label: string,
    value: string | undefined,
    onChange: (text: string) => void,
    multiline = false,
  ) => (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      multiline={multiline}
    />
  );
  const contentFields = (
    <>
      {field("Título da seção", content.heading, (heading) =>
        patchContent({ heading }),
      )}
      {field(
        "Resumo fornecido",
        content.summary,
        (summary) => patchContent({ summary }),
        true,
      )}
      <LineField
        label="Parágrafos — um por linha"
        value={content.paragraphs}
        onChange={(paragraphs) => patchContent({ paragraphs })}
      />
      <LineField
        label="Regras fornecidas — uma por linha"
        value={content.rules}
        onChange={(rules) => patchContent({ rules })}
      />
    </>
  );
  return (
    <form
      className="intake-section-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3>{section.title}</h3>
      <p>
        Todos os campos são opcionais. Use apenas o que foi fornecido.
        Alterações válidas são salvas ao trocar de seção, fechar ou gerar.
      </p>
      {dirty && <p role="status">Alterações pendentes nesta seção.</p>}
      {(section.status === "skipped" || notice.startsWith("Seção pulada")) && (
        <p role="status">Seção pulada. Seus dados foram preservados.</p>
      )}
      {section.kind === "introduction" && (
        <>
          {field("Nome da marca", brand.name, (name) => patchBrand({ name }))}
          {field("Assinatura verbal", brand.tagline, (tagline) =>
            patchBrand({ tagline }),
          )}
          {field(
            "Descrição",
            brand.description,
            (description) => patchBrand({ description }),
            true,
          )}
        </>
      )}
      {section.kind === "brand-strategy" && (
        <>
          {field(
            "Propósito",
            brief.purpose,
            (purpose) => setBrief({ ...brief, purpose }),
            true,
          )}
          {field(
            "Público",
            brief.audience,
            (audience) => setBrief({ ...brief, audience }),
            true,
          )}
          {field(
            "Posicionamento",
            brief.positioning,
            (positioning) => setBrief({ ...brief, positioning }),
            true,
          )}
          <LineField
            label="Personalidade — um traço por linha"
            value={brief.personality}
            onChange={(personality) => setBrief({ ...brief, personality })}
          />
          <LineField
            label="Valores — um por linha"
            value={brand.values}
            onChange={(values) => patchBrand({ values })}
          />
          <Rows
            title="Definições"
            items={brand.definitions}
            add={() => ({ term: "", definition: "" })}
            onChange={(definitions) => patchBrand({ definitions })}
          >
            {(row, i, update) => (
              <>
                {field(`Termo ${i + 1}`, row.term, (term) => update({ term }))}
                {field(
                  `Definição ${i + 1}`,
                  row.definition,
                  (definition) => update({ definition }),
                  true,
                )}
              </>
            )}
          </Rows>
          <Rows
            title="Narrativas"
            items={brand.narratives}
            add={() => ({ title: "", text: "" })}
            onChange={(narratives) => patchBrand({ narratives })}
          >
            {(row, i, update) => (
              <>
                {field(`Título da narrativa ${i + 1}`, row.title, (title) =>
                  update({ title }),
                )}
                {field(
                  `Narrativa ${i + 1}`,
                  row.text,
                  (text) => update({ text }),
                  true,
                )}
              </>
            )}
          </Rows>
          <LineField
            label="Mantras — um por linha"
            value={brand.mantras}
            onChange={(mantras) => patchBrand({ mantras })}
          />
          <Rows
            title="Dicionário"
            items={brand.dictionary}
            add={() => ({ term: "", meaning: "", usage: "" })}
            onChange={(dictionary) => patchBrand({ dictionary })}
          >
            {(row, i, update) => (
              <>
                {field(`Palavra ${i + 1}`, row.term, (term) =>
                  update({ term }),
                )}
                {field(`Significado ${i + 1}`, row.meaning, (meaning) =>
                  update({ meaning }),
                )}
                {field(`Uso da palavra ${i + 1}`, row.usage, (usage) =>
                  update({ usage }),
                )}
              </>
            )}
          </Rows>
        </>
      )}
      {section.kind === "voice" && (
        <>
          <LineField
            label="Traços da voz"
            value={voice.traits}
            onChange={(traits) => patchVoice({ traits })}
          />
          <LineField
            label="Fazer"
            value={voice.do}
            onChange={(value) => patchVoice({ do: value })}
          />
          <LineField
            label="Evitar"
            value={voice.avoid}
            onChange={(avoid) => patchVoice({ avoid })}
          />
          {field(
            "Exemplo real fornecido",
            voice.sample,
            (sample) => patchVoice({ sample }),
            true,
          )}
          <Rows
            title="Modos de voz"
            items={voice.modes}
            add={() => ({
              id: crypto.randomUUID(),
              name: "",
              do: [],
              dont: [],
              examples: [],
            })}
            onChange={(modes) => patchVoice({ modes })}
          >
            {(row, i, update) => (
              <>
                {field(`Nome do modo ${i + 1}`, row.name, (name) =>
                  update({ name }),
                )}
                {field(
                  `Descrição do modo ${i + 1}`,
                  row.description,
                  (description) => update({ description }),
                )}
                <LineField
                  label={`Fazer no modo ${i + 1}`}
                  value={row.do}
                  onChange={(value) => update({ do: value })}
                />
                <LineField
                  label={`Evitar no modo ${i + 1}`}
                  value={row.dont}
                  onChange={(dont) => update({ dont })}
                />
                <Rows
                  title={`Exemplos do modo ${i + 1}`}
                  items={row.examples ?? []}
                  add={() => ({ wrong: "", right: "", explanation: "" })}
                  onChange={(examples) => update({ examples })}
                >
                  {(example, j, change) => (
                    <>
                      {field(
                        `Evitar no exemplo ${i + 1}.${j + 1}`,
                        example.wrong,
                        (wrong) => change({ wrong }),
                        true,
                      )}
                      {field(
                        `Preferir no exemplo ${i + 1}.${j + 1}`,
                        example.right,
                        (right) => change({ right }),
                        true,
                      )}
                      {field(
                        `Explicação ${i + 1}.${j + 1}`,
                        example.explanation,
                        (explanation) => change({ explanation }),
                        true,
                      )}
                    </>
                  )}
                </Rows>
              </>
            )}
          </Rows>
        </>
      )}
      {section.kind === "logo" && (
        <>
          <p>
            Envie assinaturas reais. Construção, proteção e redução só entram
            quando fornecidas nas seções correspondentes.
          </p>
          <AssetPicker
            assets={project.assets.filter((a) =>
              a.mimeType.startsWith("image/"),
            )}
            value={brand.logos.find((l) => l.variant === "primary")?.assetId}
            label="Logo principal"
            uploadLabel="Enviar logo"
            accept="image/*,.svg"
            onImportAsset={onImportAsset}
            onSelect={(assetId, asset) => {
              const logos = brand.logos.filter((l) => l.variant !== "primary");
              if (assetId)
                logos.unshift({
                  id:
                    brand.logos.find((l) => l.variant === "primary")?.id ??
                    crypto.randomUUID(),
                  name: asset?.name ?? "Principal",
                  assetId,
                  variant: "primary",
                  background: "any",
                  ...provided,
                });
              patchBrand({ logos });
              // Host already registered the asset; bypass stale-prop validation only for this acknowledged record.
              onCommands([
                { type: "project.update", patch: { brand: { logos } } },
                {
                  type: "section.update",
                  sectionId: section.id,
                  patch: {
                    status: "provided",
                    enabled: true,
                    content: {
                      ...content,
                      assetIds: logos.map((l) => l.assetId),
                    },
                    origin: { kind: "provided" },
                    approval: { status: "pending" },
                  },
                },
              ]);
            }}
          />
          <Rows
            title="Assinaturas adicionais"
            items={brand.logos.filter((l) => l.variant !== "primary")}
            add={() => ({
              id: crypto.randomUUID(),
              name: "",
              assetId: "",
              variant: "secondary" as const,
              background: "any" as const,
              ...provided,
            })}
            onChange={(logos) =>
              patchBrand({
                logos: [
                  ...brand.logos.filter((l) => l.variant === "primary"),
                  ...logos,
                ],
              })
            }
          >
            {(row, i, update) => (
              <>
                {field(`Nome da assinatura ${i + 1}`, row.name, (name) =>
                  update({ name }),
                )}
                <AssetPicker
                  assets={project.assets.filter((a) =>
                    a.mimeType.startsWith("image/"),
                  )}
                  value={row.assetId}
                  label={`Arquivo da assinatura ${i + 1}`}
                  uploadLabel={`Enviar assinatura ${i + 1}`}
                  onImportAsset={onImportAsset}
                  onSelect={(assetId) => update({ assetId: assetId ?? "" })}
                />
                <label>
                  Variação
                  <select
                    value={row.variant}
                    onChange={(e) =>
                      update({ variant: e.target.value as typeof row.variant })
                    }
                  >
                    {["secondary", "symbol", "monochrome", "reversed"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Fundo
                  <select
                    value={row.background}
                    onChange={(e) =>
                      update({
                        background: e.target.value as typeof row.background,
                      })
                    }
                  >
                    {["any", "light", "dark"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </Rows>
        </>
      )}
      {section.kind === "colors" && (
        <>
          <Rows
            title="Cores"
            items={brand.colors}
            add={() => ({
              id: crypto.randomUUID(),
              name: "",
              hex: "",
              role: "primary" as const,
              ...provided,
            })}
            onChange={(colors) => patchBrand({ colors })}
          >
            {(row, i, update) => (
              <>
                {field(`Nome da cor ${i + 1}`, row.name, (name) =>
                  update({ name }),
                )}
                {field(`HEX ${i + 1}`, row.hex, (hex) => update({ hex }))}
                <label>
                  Papel da cor
                  <select
                    value={row.role}
                    onChange={(e) =>
                      update({ role: e.target.value as typeof row.role })
                    }
                  >
                    {["primary", "secondary", "accent", "neutral"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </label>
                {field(
                  `Uso da cor ${i + 1}`,
                  row.usage,
                  (usage) => update({ usage }),
                  true,
                )}
                {field(
                  `RGB fornecido ${i + 1}`,
                  colorNotes[row.id]?.rgb,
                  (rgb) =>
                    setColorNotes((notes) => ({
                      ...notes,
                      [row.id]: { rgb, cmyk: notes[row.id]?.cmyk ?? "" },
                    })),
                )}
                {field(
                  `CMYK fornecido ${i + 1}`,
                  colorNotes[row.id]?.cmyk,
                  (cmyk) =>
                    setColorNotes((notes) => ({
                      ...notes,
                      [row.id]: { cmyk, rgb: notes[row.id]?.rgb ?? "" },
                    })),
                )}
              </>
            )}
          </Rows>
          <p>
            RGB e CMYK fornecidos são preservados como notas da seção, sem
            conversão. O documento e a exportação usam RGB.
          </p>
        </>
      )}
      {section.kind === "typography" && (
        <>
          <Rows
            title="Tipografia"
            items={brand.typography}
            add={() => ({
              id: crypto.randomUUID(),
              family: "",
              weights: [400],
              role: "body" as const,
              fallback: "sans-serif",
              ...provided,
            })}
            onChange={(typography) => patchBrand({ typography })}
          >
            {(row, i, update) => (
              <>
                {field(`Família ${i + 1}`, row.family, (family) =>
                  update({ family }),
                )}
                <label>
                  Papel tipográfico
                  <select
                    value={row.role}
                    onChange={(e) =>
                      update({ role: e.target.value as typeof row.role })
                    }
                  >
                    {["display", "heading", "body", "caption"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <Weights
                  value={row.weights}
                  label={`Pesos ${i + 1}`}
                  onChange={(weights) => update({ weights })}
                />
                {field(`Substituta ${i + 1}`, row.fallback, (fallback) =>
                  update({ fallback }),
                )}
                {field(`Licença da fonte ${i + 1}`, row.license, (license) =>
                  update({ license }),
                )}
                <AssetPicker
                  assets={project.assets.filter(
                    (a) =>
                      /font|woff|ttf|otf/.test(a.mimeType) ||
                      /\.(woff2?|ttf|otf)$/i.test(a.name),
                  )}
                  value={row.assetId}
                  label={`Arquivo de fonte ${i + 1}`}
                  uploadLabel={`Enviar fonte ${i + 1}`}
                  accept=".woff,.woff2,.ttf,.otf"
                  onImportAsset={onImportAsset}
                  onSelect={(assetId) => {
                    const typography = brand.typography.map((font, index) =>
                      index === i
                        ? {
                            ...font,
                            assetId,
                            approval: { status: "pending" as const },
                          }
                        : font,
                    );
                    patchBrand({ typography });
                    if (row.family.trim())
                      onCommands([
                        {
                          type: "project.update",
                          patch: { brand: { typography } },
                        },
                      ]);
                  }}
                />
                <div aria-label={`Espécimes da fonte ${i + 1}`}>
                  <small>
                    Prévia local; o carregamento do arquivo é verificado ao
                    gerar.
                  </small>
                  {row.weights.map((weight) => (
                    <p
                      key={weight}
                      style={{
                        fontFamily: `${JSON.stringify(row.family)}, ${row.fallback}`,
                        fontWeight: weight,
                        fontSize: row.role === "display" ? 32 : 20,
                      }}
                    >
                      {weight} · Aa — {row.family || "Família a preencher"} ·
                      0123456789
                    </p>
                  ))}
                </div>
              </>
            )}
          </Rows>
          <p>
            Forneça hierarquia, tamanhos e espécimes nos parágrafos e regras
            abaixo. A fonte só será usada após carregar o arquivo; substituições
            são sinalizadas.
          </p>
        </>
      )}
      {section.kind === "credits" && (
        <>
          <p>
            Créditos começam em branco. Pular não adiciona estúdio, autor ou
            assinatura.
          </p>
          {(
            [
              "studio",
              "author",
              "handle",
              "website",
              "license",
              "notes",
            ] as const
          ).map((key, i) => (
            <TextField
              key={key}
              label={
                [
                  "Estúdio",
                  "Autor",
                  "Perfil",
                  "Site",
                  "Licença",
                  "Notas de créditos",
                ][i]
              }
              value={credits[key]}
              onChange={(text) => setCredits({ ...credits, [key]: text })}
            />
          ))}
          <Rows
            title="Colaboradores"
            items={credits.contributors ?? []}
            add={() => ({ name: "", role: "" })}
            onChange={(contributors) =>
              setCredits({ ...credits, contributors })
            }
          >
            {(row, i, update) => (
              <>
                {field(`Colaborador ${i + 1}`, row.name, (name) =>
                  update({ name }),
                )}
                {field(`Função ${i + 1}`, row.role, (role) => update({ role }))}
              </>
            )}
          </Rows>
        </>
      )}
      {contentFields}
      {[
        "photography",
        "graphic-elements",
        "applications",
        "identity-complete",
        "archetypes",
        "pillars",
        "clear-space",
        "incorrect-usage",
      ].includes(section.kind) && (
        <fieldset>
          <legend>Arquivos fornecidos para esta seção</legend>
          {project.assets.map((asset) => (
            <label className="intake-check" key={asset.id}>
              <input
                type="checkbox"
                checked={content.assetIds.includes(asset.id)}
                onChange={(e) =>
                  patchContent({
                    assetIds: e.target.checked
                      ? [...content.assetIds, asset.id]
                      : content.assetIds.filter((id) => id !== asset.id),
                  })
                }
              />
              {asset.name}
            </label>
          ))}
          <AssetPicker
            assets={project.assets}
            label="Selecionar arquivo da seção"
            uploadLabel="Enviar arquivo da seção"
            onImportAsset={onImportAsset}
            onSelect={(id) => {
              if (id)
                patchContent({
                  assetIds: [...new Set([...content.assetIds, id])],
                });
            }}
          />
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && !notice.startsWith("Seção pulada") && (
        <p role="status">{notice}</p>
      )}
      <div className="intake-actions">
        <button type="submit">Salvar seção</button>
        <button type="button" onClick={() => save("skipped")}>
          Pular seção
        </button>
        {section.status === "skipped" && (
          <button type="button" onClick={() => save("provided")}>
            Retomar seção
          </button>
        )}
      </div>
    </form>
  );
}
function Weights({
  value,
  label,
  onChange,
}: {
  value: number[];
  label: string;
  onChange: (value: number[]) => void;
}) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => {
    setText(value.join(", "));
  }, [value]);
  return (
    <label>
      {label}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onChange(
            text
              .split(/[,\s]+/)
              .filter(Boolean)
              .map(Number),
          )
        }
      />
    </label>
  );
}
