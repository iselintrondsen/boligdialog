import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { IssueRow } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';

const BLUE = '#1A56A0';

const CATEGORIES = [
  { value: 'plumbing', label: 'Rør/vann' },
  { value: 'electrical', label: 'Elektro' },
  { value: 'windows_doors', label: 'Vindu/dør' },
  { value: 'other', label: 'Annet' },
] as const;

const STATUS_MAP = {
  open: { label: 'Åpen', color: '#EF4444', bg: '#FEF2F2' },
  in_progress: { label: 'Under behandling', color: '#F59E0B', bg: '#FFFBEB' },
  resolved: { label: 'Løst', color: '#10B981', bg: '#F0FDF4' },
};

export default function TenantIssuesScreen() {
  const { user } = useAuthStore();
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: 'other' as IssueRow['category'] });

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: unitData } = await supabase
      .from('units').select('id').eq('tenant_id', user.id).maybeSingle();
    if (unitData) setUnitId(unitData.id);

    const { data } = await supabase
      .from('issues').select('*').eq('tenant_id', user.id).order('created_at', { ascending: false });
    if (data) setIssues(data as IssueRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      Alert.alert('Feil', 'Tittel og beskrivelse er påkrevd.'); return;
    }
    if (!unitId) {
      Alert.alert('Feil', 'Du må være koblet til en enhet for å rapportere feil.'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('issues').insert({
      unit_id: unitId, tenant_id: user!.id,
      title: form.title.trim(), description: form.description.trim(), category: form.category, status: 'open' as const,
    });
    setSaving(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    setShowModal(false);
    setForm({ title: '', description: '', category: 'other' });
    fetchData();
  };

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
          <Text style={s.addBtnText}>+ Rapporter feil</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ flex: 1 }} color={BLUE} /> : issues.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="construct-outline" size={48} color="#D1D5DB" />
          <Text style={s.emptyTitle}>Ingen feilmeldinger</Text>
          <Text style={s.emptySub}>Rapporter en feil ved å trykke på knappen over.</Text>
        </View>
      ) : (
        <FlatList data={issues} keyExtractor={(i) => i.id} contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const st = STATUS_MAP[item.status];
            const cat = CATEGORIES.find(c => c.value === item.category);
            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={[s.badge, { backgroundColor: st.bg }]}>
                    <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
                <View style={s.cardBottom}>
                  <Text style={s.cardMeta}>{cat?.label}</Text>
                  <Text style={s.cardMeta}>{new Date(item.created_at).toLocaleDateString('nb-NO')}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)}><Text style={s.cancel}>Avbryt</Text></TouchableOpacity>
              <Text style={s.modalTitle}>Rapporter feil</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={BLUE} /> : <Text style={s.save}>Send</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              <View style={s.field}>
                <Text style={s.label}>Tittel</Text>
                <TextInput style={s.input} placeholder="Kort beskrivelse av feilen" placeholderTextColor="#9CA3AF"
                  value={form.title} onChangeText={v => setForm(p => ({ ...p, title: v }))} />
              </View>
              <View style={s.field}>
                <Text style={s.label}>Kategori</Text>
                <View style={s.catRow}>
                  {CATEGORIES.map(c => (
                    <TouchableOpacity key={c.value} style={[s.catBtn, form.category === c.value && s.catBtnActive]}
                      onPress={() => setForm(p => ({ ...p, category: c.value }))}>
                      <Text style={[s.catText, form.category === c.value && s.catTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={s.field}>
                <Text style={s.label}>Beskrivelse</Text>
                <TextInput style={[s.input, { height: 120, textAlignVertical: 'top' }]}
                  placeholder="Beskriv feilen i detalj" placeholderTextColor="#9CA3AF" multiline
                  value={form.description} onChangeText={v => setForm(p => ({ ...p, description: v }))} />
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 0, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  addBtn: { backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  list: { padding: 20, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  cardDesc: { color: '#6B7280', fontSize: 13 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  cardMeta: { color: '#9CA3AF', fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  emptySub: { color: '#6B7280', textAlign: 'center', fontSize: 14 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  cancel: { color: '#6B7280', fontSize: 16 },
  save: { color: BLUE, fontSize: 16, fontWeight: '600' },
  modalBody: { padding: 20, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: '#1A1A2E', backgroundColor: '#F5F7FA' },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F7FA' },
  catBtnActive: { borderColor: BLUE, backgroundColor: '#EBF4FF' },
  catText: { color: '#6B7280', fontSize: 14 },
  catTextActive: { color: BLUE, fontWeight: '600' },
});
