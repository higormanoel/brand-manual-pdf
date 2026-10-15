import { createRoot } from "react-dom/client";
import { App } from "../../src/studio/App";
import { createMemoryRuntime } from "../../src/studio/memoryRuntime";
/** Editor mechanics use a test-only host; production bootstrap is exercised separately. */
export async function mountMemoryStudio() {
  document.getElementById("root")!.style.display = "none";
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<App runtime={await createMemoryRuntime()} />);
}
