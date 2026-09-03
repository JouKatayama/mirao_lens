import {
  personalContextTypes,
  type PersonalContextItem,
  type PersonalContextItemUpdate,
  type PersonalContextOnboardingInput,
  type PersonalContextProfile,
  type PersonalContextType,
} from "@miraio/domain";
import { colors, radius, spacing, typography } from "@miraio/ui-tokens";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createOnboardingInput,
  createOnboardingRequestId,
  emptyOnboardingForm,
  personalContextTypeLabels,
  type OnboardingFormValues,
} from "../lib/context-form";
import type { MobileSupabaseClient } from "../lib/supabase";
import {
  Card,
  ErrorNotice,
  Field,
  PrimaryButton,
  ScreenFrame,
  SecondaryButton,
} from "./ui";

export function AuthScreen({ client }: { client: MobileSupabaseClient }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const normalizedEmail = email.trim().toLocaleLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("有効なメールアドレスを入力してください。");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: authError } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });
    setLoading(false);

    if (authError) {
      setError("コードを送信できませんでした。少し待って再試行してください。");
      return;
    }

    setEmail(normalizedEmail);
    setCodeSent(true);
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) {
      setError("6桁のコードを入力してください。");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: authError } = await client.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    setLoading(false);

    if (authError) {
      setError(
        "コードを確認できませんでした。新しいコードで再試行してください。",
      );
    }
  }

  // The redesign opens on a dark brand screen rather than a plain form, so the
  // sign-in fields sit on that background instead of inside a ScreenFrame.
  return (
    <LinearGradient
      colors={[colors.splashTop, colors.splashBottom]}
      style={styles.authScreen}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.authScreen}>
        <ScrollView
          contentContainerStyle={styles.authBody}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authBrand}>
            <View style={styles.authLogo}>
              <Text style={styles.authLogoGlyph}>a</Text>
            </View>
            <Text style={styles.authTitle}>Miraio Lens</Text>
            <Text style={styles.authTagline}>
              人との出会いを、未来の価値に変える。
            </Text>
          </View>

          <Card>
            <Field
              autoCapitalize="none"
              autoComplete="email"
              editable={!codeSent}
              keyboardType="email-address"
              label="メールアドレス"
              onChangeText={setEmail}
              value={email}
            />
            {codeSent ? (
              <Field
                keyboardType="number-pad"
                label="メールに届いた6桁コード"
                maxLength={6}
                onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
                value={code}
              />
            ) : null}
            <ErrorNotice message={error} />
            <PrimaryButton
              label={codeSent ? "コードを確認" : "ログインコードを送る"}
              loading={loading}
              onPress={codeSent ? verifyCode : sendCode}
            />
            {codeSent ? (
              <SecondaryButton
                disabled={loading}
                label="メールアドレスを変更"
                onPress={() => {
                  setCode("");
                  setCodeSent(false);
                  setError(null);
                }}
              />
            ) : null}
          </Card>

          <Text style={styles.authNote}>
            あなたのコンテキストは非公開です。ログインして安全に管理します。
          </Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

