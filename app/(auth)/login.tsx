import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert, StyleSheet, Image,
} from 'react-native';
import { Link } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const schema = z.object({
  email: z.string().email('Ugyldig e-postadresse'),
  password: z.string().min(6, 'Passord må være minst 6 tegn'),
});
type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) Alert.alert('Innlogging feilet', error.message);
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.container}>
          <View style={s.header}>
            <Image source={require('../../assets/boligdialog-transperant-logo.png')} style={s.logoImg} resizeMode="contain" />
            <Text style={s.subtitle}>Logg inn på din konto</Text>
          </View>

          <View style={s.form}>
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
                <TextInput style={s.input} placeholder="••••••••" placeholderTextColor="#9CA3AF"
                  secureTextEntry autoComplete="password"
                  onBlur={onBlur} onChangeText={onChange} value={value} />
              )} />
              {errors.password && <Text style={s.error}>{errors.password.message}</Text>}
            </View>

            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity style={s.forgotWrap}>
                <Text style={s.link}>Glemt passord?</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <TouchableOpacity style={s.btn} onPress={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Logg inn</Text>}
          </TouchableOpacity>

          <View style={s.row}>
            <Text style={s.muted}>Har du ikke konto? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity><Text style={s.link}>Registrer deg</Text></TouchableOpacity>
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
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },
  header: { alignItems: 'center', marginBottom: 48 },
  logoImg: { width: '100%', height: 220, marginBottom: 0 },
  subtitle: { fontSize: 16, color: '#6B7280', marginTop: 4 },
  form: { gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#1A1A2E', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1A1A2E', backgroundColor: '#F5F7FA' },
  error: { color: '#EF4444', fontSize: 13, marginTop: 4 },
  forgotWrap: { alignSelf: 'flex-end' },
  link: { color: BLUE, fontWeight: '500' },
  btn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  muted: { color: '#6B7280' },
});
