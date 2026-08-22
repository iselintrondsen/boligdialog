import { useState, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Alert, ActivityIndicator, ScrollView, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ExpenseRow, ExpenseCategory } from '@/lib/types';

const BLUE = '#1A56A0';

const CATEGORIES: { key: ExpenseCategory; label: string; icon: string; color: string }[] = [
  { key: 'maintenance', label: 'Vedlikehold',    icon: 'construct-outline',            color: '#3B82F6' },
  { key: 'repair',      label: 'Reparasjon',      icon: 'hammer-outline',               color: '#F59E0B' },
  { key: 'utilities',   label: 'Strøm/vann',      icon: 'flash-outline',                color: '#10B981' },
  { key: 'insurance',   label: 'Forsikring',       icon: 'shield-outline',               color: '#8B5CF6' },
  { key: 'tax',         label: 'Avgifter/skatt',   icon: 'receipt-outline',              color: '#EF4444' },
  { key: 'other',       label: 'Annet',            icon: 'ellipsis-horizontal-outline',  color: '#6B7280' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  unitId: string;
  unitNumber: string;
}

export function ExpensesModal({ visible, onClose, unitId, unitNumber }: Props) {
  const { user } = useAuthStore();
  const [expenses, setExpenses]         = useState<ExpenseRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    category: 'maintenance' as ExpenseCategory,
    description: '',
    date: new Date(),
  });

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('expenses').select('*')
      .eq('unit_id', unitId)
      .order('date', { ascending: false });
    setExpenses((data as ExpenseRow[]) ?? []);
    setLoading(false);
  }, [unitId]);

  const resetForm = () => {
    setForm({ amount: '', category: 'maintenance', description: '', date: new Date() });
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.amount || isNaN(parseFloat(form.amount))) {
      Alert.alert('Feil', 'Skriv inn et gyldig beløp.'); return;
    }
    if (!form.description.trim()) {
      Alert.alert('Feil', 'Beskrivelse er påkrevd.'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      unit_id: unitId,
      landlord_id: user!.id,
      amount: parseFloat(form.amount),
      category: form.category,
      description: form.description.trim(),
      date: form.date.toISOString().split('T')[0],
    });
    setSaving(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    resetForm();
    fetchExpenses();
  };

  const handleDelete = (expense: ExpenseRow) => {
    Alert.alert('Slett utgift', `Vil du slette "${expense.description}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett', style: 'destructive', onPress: async () => {
        await supabase.from('expenses').delete().eq('id', expense.id);
        setExpenses(prev => prev.filter(e => e.id !== expense.id));
      }},
    ]);
  };

  const selectedCat = CATEGORIES.find(c => c.key === form.category)!;
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onShow={fetchExpenses}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={s.safe}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}><Text style={s.cancel}>Lukk</Text></TouchableOpacity>
            <Text style={s.title}>Utgifter – {unitNumber}</Text>
            <TouchableOpacity onPress={() => setShowForm(v => !v)}>
              <Text style={s.addBtn}>{showForm ? 'Avbryt' : '+ Legg til'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* Add form */}
            {showForm && (
              <View style={s.formCard}>
                <Text style={s.formTitle}>Ny utgift</Text>

                {/* Category */}
                <Text style={s.label}>Kategori</Text>
                <TouchableOpacity style={s.catSelect} onPress={() => setShowCatPicker(true)}>
                  <View style={[s.catDot, { backgroundColor: selectedCat.color + '22' }]}>
                    <Ionicons name={selectedCat.icon as any} size={16} color={selectedCat.color} />
                  </View>
                  <Text style={s.catSelectText}>{selectedCat.label}</Text>
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </TouchableOpacity>

                {/* Amount */}
                <Text style={s.label}>Beløp (kr)</Text>
                <TextInput
                  style={s.input}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  value={form.amount}
                  onChangeText={v => setForm(p => ({ ...p, amount: v }))}
                />

                {/* Description */}
                <Text style={s.label}>Beskrivelse</Text>
                <TextInput
                  style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Hva gjelder utgiften?"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  value={form.description}
                  onChangeText={v => setForm(p => ({ ...p, description: v }))}
                />

                {/* Date */}
                <Text style={s.label}>Dato</Text>
                <TouchableOpacity style={s.input} onPress={() => setShowDatePicker(true)}>
                  <Text style={{ color: '#1A1A2E', fontSize: 16 }}>
                    {form.date.toLocaleDateString('nb-NO')}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={form.date}
                    mode="date"
                    display="inline"
                    onChange={(_, d) => { setShowDatePicker(false); if (d) setForm(p => ({ ...p, date: d })); }}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                )}

                <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Lagre utgift</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Summary */}
            {expenses.length > 0 && (
              <View style={s.summaryCard}>
                <Text style={s.summaryLabel}>Totalt registrert</Text>
                <Text style={s.summaryAmount}>{total.toLocaleString('nb-NO')} kr</Text>
              </View>
            )}

            {/* List */}
            {loading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
            ) : expenses.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="wallet-outline" size={48} color="#D1D5DB" />
                <Text style={s.emptyText}>Ingen utgifter registrert ennå.</Text>
              </View>
            ) : (
              expenses.map(exp => {
                const cat = CATEGORIES.find(c => c.key === exp.category) ?? CATEGORIES[5];
                return (
                  <TouchableOpacity key={exp.id} style={s.expRow} onLongPress={() => handleDelete(exp)}>
                    <View style={[s.expIcon, { backgroundColor: cat.color + '18' }]}>
                      <Ionicons name={cat.icon as any} size={20} color={cat.color} />
                    </View>
                    <View style={s.expInfo}>
                      <Text style={s.expDesc} numberOfLines={1}>{exp.description}</Text>
                      <Text style={s.expMeta}>{cat.label} · {new Date(exp.date).toLocaleDateString('nb-NO')}</Text>
                    </View>
                    <Text style={s.expAmount}>{exp.amount.toLocaleString('nb-NO')} kr</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Category picker overlay */}
          {showCatPicker && (
            <TouchableWithoutFeedback onPress={() => setShowCatPicker(false)}>
              <View style={s.catBackdrop}>
                <TouchableWithoutFeedback>
                  <View style={s.catSheet}>
                    <View style={s.handle} />
                    <Text style={s.sheetTitle}>Velg kategori</Text>
                    {CATEGORIES.map(cat => (
                      <TouchableOpacity key={cat.key} style={s.catRow}
                        onPress={() => { setForm(p => ({ ...p, category: cat.key })); setShowCatPicker(false); }}>
                        <View style={[s.catDot, { backgroundColor: cat.color + '22' }]}>
                          <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                        </View>
                        <Text style={s.catLabel}>{cat.label}</Text>
                        {form.category === cat.key && <Ionicons name="checkmark" size={18} color={BLUE} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#F5F7FA' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:        { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  cancel:       { color: '#6B7280', fontSize: 16 },
  addBtn:       { color: BLUE, fontSize: 16, fontWeight: '600' },
  body:         { padding: 16, gap: 12, paddingBottom: 40 },
  formCard:     { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  formTitle:    { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  label:        { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  input:        { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1A1A2E', backgroundColor: '#F9FAFB' },
  catSelect:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F9FAFB' },
  catSelectText:{ flex: 1, fontSize: 16, color: '#1A1A2E' },
  saveBtn:      { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText:  { color: '#fff', fontWeight: '600', fontSize: 16 },
  summaryCard:  { backgroundColor: '#EBF4FF', borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: BLUE },
  summaryAmount:{ fontSize: 18, fontWeight: '700', color: BLUE },
  empty:        { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText:    { color: '#6B7280', fontSize: 14, textAlign: 'center' },
  expRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  expIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expInfo:      { flex: 1 },
  expDesc:      { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  expMeta:      { fontSize: 12, color: '#6B7280', marginTop: 2 },
  expAmount:    { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  catBackdrop:  { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  catSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, gap: 8 },
  handle:       { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitle:   { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  catRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB' },
  catDot:       { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catLabel:     { flex: 1, fontSize: 15, color: '#1A1A2E' },
});