export function OnboardingScreen({
  initialProfile,
  loading,
  onSubmit,
}: {
  initialProfile?: PersonalContextProfile;
  loading: boolean;
  onSubmit: (input: PersonalContextOnboardingInput) => Promise<void>;
}) {
  const [values, setValues] = useState<OnboardingFormValues>({
    ...emptyOnboardingForm,
    currentCompany: initialProfile?.current_company ?? "",
    currentRole: initialProfile?.current_role ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(createOnboardingRequestId());

  function update(key: keyof OnboardingFormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setError(null);

    try {
      await onSubmit(createOnboardingInput(values, requestId.current));
    } catch (cause) {
      if (cause instanceof Error && cause.name === "ZodError") {
        setError("「今の役割」と「提供できること」は必ず入力してください。");
        return;
      }

      setError(
        "候補を作成できませんでした。入力内容を保ったまま再試行できます。",
      );
    }
  }

  return (
    <ScreenFrame
      subtitle="約3分。AIが整理した候補は、あなたが承認するまで利用されません。"
      title="あなたについて教えてください"
    >
      <Card>
        <Field
          label="今の会社・組織（任意）"
          onChangeText={(value) => update("currentCompany", value)}
          value={values.currentCompany}
        />
        <Field
          label="今の役割・仕事 *"
          onChangeText={(value) => update("currentRole", value)}
          placeholder="例：新規事業のプロダクト責任者"
          value={values.currentRole}
        />
        <Field
          label="これまでの経験"
          multiline
          onChangeText={(value) => update("pastExperience", value)}
          value={values.pastExperience}
        />
        <Field
          label="専門領域"
          multiline
          onChangeText={(value) => update("expertise", value)}
          value={values.expertise}
        />
        <Field
          label="得意なこと"
          multiline
          onChangeText={(value) => update("strongSkills", value)}
          value={values.strongSkills}
        />
        <Field
          label="最近取り組んでいること"
          multiline
          onChangeText={(value) => update("currentThemes", value)}
          value={values.currentThemes}
        />
        <Field
          label="人に提供できること *"
          multiline
          onChangeText={(value) => update("offer", value)}
          placeholder="例：初期アイデアへの構造的なフィードバック"
          value={values.offer}
        />
        <Field
          label="今知りたいこと・会いたい人"
          multiline
          onChangeText={(value) => update("seeking", value)}
          value={values.seeking}
        />
        <Field
          label="AIに自分を説明するなら（任意）"
          multiline
          onChangeText={(value) => update("freeText", value)}
          value={values.freeText}
        />
      </Card>
      <ErrorNotice message={error} />
      <PrimaryButton label="AIで整理する" loading={loading} onPress={submit} />
    </ScreenFrame>
  );
}

function TypePicker({
  onChange,
  value,
}: {
  onChange: (type: PersonalContextType) => void;
  value: PersonalContextType;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.typePicker}>
      {personalContextTypes.map((type) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: type === value }}
          key={type}
          onPress={() => onChange(type)}
          style={[
            styles.typeChip,
            type === value ? styles.typeChipActive : null,
          ]}
        >
          <Text
            style={
              type === value ? styles.typeChipTextActive : styles.typeChipText
            }
          >
            {personalContextTypeLabels[type]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ReviewScreen({
  error,
  items,
  loading,
  onApprove,
  onDelete,
  onItemsChange,
}: {
  error?: string | null;
  items: PersonalContextItem[];
  loading: boolean;
  onApprove: (items: PersonalContextItem[]) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
  onItemsChange: (items: PersonalContextItem[]) => void;
}) {
  function update(itemId: string, change: Partial<PersonalContextItem>) {
    onItemsChange(
      items.map((item) => (item.id === itemId ? { ...item, ...change } : item)),
    );
  }

  return (
    <ScreenFrame
      subtitle="内容を確認・修正してください。「承認する」を押すまで分析には使いません。"
      title="AIの整理候補"
    >
      {personalContextTypes.map((contextType) => {
        const groupedItems = items.filter((item) => item.type === contextType);

        return groupedItems.length > 0 ? (
          <View key={contextType} style={styles.contextGroup}>
            <Text accessibilityRole="header" style={styles.contextGroupTitle}>
              {personalContextTypeLabels[contextType]}
            </Text>
            {groupedItems.map((item) => (
              <Card key={item.id}>
                <Text style={styles.draftLabel}>未承認</Text>
                <TypePicker
                  onChange={(type) => update(item.id, { type })}
                  value={item.type}
                />
                <Field
                  label="内容"
                  multiline
                  onChangeText={(text) => update(item.id, { text })}
                  value={item.text}
                />
                <SecondaryButton
                  danger
                  disabled={loading}
                  label="この候補を削除"
                  onPress={() => void onDelete(item.id)}
                />
              </Card>
            ))}
          </View>
        ) : null;
      })}
      <ErrorNotice message={error} />
      <PrimaryButton
        disabled={items.length === 0}
        label="確認した内容を承認する"
        loading={loading}
        onPress={() => void onApprove(items)}
      />
    </ScreenFrame>
  );
}

export function MyContextScreen({
  items: sourceItems,
  loading,
  onBack,
  onDelete,
  onDeleteAccount,
  onEditProfile,
  onSave,
  onSignOut,
  profile,
}: {
  items: PersonalContextItem[];
  loading: boolean;
  onBack: () => void;
  onDelete: (itemId: string) => Promise<void>;
  onDeleteAccount?: () => Promise<void>;
  onEditProfile: () => void;
  onSave: (itemId: string, update: PersonalContextItemUpdate) => Promise<void>;
  onSignOut: () => Promise<void>;
  profile: PersonalContextProfile;
}) {
  const [items, setItems] = useState(sourceItems);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setItems(sourceItems), [sourceItems]);

  function update(itemId: string, change: Partial<PersonalContextItem>) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, ...change } : item,
      ),
    );
  }

  return (
    <ScreenFrame
      subtitle="ここに表示される内容はあなた専用です。いつでも修正・削除できます。"
      title="My Context"
    >
      <SecondaryButton label="Home / Scanへ戻る" onPress={onBack} />
      <Card>
        <Text style={styles.profileLabel}>現在の会社・組織</Text>
        <Text style={styles.profileValue}>
          {profile.current_company || "未設定"}
        </Text>
        <Text style={styles.profileLabel}>現在の役割</Text>
        <Text style={styles.profileValue}>
          {profile.current_role || "未設定"}
        </Text>
        <SecondaryButton
          label="プロフィールと項目を追加・更新"
          onPress={onEditProfile}
        />
      </Card>
      {personalContextTypes.map((contextType) => {
        const groupedItems = items.filter((item) => item.type === contextType);

        return groupedItems.length > 0 ? (
          <View key={contextType} style={styles.contextGroup}>
            <Text accessibilityRole="header" style={styles.contextGroupTitle}>
              {personalContextTypeLabels[contextType]}
            </Text>
            {groupedItems.map((item) => (
              <Card key={item.id}>
                <Text style={styles.approvedLabel}>承認済み</Text>
                <TypePicker
                  onChange={(type) => update(item.id, { type })}
                  value={item.type}
                />
                <Field
                  label="内容"
                  multiline
                  onChangeText={(text) => update(item.id, { text })}
                  value={item.text}
                />
                <PrimaryButton
                  disabled={loading}
                  label="変更を保存"
                  onPress={() => {
                    setError(null);
                    void onSave(item.id, {
                      type: item.type,
                      text: item.text,
                    }).catch(() => setError("変更を保存できませんでした。"));
                  }}
                />
                <SecondaryButton
                  danger
                  disabled={loading}
                  label="削除"
                  onPress={() => {
                    setError(null);
                    void onDelete(item.id).catch(() =>
                      setError("項目を削除できませんでした。"),
                    );
                  }}
                />
              </Card>
            ))}
          </View>
        ) : null;
      })}
      <ErrorNotice message={error} />
      <SecondaryButton
        disabled={loading}
        label="ログアウト"
        onPress={() => void onSignOut()}
      />
      {onDeleteAccount ? (
        <SecondaryButton
          label="アカウントを削除"
          onPress={() => {
            Alert.alert(
              "アカウントを削除",
              "すべてのスキャン・Personal Context・アカウント情報が削除されます。この操作は取り消せません。",
              [
                { style: "cancel", text: "キャンセル" },
                {
                  onPress: () => void onDeleteAccount().catch(() => {}),
                  style: "destructive",
                  text: "削除する",
                },
              ],
            );
          }}
        />
      ) : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  authBody: {
    alignSelf: "center",
    maxWidth: 640,
    width: "100%",
    flexGrow: 1,
    gap: spacing.lg,
    justifyContent: "center",
    padding: spacing.lg,
  },
  authBrand: { alignItems: "center", gap: spacing.sm },
  authLogo: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 84,
    justifyContent: "center",
    marginBottom: spacing.xs,
    width: 84,
  },
  authLogoGlyph: { color: colors.onAccent, fontSize: 40, fontWeight: "700" },
  authNote: {
    ...typography.caption,
    color: colors.textOnDarkMuted,
    textAlign: "center",
  },
  authScreen: { flex: 1 },
  authTagline: { ...typography.caption, color: colors.textOnDarkMuted },
  authTitle: { ...typography.display, color: colors.textOnDark },
  approvedLabel: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  contextGroup: { gap: spacing.md },
  contextGroupTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  draftLabel: { color: colors.warning, fontSize: 12, fontWeight: "800" },
  profileLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  profileValue: { color: colors.text, fontSize: 17, fontWeight: "700" },
  typeChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  typeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  typeChipText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  typeChipTextActive: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },
  typePicker: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
