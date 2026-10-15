import { createRoot } from "react-dom/client";
import { RenderHarness } from "./render/RenderHarness";
import { RuntimeBootstrap } from "./studio/RuntimeBootstrap";
const root = createRoot(document.getElementById("root")!);
if (new URLSearchParams(location.search).has("render-proof"))
  root.render(<RenderHarness />);
else root.render(<RuntimeBootstrap />);
