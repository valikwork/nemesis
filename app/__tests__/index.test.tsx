import { render } from '@testing-library/react-native';
import '../../src/i18n';

jest.mock('../../src/auth/session', () => ({
  useSession: () => ({ loading: false, session: null, hasProfile: false, refreshProfile: async () => {} }),
}));

// Home imports src/lib/supabase (for the persona lookup effect) purely for
// its side-effecting createClient() call, which needs real env vars this
// unit test shouldn't depend on — mock the module so import doesn't blow up.
jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));

import Home from '../index';

describe('Home', () => {
  it('renders logo and tagline', async () => {
    const { getByText } = await render(<Home />);
    getByText('NEMESIS');
    getByText('Iron hardens Iron');
  });
});
