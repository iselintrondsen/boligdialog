import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
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
  const [lease, setLease]               = useState<LeaseInfo | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading]           = useState(true);

  const handleEnterCode = () => {
    Alert.prompt(
      'Skriv inn invitasjonskode',
      'Du finner koden hos utleier (6 siffer):',
      (code: string) => {
        if (!code?.trim()) return;
        router.push(`/invite/${code.trim()}` as any);
      },
      'plain-text'
    );
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const fetchData = async () => {
        if (!user) return;
        const { data } = await supabase
          .from('units')
          .select(`
            unit_number, monthly_rent,
            properties ( id, address, city, postal_code, users ( full_name ) )
          `)
          .eq('tenant_id', user.id)
          .maybeSingle() as any;

        if (!active) return;

        if (data) {
          const prop = data.properties;
          setLease({
            address: prop.address,
            city: prop.city,
            postal_code: prop.postal_code,
            unit_number: data.unit_number,
            monthly_rent: data.monthly_rent,
            landlord_name: prop.users?.full_name ?? 'Utleier',
            property_id: prop.id,
          });

          const { data: anns } = await supabase
            .from('announcements')
            .select('id, content, created_at')
            .eq('property_id', prop.id)
            .order('created_at', { ascending: false })
            .limit(5);
          if (active && anns) setAnnouncements(anns as Announcement[]);
        } else {
          setLease(null);
        }
        if (active) setLoading(false);
      };
      fetchData();
      return () => { active = false; };
    }, [user])
  );

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Hilsen */}
        <View style={s.greeting}>
          <Text style={s.greetSub}>Hei,</Text>
          <Text style={s.greetName}>{user?.full_name ?? 'Leietaker'}</Text>
        </View>

        {/* Varsler fra utleier */}
        {announcements.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>VARSLER FRA UTLEIER</Text>
            {announcements.map(ann => (
              <View key={ann.id} style={s.announcementCard}>
                <View style={s.announcementHeader}>
                  <Ionicons name="megaphone" size={16} color="#92400E" />
                  <Text style={s.announcementDate}>
                    {new Date(ann.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}
                  </Text>
                </View>
                <Text style={s.announcementText}>{ann.content}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Leieforhold */}
        <View style={s.card}>
          <Text style={s.cardLabel}>DITT LEIEFORHOLD</Text>
          {loading ? (
            <ActivityIndicator color={BLUE} />
          ) : lease ? (
            <View style={s.leaseBox}>
              <Text style={s.leaseAddress}>{lease.address}, {lease.unit_number}</Text>
              <Text style={s.leaseCity}>{lease.postal_code} {lease.city}</Text>
              {lease.monthly_rent != null && (
                <Text style={s.leaseRent}>{lease.monthly_rent.toLocaleString('nb-NO')} kr/mnd</Text>
              )}
              <View style={s.landlordRow}>
                <Ionicons name="person-outline" size={14} color="#6B7280" />
                <Text style={s.landlordName}>{lease.landlord_name}</Text>
              </View>
            </View>
          ) : (
            <View style={s.noLeaseBox}>
              <Ionicons name="home-outline" size={32} color="#9CA3AF" />
              <Text style={s.noLeaseText}>Ingen aktiv leiekontrakt</Text>
              <Text style={s.noLeaseSub}>Skriv inn koden du har fått fra utleier.</Text>
              <TouchableOpacity style={s.connectBtn} onPress={handleEnterCode}>
                <Ionicons name="keypad-outline" size={18} color="#fff" />
                <Text style={s.connectBtnText}>Skriv inn kode</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Snarveier */}
        <Text style={s.sectionLabel}>SNARVEIER</Text>
        <View style={s.quickGrid}>
          <TouchableOpacity style={s.quickCard} onPress={() => router.push('/(tenant)/inspections')} activeOpacity={0.8}>
            <View style={[s.quickIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="clipboard-outline" size={24} color="#F59E0B" />
            </View>
            <Text style={s.quickLabel}>Rapporter</Text>
            <Text style={s.quickSub}>Inn- og utflytting</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.quickCard} onPress={() => router.push('/(tenant)/documents')} activeOpacity={0.8}>
            <View style={[s.quickIcon, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="document-text-outline" size={24} color="#7C3AED" />
            </View>
            <Text style={s.quickLabel}>Dokumenter</Text>
            <Text style={s.quickSub}>Kontrakt og kvitteringer</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: '#F5F7FA' },
  scroll:             { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  greeting:           { marginBottom: 20 },
  greetSub:           { fontSize: 14, color: '#6B7280' },
  greetName:          { fontSize: 26, fontWeight: '700', color: '#1A1A2E' },
  section:            { marginBottom: 16 },
  sectionLabel:       { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' },
  announcementCard:   { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 14, padding: 14, marginBottom: 8, gap: 6 },
  announcementHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  announcementDate:   { fontSize: 12, color: '#B45309', fontWeight: '500' },
  announcementText:   { fontSize: 15, color: '#78350F', lineHeight: 22 },
  card:               { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardLabel:          { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6, marginBottom: 12, textTransform: 'uppercase' },
  leaseBox:           { gap: 4 },
  leaseAddress:       { color: '#1A1A2E', fontWeight: '600', fontSize: 16 },
  leaseCity:          { color: '#6B7280', fontSize: 14 },
  leaseRent:          { color: BLUE, fontWeight: '700', fontSize: 20, marginTop: 6 },
  landlordRow:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  landlordName:       { color: '#6B7280', fontSize: 13 },
  noLeaseBox:         { alignItems: 'center', paddingVertical: 20, gap: 8 },
  noLeaseText:        { color: '#6B7280', fontWeight: '500', fontSize: 15 },
  noLeaseSub:         { color: '#9CA3AF', fontSize: 13, textAlign: 'center' },
  connectBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BLUE, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 4 },
  connectBtnText:     { color: '#fff', fontWeight: '600', fontSize: 15 },
  quickGrid:          { flexDirection: 'row', gap: 12, marginBottom: 4 },
  quickCard:          { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, gap: 6 },
  quickIcon:          { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  quickLabel:         { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  quickSub:           { fontSize: 12, color: '#6B7280' },
});
