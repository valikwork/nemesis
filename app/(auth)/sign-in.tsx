import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const fn = mode === 'signIn'
      ? supabase.auth.signInWithPassword({ email: email.trim(), password })
      : supabase.auth.signUp({ email: email.trim(), password });
    const { error: e } = await fn;
    if (e) setError(e.message);
    setBusy(false);
    // success: session change fires the root guard; no manual navigation
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.welcome}>{t('onboarding.welcomeTitle')}</Text>
      <Text style={styles.body}>{t('onboarding.welcomeBody')}</Text>
      <View style={styles.form}>
        <GrimInput value={email} onChangeText={setEmail} placeholder="email@example.com"
          autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <GrimInput value={password} onChangeText={setPassword} placeholder="••••••••"
          secureTextEntry autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} />
        {error != null && <Text style={styles.error}>{error}</Text>}
        <GrimButton
          label={mode === 'signIn' ? 'Enter' : 'Rise'}
          onPress={submit}
          disabled={busy || email.trim() === '' || password.length < 8}
        />
        <GrimButton
          label={mode === 'signIn' ? 'No account? Rise anew' : 'Return to the gate'}
          variant="ghost"
          onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, justifyContent: 'center', padding: spacing[4], gap: spacing[1] },
  logo: { color: semantic.text, fontSize: 40, letterSpacing: 6, textAlign: 'center' },
  welcome: { color: colors.ash, fontSize: 16, textAlign: 'center', marginTop: spacing[2] },
  body: { color: colors.smoke, fontSize: 13, textAlign: 'center', marginBottom: spacing[4] },
  error: { color: colors.blood, fontSize: 13 },
  form: { gap: spacing[2] },
});
