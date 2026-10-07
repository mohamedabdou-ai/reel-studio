import { createRoot } from "react-dom/client";
import "virtual:panels";
import "./app.css";
import "./styles.css";
import { App } from "./App";
import { api } from "./api.ts";
import { getClient } from "./api-client.ts";
import { createEditorStore } from "./store.ts";
import type { ProjectResponse } from "./types.ts";

const rootEl = document.getElementById("root")!;


function showError(message: string) {
  let bar = document.getElementById("fatal");
  if (!bar) {
    bar = document.createElement("pre");
    bar.id = "fatal";
    bar.setAttribute("role", "alert");
    document.body.append(bar);
  }
  bar.textContent = `${message}\n${bar.textContent ?? ""}`.slice(0, 4000);
}
window.addEventListener("error", (e) => showError(`${e.message}`));
window.addEventListener("unhandledrejection", (e) => showError(`unhandled: ${e.reason?.message ?? e.reason}`));

async function boot() {
  const project = await api<ProjectResponse>("/api/project");

  globalThis.__REVIEW_STATIC_FILES__ = project.staticFiles.map((name) => ({ name, lastModified: 0, sizeInBytes: 0 }));
  document.title = `${project.slug} · Review Editor`;
  const store = createEditorStore(project.manifest);

  (window as unknown as { __review: unknown }).__review = { store, project, client: getClient() };
  createRoot(rootEl).render(<App store={store} project={project} />);
}

boot().catch((error) => showError(`تعذّر تحميل المشروع: ${error?.message ?? error}`));
