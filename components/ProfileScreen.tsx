import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView, TextInput, Modal, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import * as SecureStore from 'expo-secure-store';

const BLUE = '#1A56A0';
const VERSION = '1.0.0';

const PRIVACY_POLICY = `Sist oppdatert: 3. juni 2026

PERSONVERNERKLÆRING FOR BOLIG DIALOG

1. BEHANDLINGSANSVARLIG
Bolig Dialog ("vi", "oss") er behandlingsansvarlig for personopplysningene du gir oss gjennom appen.

2. HVILKE OPPLYSNINGER VI SAMLER INN
Vi samler inn følgende opplysninger:
• Navn og e-postadresse ved registrering
• Rolle (utleier eller leietaker)
• Meldinger sendt mellom utleier og leietaker
• Feilmeldinger og beskrivelser du sender inn
• Enhets- og eiendomsinformasjon registrert av utleier

3. FORMÅL MED BEHANDLINGEN
Opplysningene brukes til:
• Å levere appens tjenester (kommunikasjon, feilrapportering, dokumentdeling)
• Å sikre at riktige parter har tilgang til riktig informasjon
• Å sende varsler og meldinger mellom utleier og leietaker

4. RETTSLIG GRUNNLAG
Behandlingen er basert på avtale (GDPR art. 6 nr. 1 bokstav b) – vi behandler opplysningene for å oppfylle tjenesteavtalen med deg.

5. LAGRING OG SIKKERHET
Alle data lagres i Supabase (EU-region) med kryptering i overføring og hvile. Tilgang er begrenset gjennom row-level security – du ser kun data du har rett til å se.

6. DELING MED TREDJEPARTER
Vi deler ikke dine personopplysninger med tredjeparter, med unntak av:
• Supabase (databehandler, EU-basert infrastruktur)

7. DINE RETTIGHETER
Du har rett til å:
• Få innsyn i hvilke opplysninger vi har om deg
• Kreve retting av feilaktige opplysninger
• Kreve sletting av dine opplysninger ("retten til å bli glemt")
• Trekke tilbake samtykke når som helst

For å utøve dine rettigheter, kontakt oss på:
support@boligdialog.no

8. KONTAKT
Bolig Dialog
E-post: support@boligdialog.no`;

type Stat = { label: string; value: number | string; icon: string };

interface Props {
  role: 'landlord' | 'tenant';
  stats?: Stat[];
}

