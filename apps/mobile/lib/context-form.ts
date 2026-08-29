import {
  personalContextOnboardingInputSchema,
  type PersonalContextOnboardingInput,
  type PersonalContextResponse,
  type PersonalContextType,
} from "@miraio/domain";

export type OnboardingFormValues = {
  currentCompany: string;
  currentRole: string;
  currentThemes: string;
  expertise: string;
  freeText: string;
  offer: string;
  pastExperience: string;
  seeking: string;
  strongSkills: string;
};

export const emptyOnboardingForm: OnboardingFormValues = {
  currentCompany: "",
  currentRole: "",
  currentThemes: "",
  expertise: "",
  freeText: "",
  offer: "",
  pastExperience: "",
  seeking: "",
  strongSkills: "",
};

export const personalContextTypeLabels: Record<PersonalContextType, string> = {
  past_experience: "これまでの経験",
  expertise: "専門領域",
  strong_skill: "得意なこと",
  current_theme: "最近のテーマ",
  offer: "提供できること",
  seeking: "知りたい・会いたい",
  free_text: "その他",
};

export function createOnboardingInput(
  values: OnboardingFormValues,
  requestId: string,
): PersonalContextOnboardingInput {
  return personalContextOnboardingInputSchema.parse({
    request_id: requestId,
    profile: {
      current_company: values.currentCompany,
      current_role: values.currentRole,
    },
    answers: {
      past_experience: values.pastExperience,
      expertise: values.expertise,
      strong_skills: values.strongSkills,
      current_themes: values.currentThemes,
      offer: values.offer,
      seeking: values.seeking,
      free_text: values.freeText,
    },
    locale: "ja",
  });
}

export function createOnboardingRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function hasUsablePersonalContext(
  context: PersonalContextResponse,
): boolean {
  return Boolean(
    context.profile.current_role?.trim() &&
    context.items.some((item) => item.type === "offer" && item.user_approved),
  );
}
