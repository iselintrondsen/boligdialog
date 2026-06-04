import { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

function SplashScreen() {
  return (
    <View style={s.splash}>
      <Image
        source={require('@/assets/transperant-icon2-cropped.png')}
        style={s.splashLogo}
        resizeMode="contain"
      />
    </View>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  splashLogo: { width: 160, height: 160 },
});

export default function RootLayout() {
  const { session, user, loading, setSession, fetchUser } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchUser(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchUser(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTenantGroup = segments[0] === '(tenant)';
    const inLandlordGroup = segments[0] === '(landlord)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (session && user) {
      if (user.role === 'tenant' && !inTenantGroup) {
        router.replace('/(tenant)/');
      } else if (user.role === 'landlord' && !inLandlordGroup) {
        router.replace('/(landlord)/');
      }
    }
  }, [session, user, loading, segments]);

  if (loading) return <SplashScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tenant)" />
      <Stack.Screen name="(landlord)" />
    </Stack>
  );
}
