import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { BuildingIcon } from '@/components/Icon';
import { PropertyRow } from '@/lib/types';

const BLUE = '#1A56A0';

export default function LandlordPropertiesScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ address: '', city: '', postal_code: '', description: '' });

  const fetchProperties = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: false });
if (!error && data) setProperties(data as PropertyRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const handleSave = async () => {
    if (!form.address.trim() || !form.city.trim() || !form.postal_code.trim()) {
      Alert.alert('Feil', 'Adresse, by og postnummer er påkrevd.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('properties').insert({
      landlord_id: user!.id,
      address: form.address.trim(),
      city: form.city.trim(),
      postal_code: form.postal_code.trim(),
      description: form.description.trim() || null,
    });
    setSaving(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    setShowModal(false);
    setForm({ address: '', city: '', postal_code: '', description: '' });
    fetchProperties();
  };

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Eiendommer</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
          <Text style={s.addBtnText}>+ Legg til</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={BLUE} />
      ) : properties.length === 0 ? (
        <View style={s.empty}>
          <BuildingIcon color="#D1D5DB" size={48} />
          <Text style={s.emptyTitle}>Ingen eiendommer ennå</Text>
          <Text style={s.emptySub}>Legg til din første eiendom for å komme i gang.</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/(landlord)/property/${item.id}`)}>
              <View style={s.cardIcon}>
                <BuildingIcon color={BLUE} size={22} />
              </View>
              <View style={s.cardText}>
                <Text style={s.cardAddress}>{item.address}</Text>
                <Text style={s.cardCity}>{item.postal_code} {item.city}</Text>
              </View>
              <Text style={s.arrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={s.cancel}>Avbryt</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>Ny eiendom</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={BLUE} /> : <Text style={s.save}>Lagre</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {[
                { key: 'address', label: 'Gateadresse', placeholder: 'Karl Johans gate 1' },
                { key: 'city', label: 'By', placeholder: 'Oslo' },
                { key: 'postal_code', label: 'Postnummer', placeholder: '0154' },
              ].map((f) => (
                <View key={f.key} style={s.field}>
                  <Text style={s.label}>{f.label}</Text>
                  <TextInput
                    style={s.input}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9CA3AF"
                    value={form[f.key as keyof typeof form]}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                  />
                </View>
              ))}
              <View style={s.field}>
                <Text style={s.label}>Beskrivelse (valgfritt)</Text>
                <TextInput
                  style={[s.input, { height: 100, textAlignVertical: 'top' }]}
                  placeholder="Kort beskrivelse av eiendommen"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  value={form.description}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, description: v }))}
                />
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
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EBF4FF', alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
  cardAddress: { fontWeight: '600', color: '#1A1A2E', fontSize: 16 },
  cardCity: { color: '#6B7280', fontSize: 13, marginTop: 2 },
  arrow: { fontSize: 20, color: '#9CA3AF' },
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
});
