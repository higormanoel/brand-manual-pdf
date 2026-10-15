import { test, expect, type Page } from "@playwright/test";
async function mount(page: Page) {
  await page.goto("/?render-proof");
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  await page.evaluate(async () => {
    const { mountIntake } = await import(
      /* @vite-ignore */ "/tests/intake/browserHarness.tsx" as string
    );
    mountIntake();
  });
  await expect(
    page.getByRole("heading", { name: "Briefing da marca" }),
  ).toBeVisible();
}
test("name-only project generates without requiring optional fields or fabricated credits", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Gerar manual e abrir editor" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retomar briefing" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      generated: window.intakeGenerated,
      credits: window.intakeProject.credits,
      logos: window.intakeProject.brand.logos,
    })),
  ).toEqual({ generated: 1, credits: {}, logos: [] });
});
test("skip retains entered content and reopening does not demand skipped sections", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Posicionamento", exact: true })
    .click();
  await page.getByLabel("Propósito", { exact: true }).fill("Uma intenção real");
  await page.getByRole("button", { name: "Pular seção" }).click();
  await page.getByRole("button", { name: "Fechar briefing" }).click();
  await page.getByRole("button", { name: "Retomar briefing" }).click();
  await page
    .getByRole("button", { name: "Posicionamento", exact: true })
    .click();
  await expect(page.getByLabel("Propósito", { exact: true })).toHaveValue(
    "Uma intenção real",
  );
  await expect(
    page.getByText("Seção pulada. Seus dados foram preservados."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retomar seção" }).click();
  expect(
    await page.evaluate(
      () =>
        window.intakeProject.sections.find((s) => s.kind === "brand-strategy")
          ?.status,
    ),
  ).toBe("provided");
});
test("uploads and assigns original logo and font, retains manifest when intake reopens", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Marca e assinaturas", exact: true })
    .click();
  await page.getByLabel("Enviar logo").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>',
    ),
  });
  await expect(page.getByLabel("Logo principal")).not.toHaveValue("");
  await page.getByRole("button", { name: "Tipografia", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar tipografia" }).click();
  await page.getByLabel("Família 1", { exact: true }).fill("Fonte do cliente");
  await page
    .getByLabel("Enviar fonte 1")
    .setInputFiles(
      "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    );
  await expect(page.getByLabel("Arquivo de fonte 1")).not.toHaveValue("");
  await page.getByRole("button", { name: "Fechar briefing" }).click();
  await page.getByRole("button", { name: "Retomar briefing" }).click();
  const saved = await page.evaluate(() => window.intakeProject);
  expect(saved.assets).toHaveLength(2);
  expect(saved.brand.logos[0].assetId).toBe(saved.assets[0].id);
  expect(saved.brand.typography[0].assetId).toBe(saved.assets[1].id);
  expect(saved.credits).toEqual({});
});
test("suggestions remain pending until explicit review and invalid import reports recovery", async ({
  page,
}) => {
  await mount(page);
  const sectionId = await page.evaluate(
    () => window.intakeProject.sections[0].id,
  );
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await page.getByLabel("Resposta estruturada").fill("{");
  await page.getByRole("button", { name: "Importar sugestão" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Resposta estruturada").fill(
    JSON.stringify({
      sectionId,
      content: { summary: "Texto para decisão do designer" },
    }),
  );
  await page.getByRole("button", { name: "Importar sugestão" }).click();
  await expect(page.getByText("Texto para decisão do designer")).toBeVisible();
  expect(
    await page.evaluate(() => window.intakeProject.sections[0].approval.status),
  ).toBe("pending");
  await page.getByRole("button", { name: "Aprovar Apresentação" }).click();
  expect(
    await page.evaluate(() => window.intakeProject.sections[0].approval.status),
  ).toBe("approved");
});
test("loads actual uploaded font bytes and reports unavailable fonts as substitutions", async ({
  page,
}) => {
  await page.goto("/?render-proof");
  const result = await page.evaluate(async () => {
    const { loadProjectFonts } = await import(
      /* @vite-ignore */ "/src/render/fonts.ts" as string
    );
    const { createProject } = await import(
      /* @vite-ignore */ "/src/core/project.ts" as string
    );
    const project = createProject("Fonte real");
    project.assets.push({
      id: "font-real",
      path: "assets/brand.woff2",
      name: "Original.woff2",
      hash: "a".repeat(64),
      mimeType: "font/woff2",
      origin: { kind: "provided" },
    });
    project.brand.typography.push(
      {
        id: "font-style",
        family: "Fonte carregada de verdade",
        role: "body",
        weights: [400],
        fallback: "sans-serif",
        assetId: "font-real",
        origin: { kind: "provided" },
        approval: { status: "pending" },
      },
      {
        id: "font-missing",
        family: "Marca indisponível",
        role: "heading",
        weights: [700],
        fallback: "serif",
        origin: { kind: "provided" },
        approval: { status: "pending" },
      },
    );
    const loaded = await loadProjectFonts(
      project,
      () =>
        "/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    );
    const facePresent = [...document.fonts].some(
      (face) =>
        face.family.includes("Fonte carregada de verdade") &&
        face.status === "loaded" &&
        face.weight === "400",
    );
    const broken = await loadProjectFonts(
      project,
      () => "/nonexistent-brand-font.woff2",
    );
    return { loaded, facePresent, broken };
  });
  expect(result.loaded[0]).toMatchObject({
    family: "Fonte carregada de verdade",
    weight: 400,
    status: "loaded",
  });
  expect(result.facePresent).toBe(true);
  expect(result.loaded[1]).toMatchObject({
    family: "Marca indisponível",
    status: "substituted",
    fallback: "serif",
  });
  expect(result.broken[0]).toMatchObject({
    status: "substituted",
    fallback: "sans-serif",
  });
});
test("review approves a supplied font independently from section copy", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Tipografia", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar tipografia" }).click();
  await page.getByLabel("Família 1", { exact: true }).fill("Fonte fornecida");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await page
    .getByRole("button", { name: "Aprovar tipografia Fonte fornecida" })
    .click();
  expect(
    await page.evaluate(() => ({
      font: window.intakeProject.brand.typography[0].approval.status,
      section: window.intakeProject.sections.find(
        (s) => s.kind === "typography",
      )?.approval.status,
    })),
  ).toEqual({ font: "approved", section: "pending" });
});
test("replacing a logo keeps old bytes in the manifest and uses only the new assignment", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Marca e assinaturas", exact: true })
    .click();
  for (const name of ["logo-v1.svg", "logo-v2.svg"]) {
    await page.getByLabel("Enviar logo").setInputFiles({
      name,
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg"><title>${name}</title></svg>`,
      ),
    });
    await expect(page.getByLabel("Logo principal")).toContainText(name);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.intakeProject.brand.logos[0] &&
            window.intakeProject.assets.find(
              (a) => a.id === window.intakeProject.brand.logos[0].assetId,
            )?.name,
        ),
      )
      .toBe(name);
  }
  await page.getByRole("button", { name: "Fechar briefing" }).click();
  await page.getByRole("button", { name: "Retomar briefing" }).click();
  const result = await page.evaluate(() => ({
    count: window.intakeProject.assets.length,
    logos: window.intakeProject.brand.logos,
    newId: window.intakeProject.assets[1].id,
  }));
  expect(result.count).toBe(2);
  expect(result.logos).toHaveLength(1);
  expect(result.logos[0].assetId).toBe(result.newId);
});
test("skipping blank credits leaves credits blank and partial generation available", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Créditos", exact: true }).click();
  await page.getByRole("button", { name: "Pular seção" }).click();
  expect(await page.evaluate(() => window.intakeProject.credits)).toEqual({});
  await page
    .getByRole("button", { name: "Gerar manual e abrir editor" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retomar briefing" }),
  ).toBeVisible();
});
test("voice repeaters preserve multiline typing and actual wrong/right examples", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Voz e linguagem", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar modos de voz" }).click();
  await page.getByLabel("Nome do modo 1", { exact: true }).fill("Atendimento");
  const doing = page.getByLabel("Fazer no modo 1", { exact: true });
  await doing.pressSequentially("Ouvir");
  await doing.press("Enter");
  await doing.pressSequentially("Explicar");
  await expect(doing).toHaveValue("Ouvir\nExplicar");
  await page
    .getByRole("button", { name: "Adicionar exemplos do modo 1" })
    .click();
  await page
    .getByLabel("Evitar no exemplo 1.1", { exact: true })
    .fill("Você errou.");
  await page
    .getByLabel("Preferir no exemplo 1.1", { exact: true })
    .fill("Vamos revisar juntos.");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  const mode = await page.evaluate(
    () => window.intakeProject.brand.voice?.modes[0],
  );
  expect(mode).toMatchObject({
    name: "Atendimento",
    do: ["Ouvir", "Explicar"],
    examples: [{ wrong: "Você errou.", right: "Vamos revisar juntos." }],
  });
});
test("editing an approved identity item requires fresh approval", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Tipografia", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar tipografia" }).click();
  await page.getByLabel("Família 1", { exact: true }).fill("Nome original");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await page
    .getByRole("button", { name: "Aprovar tipografia Nome original" })
    .click();
  await page.getByRole("button", { name: "Tipografia", exact: true }).click();
  await page.getByLabel("Família 1", { exact: true }).fill("Família revisada");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  expect(
    await page.evaluate(
      () => window.intakeProject.brand.typography[0].approval.status,
    ),
  ).toBe("pending");
});
test("an incomplete optional color row cannot prevent skipping the section", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Paleta de cores", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar cores" }).click();
  await page.getByRole("button", { name: "Pular seção" }).click();
  expect(
    await page.evaluate(
      () =>
        window.intakeProject.sections.find((s) => s.kind === "colors")?.status,
    ),
  ).toBe("skipped");
  expect(await page.evaluate(() => window.intakeProject.brand.colors)).toEqual(
    [],
  );
});
test("typing then generating flushes the current name before generation", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByLabel("Nome da marca", { exact: true })
    .fill("Nome revisado antes de gerar");
  await page
    .getByRole("button", { name: "Gerar manual e abrir editor" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retomar briefing" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.intakeProject.brand.name)).toBe(
    "Nome revisado antes de gerar",
  );
});
test("switching sections and closing saves a valid draft without an extra confirmation", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Descrição em andamento");
  await page
    .getByRole("button", { name: "Posicionamento", exact: true })
    .click();
  await page.getByLabel("Propósito", { exact: true }).fill("Propósito real");
  await page.getByRole("button", { name: "Fechar briefing" }).click();
  await page.getByRole("button", { name: "Retomar briefing" }).click();
  await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue(
    "Descrição em andamento",
  );
  expect(await page.evaluate(() => window.intakeProject.brief.purpose)).toBe(
    "Propósito real",
  );
});
test("replacing an approved font requires new approval", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "Tipografia", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar tipografia" }).click();
  await page.getByLabel("Família 1", { exact: true }).fill("Família fornecida");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await page
    .getByRole("button", { name: "Aprovar tipografia Família fornecida" })
    .click();
  await page.getByRole("button", { name: "Tipografia", exact: true }).click();
  await page
    .getByLabel("Enviar fonte 1")
    .setInputFiles(
      "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    );
  await expect(page.getByLabel("Arquivo de fonte 1")).not.toHaveValue("");
  expect(
    await page.evaluate(
      () => window.intakeProject.brand.typography[0].approval.status,
    ),
  ).toBe("pending");
});
test("malformed optional data can be skipped with an explicit recovery notice", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Paleta de cores", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar cores" }).click();
  await page
    .getByLabel("Nome da cor 1", { exact: true })
    .fill("Cor do cliente");
  await page.getByLabel("HEX 1", { exact: true }).fill("valor não hexadecimal");
  await page
    .getByLabel("Parágrafos — um por linha", { exact: true })
    .fill("Rascunho ainda inválido");
  await page.getByRole("button", { name: "Pular seção" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "rascunho inválido não foi salvo",
  );
  await expect(
    page.getByLabel("Parágrafos — um por linha", { exact: true }),
  ).toHaveValue("");
  expect(
    await page.evaluate(
      () =>
        window.intakeProject.sections.find((s) => s.kind === "colors")?.status,
    ),
  ).toBe("skipped");
  expect(await page.evaluate(() => window.intakeProject.brand.colors)).toEqual(
    [],
  );
  await page
    .getByRole("button", { name: "Gerar manual e abrir editor" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retomar briefing" }),
  ).toBeVisible();
});
test("available system fonts do not produce false substitution diagnostics", async ({
  page,
}) => {
  await page.goto("/?render-proof");
  const result = await page.evaluate(async () => {
    const { loadProjectFonts } = await import(
      /* @vite-ignore */ "/src/render/fonts.ts" as string
    );
    const { createProject } = await import(
      /* @vite-ignore */ "/src/core/project.ts" as string
    );
    const project = createProject("Fontes disponíveis");
    project.brand.typography.push(
      {
        id: "generic",
        family: "serif",
        role: "body",
        weights: [400],
        fallback: "sans-serif",
        origin: { kind: "provided" },
        approval: { status: "pending" },
      },
      {
        id: "missing",
        family: "Fonte fictícia que não existe 7321",
        role: "heading",
        weights: [700],
        fallback: "serif",
        origin: { kind: "provided" },
        approval: { status: "pending" },
      },
    );
    return loadProjectFonts(project, () => undefined);
  });
  expect(result[0]).toMatchObject({
    family: "serif",
    status: "loaded",
    source: "system",
  });
  expect(result[1]).toMatchObject({
    family: "Fonte fictícia que não existe 7321",
    status: "substituted",
    fallback: "serif",
  });
});

