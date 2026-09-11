/**
 * Source URLs reach this codebase from provider output, never from the user.
 * Handing an arbitrary string to a browser or an OS would let a non-web scheme
 * reach another installed app, so only plain web links survive.
 */
export function toPublicHttpUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

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

export function toUrlHost(value: string | null | undefined): string | null {
  const url = toPublicHttpUrl(value);
  if (url === null) return null;

  // A card prints "www.example.co.jp" while a search result cites
  // "example.co.jp"; treating those as different hosts would file the
  // company's own page as third-party web content.
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

export function toEmailHost(value: string | null | undefined): string | null {
  if (!value) return null;

  const at = value.trim().lastIndexOf("@");
  if (at < 1) return null;

  const host = value
    .trim()
    .slice(at + 1)
    .toLowerCase()
    .replace(/^www\./, "");

  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

/**
 * Whether a researched page belongs to the company on the card. The card's own
 * website and email domain are the only evidence available for that, so a page
 * is "official" when its host matches one of them and third-party otherwise.
 * Being wrong in the cautious direction labels a company page as public web,
 * which understates the source rather than overstating it.
 */
export function classifyCompanySourceType(
  sourceUrl: string,
  card: Readonly<{ website?: string | null; email?: string | null }>,
): "official_company" | "public_web" {
  const sourceHost = toUrlHost(sourceUrl);

  if (sourceHost === null) {
    return "public_web";
  }

  const cardHosts = [toUrlHost(card.website), toEmailHost(card.email)].filter(
    (host): host is string => host !== null,
  );

  const official = cardHosts.some(
    (host) => sourceHost === host || sourceHost.endsWith(`.${host}`),
  );

  return official ? "official_company" : "public_web";
}
