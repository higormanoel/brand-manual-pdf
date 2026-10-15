import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createProject,
  type BrandProject,
  type AssetRecord,
} from "../../src/core/project";
import { applyCommands } from "../../src/core/commands";
import { Intake } from "../../src/studio/intake/Intake";
import { AssetsPanel } from "../../src/studio/panels/AssetsPanel";
declare global {
  interface Window {
    intakeProject: BrandProject;
    intakeGenerated: number;
  }
}
export function mountIntake() {
  const target = document.createElement("div");
  target.id = "intake-test";
  document.body.replaceChildren(target);
  function Harness() {
    const [project, setProject] = useState(() => createProject("Somente nome"));
    const [open, setOpen] = useState(true);
    window.intakeProject = project;
    const importFile = async (file: File): Promise<AssetRecord> => {
      const bytes = await file.arrayBuffer();
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const asset: AssetRecord = {
        id: crypto.randomUUID(),
        name: file.name,
        path: `assets/${hash}-${file.name}`,
        mimeType: file.type || "application/octet-stream",
        hash,
        origin: { kind: "provided" },
      };
      setProject((p) => applyCommands(p, [{ type: "asset.insert", asset }]));
      return asset;
    };
    return (
      <>
        {open ? (
          <Intake
            project={project}
            onCommands={(commands) =>
              setProject((p) => applyCommands(p, commands))
            }
            onImportAsset={importFile}
            onGenerate={() => {
              window.intakeGenerated = (window.intakeGenerated || 0) + 1;
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        ) : (
          <button onClick={() => setOpen(true)}>Retomar briefing</button>
        )}
        <AssetsPanel
          project={project}
          resolveAsset={() => undefined}
          onImportAsset={importFile}
          onInsertImage={() => {}}
        />
      </>
    );
  }
  createRoot(target).render(<Harness />);
}
