import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { IssueRow } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';

const BLUE = '#1A56A0';

const STATUS_MAP = {
  open: { label: 'Åpen', color: '#EF4444', bg: '#FEF2F2' },
  in_progress: { label: 'Under behandling', color: '#F59E0B', bg: '#FFFBEB' },
  resolved: { label: 'Løst', color: '#10B981', bg: '#F0FDF4' },
};

const CATEGORIES: Record<string, string> = {
  plumbing: 'Rør/vann', electrical: 'Elektro', windows_doors: 'Vindu/dør', other: 'Annet',
};

type IssueWithUnit = IssueRow & { unit_number?: string; address?: string };

export default function LandlordIssuesScreen() {
  const { user } = useAuthStore();
  const [issues, setIssues] = useState<IssueWithUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | IssueRow['status']>('all');

  const fetchIssues = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('issues')
      .select(`*, units!inner(unit_number, properties!inner(address, landlord_id))`)
      .eq('units.properties.landlord_id', user.id)
      .order('created_at', { ascending: false }) as any;

    if (!error && data) {
      setIssues(data.map((i: any) => ({
        ...i,
        unit_number: i.units?.unit_number,
        address: i.units?.properties?.address,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const updateStatus = async (issue: IssueWithUnit, status: IssueRow['status']) => {
    const { error } = await supabase.from('issues').update({ status }).eq('id', issue.id);
    if (error) { Alert.alert('Feil', error.message); return; }
    setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status } : i));
  };

  const showStatusPicker = (issue: IssueWithUnit) => {
    Alert.alert('Oppdater status', issue.title, [
      { text: 'Åpen', onPress: () => updateStatus(issue, 'open') },
      { text: 'Under behandling', onPress: () => updateStatus(issue, 'in_progress') },
      { text: 'Løst', onPress: () => updateStatus(issue, 'resolved') },
      { text: 'Avbryt', style: 'cancel' },
    ]);
  };

  const filtered = filter === 'all' ? issues : issues.filter(i => i.status === filter);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.filterRow}>
        {(['all', 'open', 'in_progress', 'resolved'] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === 'all' ? 'Alle' : STATUS_MAP[f].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator style={{ flex: 1 }} color={BLUE} /> : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#D1D5DB" />
          <Text style={s.emptyTitle}>Ingen feilmeldinger</Text>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id} contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const st = STATUS_MAP[item.status];
            return (
              <TouchableOpacity style={s.card} onPress={() => showStatusPicker(item)} activeOpacity={0.8}>
                <View style={s.cardTop}>
                  <View style={s.cardMeta}>
                    <Text style={s.cardAddress} numberOfLines={1}>{item.address} · Enhet {item.unit_number}</Text>
                    <Text style={s.cardDate}>{new Date(item.created_at).toLocaleDateString('nb-NO')}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: st.bg }]}>
                    <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
                <View style={s.cardFooter}>
                  <Text style={s.catLabel}>{CATEGORIES[item.category]}</Text>
                  <Text style={s.tapHint}>Trykk for å endre status</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterBtn: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#E5E7EB' },
  filterBtnActive: { backgroundColor: BLUE },
  filterText: { color: '#6B7280', fontSize: 13, fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { padding: 20, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardMeta: { flex: 1 },
  cardAddress: { fontSize: 12, color: '#6B7280' },
  cardDate: { fontSize: 12, color: '#9CA3AF' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  cardDesc: { color: '#6B7280', fontSize: 13 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  catLabel: { fontSize: 12, color: '#9CA3AF' },
  tapHint: { fontSize: 12, color: '#9CA3AF' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
});