export function ProfileScreen({ role, stats }: Props) {
  const { user, signOut, fetchUser } = useAuthStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [newName, setNewName] = useState(user?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync('notifications_enabled').then(val => {
      if (val !== null) setNotificationsEnabled(val === 'true');
    });
  }, []);

  const handleToggleNotifications = async (val: boolean) => {
    setNotificationsEnabled(val);
    await SecureStore.setItemAsync('notifications_enabled', String(val));
  };

  const handleSaveName = async () => {
    if (!newName.trim() || newName.trim().length < 2) {
      Alert.alert('Feil', 'Navn må være minst 2 tegn.'); return;
    }
    setSavingName(true);
    const { error } = await supabase.from('users').update({ full_name: newName.trim() }).eq('id', user!.id);
    setSavingName(false);
    if (error) { Alert.alert('Feil', error.message); return; }
    await fetchUser(user!.id);
    setShowEditModal(false);
  };

  const handleResetPassword = async () => {
    Alert.alert('Bytt passord', `Vi sender en e-post til ${user?.email} med en lenke for å bytte passord.`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Send e-post', onPress: async () => {
          setSendingReset(true);
          const { error } = await supabase.auth.resetPasswordForEmail(user!.email, {
            redirectTo: 'boligdialog://reset-password',
          });
          setSendingReset(false);
          if (error) { Alert.alert('Feil', error.message); return; }
          Alert.alert('Sendt!', 'Sjekk e-posten din for videre instruksjoner.');
        },
      },
    ]);
  };

  const handleSignOut = () => Alert.alert('Logg ut', 'Er du sikker?', [
    { text: 'Avbryt', style: 'cancel' },
    { text: 'Logg ut', style: 'destructive', onPress: signOut },
  ]);

  const roleLabel = role === 'landlord' ? 'Utleier' : 'Leietaker';
  const initial = user?.full_name?.charAt(0).toUpperCase() ?? '?';

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Avatar-kort med tannhjul */}
        <View style={s.avatarCard}>
          <TouchableOpacity style={s.gearBtn} onPress={() => { setNewName(user?.full_name ?? ''); setShowEditModal(true); }}>
            <Ionicons name="settings-outline" size={18} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
          <Text style={s.name}>{user?.full_name}</Text>
          <Text style={s.email}>{user?.email}</Text>
          <View style={s.badge}><Text style={s.badgeText}>{roleLabel}</Text></View>
        </View>

        {/* Stats for landlord */}
        {stats && stats.length > 0 && (
          <View style={s.statsRow}>
            {stats.map(st => (
              <View key={st.label} style={s.statCard}>
                <Ionicons name={st.icon as any} size={20} color={BLUE} />
                <Text style={s.statValue}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Innstillinger */}
        <Text style={s.sectionLabel}>INNSTILLINGER</Text>
        <View style={s.section}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: '#EBF4FF' }]}>
                <Ionicons name="notifications-outline" size={18} color={BLUE} />
              </View>
              <Text style={s.rowLabel}>Varslinger</Text>
            </View>
            <Switch value={notificationsEnabled} onValueChange={handleToggleNotifications}
              trackColor={{ false: '#E5E7EB', true: '#BFDBFE' }} thumbColor={notificationsEnabled ? BLUE : '#9CA3AF'} />
          </View>

          <View style={s.divider} />

          <TouchableOpacity style={s.row} onPress={handleResetPassword} disabled={sendingReset}>
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="lock-closed-outline" size={18} color="#10B981" />
              </View>
              <Text style={s.rowLabel}>Bytt passord</Text>
            </View>
            {sendingReset ? <ActivityIndicator size="small" color={BLUE} /> : <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />}
          </TouchableOpacity>
        </View>

        {/* App-info */}
        <Text style={s.sectionLabel}>OM APPEN</Text>
        <View style={s.section}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="information-circle-outline" size={18} color="#7C3AED" />
              </View>
              <Text style={s.rowLabel}>Versjon</Text>
            </View>
            <Text style={s.rowValue}>{VERSION}</Text>
          </View>

          <View style={s.divider} />

          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="mail-outline" size={18} color="#EA580C" />
              </View>
              <Text style={s.rowLabel}>Kontakt support</Text>
            </View>
            <Text style={s.rowValue}>support@boligdialog.no</Text>
          </View>

          <View style={s.divider} />

          <TouchableOpacity style={s.row} onPress={() => setShowPrivacyModal(true)}>
            <View style={s.rowLeft}>
              <View style={[s.rowIcon, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#EF4444" />
              </View>
              <Text style={s.rowLabel}>Personvern</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={s.signOutText}>Logg ut</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rediger navn modal */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}><Text style={s.cancel}>Avbryt</Text></TouchableOpacity>
            <Text style={s.modalTitle}>Rediger navn</Text>
            <TouchableOpacity onPress={handleSaveName} disabled={savingName}>
              {savingName ? <ActivityIndicator color={BLUE} /> : <Text style={s.save}>Lagre</Text>}
            </TouchableOpacity>
          </View>
          <View style={s.modalBody}>
            <Text style={s.label}>Fullt navn</Text>
            <TextInput style={s.input} value={newName} onChangeText={setNewName}
              placeholder="Ola Nordmann" placeholderTextColor="#9CA3AF"
              autoFocus autoCorrect={false} />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Personvern modal */}
      <Modal visible={showPrivacyModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <View style={{ width: 60 }} />
            <Text style={s.modalTitle}>Personvern</Text>
            <TouchableOpacity onPress={() => setShowPrivacyModal(false)} style={s.closeBtn}>
              <Text style={s.cancel}>Lukk</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.privacyBody}>
            <Text style={s.privacyText}>{PRIVACY_POLICY}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E', marginBottom: 20 },
  avatarCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  gearBtn: { position: 'absolute', top: 16, right: 16, padding: 4 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#D5E8F0', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '700', color: BLUE },
  name: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  email: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  badge: { marginTop: 10, backgroundColor: '#EBF4FF', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  badgeText: { color: BLUE, fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1A1A2E' },
  statLabel: { fontSize: 11, color: '#6B7280', textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  section: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, color: '#1A1A2E' },
  rowValue: { fontSize: 13, color: '#6B7280' },
  divider: { height: 1, backgroundColor: '#F5F7FA', marginLeft: 62 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 16, padding: 16, marginTop: 4 },
  signOutText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  cancel: { color: '#6B7280', fontSize: 16 },
  closeBtn: { width: 60, alignItems: 'flex-end' },
  save: { color: BLUE, fontSize: 16, fontWeight: '600' },
  modalBody: { padding: 20, gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: '#1A1A2E', backgroundColor: '#F5F7FA' },
  privacyBody: { padding: 24 },
  privacyText: { fontSize: 14, color: '#374151', lineHeight: 22 },
});
