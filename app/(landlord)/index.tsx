import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { AlertIcon, WrenchIcon, BuildingIcon, ChatIcon } from '@/components/Icon';

const BLUE = '#1A56A0';

type Stats = { open: number; in_progress: number; active_units: number; unread: number };

function StatCard({ label, value, bgColor, icon }: { label: string; value: string | number; bgColor: string; icon: React.ReactNode }) {
  return (
    <View style={[s.statCard, { backgroundColor: bgColor }]}>
      {icon}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function LandlordDashboardScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ open: 0, in_progress: 0, active_units: 0, unread: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const [issuesRes, unitsRes] = await Promise.all([
        supabase.from('issues')
          .select(`status, units!inner(properties!inner(landlord_id))`)
          .eq('units.properties.landlord_id', user.id) as any,
        supabase.from('units')
          .select(`id, tenant_id, properties!inner(landlord_id)`)
          .eq('properties.landlord_id', user.id)
          .not('tenant_id', 'is', null) as any,
      ]);

      const issues = issuesRes.data ?? [];
      setStats({
        open: issues.filter((i: any) => i.status === 'open').length,
        in_progress: issues.filter((i: any) => i.status === 'in_progress').length,
        active_units: unitsRes.data?.length ?? 0,
        unread: 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, [user]);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.greeting}>
          <Text style={s.greetSub}>Hei,</Text>
          <Text style={s.greetName}>{user?.full_name ?? 'Utleier'}</Text>
        </View>

        {loading ? <ActivityIndicator color={BLUE} style={{ marginBottom: 16 }} /> : (
          <View style={s.statsRow}>
            <StatCard label="Åpne feil" value={stats.open} bgColor="#FEF2F2" icon={<AlertIcon color="#EF4444" size={20} />} />
            <StatCard label="Behandles" value={stats.in_progress} bgColor="#FFFBEB" icon={<WrenchIcon color="#F59E0B" size={20} />} />
            <StatCard label="Leietakere" value={stats.active_units} bgColor="#F0FDF4" icon={<BuildingIcon color="#10B981" size={20} />} />
          </View>
        )}

        <TouchableOpacity style={s.card} onPress={() => router.push('/(landlord)/messages')}>
          <ChatIcon color={BLUE} size={22} />
          <View style={s.cardText}>
            <Text style={s.cardTitle}>Meldinger</Text>
            <Text style={s.cardSub}>Chat med leietakerne dine</Text>
          </View>
          <Text style={s.cardArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.card} onPress={() => router.push('/(landlord)/issues')}>
          <WrenchIcon color={BLUE} size={22} />
          <View style={s.cardText}>
            <Text style={s.cardTitle}>Feilmeldinger</Text>
            <Text style={s.cardSub}>{stats.open > 0 ? `${stats.open} åpen${stats.open > 1 ? 'e' : ''} feil` : 'Ingen åpne feil'}</Text>
          </View>
          <Text style={s.cardArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.card} onPress={() => router.push('/(landlord)/properties')}>
          <BuildingIcon color={BLUE} size={22} />
          <View style={s.cardText}>
            <Text style={s.cardTitle}>Eiendommer</Text>
            <Text style={s.cardSub}>Se og administrer eiendommene dine</Text>
          </View>
          <Text style={s.cardArrow}>›</Text>
        </TouchableOpacity>
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
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 16, padding: 16, gap: 6 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1A1A2E' },
  statLabel: { fontSize: 11, color: '#6B7280' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardText: { flex: 1 },
  cardTitle: { fontWeight: '600', color: '#1A1A2E' },
  cardSub: { color: '#6B7280', fontSize: 13 },
  cardArrow: { fontSize: 22, color: '#9CA3AF' },
});
