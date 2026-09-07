import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon } from "./icons";
import { ErrorNotice, IconButton } from "./ui";

export function CameraFrame({
  children,
  onBack,
  onGallery,
  onToggleTorch,
  onCapture,
  torch,
  disabled,
  capturing,
  error,
}: {
  children: ReactNode;
  onBack: () => void;
  onGallery: () => void;
  onToggleTorch: () => void;
  onCapture: () => void;
  torch: boolean;
  disabled: boolean;
  capturing: boolean;
  error: string | null;
}) {
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <View style={s.close}>
          <IconButton
            name="close"
            color="#FFFFFF"
            label="撮影をやめて戻る"
            onPress={onBack}
          />
        </View>
        <Text style={s.title}>名刺を撮影</Text>
        <Text style={s.subtitle}>名刺を枠内に合わせてください</Text>
      </View>
      <View style={s.preview}>
        {children}
        <View pointerEvents="none" style={s.overlay}>
          <View style={s.guide}>
            {[s.topLeft, s.topRight, s.bottomLeft, s.bottomRight].map(
              (position, i) => (
                <View key={i} style={[s.corner, position]} />
              ),
            )}
          </View>
        </View>
      </View>
      <View style={s.controls}>
        <ErrorNotice message={error} />
        <View style={s.buttons}>
          <View style={s.round}>
            <IconButton
              name="image"
              label="写真から名刺を選ぶ"
              color="#FFFFFF"
              onPress={onGallery}
              disabled={capturing}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="名刺を撮影"
            accessibilityState={{ disabled, busy: capturing }}
            disabled={disabled}
            onPress={onCapture}
            style={({ pressed }) => [s.shutter, (pressed || disabled) && s.dim]}
          >
            {capturing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={s.shutterInner} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? "ライトをオフ" : "ライトをオン"}
            accessibilityState={{ selected: torch }}
            aria-pressed={torch}
            onPress={onToggleTorch}
            style={s.round}
          >
            <Icon
              name="flash"
              color={torch ? "#C195FF" : "#FFFFFF"}
              size={23}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000000",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  header: { height: 111, paddingTop: 25, alignItems: "center", gap: 14 },
  title: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  subtitle: { color: "#FFFFFF", fontSize: 13 },
  close: { position: "absolute", top: 13, left: 12 },
  preview: {
    flex: 1,
    minHeight: 220,
    overflow: "hidden",
    backgroundColor: "#1D1C21",
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  guide: { aspectRatio: 1.2, maxHeight: "85%", width: "100%" },
  corner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: "#FFFFFF",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  controls: {
    paddingHorizontal: 26,
    paddingTop: 25,
    paddingBottom: 30,
    gap: 10,
  },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
  },
  dim: { opacity: 0.5 },
});