test("provided RGB and CMYK remain editable without duplicate paragraphs or conversion", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Paleta de cores", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar cores" }).click();
  await page.getByLabel("Nome da cor 1", { exact: true }).fill("Tinta");
  await page.getByLabel("HEX 1", { exact: true }).fill("#123456");
  await page.getByLabel("RGB fornecido 1", { exact: true }).fill("18, 52, 86");
  await page
    .getByLabel("CMYK fornecido 1", { exact: true })
    .fill("70 / 40 / 0 / 30");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await page.getByLabel("RGB fornecido 1", { exact: true }).fill("18, 52, 87");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await page.getByRole("button", { name: "Apresentação", exact: true }).click();
  await page
    .getByRole("button", { name: "Paleta de cores", exact: true })
    .click();
  await expect(page.getByLabel("RGB fornecido 1", { exact: true })).toHaveValue(
    "18, 52, 87",
  );
  const paragraphs = await page.evaluate(
    () =>
      window.intakeProject.sections.find((s) => s.kind === "colors")?.content
        ?.paragraphs,
  );
  expect(paragraphs).toEqual([
    "Coordenadas fornecidas · Tinta (#123456) | RGB fornecido: 18, 52, 87 | CMYK fornecido: 70 / 40 / 0 / 30",
  ]);
});

