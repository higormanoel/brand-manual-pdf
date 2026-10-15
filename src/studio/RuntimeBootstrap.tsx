import { useEffect, useState } from "react";
import { App } from "./App";
import {
  initializeRuntime,
  createBrowserRuntime,
  type Startup,
} from "./runtime";
import { importPortable, exportPortable } from "../storage/portable";
import { RecoveryPublicationError } from "../storage/recovery";
import { parseProject } from "../core/project";
import { createSnapshot } from "../storage/snapshot";
import type { StudioRuntime } from "./runtime-contract";
function download(bytes: Uint8Array, name: string) {
  const u = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function RuntimeBootstrap() {
  const [state, setState] = useState<Startup>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    let runtime: StudioRuntime | undefined;
    initializeRuntime()
      .then((s) => {
        runtime = s.runtime;
        if (active) setState(s);
        else runtime.close?.();
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      runtime?.close?.();
    };
  }, []);
  useEffect(
    () => () => {
      state?.runtime.close?.();
    },
    [state?.runtime],
  );
  async function switchRuntime(next: StudioRuntime) {
    const url = new URL(location.href);
    if (next.mode === "browser-only") {
      url.searchParams.set("mode", "browser");
      history.replaceState(null, "", url.href);
    }
    setGeneration((n) => n + 1);
    setState({ runtime: next });
    setError("");
  }
  async function open(file: File) {
    const snapshot = await importPortable(
      new Uint8Array(await file.arrayBuffer()),
    );
    let runtime: StudioRuntime;
    try {
      runtime = await createBrowserRuntime(snapshot);
    } catch (error) {
      if (
        !(error instanceof RecoveryPublicationError) ||
        error.code !== "revision-conflict"
      )
        throw error;
      // Explicit Open creates an independent copy when this identity already has newer confirmed work.
      const copy = parseProject(snapshot.project);
      copy.id = crypto.randomUUID();
      runtime = await createBrowserRuntime(
        await createSnapshot(copy, snapshot.assets),
      );
    }
    await switchRuntime(runtime);
  }
  async function recover() {
    if (!state?.recovery) return;
    setBusy(true);
    try {
      const r = state.recovery;
      const copy = structuredClone(r.project);
      copy.id = crypto.randomUUID();
      copy.title = `${copy.title} — cópia recuperada não confirmada`;
      await switchRuntime(
        await createBrowserRuntime(await createSnapshot(copy, r.assets)),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    if (!state?.recovery) return;
    try {
      const r = state.recovery;
      const copy = structuredClone(r.project);
      copy.title += " — recuperação não confirmada";
      download(
        await exportPortable(await createSnapshot(copy, r.assets)),
        "recuperacao-nao-confirmada.marquio.zip",
      );
    } catch (e) {
      setError(String(e));
    }
  }
  if (state?.recovery)
    return (
      <main
        style={{
          padding: 32,
          color: "#f1f1f1",
          background: "#202020",
          minHeight: "100vh",
          fontFamily: "Inter,sans-serif",
        }}
      >
        <h1>Alterações não confirmadas recuperáveis</h1>
        <p>
          Existe uma cópia pendente neste navegador. O arquivo confirmado pode
          ter mudado. Recupere uma cópia independente ou salve um backup antes
          de continuar.
        </p>
        <button disabled={busy} onClick={() => void recover()}>
          Recuperar como cópia no navegador
        </button>{" "}
        <button onClick={() => void backup()}>Baixar backup pendente</button>{" "}
        <button onClick={() => setState({ runtime: state.runtime })}>
          Usar projeto confirmado
        </button>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  if (state)
    return (
      <>
        {error && (
          <p
            role="alert"
            style={{
              position: "fixed",
              zIndex: 99,
              top: 48,
              left: 48,
              padding: 12,
              background: "#202020",
              color: "#ffb4ab",
            }}
          >
            {error}
          </p>
        )}
        <App
          key={generation}
          runtime={state.runtime}
          onNewProject={() => {
            void createBrowserRuntime()
              .then(switchRuntime)
              .catch((e) => setError(String(e)));
          }}
          onOpenPortable={open}
        />
      </>
    );
  return (
    <main style={{ padding: 32 }}>
      {error ? (
        <>
          <p role="alert">Não foi possível abrir o projeto: {error}</p>
          <button onClick={() => location.reload()}>Tentar novamente</button>
          <button
            onClick={() =>
              void createBrowserRuntime()
                .then(switchRuntime)
                .catch((e) => setError(String(e)))
            }
          >
            Criar projeto separado no navegador
          </button>
        </>
      ) : (
        <p role="status">Abrindo Marquio…</p>
      )}
    </main>
  );
}
