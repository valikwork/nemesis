import '../../src/i18n';
import { render } from '@testing-library/react-native';
import Home from '../index';

describe('Home', () => {
  it('renders logo and tagline', async () => {
    // @testing-library/react-native v14 targets React 19's concurrent test
    // renderer, so `render` is async — must be awaited (unlike older RTL).
    const { getByText } = await render(<Home />);
    getByText('NEMESIS');
    getByText('Iron hardens Iron');
  });
});
