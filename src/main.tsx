import { createRoot } from "react-dom/client";
import { RenderHarness } from "./render/RenderHarness";
import { App } from "./studio/App";
import { createMemoryRuntime } from "./studio/memoryRuntime";
const root = createRoot(document.getElementById("root")!);
if (new URLSearchParams(location.search).has("render-proof"))
  root.render(<RenderHarness />);
else {
  root.render(<p role="status">Abrindo Marquio…</p>);
  createMemoryRuntime()
    .then((runtime) => root.render(<App runtime={runtime} />))
    .catch((error) =>
      root.render(
        <p role="alert">Não foi possível abrir o projeto: {String(error)}</p>,
      ),
    );
}
