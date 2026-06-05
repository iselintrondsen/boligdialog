import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const BLUE = '#1A56A0';

export interface UnitSheetData {
  id: string;
  unit_number: string;
  floor: number | null;
  size_sqm: number | null;
  monthly_rent: number | null;
  tenant_id: string | null;
  // enriched
  tenant_name?: string;
  tenant_email?: string;
  lease_started?: string;
  invite_status?: 'pending' | 'accepted' | 'expired';
  has_past_leases?: boolean;
}

interface Props {
  unit: UnitSheetData | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenDocs: (unitId: string, unitNumber: string) => void;
  onOpenExpenses: (unitId: string, unitNumber: string) => void;
}

export function UnitDetailSheet({ unit, onClose, onRefresh, onOpenDocs, onOpenExpenses }: Props) {
  const router = useRouter();

  if (!unit) return null;

  const hasActiveTenant = !!unit.tenant_id;

  const handleEndLease = () => {
    if (!hasActiveTenant) return;
    Alert.alert(
      'Avslutt leieforhold',
      `Er du sikker på at du vil avslutte leieforholdet med ${unit.tenant_name ?? 'leietaker'}?\n\nLeietaker mister tilgang umiddelbart.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Avslutt', style: 'destructive', onPress: async () => {
            const { data: lease } = await supabase
              .from('leases').select('id')
              .eq('unit_id', unit.id).is('ended_at', null).single();
            if (lease) {
              await supabase.from('leases').update({ ended_at: new Date().toISOString().split('T')[0] }).eq('id', lease.id);
              await supabase.from('units').update({ tenant_id: null, lease_start: null, lease_end: null }).eq('id', unit.id);
            }
            onRefresh();
            onClose();
          },
        },
      ]
    );
  };

  const handleDeleteUnit = () => {
    Alert.alert(
      'Slett enhet',
      `Er du sikker på at du vil slette enhet ${unit.unit_number}? Dette kan ikke angres.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Slett', style: 'destructive', onPress: async () => {
            await supabase.from('units').delete().eq('id', unit.id);
            onRefresh();
            onClose();
          },
        },
      ]
    );
  };

  const sendInvite = async () => {
    Alert.prompt(
      'Inviter leietaker',
      'Skriv inn leietakers e-postadresse:',
      async (email) => {
        if (!email?.trim() || !email.includes('@')) return;
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const { data: { session } } = await supabase.auth.getSession();
        const { error } = await supabase.from('invitations').insert({
          unit_id: unit.id,
          landlord_id: session!.user.id,
          email: email.trim().toLowerCase(),
          token,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        if (error) { Alert.alert('Feil', error.message); return; }
        Alert.alert('Invitasjon sendt!', `Invitasjon er sendt til ${email.trim()}`);
        onRefresh();
      },
      'plain-text'
    );
  };

  return (
    <>
      <Modal visible={!!unit} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={s.safe}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.closeBtn}>Lukk</Text>
            </TouchableOpacity>
            <Text style={s.title}>Enhet {unit.unit_number}</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView contentContainerStyle={s.body}>
            {/* Info-kort */}
            <View style={s.infoCard}>
              {unit.monthly_rent != null && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Månedlig leie</Text>
                  <Text style={s.infoValue}>{Number(unit.monthly_rent).toLocaleString('nb-NO')} kr</Text>
                </View>
              )}
              {unit.size_sqm != null && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Størrelse</Text>
                  <Text style={s.infoValue}>{unit.size_sqm} m²</Text>
                </View>
              )}
              {unit.floor != null && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Etasje</Text>
                  <Text style={s.infoValue}>{unit.floor}</Text>
                </View>
              )}
            </View>

            {/* Leietaker-status */}
            <View style={s.infoCard}>
              <Text style={s.sectionLabel}>Leietaker</Text>
              {hasActiveTenant ? (
                <>
                  <View style={s.tenantRow}>
                    <View style={s.tenantAvatar}>
                      <Ionicons name="person" size={20} color={BLUE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tenantName}>{unit.tenant_name ?? 'Ukjent'}</Text>
                      {unit.tenant_email ? <Text style={s.tenantEmail}>{unit.tenant_email}</Text> : null}
                      {unit.lease_started ? <Text style={s.tenantSince}>Leieavtale fra {new Date(unit.lease_started).toLocaleDateString('nb-NO')}</Text> : null}
                    </View>
                  </View>
                </>
              ) : unit.invite_status === 'pending' ? (
                <Text style={s.invitePending}>Invitasjon sendt — venter på svar</Text>
              ) : (
                <Text style={s.noTenant}>Ingen aktiv leietaker</Text>
              )}
            </View>

            {/* Handlinger */}
            <Text style={s.actionsLabel}>Handlinger</Text>
            <View style={s.actionsGrid}>
              <ActionBtn icon="document-text-outline" label="Dokumenter" color="#7C3AED"
                onPress={() => { onClose(); setTimeout(() => onOpenDocs(unit.id, unit.unit_number), 350); }} />
              <ActionBtn icon="wallet-outline" label="Utgifter" color="#10B981"
                onPress={() => { onClose(); setTimeout(() => onOpenExpenses(unit.id, unit.unit_number), 350); }} />
              <ActionBtn icon="clipboard-outline" label="Rapport" color="#F59E0B"
                onPress={() => { onClose(); setTimeout(() => router.push({ pathname: '/(landlord)/inspection', params: { unit_id: unit.id, unit_number: unit.unit_number } } as any), 350); }} />
              {!hasActiveTenant && (
                <ActionBtn icon="mail-outline" label="Inviter" color={BLUE} onPress={sendInvite} />
              )}
              {hasActiveTenant && (
                <ActionBtn icon="person-remove-outline" label="Avslutt leie" color="#EF4444" onPress={handleEndLease} />
              )}
            </View>

            {/* Slett enhet */}
            <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteUnit}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
              <Text style={s.deleteBtnText}>Slett enhet</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </>
  );
}

function ActionBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress}>
      <View style={[s.actionIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={26} color={color} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#F5F7FA' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:        { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  closeBtn:     { color: '#6B7280', fontSize: 16 },
  body:         { padding: 16, gap: 12, paddingBottom: 40 },
  infoCard:     { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:    { fontSize: 14, color: '#6B7280' },
  infoValue:    { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  tenantRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tenantAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EBF4FF', alignItems: 'center', justifyContent: 'center' },
  tenantName:   { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  tenantEmail:  { fontSize: 13, color: '#6B7280', marginTop: 1 },
  tenantSince:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  invitePending:{ fontSize: 14, color: '#F59E0B', fontWeight: '500' },
  noTenant:     { fontSize: 14, color: '#9CA3AF' },
  actionsLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionBtn:    { width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  actionIcon:   { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  deleteBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  deleteBtnText:{ color: '#EF4444', fontWeight: '500', fontSize: 14 },
});
