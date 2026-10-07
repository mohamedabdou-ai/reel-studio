declare module "react-dom" {
  export function flushSync<R>(fn: () => R): R;
}
