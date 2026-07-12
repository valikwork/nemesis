// Supabase errors (PostgrestError, AuthError, FunctionsError) carry a
// `message` but are not Error instances -- `String(e)` renders
// "[object Object]". Always extract through this helper.
export function errMessage(e: unknown): string {
  if (e != null && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
