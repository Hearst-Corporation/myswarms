/** Detects whether a string looks like Markdown (usable server-side). */
export function isMarkdown(text: string): boolean {
  return (
    /^#{1,3}\s/m.test(text) ||
    /\*\*.+\*\*/m.test(text) ||
    /^[-*]\s/m.test(text) ||
    /^\d+\.\s/m.test(text)
  );
}
