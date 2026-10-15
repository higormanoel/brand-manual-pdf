import { describe, expect, it } from "vitest";
import { createProject } from "../../src/core/project";
import { applyCommands } from "../../src/core/commands";
import {
  importSuggestion,
  suggestionRequest,
} from "../../src/studio/intake/suggestions";

describe("reviewable suggestions", () => {
  it("imports validated copy pending explicit approval without inventing an author", () => {
    const project = createProject("Só nome");
    const section = project.sections.find((s) => s.kind === "voice")!;
    const next = applyCommands(
      project,
      importSuggestion(
        project,
        JSON.stringify({
          sectionId: section.id,
          content: { summary: "Uma possibilidade a revisar." },
        }),
      ),
    );
    expect(next.sections.find((s) => s.id === section.id)).toMatchObject({
      status: "suggested",
      origin: { kind: "suggested" },
      approval: { status: "pending" },
      content: { summary: "Uma possibilidade a revisar." },
    });
    expect(next.credits).toEqual({});
    expect(project.sections.find((s) => s.id === section.id)?.status).toBe(
      "not-started",
    );
  });
  it("rejects unknown sections, malformed copy and asset references atomically", () => {
    const project = createProject("Nome");
    expect(() => importSuggestion(project, "{")).toThrow();
    expect(() =>
      importSuggestion(
        project,
        JSON.stringify({ sectionId: "missing", content: { summary: "x" } }),
      ),
    ).toThrow();
    expect(() =>
      importSuggestion(
        project,
        JSON.stringify({
          sectionId: project.sections[0].id,
          content: { assetIds: ["missing"] },
        }),
      ),
    ).toThrow();
    expect(() =>
      importSuggestion(
        project,
        JSON.stringify({
          sectionId: project.sections[0].id,
          content: { summary: 12 },
        }),
      ),
    ).toThrow();
  });
  it("creates an honest structured request preserving supplied context", () => {
    const project = createProject("Nome fornecido");
    const request = suggestionRequest(project, project.sections[0]);
    expect(request).toContain("Nome fornecido");
    expect(request).toContain(project.sections[0].id);
    expect(request).toContain("Não invente");
  });
});
