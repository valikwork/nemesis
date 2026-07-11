export interface RouteState {
  session: boolean;
  hasProfile: boolean;
}

export function routeFor({ session, hasProfile }: RouteState): string {
  if (!session) return '/(auth)/sign-in';
  if (!hasProfile) return '/(onboarding)/mask';
  return '/';
}