test("removing a saved color updates owning section references atomically", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Paleta de cores", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar cores" }).click();
  await page.getByLabel("Nome da cor 1", { exact: true }).fill("Tinta");
  await page.getByLabel("HEX 1", { exact: true }).fill("#123456");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await page
    .getByRole("button", { name: "Remover Cores 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Salvar seção" }).click();
  expect(
    await page.evaluate(() => ({
      colors: window.intakeProject.brand.colors,
      refs: window.intakeProject.sections.find((s) => s.kind === "colors")
        ?.content?.colorIds,
    })),
  ).toEqual({ colors: [], refs: [] });
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("removing saved typography clears owning refs and retains the uploaded asset", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Tipografia", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar tipografia" }).click();
  await page.getByLabel("Família 1", { exact: true }).fill("Fonte original");
  await page
    .getByLabel("Enviar fonte 1")
    .setInputFiles(
      "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    );
  await expect(page.getByLabel("Arquivo de fonte 1")).not.toHaveValue("");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await page
    .getByRole("button", { name: "Remover Tipografia 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Salvar seção" }).click();
  expect(
    await page.evaluate(() => ({
      typography: window.intakeProject.brand.typography,
      refs: window.intakeProject.sections.find((s) => s.kind === "typography")
        ?.content?.typographyIds,
      assetCount: window.intakeProject.assets.length,
    })),
  ).toEqual({ typography: [], refs: [], assetCount: 1 });
});

