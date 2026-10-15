import { spawn } from "node:child_process";
export function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "rundll32"
        : "xdg-open";
  const args =
    platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      shell: false,
      detached: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
