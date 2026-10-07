declare module "virtual:panels";



declare module "react-dom/client" {
  export function createRoot(container: Element | DocumentFragment): { render(children: import("react").ReactNode): void; unmount(): void };
}
