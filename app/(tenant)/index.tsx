import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

const BLUE = '#1A56A0';

type LeaseInfo = {
  address: string;
  city: string;
  postal_code: string;
  unit_number: string;
  monthly_rent: number | null;
  landlord_name: string;
  property_id: string;
};

type Announcement = {
  id: string;
  content: string;
  created_at: string;
};

export default function TenantHomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [lease, setLease] = useState<LeaseInfo | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLease = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('units')
        .select(`
          unit_number,
          monthly_rent,
          properties (
            id,
            address,
            city,
            postal_code,
            users ( full_name )
          )
        `)
        .eq('tenant_id', user.id)
        .maybeSingle() as any;

      if (data) {
        const prop = data.properties;
        const propertyId = prop.id;
        setLease({
          address: prop.address,
          city: prop.city,
          postal_code: prop.postal_code,
          unit_number: data.unit_number,
          monthly_rent: data.monthly_rent,
          landlord_name: prop.users?.full_name ?? 'Utleier',
          property_id: propertyId,
        });

        const { data: ann } = await supabase
          .from('announcements')
          .select('id, content, created_at')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ann) setAnnouncement(ann as Announcement);
      }
      setLoading(false);
    };
    fetchLease();
  }, [user]);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.greeting}>
          <Text style={s.greetSub}>Hei,</Text>
          <Text style={s.greetName}>{user?.full_name ?? 'Leietaker'}</Text>
        </View>

        {announcement && (
          <View style={s.announcementCard}>
            <View style={s.announcementHeader}>
              <Ionicons name="megaphone" size={16} color="#92400E" />
              <Text style={s.announcementLabel}>VARSEL FRA UTLEIER</Text>
              <Text style={s.announcementDate}>
                {new Date(announcement.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <Text style={s.announcementText}>{announcement.content}</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.cardLabel}>DITT LEIEFORHOLD</Text>
          {loading ? (
            <ActivityIndicator color={BLUE} />
          ) : lease ? (
            <View style={s.leaseBox}>
              <Text style={s.leaseAddress}>{lease.address}, Enhet {lease.unit_number}</Text>
              <Text style={s.leaseCity}>{lease.postal_code} {lease.city}</Text>
              {lease.monthly_rent && (
                <Text style={s.leaseRent}>{lease.monthly_rent.toLocaleString('nb-NO')} kr/mnd</Text>
              )}
              <View style={s.landlordRow}>
                <Ionicons name="person-outline" size={14} color="#6B7280" />
                <Text style={s.landlordName}>{lease.landlord_name}</Text>
              </View>
            </View>
          ) : (
            <View style={s.noLeaseBox}>
              <Ionicons name="home-outline" size={28} color="#9CA3AF" />
              <Text style={s.noLeaseText}>Ingen aktiv leiekontrakt</Text>
              <Text style={s.noLeaseSub}>Be utleier om å sende en invitasjon.</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={s.reportBtn} onPress={() => router.push('/(tenant)/issues')} activeOpacity={0.85}>
          <Ionicons name="construct-outline" size={28} color="#fff" />
          <View style={s.reportText}>
            <Text style={s.reportTitle}>Rapporter feil</Text>
            <Text style={s.reportSub}>Beskriv og send til utleier</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickCard} onPress={() => router.push('/(tenant)/messages')}>
            <Ionicons name="chatbubble-outline" size={24} color={BLUE} />
            <Text style={s.quickLabel}>Meldinger</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickCard} onPress={() => router.push('/(tenant)/documents')}>
            <Ionicons name="document-text-outline" size={24} color={BLUE} />
            <Text style={s.quickLabel}>Dokumenter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  greeting: { marginBottom: 24 },
  greetSub: { fontSize: 14, color: '#6B7280' },
  greetName: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', letterSpacing: 0.5, marginBottom: 12 },
  leaseBox: { gap: 4 },
  leaseAddress: { color: '#1A1A2E', fontWeight: '600', fontSize: 16 },
  leaseCity: { color: '#6B7280', fontSize: 14 },
  leaseRent: { color: BLUE, fontWeight: '700', fontSize: 18, marginTop: 6 },
  landlordRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  landlordName: { color: '#6B7280', fontSize: 13 },
  announcementCard: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 16, padding: 16, marginBottom: 16, gap: 8 },
  announcementHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  announcementLabel: { fontSize: 11, fontWeight: '700', color: '#92400E', letterSpacing: 0.5, flex: 1 },
  announcementDate: { fontSize: 11, color: '#B45309' },
  announcementText: { fontSize: 15, color: '#78350F', lineHeight: 22 },
  noLeaseBox: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  noLeaseText: { color: '#6B7280', fontWeight: '500', fontSize: 15 },
  noLeaseSub: { color: '#9CA3AF', fontSize: 13, textAlign: 'center' },
  reportBtn: { backgroundColor: BLUE, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 16 },
  reportText: { flex: 1 },
  reportTitle: { color: '#fff', fontWeight: '700', fontSize: 18 },
  reportSub: { color: '#BFDBFE', fontSize: 13 },
  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, gap: 8 },
  quickLabel: { fontSize: 13, fontWeight: '500', color: '#1A1A2E' },
});
