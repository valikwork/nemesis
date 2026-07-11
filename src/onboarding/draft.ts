import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DraftOrdeal {
  ordealId: string;
  skillHint: string;
}

export interface OnboardingDraft {
  maskAvatarId: string | null;
  nemesisName: string;
  catchphrase: string;
  bio: string;
  ordeals: DraftOrdeal[];
}

export const emptyDraft: OnboardingDraft = {
  maskAvatarId: null,
  nemesisName: '',
  catchphrase: '',
  bio: '',
  ordeals: [],
};

const KEY = 'nemesis.onboarding.draft';

export async function loadDraft(): Promise<OnboardingDraft> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyDraft;
    return { ...emptyDraft, ...JSON.parse(raw) };
  } catch {
    return emptyDraft;
  }
}

export async function saveDraft(draft: OnboardingDraft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(draft));
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
