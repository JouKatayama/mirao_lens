// Visual tokens for Miraio Lens.
//
// `accent`, `background`, `muted` and `text` predate the 2026-09 redesign and
// are kept so screens can migrate one at a time; they now carry the new
// values. Prefer the named tokens below them in new code.

export const colors = {
  // ─── Legacy names, new values ──────────────────────────────────────────────
  accent: "#8B5CF6",
  background: "#F5F5F8",
  muted: "#6B6B78",
  text: "#1A1A22",

  // ─── Brand ─────────────────────────────────────────────────────────────────
  accentPressed: "#7C4DEF",
  // Small purple text needs more contrast than the decorative brand accent.
  accentText: "#7544DB",
  // Chip fills, selected rows, and the tint behind hint cards.
  accentSoft: "#EFEAFE",
  accentSoftText: "#6D46D6",
  onAccent: "#FFFFFF",

  // ─── Surfaces ──────────────────────────────────────────────────────────────
  surface: "#FFFFFF",
  // Sits between surface and background: nested cards, textarea wells.
  surfaceSunken: "#FAFAFC",
  // The welcome screen runs a vertical gradient between these two.
  splashTop: "#1B1233",
  splashBottom: "#0D0919",
  // Camera chrome sits on the live preview, so it is its own near-black.
  cameraChrome: "#101014",

  // ─── Text ──────────────────────────────────────────────────────────────────
  textOnDark: "#FFFFFF",
  textOnDarkMuted: "#B7B0CC",

  // ─── Lines ─────────────────────────────────────────────────────────────────
  border: "#E7E7ED",
  borderStrong: "#D6D6DF",

  // ─── Meaningful accents ────────────────────────────────────────────────────
  // GIVE / GET / BRIDGE keep distinct hues so the three analysis tabs stay
  // legible without relying on their headings alone.
  give: "#16A34A",
  giveSoft: "#DCFCE7",
  get: "#2563EB",
  getSoft: "#DBEAFE",
  bridge: "#0EA5E9",
  bridgeSoft: "#E0F2FE",

  // Status badges on the home list.
  warning: "#C2710A",
  warningSoft: "#FEF0DC",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#16A34A",
  successSoft: "#DCFCE7",

  // Score rings draw the filled arc in `accent` over this track.
  track: "#EDEDF3",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// Sizes and weights only. Families stay with the platform so Japanese text
// keeps its system font on both iOS and Android.
export const typography = {
  display: { fontSize: 30, fontWeight: "700", lineHeight: 38 },
  title: { fontSize: 22, fontWeight: "700", lineHeight: 30 },
  heading: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
  body: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400", lineHeight: 18 },
  captionStrong: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: "600", lineHeight: 15 },
} as const;

// Cards in the redesign are separated by a soft shadow rather than a border.
export const elevation = {
  card: {
    elevation: 2,
    shadowColor: "#1A1A22",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  bar: {
    elevation: 8,
    shadowColor: "#1A1A22",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
} as const;
