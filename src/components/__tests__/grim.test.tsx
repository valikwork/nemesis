import { render, fireEvent } from '@testing-library/react-native';
// GrimButton → useBrutality → provider module pulls session/supabase; stub both
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../auth/session', () => ({ useSession: () => ({ session: null, hasProfile: false }) }));
import { GrimButton } from '../GrimButton';
import { GrimInput } from '../GrimInput';

describe('GrimButton', () => {
  it('renders label and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<GrimButton label="Challenge" onPress={onPress} />);
    fireEvent.press(getByText('Challenge'));
    expect(onPress).toHaveBeenCalled();
  });
  it('disabled: no fire', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<GrimButton label="Dead" onPress={onPress} disabled />);
    fireEvent.press(getByText('Dead'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('GrimInput', () => {
  it('renders error text when given', async () => {
    const { getByText } = await render(
      <GrimInput value="" onChangeText={() => {}} placeholder="x" error="Too short" />,
    );
    getByText('Too short');
  });
});
