// Bun supports importing .md files as text via `with { type: "text" }`.
// This declaration lets TypeScript resolve such imports without errors.
declare module "*.md" {
  const content: string;
  export default content;
}