test("removal still rejects a color referenced by a different section without changing the project", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Paleta de cores", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar cores" }).click();
  await page
    .getByLabel("Nome da cor 1", { exact: true })
    .fill("Tinta compartilhada");
  await page.getByLabel("HEX 1", { exact: true }).fill("#123456");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  const refs = await page.evaluate(() => ({
    sectionId: window.intakeProject.sections[0].id,
    colorId: window.intakeProject.brand.colors[0].id,
  }));
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await page
    .getByLabel("Resposta estruturada")
    .fill(
      JSON.stringify({
        sectionId: refs.sectionId,
        content: {
          colorIds: [refs.colorId],
          summary: "Cor fornecida como referência para esta sugestão.",
        },
      }),
    );
  await page.getByRole("button", { name: "Importar sugestão" }).click();
  await page
    .getByRole("button", { name: "Paleta de cores", exact: true })
    .click();
  const before = await page.evaluate(() =>
    JSON.stringify(window.intakeProject),
  );
  await page
    .getByRole("button", { name: "Remover Cores 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Salvar seção" }).click();
  await expect(page.getByRole("alert")).toContainText("Cor");
  expect(await page.evaluate(() => JSON.stringify(window.intakeProject))).toBe(
    before,
  );
});

test("editing the brand name retains pending suggestion copy and its visible provenance until approval", async ({
  page,
}) => {
  await mount(page);
  const sectionId = await page.evaluate(
    () => window.intakeProject.sections[0].id,
  );
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await page
    .getByLabel("Resposta estruturada")
    .fill(
      JSON.stringify({
        sectionId,
        content: { summary: "Texto do agente ainda não aprovado" },
      }),
    );
  await page.getByRole("button", { name: "Importar sugestão" }).click();
  await page.getByRole("button", { name: "Apresentação", exact: true }).click();
  await page.getByLabel("Nome da marca", { exact: true }).fill("Nome revisado");
  await page.getByRole("button", { name: "Salvar seção" }).click();
  expect(
    await page.evaluate(() => window.intakeProject.sections[0]),
  ).toMatchObject({
    status: "suggested",
    origin: { kind: "suggested" },
    approval: { status: "pending" },
    content: { summary: "Texto do agente ainda não aprovado" },
  });
  await expect(
    page.getByRole("button", { name: "Apresentação", exact: true }),
  ).toContainText("Sugestão pendente");
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await expect(
    page.getByRole("heading", { name: "Apresentação · Sugerido, pendente" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aprovar Apresentação" }).click();
  expect(
    await page.evaluate(() => window.intakeProject.sections[0]),
  ).toMatchObject({
    status: "approved",
    origin: { kind: "suggested" },
    approval: { status: "approved" },
  });
});

test("assigning a logo preserves the pending origin of retained suggested section rules", async ({
  page,
}) => {
  await mount(page);
  const sectionId = await page.evaluate(
    () => window.intakeProject.sections.find((s) => s.kind === "logo")!.id,
  );
  await page.getByRole("button", { name: "Revisar sugestões" }).click();
  await page
    .getByLabel("Resposta estruturada")
    .fill(
      JSON.stringify({
        sectionId,
        content: { rules: ["Regra sugerida aguardando decisão"] },
      }),
    );
  await page.getByRole("button", { name: "Importar sugestão" }).click();
  await page
    .getByRole("button", { name: "Marca e assinaturas", exact: true })
    .click();
  await page
    .getByLabel("Enviar logo")
    .setInputFiles({
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
  await expect(page.getByLabel("Logo principal")).not.toHaveValue("");
  expect(
    await page.evaluate(() =>
      window.intakeProject.sections.find((s) => s.kind === "logo"),
    ),
  ).toMatchObject({
    status: "suggested",
    origin: { kind: "suggested" },
    approval: { status: "pending" },
    content: { rules: ["Regra sugerida aguardando decisão"] },
  });
});

test("removing an upload and changing weight cannot leave an injected font masquerading as system font", async ({
  page,
}) => {
  await page.goto("/?render-proof");
  const result = await page.evaluate(async () => {
    const { loadProjectFonts } = await import(
      /* @vite-ignore */ "/src/render/fonts.ts" as string
    );
    const { createProject } = await import(
      /* @vite-ignore */ "/src/core/project.ts" as string
    );
    const project = createProject("Reconciliação de fontes");
    project.assets.push({
      id: "font-file",
      name: "Original.woff2",
      path: "assets/original.woff2",
      hash: "a".repeat(64),
      mimeType: "font/woff2",
      origin: { kind: "provided" },
    });
    project.brand.typography.push({
      id: "font",
      family: "MarquioEphemeralReviewFace",
      role: "body",
      weights: [400],
      fallback: "serif",
      assetId: "font-file",
      origin: { kind: "provided" },
      approval: { status: "pending" },
    });
    const before = await loadProjectFonts(
      project,
      () =>
        "/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    );
    project.brand.typography[0].weights = [700];
    delete project.brand.typography[0].assetId;
    const after = await loadProjectFonts(project, () => undefined);
    const remaining = [...document.fonts]
      .filter((face) => face.family.includes("MarquioEphemeralReviewFace"))
      .map((face) => face.weight);
    return { before, after, remaining };
  });
  expect(result.before[0]).toMatchObject({
    status: "loaded",
    source: "asset",
    weight: 400,
  });
  expect(result.after[0]).toMatchObject({
    status: "substituted",
    weight: 700,
    fallback: "serif",
  });
  expect(result.remaining).toEqual([]);
});

test("system detection runs before shared uploaded families and tracks all current requested weights", async ({
  page,
}) => {
  await page.goto("/?render-proof");
  const result = await page.evaluate(async () => {
    const { loadProjectFonts } = await import(
      /* @vite-ignore */ "/src/render/fonts.ts" as string
    );
    const { createProject } = await import(
      /* @vite-ignore */ "/src/core/project.ts" as string
    );
    const project = createProject("Família compartilhada");
    project.assets.push({
      id: "font-file",
      name: "Original.woff2",
      path: "assets/original.woff2",
      hash: "a".repeat(64),
      mimeType: "font/woff2",
      origin: { kind: "provided" },
    });
    const base = {
      family: "MarquioSharedReviewFace",
      role: "body",
      fallback: "serif",
      origin: { kind: "provided" },
      approval: { status: "pending" },
    };
    project.brand.typography.push(
      { ...base, id: "uploaded", weights: [400, 600], assetId: "font-file" },
      { ...base, id: "system-request", weights: [700] },
    );
    const first = await loadProjectFonts(
      project,
      () =>
        "/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    );
    const active = [...document.fonts]
      .filter((face) => face.family.includes("MarquioSharedReviewFace"))
      .map((face) => face.weight)
      .sort();
    project.brand.typography = [];
    await loadProjectFonts(project, () => undefined);
    const cleared = [...document.fonts].filter((face) =>
      face.family.includes("MarquioSharedReviewFace"),
    ).length;
    return { first, active, cleared };
  });
  expect(result.first[0]).toMatchObject({
    status: "loaded",
    source: "asset",
    weight: 400,
  });
  expect(result.first[1]).toMatchObject({
    status: "loaded",
    source: "asset",
    weight: 600,
  });
  expect(result.first[2]).toMatchObject({ status: "substituted", weight: 700 });
  expect(result.active).toEqual(["400", "600"]);
  expect(result.cleared).toBe(0);
});
