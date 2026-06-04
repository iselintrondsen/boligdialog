import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Ionicons } from '@expo/vector-icons';

const BLUE = '#1A56A0';

type InviteData = {
  id: string;
  unit_id: string;
  email: string;
  status: string;
  units: {
    unit_number: string;
    monthly_rent: number | null;
    properties: {
      address: string;
      city: string;
      postal_code: string;
    };
  };
};

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvite = async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select(`
          id, unit_id, email, status, expires_at,
          units (
            unit_number, monthly_rent,
            properties ( address, city, postal_code )
          )
        `)
        .eq('token', token)
        .maybeSingle() as any;

      if (error || !data) {
        setError('Ugyldig eller utløpt invitasjonslenke.');
      } else if (data.status === 'accepted') {
        setError('Denne invitasjonen er allerede brukt.');
      } else if (new Date(data.expires_at) < new Date()) {
        setError('Invitasjonslenken har utløpt. Be utleier sende en ny.');
      } else {
        setInvite(data as unknown as InviteData);
      }
      setLoading(false);
    };
    if (token) fetchInvite();
  }, [token]);

  const handleAccept = async () => {
    if (!user || !invite) return;

    if (user.email !== invite.email) {
      Alert.alert(
        'Feil bruker',
        `Denne invitasjonen er til ${invite.email}, men du er logget inn som ${user.email}.`
      );
      return;
    }

    setAccepting(true);
    const { error: invErr } = await supabase
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    if (invErr) { Alert.alert('Feil', invErr.message); setAccepting(false); return; }

    const { error: unitErr } = await supabase
      .from('units')
      .update({ tenant_id: user.id, lease_start: new Date().toISOString().split('T')[0] })
      .eq('id', invite.unit_id);

    if (unitErr) { Alert.alert('Feil', unitErr.message); setAccepting(false); return; }

    // Create lease record
    const { error: leaseErr } = await supabase
      .from('leases')
      .insert({ unit_id: invite.unit_id, tenant_id: user.id, started_at: new Date().toISOString().split('T')[0], ended_at: null });

    setAccepting(false);
    if (leaseErr) { Alert.alert('Feil', leaseErr.message); return; }

    Alert.alert('Velkommen!', 'Du er nå koblet til enheten.', [
      { text: 'Gå til hjem', onPress: () => router.replace('/(tenant)/') },
    ]);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={BLUE} />;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {error ? (
          <View style={s.errorBox}>
            <Ionicons name="close-circle-outline" size={56} color="#EF4444" />
            <Text style={s.errorTitle}>Ugyldig invitasjon</Text>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/(tenant)/')}>
              <Text style={s.btnText}>Gå til hjem</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.inviteBox}>
            <View style={s.iconCircle}>
              <Ionicons name="home" size={40} color={BLUE} />
            </View>
            <Text style={s.title}>Du er invitert!</Text>
            <Text style={s.subtitle}>Godta invitasjonen for å koble deg til:</Text>
            <View style={s.detailCard}>
              <Text style={s.detailAddress}>{invite?.units.properties.address}</Text>
              <Text style={s.detailCity}>{invite?.units.properties.postal_code} {invite?.units.properties.city}</Text>
              <Text style={s.detailUnit}>Enhet {invite?.units.unit_number}</Text>
              {invite?.units.monthly_rent && (
                <Text style={s.detailRent}>{invite.units.monthly_rent.toLocaleString('nb-NO')} kr/mnd</Text>
              )}
            </View>
            {!user ? (
              <View style={s.authPrompt}>
                <Text style={s.authText}>Du må være logget inn for å godta invitasjonen.</Text>
                <TouchableOpacity style={s.btn} onPress={() => router.push('/(auth)/login')}>
                  <Text style={s.btnText}>Logg inn</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.btn} onPress={handleAccept} disabled={accepting}>
                {accepting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Godta invitasjon</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  errorBox: { alignItems: 'center', gap: 16 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A2E' },
  errorText: { color: '#6B7280', textAlign: 'center', fontSize: 15 },
  inviteBox: { alignItems: 'center', gap: 16 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#EBF4FF', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { color: '#6B7280', fontSize: 15 },
  detailCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', gap: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  detailAddress: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  detailCity: { color: '#6B7280', fontSize: 14 },
  detailUnit: { color: '#1A1A2E', fontWeight: '500', fontSize: 15, marginTop: 8 },
  detailRent: { color: BLUE, fontWeight: '700', fontSize: 18 },
  authPrompt: { alignItems: 'center', gap: 12, width: '100%' },
  authText: { color: '#6B7280', textAlign: 'center', fontSize: 14 },
  btn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center', width: '100%' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
