import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { PropertyRow, UnitRow, ExpenseRow, ExpenseCategory, DocumentRow, DocumentCategory, LeaseRow } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';

// Konverter base64-streng til Uint8Array uten atob (fungerer i React Native)
function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const str = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i += 4) {
    const e1 = chars.indexOf(str[i]);
    const e2 = chars.indexOf(str[i + 1]);
    const e3 = chars.indexOf(str[i + 2]);
    const e4 = chars.indexOf(str[i + 3]);
    bytes.push((e1 << 2) | (e2 >> 4));
    if (e3 !== -1) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 !== -1) bytes.push(((e3 & 3) << 6) | e4);
  }
  return new Uint8Array(bytes);
}

const DOC_CATEGORIES: { key: DocumentCategory; label: string; icon: string; color: string }[] = [
  { key: 'contract',  label: 'Kontrakt',   icon: 'document-text-outline', color: '#1A56A0' },
  { key: 'rules',     label: 'Husregler',  icon: 'list-outline',           color: '#7C3AED' },
  { key: 'receipt',   label: 'Kvittering', icon: 'receipt-outline',        color: '#10B981' },
  { key: 'other',     label: 'Annet',      icon: 'attach-outline',         color: '#6B7280' },
];

function isImage(name: string) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(name); }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function leaseDuration(start: string, end: string | null) {
  const from = new Date(start);
  const to = end ? new Date(end) : new Date();
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (months === 0) return '< 1 mnd';
  if (years === 0) return `${rem} mnd`;
  if (rem === 0) return `${years} år`;
  return `${years} år ${rem} mnd`;
}

const BLUE = '#1A56A0';

type LeaseWithTenant = LeaseRow & { tenant_name: string; tenant_email: string };

type InvitationStatus = 'pending' | 'accepted' | 'expired';
type UnitWithInvite = UnitRow & { invite_status?: InvitationStatus };

