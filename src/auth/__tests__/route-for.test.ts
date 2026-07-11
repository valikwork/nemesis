import { routeFor } from '../route-for';

describe('routeFor', () => {
  it('unauthenticated → sign-in', () => {
    expect(routeFor({ session: false, hasProfile: false })).toBe('/(auth)/sign-in');
  });
  it('authenticated without profile → onboarding', () => {
    expect(routeFor({ session: true, hasProfile: false })).toBe('/(onboarding)/mask');
  });
  it('authenticated with profile → home', () => {
    expect(routeFor({ session: true, hasProfile: true })).toBe('/');
  });
});
