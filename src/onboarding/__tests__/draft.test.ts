import { emptyDraft, saveDraft, loadDraft, clearDraft, type OnboardingDraft } from '../draft';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('onboarding draft', () => {
  beforeEach(async () => { await clearDraft(); });

  it('loads empty draft when nothing saved', async () => {
    expect(await loadDraft()).toEqual(emptyDraft);
  });

  it('round-trips a partial draft', async () => {
    const draft: OnboardingDraft = {
      ...emptyDraft,
      maskAvatarId: 'skull_03',
      nemesisName: 'Doomrider Kevin',
      ordeals: [{ ordealId: 'uuid-1', skillHint: '1450 elo' }],
    };
    await saveDraft(draft);
    expect(await loadDraft()).toEqual(draft);
  });

  it('clear resets to empty', async () => {
    await saveDraft({ ...emptyDraft, nemesisName: 'X Y' });
    await clearDraft();
    expect(await loadDraft()).toEqual(emptyDraft);
  });

  it('survives corrupt stored json', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('nemesis.onboarding.draft', '{not json');
    expect(await loadDraft()).toEqual(emptyDraft);
  });
});