const UNIT_FIELDS = [
  { key: 'unit_number', label: 'Enhetsnummer / leil.nr.', placeholder: '1A', keyboard: 'default' },
  { key: 'floor', label: 'Etasje (valgfritt)', placeholder: '2', keyboard: 'numeric' },
  { key: 'size_sqm', label: 'Størrelse m² (valgfritt)', placeholder: '65', keyboard: 'numeric' },
  { key: 'monthly_rent', label: 'Månedlig leie kr (valgfritt)', placeholder: '12500', keyboard: 'numeric' },
] as const;

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const router = useRouter();

  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [units, setUnits] = useState<UnitWithInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitWithInvite | null>(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ unit_number: '', floor: '', size_sqm: '', monthly_rent: '' });

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<UnitWithInvite | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Property settings
  const [showPropertySettingsModal, setShowPropertySettingsModal] = useState(false);
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertyForm, setPropertyForm] = useState({ address: '', city: '', postal_code: '', description: '' });

  // Unit settings
  const [showUnitSettingsModal, setShowUnitSettingsModal] = useState(false);
  const [settingsUnit, setSettingsUnit] = useState<UnitWithInvite | null>(null);

  // Leases
  const [leases, setLeases] = useState<LeaseWithTenant[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyUnit, setHistoryUnit] = useState<UnitWithInvite | null>(null);
  const [endingLease, setEndingLease] = useState(false);

  // Documents
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsUnit, setDocsUnit] = useState<UnitWithInvite | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [pendingDoc, setPendingDoc] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [showDocCatModal, setShowDocCatModal] = useState(false);

  const fetchDocs = async (uid: string) => {
    const { data } = await supabase.from('documents').select('*').eq('unit_id', uid).order('created_at', { ascending: false });
    setDocs((data as DocumentRow[]) ?? []);
  };

  const openDocs = async (unit: UnitWithInvite) => {
    setDocsUnit(unit);
    setShowDocsModal(true);
    setLoadingDocs(true);
    await fetchDocs(unit.id);
    setLoadingDocs(false);
  };

  const uploadWithCategory = async (category: DocumentCategory) => {
    if (!pendingDoc || !docsUnit) return;
    setShowDocCatModal(false);
    setUploadingDoc(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(pendingDoc.uri, { encoding: FileSystem.EncodingType.Base64 });
      const byteArray = base64ToUint8Array(base64);
      const path = `${user!.id}/${docsUnit.id}/${Date.now()}_${pendingDoc.name}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, byteArray, { contentType: pendingDoc.mimeType });
      if (upErr) throw upErr;
      await supabase.from('documents').insert({
        unit_id: docsUnit.id, uploaded_by: user!.id,
        name: pendingDoc.name, category,
        storage_path: path, file_size: byteArray.length,
      });
      await fetchDocs(docsUnit.id);
    } catch (e: any) {
      Alert.alert('Feil', e.message ?? 'Kunne ikke laste opp.');
    } finally {
      setUploadingDoc(false);
      setPendingDoc(null);
    }
  };

  const handlePickDoc = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setPendingDoc({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' });
    setShowDocCatModal(true);
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Tillatelse kreves', 'Gi tilgang til bildebiblioteket i innstillinger.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setPendingDoc({ uri: a.uri, name: a.fileName ?? `bilde_${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' });
    setShowDocCatModal(true);
  };

  const handleDocPress = async (doc: DocumentRow) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60);
    if (error || !data) { Alert.alert('Feil', 'Kunne ikke åpne filen.'); return; }
    if (isImage(doc.name)) {
      setPreviewUrl(data.signedUrl);
      setPreviewVisible(true);
    } else {
      Alert.alert(doc.name, `Størrelse: ${(doc.file_size / 1024).toFixed(1)} KB\nKategori: ${DOC_CATEGORIES.find(c => c.key === doc.category)?.label}`);
    }
  };

  const handleDeleteDoc = (doc: DocumentRow) => {
    Alert.alert('Slett dokument', `Vil du slette "${doc.name}"? Dette kan ikke angres.`, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett', style: 'destructive', onPress: async () => {
        await supabase.storage.from('documents').remove([doc.storage_path]);
        await supabase.from('documents').delete().eq('id', doc.id);
        setDocs(prev => prev.filter(d => d.id !== doc.id));
      }},
    ]);
  };

  const showUploadOptions = () => {
    Alert.alert('Last opp', 'Velg type', [
      { text: 'Bilde fra bibliotek', onPress: handlePickImage },
      { text: 'Fil / dokument', onPress: handlePickDoc },
      { text: 'Avbryt', style: 'cancel' },
    ]);
  };

  // Expenses
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [expenseUnit, setExpenseUnit] = useState<UnitWithInvite | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'maintenance' as ExpenseCategory, description: '', date: new Date() });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string; icon: string; color: string }[] = [
    { key: 'maintenance', label: 'Vedlikehold', icon: 'construct-outline', color: '#3B82F6' },
    { key: 'repair', label: 'Reparasjon', icon: 'hammer-outline', color: '#F59E0B' },
    { key: 'utilities', label: 'Strøm/vann', icon: 'flash-outline', color: '#10B981' },
    { key: 'insurance', label: 'Forsikring', icon: 'shield-outline', color: '#8B5CF6' },
    { key: 'tax', label: 'Avgifter/skatt', icon: 'receipt-outline', color: '#EF4444' },
    { key: 'other', label: 'Annet', icon: 'ellipsis-horizontal-outline', color: '#6B7280' },
  ];

  const openExpenses = async (unit: UnitWithInvite) => {
    setExpenseUnit(unit);
    setShowAddExpenseForm(false);
    setShowExpensesModal(true);
    setLoadingExpenses(true);
    const { data } = await supabase.from('expenses').select('*').eq('unit_id', unit.id).order('date', { ascending: false });
    setExpenses((data as ExpenseRow[]) ?? []);
    setLoadingExpenses(false);
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.amount || isNaN(parseFloat(expenseForm.amount))) { Alert.alert('Feil', 'Skriv inn et gyldig beløp.'); return; }
    if (!expenseForm.description.trim()) { Alert.alert('Feil', 'Beskrivelse er påkrevd.'); return; }
    setSavingExpense(true);
    const { error } = await supabase.from('expenses').insert({
      unit_id: expenseUnit!.id,
      landlord_id: user!.id,
      amount: parseFloat(expenseForm.amount),
      category: expenseForm.category,
      description: expenseForm.description.trim(),
      date: expenseForm.date.toISOString().split('T')[0],
    });
    setSavingExpense(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    setShowAddExpenseForm(false);
    setExpenseForm({ amount: '', category: 'maintenance', description: '', date: new Date() });
    const { data } = await supabase.from('expenses').select('*').eq('unit_id', expenseUnit!.id).order('date', { ascending: false });
    setExpenses((data as ExpenseRow[]) ?? []);
  };

  const handleDeleteExpense = (expense: ExpenseRow) => {
    Alert.alert('Slett utgift', `Vil du slette "${expense.description}"? Dette kan ikke angres.`, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett utgift', style: 'destructive', onPress: async () => {
        await supabase.from('expenses').delete().eq('id', expense.id);
        setExpenses(prev => prev.filter(e => e.id !== expense.id));
      }},
    ]);
  };

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [propRes, unitsRes] = await Promise.all([
      supabase.from('properties').select('*').eq('id', id).single(),
      supabase.from('units').select('*').eq('property_id', id).order('unit_number'),
    ]);
    if (propRes.data) setProperty(propRes.data as PropertyRow);
    if (unitsRes.data) {
      const unitList = unitsRes.data as UnitRow[];
      const unitIds = unitList.map(u => u.id);
      const [invitesRes, leasesRes] = await Promise.all([
        supabase.from('invitations').select('unit_id, status').in('unit_id', unitIds),
        supabase.from('leases').select(`*, users:tenant_id (full_name, email)`).in('unit_id', unitIds).order('started_at', { ascending: false }) as any,
      ]);
      setUnits(unitList.map(u => ({
        ...u,
        invite_status: invitesRes.data?.find((i: any) => i.unit_id === u.id)?.status as InvitationStatus | undefined,
      })));
      setLeases((leasesRes.data ?? []).map((l: any) => ({
        ...l,
        tenant_name: l.users?.full_name ?? 'Ukjent',
        tenant_email: l.users?.email ?? '',
      })));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEndLease = (unit: UnitWithInvite) => {
    const activeLease = leases.find(l => l.unit_id === unit.id && !l.ended_at);
    if (!activeLease) return;
    Alert.alert(
      'Avslutt leieforhold',
      `Er du sikker på at du vil avslutte leieforholdet med ${activeLease.tenant_name}?\n\nLeietaker mister tilgang til enheten umiddelbart.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Avslutt leieforhold', style: 'destructive', onPress: async () => {
          setEndingLease(true);
          const today = new Date().toISOString().split('T')[0];
          await supabase.from('leases').update({ ended_at: today }).eq('id', activeLease.id);
          await supabase.from('units').update({ tenant_id: null, lease_start: null, lease_end: null }).eq('id', unit.id);
          await fetchData();
          setEndingLease(false);
          setShowUnitSettingsModal(false);
        }},
      ]
    );
  };

  const openAddModal = () => {
    setEditingUnit(null);
    setUnitForm({ unit_number: '', floor: '', size_sqm: '', monthly_rent: '' });
    setShowUnitModal(true);
  };

  const openEditModal = (unit: UnitWithInvite) => {
    setEditingUnit(unit);
    setUnitForm({
      unit_number: unit.unit_number,
      floor: unit.floor != null ? String(unit.floor) : '',
      size_sqm: unit.size_sqm != null ? String(unit.size_sqm) : '',
      monthly_rent: unit.monthly_rent != null ? String(unit.monthly_rent) : '',
    });
    setShowUnitModal(true);
  };

  const handleSaveUnit = async () => {
    if (!unitForm.unit_number.trim()) { Alert.alert('Feil', 'Enhetsnummer er påkrevd.'); return; }
    setSavingUnit(true);
    const payload = {
      unit_number: unitForm.unit_number.trim(),
      floor: unitForm.floor ? parseInt(unitForm.floor) : null,
      size_sqm: unitForm.size_sqm ? parseFloat(unitForm.size_sqm) : null,
      monthly_rent: unitForm.monthly_rent ? parseFloat(unitForm.monthly_rent) : null,
    };
    const { error } = editingUnit
      ? await supabase.from('units').update(payload).eq('id', editingUnit.id)
      : await supabase.from('units').insert({ ...payload, property_id: id, tenant_id: null, lease_start: null, lease_end: null });
    setSavingUnit(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    setShowUnitModal(false);
    fetchData();
  };

  const handleDeleteUnit = (unit: UnitWithInvite) => {
    Alert.alert(
      'Slett enhet',
      `Er du sikker på at du vil slette Enhet ${unit.unit_number}? Dette kan ikke angres.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Slett', style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('units').delete().eq('id', unit.id);
            if (error) { Alert.alert('Feil', error.message); return; }
            fetchData();
          },
        },
      ]
    );
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) { Alert.alert('Feil', 'Skriv inn en gyldig e-postadresse.'); return; }
    if (!selectedUnit) return;
    setSendingInvite(true);
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const { error } = await supabase.from('invitations').insert({
      unit_id: selectedUnit.id, landlord_id: user!.id,
      email: inviteEmail.trim().toLowerCase(), token, status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    setSendingInvite(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    const link = `boligdialog://invite/${token}`;
    await Clipboard.setStringAsync(link);
    Alert.alert('Invitasjon opprettet!', `Lenken er kopiert til utklippstavlen:\n\n${link}`, [{ text: 'OK' }]);
    setShowInviteModal(false);
    setInviteEmail('');
    setSelectedUnit(null);
    fetchData();
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) { Alert.alert('Feil', 'Skriv inn en melding.'); return; }
    const activeUnits = units.filter(u => u.tenant_id);
    if (activeUnits.length === 0) {
      Alert.alert('Ingen leietakere', 'Det er ingen aktive leietakere å sende varsel til.'); return;
    }
    setSendingBroadcast(true);
    const { error } = await (supabase.from('announcements') as any).insert({
      property_id: id,
      landlord_id: user!.id,
      content: broadcastText.trim(),
    });
    setSendingBroadcast(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    setShowBroadcastModal(false);
    setBroadcastText('');
    Alert.alert('Sendt!', `Varselet er publisert og vises på hjemskjermen til ${activeUnits.length} leietaker${activeUnits.length > 1 ? 'e' : ''}.`);
  };

  const handleDeleteProperty = () => {
    Alert.alert(
      'Slett eiendom',
      `Er du sikker på at du vil slette "${property?.address}"? Alle enheter og data knyttet til eiendommen slettes også. Dette kan ikke angres.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Slett eiendom', style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('properties').delete().eq('id', id);
            if (error) { Alert.alert('Feil', error.message); return; }
            setShowPropertySettingsModal(false);
            router.back();
          },
        },
      ]
    );
  };

  const handleSaveProperty = async () => {
    if (!propertyForm.address.trim() || !propertyForm.city.trim() || !propertyForm.postal_code.trim()) {
      Alert.alert('Feil', 'Adresse, by og postnummer er påkrevd.'); return;
    }
    setSavingProperty(true);
    const { error } = await supabase.from('properties').update({
      address: propertyForm.address.trim(),
      city: propertyForm.city.trim(),
      postal_code: propertyForm.postal_code.trim(),
      description: propertyForm.description.trim() || null,
    }).eq('id', id!);
    setSavingProperty(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    await fetchData();
    setShowPropertySettingsModal(false);
  };

  const statusLabel = (status?: InvitationStatus) => {
    if (!status) return null;
    return { pending: { label: 'Invitert', color: '#F59E0B' }, accepted: { label: 'Aktiv leietaker', color: '#10B981' }, expired: { label: 'Utløpt', color: '#EF4444' } }[status];
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={BLUE} />;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={24} color={BLUE} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title} numberOfLines={1}>{property?.address}</Text>
          <Text style={s.subtitle}>{property?.postal_code} {property?.city}</Text>
        </View>
        <TouchableOpacity style={s.gearBtn} onPress={() => {
          setPropertyForm({
            address: property?.address ?? '',
            city: property?.city ?? '',
            postal_code: property?.postal_code ?? '',
            description: property?.description ?? '',
          });
          setShowPropertySettingsModal(true);
        }}>
          <Ionicons name="settings-outline" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={units}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={s.sectionHeaderWrap}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Enheter ({units.length})</Text>
              <TouchableOpacity style={s.addBtn} onPress={openAddModal}>
                <Text style={s.addBtnText}>+ Enhet</Text>
              </TouchableOpacity>
            </View>
            {units.some(u => u.tenant_id) && (
              <TouchableOpacity style={s.broadcastBtn} onPress={() => setShowBroadcastModal(true)}>
                <Ionicons name="megaphone-outline" size={16} color={BLUE} />
                <Text style={s.broadcastBtnText}>Send felles varsel til alle leietakere</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="home-outline" size={40} color="#D1D5DB" />
            <Text style={s.emptyText}>Ingen enheter ennå. Legg til en enhet.</Text>
          </View>
        }
        renderItem={useCallback(({ item }: { item: UnitWithInvite }) => {
          const st = statusLabel(item.invite_status);
          const activeLease = leases.find(l => l.unit_id === item.id && !l.ended_at);
          const pastLeases = leases.filter(l => l.unit_id === item.id && l.ended_at);
          return (
            <View style={s.unitCard}>
              <View style={s.unitRow}>
                <View style={s.unitInfo}>
                  <Text style={s.unitNumber}>Enhet {item.unit_number}</Text>
                  {item.monthly_rent != null && <Text style={s.unitRent}>{Number(item.monthly_rent).toLocaleString('nb-NO')} kr/mnd</Text>}
                  {item.size_sqm != null && <Text style={s.unitDetail}>{item.size_sqm} m²{item.floor != null ? ` · Etasje ${item.floor}` : ''}</Text>}
                  {activeLease ? (
                    <View style={s.activeTenantRow}>
                      <Ionicons name="person-circle-outline" size={15} color="#10B981" />
                      <Text style={s.activeTenantName}>{activeLease.tenant_name}</Text>
                      <Text style={s.activeTenantSince}>· fra {fmtDate(activeLease.started_at)}</Text>
                    </View>
                  ) : st ? (
                    <View style={[s.badge, { backgroundColor: st.color + '22' }]}><Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text></View>
                  ) : null}
                </View>
                <View style={s.unitActions}>
                  <TouchableOpacity style={s.iconBtn} onPress={() => openDocs(item)}>
                    <Ionicons name="document-text-outline" size={22} color="#7C3AED" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => openExpenses(item)}>
                    <Ionicons name="wallet-outline" size={22} color="#10B981" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => router.push({ pathname: '/(landlord)/inspection', params: { unit_id: item.id, unit_number: item.unit_number } } as any)}>
                    <Ionicons name="clipboard-outline" size={22} color="#F59E0B" />
                  </TouchableOpacity>
                  {pastLeases.length > 0 && (
                    <TouchableOpacity style={s.iconBtn} onPress={() => { setHistoryUnit(item); setShowHistoryModal(true); }}>
                      <Ionicons name="time-outline" size={22} color="#6B7280" />
                    </TouchableOpacity>
                  )}
                  {!activeLease && (
                    <TouchableOpacity style={s.iconBtn} onPress={() => { setSelectedUnit(item); setShowInviteModal(true); }}>
                      <Ionicons name="mail-outline" size={22} color={BLUE} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.iconBtn} onPress={() => {
                    setSettingsUnit(item);
                    setUnitForm({
                      unit_number: item.unit_number,
                      floor: item.floor != null ? String(item.floor) : '',
                      size_sqm: item.size_sqm != null ? String(item.size_sqm) : '',
                      monthly_rent: item.monthly_rent != null ? String(item.monthly_rent) : '',
                    });
                    setShowUnitSettingsModal(true);
                  }}>
                    <Ionicons name="settings-outline" size={22} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }, [leases, units])}
      />

      {/* Add / Edit Unit Modal */}
      <Modal visible={showUnitModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowUnitModal(false)}><Text style={s.cancel}>Avbryt</Text></TouchableOpacity>
              <Text style={s.modalTitle}>{editingUnit ? 'Rediger enhet' : 'Ny enhet'}</Text>
              <TouchableOpacity onPress={handleSaveUnit} disabled={savingUnit}>
                {savingUnit ? <ActivityIndicator color={BLUE} /> : <Text style={s.saveText}>Lagre</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {UNIT_FIELDS.map(f => (
                <View key={f.key} style={s.field}>
                  <Text style={s.label}>{f.label}</Text>
                  <TextInput style={s.input} placeholder={f.placeholder} placeholderTextColor="#9CA3AF"
                    keyboardType={f.keyboard as any}
                    value={unitForm[f.key]}
                    onChangeText={v => setUnitForm(prev => ({ ...prev, [f.key]: v }))} />
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Broadcast Modal */}
      <Modal visible={showBroadcastModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => { setShowBroadcastModal(false); setBroadcastText(''); }}>
                <Text style={s.cancel}>Avbryt</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>Felles varsel</Text>
              <TouchableOpacity onPress={handleBroadcast} disabled={sendingBroadcast}>
                {sendingBroadcast ? <ActivityIndicator color={BLUE} /> : <Text style={s.saveText}>Send</Text>}
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              <View style={s.broadcastInfo}>
                <Ionicons name="megaphone-outline" size={20} color={BLUE} />
                <Text style={s.broadcastInfoText}>
                  Varselet vises øverst på hjemskjermen til alle {units.filter(u => u.tenant_id).length} leietakere på {property?.address}.
                </Text>
              </View>
              <View style={s.field}>
                <Text style={s.label}>Melding</Text>
                <TextInput
                  style={[s.input, { height: 140, textAlignVertical: 'top' }]}
                  placeholder="Eks: Det vil være stengt vann mandag 10. juni kl. 09–12 på grunn av rørarbeid."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  autoFocus
                  value={broadcastText}
                  onChangeText={setBroadcastText}
                />
              </View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Documents Modal */}
      <Modal visible={showDocsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowDocsModal(false)}><Text style={s.cancel}>Lukk</Text></TouchableOpacity>
            <Text style={s.modalTitle}>Dokumenter – Enhet {docsUnit?.unit_number}</Text>
            <TouchableOpacity onPress={showUploadOptions} disabled={uploadingDoc}>
              {uploadingDoc ? <ActivityIndicator color={BLUE} size="small" /> : <Text style={s.saveText}>+ Last opp</Text>}
            </TouchableOpacity>
          </View>

          {loadingDocs ? <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} /> : (
            <ScrollView contentContainerStyle={s.modalBody}>
              {docs.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="document-text-outline" size={40} color="#D1D5DB" />
                  <Text style={s.emptyText}>Ingen dokumenter lastet opp ennå.</Text>
                </View>
              ) : docs.map(doc => {
                const cat = DOC_CATEGORIES.find(c => c.key === doc.category) ?? DOC_CATEGORIES[3];
                return (
                  <TouchableOpacity key={doc.id} style={s.expenseCard} onPress={() => handleDocPress(doc)}>
                    <View style={[s.expenseCatIcon, { backgroundColor: cat.color + '18' }]}>
                      <Ionicons name={(isImage(doc.name) ? 'image-outline' : cat.icon) as any} size={18} color={cat.color} />
                    </View>
                    <View style={s.expenseInfo}>
                      <Text style={s.expenseDesc} numberOfLines={1}>{doc.name}</Text>
                      <Text style={s.expenseMeta}>{cat.label} · {(doc.file_size / 1024).toFixed(1)} KB · {new Date(doc.created_at).toLocaleDateString('nb-NO')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteDoc(doc)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Image preview */}
      <Modal visible={previewVisible} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPreviewVisible(false)}>
          {previewUrl && <Image source={{ uri: previewUrl }} style={s.previewImg} resizeMode="contain" />}
          <TouchableOpacity style={s.closePreview} onPress={() => setPreviewVisible(false)}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Document category picker */}
      <Modal visible={showDocCatModal} transparent animationType="slide">
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => { setShowDocCatModal(false); setPendingDoc(null); }}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Velg kategori</Text>
            {pendingDoc && <Text style={s.sheetFile} numberOfLines={1}>{pendingDoc.name}</Text>}
            <View style={s.catList}>
              {DOC_CATEGORIES.map(cat => (
                <TouchableOpacity key={cat.key} style={s.catRow} onPress={() => uploadWithCategory(cat.key)}>
                  <View style={[s.catIcon, { backgroundColor: cat.color + '18' }]}>
                    <Ionicons name={cat.icon as any} size={20} color={cat.color} />
                  </View>
                  <Text style={s.catLabel}>{cat.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit Settings Modal */}
      <Modal visible={showUnitSettingsModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowUnitSettingsModal(false)}><Text style={s.cancel}>Avbryt</Text></TouchableOpacity>
              <Text style={s.modalTitle}>Enhet {settingsUnit?.unit_number}</Text>
              <TouchableOpacity onPress={async () => {
                if (!unitForm.unit_number.trim()) { Alert.alert('Feil', 'Enhetsnummer er påkrevd.'); return; }
                setSavingUnit(true);
                const payload = {
                  unit_number: unitForm.unit_number.trim(),
                  floor: unitForm.floor ? parseInt(unitForm.floor) : null,
                  size_sqm: unitForm.size_sqm ? parseFloat(unitForm.size_sqm) : null,
                  monthly_rent: unitForm.monthly_rent ? parseFloat(unitForm.monthly_rent) : null,
                };
                const { error } = await supabase.from('units').update(payload).eq('id', settingsUnit!.id);
                setSavingUnit(false);
                if (error) { Alert.alert('Feil', error.message); return; }
                setShowUnitSettingsModal(false);
                fetchData();
              }} disabled={savingUnit}>
                {savingUnit ? <ActivityIndicator color={BLUE} /> : <Text style={s.saveText}>Lagre</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {UNIT_FIELDS.map(f => (
                <View key={f.key} style={s.field}>
                  <Text style={s.label}>{f.label}</Text>
                  <TextInput
                    style={s.input}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9CA3AF"
                    keyboardType={f.keyboard as any}
                    value={unitForm[f.key]}
                    onChangeText={v => setUnitForm(prev => ({ ...prev, [f.key]: v }))}
                  />
                </View>
              ))}

              <View style={s.dangerZone}>
                {settingsUnit && leases.find(l => l.unit_id === settingsUnit.id && !l.ended_at) && (
                  <>
                    <TouchableOpacity style={[s.deleteBtn, { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }]} onPress={() => handleEndLease(settingsUnit)} disabled={endingLease}>
                      {endingLease ? <ActivityIndicator size="small" color="#D97706" /> : <Ionicons name="exit-outline" size={18} color="#D97706" />}
                      <Text style={[s.deleteBtnText, { color: '#D97706' }]}>Avslutt leieforhold</Text>
                    </TouchableOpacity>
                    <Text style={s.dangerNote}>Leietaker mister tilgang umiddelbart. Historikk og rapporter beholdes.</Text>
                  </>
                )}
                <TouchableOpacity style={s.deleteBtn} onPress={() => {
                  Alert.alert(
                    'Slett enhet',
                    `Er du sikker på at du vil slette Enhet ${settingsUnit?.unit_number}? Alle data knyttet til enheten slettes permanent.`,
                    [
                      { text: 'Avbryt', style: 'cancel' },
                      { text: 'Slett enhet', style: 'destructive', onPress: async () => {
                        const { error } = await supabase.from('units').delete().eq('id', settingsUnit!.id);
                        if (error) { Alert.alert('Feil', error.message); return; }
                        setShowUnitSettingsModal(false);
                        fetchData();
                      }},
                    ]
                  );
                }}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={s.deleteBtnText}>Slett enhet</Text>
                </TouchableOpacity>
                <Text style={s.dangerNote}>Dette sletter enheten og alle tilknyttede meldinger, feilmeldinger og utgifter permanent.</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Expenses Modal — contains both list and add-form views */}
      <Modal visible={showExpensesModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => {
                if (showAddExpenseForm) { setShowAddExpenseForm(false); }
                else { setShowExpensesModal(false); }
              }}>
                <Text style={s.cancel}>{showAddExpenseForm ? 'Avbryt' : 'Lukk'}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>
                {showAddExpenseForm ? 'Ny utgift' : `Utgifter – Enhet ${expenseUnit?.unit_number}`}
              </Text>
              {showAddExpenseForm ? (
                <TouchableOpacity onPress={handleSaveExpense} disabled={savingExpense}>
                  {savingExpense ? <ActivityIndicator color={BLUE} /> : <Text style={s.saveText}>Lagre</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => {
                  setExpenseForm({ amount: '', category: 'maintenance', description: '', date: new Date() });
                  setShowDatePicker(false);
                  setShowAddExpenseForm(true);
                }}>
                  <Text style={s.saveText}>+ Ny</Text>
                </TouchableOpacity>
              )}
            </View>

            {showAddExpenseForm ? (
              <ScrollView contentContainerStyle={s.modalBody}>
                <View style={s.field}>
                  <Text style={s.label}>Beløp (kr)</Text>
                  <TextInput style={s.input} placeholder="2500" placeholderTextColor="#9CA3AF"
                    keyboardType="numeric" autoFocus value={expenseForm.amount}
                    onChangeText={v => setExpenseForm(p => ({ ...p, amount: v }))} />
                </View>
                <View style={s.field}>
                  <Text style={s.label}>Kategori</Text>
                  <View style={s.catGrid}>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <TouchableOpacity key={cat.key}
                        style={[s.catBtn, expenseForm.category === cat.key && { borderColor: cat.color, backgroundColor: cat.color + '12' }]}
                        onPress={() => setExpenseForm(p => ({ ...p, category: cat.key }))}>
                        <Ionicons name={cat.icon as any} size={16} color={expenseForm.category === cat.key ? cat.color : '#6B7280'} />
                        <Text style={[s.catBtnText, expenseForm.category === cat.key && { color: cat.color, fontWeight: '600' }]}>{cat.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={s.field}>
                  <Text style={s.label}>Beskrivelse</Text>
                  <TextInput style={s.input} placeholder="Eks: Byttet varmtvannsbereder" placeholderTextColor="#9CA3AF"
                    value={expenseForm.description} onChangeText={v => setExpenseForm(p => ({ ...p, description: v }))} />
                </View>
                <View style={s.field}>
                  <Text style={s.label}>Dato</Text>
                  <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={18} color={BLUE} />
                    <Text style={s.dateBtnText}>
                      {expenseForm.date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={expenseForm.date}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      locale="nb-NO"
                      maximumDate={new Date()}
                      onChange={(_, selectedDate) => {
                        if (Platform.OS === 'android') setShowDatePicker(false);
                        if (selectedDate) setExpenseForm(p => ({ ...p, date: selectedDate }));
                      }}
                      style={{ marginTop: 8, width: '100%' }}
                    />
                  )}
                  {showDatePicker && Platform.OS === 'ios' && (
                    <TouchableOpacity onPress={() => setShowDatePicker(false)} style={s.dateCloseBtn}>
                      <Text style={{ color: BLUE, fontWeight: '600' }}>Ferdig</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            ) : loadingExpenses ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
            ) : (
              <ScrollView contentContainerStyle={s.modalBody}>
                {expenses.length > 0 && (
                  <View style={s.expenseSummary}>
                    <Text style={s.expenseSummaryLabel}>Totalt</Text>
                    <Text style={s.expenseSummaryAmount}>
                      {expenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('nb-NO')} kr
                    </Text>
                  </View>
                )}
                {expenses.length === 0 ? (
                  <View style={s.empty}>
                    <Ionicons name="wallet-outline" size={40} color="#D1D5DB" />
                    <Text style={s.emptyText}>Ingen utgifter registrert ennå.</Text>
                  </View>
                ) : (
                  expenses.map(expense => {
                    const cat = EXPENSE_CATEGORIES.find(c => c.key === expense.category)!;
                    return (
                      <View key={expense.id} style={s.expenseCard}>
                        <View style={[s.expenseCatIcon, { backgroundColor: cat.color + '18' }]}>
                          <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                        </View>
                        <View style={s.expenseInfo}>
                          <Text style={s.expenseDesc}>{expense.description}</Text>
                          <Text style={s.expenseMeta}>{cat.label} · {expense.date}</Text>
                        </View>
                        <View style={s.expenseRight}>
                          <Text style={s.expenseAmount}>{Number(expense.amount).toLocaleString('nb-NO')} kr</Text>
                          <TouchableOpacity onPress={() => handleDeleteExpense(expense)}>
                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Property Settings Modal */}
      <Modal visible={showPropertySettingsModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowPropertySettingsModal(false)}><Text style={s.cancel}>Avbryt</Text></TouchableOpacity>
              <Text style={s.modalTitle}>Innstillinger</Text>
              <TouchableOpacity onPress={handleSaveProperty} disabled={savingProperty}>
                {savingProperty ? <ActivityIndicator color={BLUE} /> : <Text style={s.saveText}>Lagre</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {[
                { key: 'address', label: 'Adresse', placeholder: 'Storgata 1' },
                { key: 'city', label: 'By', placeholder: 'Oslo' },
                { key: 'postal_code', label: 'Postnummer', placeholder: '0182' },
                { key: 'description', label: 'Beskrivelse (valgfritt)', placeholder: 'Eks: Leilighetsbygg fra 2005' },
              ].map(f => (
                <View key={f.key} style={s.field}>
                  <Text style={s.label}>{f.label}</Text>
                  <TextInput
                    style={s.input}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9CA3AF"
                    value={propertyForm[f.key as keyof typeof propertyForm]}
                    onChangeText={v => setPropertyForm(p => ({ ...p, [f.key]: v }))}
                  />
                </View>
              ))}

              {/* Destructive zone */}
              <View style={s.dangerZone}>

                <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteProperty}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={s.deleteBtnText}>Slett eiendom</Text>
                </TouchableOpacity>
                <Text style={s.dangerNote}>Dette sletter eiendommen og alle tilknyttede enheter, meldinger og data permanent.</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Lease History Modal */}
      <Modal visible={showHistoryModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => { setShowHistoryModal(false); setHistoryUnit(null); }}>
              <Text style={s.cancel}>Lukk</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Leiehistorikk – Enhet {historyUnit?.unit_number}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>
            {leases.filter(l => l.unit_id === historyUnit?.id).map((lease, idx) => {
              const isActive = !lease.ended_at;
              return (
                <View key={lease.id} style={[s.leaseCard, isActive && s.leaseCardActive]}>
                  <View style={s.leaseCardHeader}>
                    <View style={s.leaseTenantRow}>
                      <Ionicons name="person-circle-outline" size={20} color={isActive ? '#10B981' : '#6B7280'} />
                      <Text style={[s.leaseTenantName, isActive && { color: '#065F46' }]}>{lease.tenant_name}</Text>
                      {isActive && <View style={s.activeChip}><Text style={s.activeChipText}>Aktiv</Text></View>}
                    </View>
                    <Text style={s.leaseDuration}>{leaseDuration(lease.started_at, lease.ended_at)}</Text>
                  </View>
                  <Text style={s.leasePeriod}>
                    {fmtDate(lease.started_at)} – {lease.ended_at ? fmtDate(lease.ended_at) : 'nå'}
                  </Text>
                  <Text style={s.leaseTenantEmail}>{lease.tenant_email}</Text>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Invite Modal */}
      <Modal visible={showInviteModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => { setShowInviteModal(false); setInviteEmail(''); }}><Text style={s.cancel}>Avbryt</Text></TouchableOpacity>
              <Text style={s.modalTitle}>Inviter leietaker</Text>
              <TouchableOpacity onPress={handleSendInvite} disabled={sendingInvite}>
                {sendingInvite ? <ActivityIndicator color={BLUE} /> : <Text style={s.saveText}>Send</Text>}
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              <Text style={s.inviteInfo}>Enhet: {selectedUnit?.unit_number}</Text>
              <View style={s.field}>
                <Text style={s.label}>Leietakers e-postadresse</Text>
                <TextInput style={s.input} placeholder="leietaker@epost.no" placeholderTextColor="#9CA3AF"
                  keyboardType="email-address" autoCapitalize="none" autoFocus
                  value={inviteEmail} onChangeText={setInviteEmail} />
              </View>
              <Text style={s.inviteNote}>Leietakeren må registrere seg med denne e-postadressen og bruke invitasjonslenken for å koble seg til enheten.</Text>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 8 },
  back: { padding: 4 },
  gearBtn: { padding: 8, borderRadius: 10, backgroundColor: '#F5F7FA' },
  dangerZone: { marginTop: 16, borderWidth: 1, borderColor: '#FECACA', borderRadius: 16, padding: 16, gap: 12, backgroundColor: '#FEF2F2' },
  dangerTitle: { fontSize: 13, fontWeight: '600', color: '#EF4444', letterSpacing: 0.5 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 14 },
  deleteBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },
  dangerNote: { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#6B7280' },
  list: { padding: 20, gap: 12 },
  sectionHeaderWrap: { gap: 10, marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  broadcastBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EBF4FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  broadcastBtnText: { color: BLUE, fontSize: 14, fontWeight: '500', flex: 1 },
  broadcastInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EBF4FF', borderRadius: 12, padding: 14 },
  broadcastInfoText: { color: BLUE, fontSize: 14, flex: 1, lineHeight: 20 },
  addBtn: { backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  unitCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  unitInfo: { flex: 1, gap: 4 },
  unitNumber: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  unitRent: { fontSize: 14, color: BLUE, fontWeight: '500' },
  unitDetail: { fontSize: 13, color: '#6B7280' },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  unitActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: '#6B7280', textAlign: 'center', fontSize: 14 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  cancel: { color: '#6B7280', fontSize: 16 },
  saveText: { color: BLUE, fontSize: 16, fontWeight: '600' },
  modalBody: { padding: 20, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: '#1A1A2E', backgroundColor: '#F5F7FA' },
  inviteInfo: { fontSize: 15, fontWeight: '500', color: '#1A1A2E', marginBottom: 4 },
  inviteNote: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  expenseSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EBF4FF', borderRadius: 14, padding: 16, marginBottom: 4 },
  expenseSummaryLabel: { fontSize: 14, color: '#1A56A0', fontWeight: '500' },
  expenseSummaryAmount: { fontSize: 20, fontWeight: '700', color: '#1A56A0' },
  expenseCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  expenseCatIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expenseInfo: { flex: 1, gap: 2 },
  expenseDesc: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  expenseMeta: { fontSize: 12, color: '#6B7280' },
  expenseRight: { alignItems: 'flex-end', gap: 6 },
  expenseAmount: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#EBF4FF' },
  dateBtnText: { fontSize: 15, color: BLUE, fontWeight: '500' },
  dateCloseBtn: { alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, gap: 4 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  sheetFile: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  catList: { gap: 8 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14 },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '95%', height: '80%' },
  closePreview: { position: 'absolute', top: 56, right: 20 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F5F7FA' },
  catBtnText: { fontSize: 13, color: '#6B7280' },
  // Tenant / lease styles
  activeTenantRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  activeTenantName: { fontSize: 13, fontWeight: '600', color: '#065F46' },
  activeTenantSince: { fontSize: 12, color: '#6B7280' },
  leaseCard: { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 16, gap: 5, borderWidth: 1, borderColor: '#E5E7EB' },
  leaseCardActive: { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
  leaseCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leaseTenantRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  leaseTenantName: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  leaseDuration: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  leasePeriod: { fontSize: 13, color: '#6B7280' },
  leaseTenantEmail: { fontSize: 12, color: '#9CA3AF' },
  activeChip: { backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  activeChipText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
