import { colors } from "@miraio/ui-tokens";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

const paths = {
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6L6 18",
  home: "M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  person: "M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 21v-3c0-5 16-5 16 0v3z",
  company:
    "M4 21V3h10v18M14 9h6v12M7 7h3M7 11h3M7 15h3M17 13h1M17 17h1M2 21h20",
  people:
    "M8 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0M4 21v-3c0-5 14-5 14 0v3M17 4a3 3 0 0 1 0 6M19 14c3 0 3 4 3 5M4 4a3 3 0 0 0 0 6M3 14c-3 0-2 4-2 5",
  note: "M13 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8M10 14l1-4 8-8 3 3-8 8z",
  camera:
    "M8 5l1-2h6l1 2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 13a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  check: "M5 12l4 4L19 6",
  checked:
    "M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9M7 11l4 4L21 3",
  gift: "M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9C2 9 5 0 9 4l3 5c10 0 7-9 3-5z",
  bridge: "M3 20V7M21 20V7M3 12c4 7 14 7 18 0M7 16v4M12 18v2M17 16v4M1 20h22",
  bulb: "M8 16c-6-7-2-13 4-13s10 6 4 13l-1 3H9zM9 22h6M12 7v5",
  image: "M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M14 7h.01",
  flash: "M13 2L5 14h6l-1 8 9-13h-6z",
  bell: "M4 17h16l-2-3V9a6 6 0 0 0-12 0v5zM10 21h4",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
} as const;

export type IconName = keyof typeof paths;
export function Icon({
  name,
  color = colors.muted,
  size = 24,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LensMark() {
  return (
    <Svg
      width={94}
      height={94}
      viewBox="0 0 100 100"
      accessibilityLabel="Miraio Lens ロゴ"
    >
      <Defs>
        <LinearGradient id="lens" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#602CAB" />
          <Stop offset="0.45" stopColor="#B27BFF" />
          <Stop offset="1" stopColor="#8244D2" />
        </LinearGradient>
      </Defs>
      <Ellipse
        cx={49}
        cy={48}
        rx={32}
        ry={35}
        stroke="url(#lens)"
        strokeWidth={15}
        fill="none"
        transform="rotate(25 49 48)"
      />
      <Path
        d="M23 25C48 11 74 35 76 57l6 24-17-9c17-24-1-51-26-54"
        fill="#C497FF"
        opacity={0.65}
      />
      <Circle cx={46} cy={48} r={22} fill={colors.dark} />
    </Svg>
  );
}
