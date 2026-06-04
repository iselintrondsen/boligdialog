import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const schema = z.object({ email: z.string().email('Ugyldig e-postadresse') });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, { redirectTo: 'boligdialog://reset-password' });
    if (error) Alert.alert('Feil', error.message); else setSent(true);
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.container}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={s.link}>← Tilbake</Text>
        </TouchableOpacity>
        <Text style={s.title}>Glemt passord</Text>
        <Text style={s.subtitle}>Skriv inn e-postadressen din, så sender vi deg en tilbakestillingslenke.</Text>

        {sent ? (
          <View style={s.successBox}>
            <Text style={s.successTitle}>E-post sendt!</Text>
            <Text style={s.successText}>Sjekk innboksen din for å tilbakestille passordet.</Text>
          </View>
        ) : (
          <>
            <Text style={s.label}>E-post</Text>
            <Controller control={control} name="email" render={({ field: { onChange, onBlur, value } }) => (
              <TextInput style={s.input} placeholder="din@epost.no" placeholderTextColor="#9CA3AF"
                keyboardType="email-address" autoCapitalize="none" onBlur={onBlur} onChangeText={onChange} value={value} />
            )} />
            {errors.email && <Text style={s.error}>{errors.email.message}</Text>}
            <TouchableOpacity style={s.btn} onPress={handleSubmit(onSubmit)} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send tilbakestillingslenke</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const BLUE = '#1A56A0';
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 64 },
  back: { marginBottom: 32 },
  link: { color: BLUE, fontSize: 16 },
  title: { fontSize: 28, fontWeight: '700', color: BLUE, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6B7280', marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '500', color: '#1A1A2E', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1A1A2E', backgroundColor: '#F5F7FA' },
  error: { color: '#EF4444', fontSize: 13, marginTop: 4 },
  btn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  successBox: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 12, padding: 16 },
  successTitle: { color: '#15803D', fontWeight: '600' },
  successText: { color: '#16A34A', fontSize: 14, marginTop: 4 },
});
