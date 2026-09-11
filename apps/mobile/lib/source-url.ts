/**
 * Evidence source URLs arrive from provider output and stored analysis rows,
 * not from the user. Handing an arbitrary string to the OS would let a
 * non-web scheme reach another installed app, so only plain web links open.
 */
export function toOpenableSourceUrl(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString();
}
