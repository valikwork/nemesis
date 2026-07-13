import { render } from '@testing-library/react-native';
import '../../src/i18n';

jest.mock('../../src/auth/session', () => ({
  useSession: () => ({ loading: false, session: null, hasProfile: false, refreshProfile: async () => {} }),
}));
jest.mock('../../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('../../src/lib/feuds', () => ({ listFeudsWithMeta: jest.fn(async () => []) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (effect: () => void) => effect(),
}));

import Home from '../(tabs)/index';

describe('Home', () => {
  it('renders logo and empty state', async () => {
    const { getByText } = await render(<Home />);
    getByText('NEMESIS'); // T1 logo is Pickyside — plain text, no metal mirror
    getByText('No feuds yet. Summon a friend and begin.');
  });
});
