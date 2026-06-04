import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/lib/types';

const schema = z.object({
  full_name: z.string().min(2, 'Navn må være minst 2 tegn'),
  email: z.string().email('Ugyldig e-postadresse'),
  password: z.string().min(6, 'Passord må være minst 6 tegn'),
  role: z.enum(['landlord', 'tenant'] as const),
});
type FormData = z.infer<typeof schema>;

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'landlord', label: 'Utleier', desc: 'Jeg leier ut boliger' },
  { value: 'tenant', label: 'Leietaker', desc: 'Jeg leier bolig' },
];

export default function RegisterScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'tenant' },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const { data: authData, error: authError } = await supabase.auth.signUp({ email: data.email, password: data.password });
    if (authError) { Alert.alert('Registrering feilet', authError.message); setLoading(false); return; }
    if (authData.user) {
      const { error } = await supabase.from('users').insert({ id: authData.user.id, email: data.email, full_name: data.full_name, role: data.role, avatar_url: null, push_token: null });
      if (error) { Alert.alert('Feil', `Kunne ikke opprette brukerprofil: ${error.message}`); setLoading(false); return; }
    }

    setLoading(false);
    Alert.alert('Velkommen!', 'Kontoen din er opprettet.', [
      { text: 'Logg inn', onPress: () => router.replace('/(auth)/login') },
    ]);
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.container}>
          <View style={s.header}>
            <Text style={s.title}>Opprett konto</Text>
            <Text style={s.subtitle}>Kom i gang med Bolig Dialog</Text>
          </View>

          <View style={s.form}>
            <View>
              <Text style={s.label}>Fullt navn</Text>
              <Controller control={control} name="full_name" render={({ field: { onChange, onBlur, value } }) => (
                <TextInput style={s.input} placeholder="Ola Nordmann" placeholderTextColor="#9CA3AF"
                  autoComplete="name" onBlur={onBlur} onChangeText={onChange} value={value} />
              )} />
              {errors.full_name && <Text style={s.error}>{errors.full_name.message}</Text>}
            </View>

            <View>
              <Text style={s.label}>E-post</Text>
              <Controller control={control} name="email" render={({ field: { onChange, onBlur, value } }) => (
                <TextInput style={s.input} placeholder="din@epost.no" placeholderTextColor="#9CA3AF"
                  keyboardType="email-address" autoCapitalize="none" autoComplete="email"
                  onBlur={onBlur} onChangeText={onChange} value={value} />
              )} />
              {errors.email && <Text style={s.error}>{errors.email.message}</Text>}
            </View>

            <View>
              <Text style={s.label}>Passord</Text>
              <Controller control={control} name="password" render={({ field: { onChange, onBlur, value } }) => (
                <TextInput style={s.input} placeholder="Minst 6 tegn" placeholderTextColor="#9CA3AF"
                  secureTextEntry onBlur={onBlur} onChangeText={onChange} value={value} />
              )} />
              {errors.password && <Text style={s.error}>{errors.password.message}</Text>}
            </View>

            <View>
              <Text style={s.label}>Jeg er</Text>
              <Controller control={control} name="role" render={({ field: { onChange, value } }) => (
                <View style={s.roleRow}>
                  {ROLES.map(r => (
                    <TouchableOpacity key={r.value} style={[s.roleCard, value === r.value && s.roleCardActive]} onPress={() => onChange(r.value)}>
                      <Text style={[s.roleLabel, value === r.value && s.roleLabelActive]}>{r.label}</Text>
                      <Text style={s.roleDesc}>{r.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )} />
            </View>
          </View>

          <TouchableOpacity style={s.btn} onPress={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Registrer meg</Text>}
          </TouchableOpacity>

          <View style={s.row}>
            <Text style={s.muted}>Har du allerede konto? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity><Text style={s.link}>Logg inn</Text></TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const BLUE = '#1A56A0';
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 32 },
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', color: BLUE, marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6B7280' },
  form: { gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#1A1A2E', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1A1A2E', backgroundColor: '#F5F7FA' },
  error: { color: '#EF4444', fontSize: 13, marginTop: 4 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleCard: { flex: 1, borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 12, padding: 16, backgroundColor: '#F5F7FA' },
  roleCardActive: { borderColor: BLUE, backgroundColor: '#D5E8F0' },
  roleLabel: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  roleLabelActive: { color: BLUE },
  roleDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  btn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  muted: { color: '#6B7280' },
  link: { color: BLUE, fontWeight: '500' },
});
