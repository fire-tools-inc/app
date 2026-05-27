/**
 * Ambient declarations for asset imports that Vite resolves at build time.
 */
declare module '*?url' {
  const src: string;
  export default src;
}

declare module '*?worker&inline' {
  const workerCtor: { new (): Worker };
  export default workerCtor;
}
