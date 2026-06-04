import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Image, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  InspectionReportRow, InspectionItemRow, InspectionPhotoRow,
  InspectionItemCategory, InspectionItemCondition,
} from '@/lib/types';

const BLUE = '#1A56A0';

const ROOMS: { key: InspectionItemCategory; label: string; icon: string }[] = [
  { key: 'kitchen',  label: 'Kjøkken',  icon: 'restaurant-outline' },
  { key: 'bathroom', label: 'Bad',       icon: 'water-outline' },
  { key: 'floors',   label: 'Gulv',      icon: 'layers-outline' },
  { key: 'walls',    label: 'Vegger',    icon: 'square-outline' },
  { key: 'other',    label: 'Annet',     icon: 'ellipsis-horizontal-outline' },
];

const CONDITIONS: { key: InspectionItemCondition; label: string; color: string; bg: string }[] = [
  { key: 'good', label: 'Bra',    color: '#10B981', bg: '#ECFDF5' },
  { key: 'fair', label: 'Ok',     color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'poor', label: 'Dårlig', color: '#EF4444', bg: '#FEF2F2' },
];

type PhotoMeta = { id: string; storage_path: string; uploaded_by: string | null; url: string | null };

type RoomState = {
  itemId: string | null;
  // Landlord data (read-only)
  landlordCondition: InspectionItemCondition | null;
  landlordNotes: string | null;
  landlordPhotos: PhotoMeta[];
  // Tenant response
  tenantComment: string;
  newPhotoUri: string | null;
  newPhotoName: string;
  newMimeType: string;
  existingTenantPhotos: PhotoMeta[];
};

const emptyRoom = (): RoomState => ({
  itemId: null,
  landlordCondition: null, landlordNotes: null, landlordPhotos: [],
  tenantComment: '', newPhotoUri: null, newPhotoName: '', newMimeType: 'image/jpeg',
  existingTenantPhotos: [],
});
const emptyRooms = (): Record<InspectionItemCategory, RoomState> =>
  Object.fromEntries(ROOMS.map(r => [r.key, emptyRoom()])) as Record<InspectionItemCategory, RoomState>;

export default function TenantInspectionsScreen() {
  const { user } = useAuthStore();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<InspectionReportRow[]>([]);
  const [selectedReport, setSelectedReport] = useState<InspectionReportRow | null>(null);
  const [roomStates, setRoomStates] = useState<Record<InspectionItemCategory, RoomState>>(emptyRooms());
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [expandedComment, setExpandedComment] = useState<InspectionItemCategory | null>(null);

  const fetchReports = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('inspection_reports').select('*').eq('unit_id', uid)
      .in('status', ['sent_to_tenant', 'tenant_responded', 'locked'])
      .order('created_at', { ascending: false });
    setReports((data as InspectionReportRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from('units').select('id').eq('tenant_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.id) { setUnitId(data.id); fetchReports(data.id).finally(() => setLoading(false)); }
      else setLoading(false);
    });
  }, [user, fetchReports]);

  const signUrl = async (path: string) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  };

  const openReport = async (report: InspectionReportRow) => {
    setSelectedReport(report);
    setLoadingReport(true);
    const rooms = emptyRooms();

    const { data: itemData } = await supabase
      .from('inspection_items').select('*').eq('report_id', report.id);
    const itemList = (itemData as InspectionItemRow[]) ?? [];

    if (itemList.length > 0) {
      const { data: photoData } = await supabase
        .from('inspection_photos').select('*').in('item_id', itemList.map(i => i.id));
      const photos = (photoData as InspectionPhotoRow[]) ?? [];

      for (const item of itemList) {
        const cat = item.category as InspectionItemCategory;
        const itemPhotos = photos.filter(p => p.item_id === item.id);
        const landlordPhotos: PhotoMeta[] = [];
        const tenantPhotos: PhotoMeta[] = [];
        for (const p of itemPhotos) {
          const url = await signUrl(p.storage_path);
          const meta: PhotoMeta = { id: p.id, storage_path: p.storage_path, uploaded_by: p.uploaded_by, url };
          if (p.uploaded_by === report.landlord_id || !p.uploaded_by) landlordPhotos.push(meta);
          else tenantPhotos.push(meta);
        }
        rooms[cat] = {
          itemId: item.id,
          landlordCondition: item.condition as InspectionItemCondition | null,
          landlordNotes: item.notes,
          landlordPhotos,
          tenantComment: item.tenant_comment ?? '',
          newPhotoUri: null, newPhotoName: '', newMimeType: 'image/jpeg',
          existingTenantPhotos: tenantPhotos,
        };
      }
    }
    setRoomStates(rooms);
    setLoadingReport(false);
  };

  const pickPhoto = async (cat: InspectionItemCategory) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    const doCamera = async () => {
      const r = await ImagePicker.launchCameraAsync({ quality: 0.75 });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      setRoomStates(prev => ({ ...prev, [cat]: { ...prev[cat], newPhotoUri: a.uri, newPhotoName: `${cat}_${Date.now()}.jpg`, newMimeType: a.mimeType ?? 'image/jpeg' } }));
    };
    const doLibrary = async () => {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      setRoomStates(prev => ({ ...prev, [cat]: { ...prev[cat], newPhotoUri: a.uri, newPhotoName: a.fileName ?? `${cat}_${Date.now()}.jpg`, newMimeType: a.mimeType ?? 'image/jpeg' } }));
    };
    if (status === 'granted') {
      Alert.alert('Legg til bilde', '', [
        { text: 'Ta bilde', onPress: doCamera },
        { text: 'Velg fra bibliotek', onPress: doLibrary },
        { text: 'Avbryt', style: 'cancel' },
      ]);
    } else { doLibrary(); }
  };

  const handleSignAndSubmit = async () => {
    if (!selectedReport) return;
    Alert.alert(
      'Signer og send tilbakemelding',
      'Du bekrefter at du har gjennomgått rapporten. Eventuelle kommentarer og bilder du har lagt til sendes til utleier.',
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Signer og send', onPress: async () => {
          setSaving(true);
          try {
            for (const room of ROOMS) {
              const rs = roomStates[room.key];
              if (!rs.itemId) continue;
              // Save tenant comment
              await supabase.from('inspection_items')
                .update({ tenant_comment: rs.tenantComment.trim() || null })
                .eq('id', rs.itemId);
              // Upload tenant photo if new
              if (rs.newPhotoUri) {
                const base64 = await FileSystem.readAsStringAsync(rs.newPhotoUri, { encoding: FileSystem.EncodingType.Base64 });
                const buf = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                const path = `inspections/${selectedReport.id}/${rs.itemId}_tenant_${rs.newPhotoName}`;
                const { error: upErr } = await supabase.storage.from('documents').upload(path, buf, { contentType: rs.newMimeType });
                if (upErr) throw upErr;
                await supabase.from('inspection_photos').insert({ item_id: rs.itemId, storage_path: path, uploaded_by: user!.id });
              }
            }
            await supabase.from('inspection_reports').update({
              status: 'tenant_responded',
              tenant_signed_at: new Date().toISOString(),
              tenant_signed_by: user!.id,
            }).eq('id', selectedReport.id);
            const updated = { ...selectedReport, status: 'tenant_responded' as const };
            setSelectedReport(updated);
            setReports(prev => prev.map(r => r.id === selectedReport.id ? updated : r));
            Alert.alert('Signert!', 'Tilbakemeldingen er sendt til utleier. Rapporten låses når utleier bekrefter.');
          } catch (e: any) {
            Alert.alert('Feil', e.message ?? 'Noe gikk galt.');
          } finally { setSaving(false); }
        }},
      ]
    );
  };

  const reportTypeLabel = (type: string) => type === 'move_in' ? 'Innflyttingsrapport' : 'Utflyttingsrapport';
  const statusInfo = (status: string) => ({
    sent_to_tenant:   { label: 'Trenger din signatur', color: '#3B82F6' },
    tenant_responded: { label: 'Signert – venter utleier', color: '#F59E0B' },
    locked:           { label: 'Ferdig og låst',           color: '#10B981' },
  }[status] ?? { label: status, color: '#6B7280' });

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={BLUE} />;

  if (!unitId) return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.empty}>
        <Ionicons name="home-outline" size={48} color="#D1D5DB" />
        <Text style={s.emptyTitle}>Ingen enhet tilknyttet</Text>
        <Text style={s.emptySub}>Du er ikke koblet til en leieenhet ennå.</Text>
      </View>
    </SafeAreaView>
  );

  // ─── REPORT VIEW ──────────────────────────────────────────────────
  if (selectedReport) {
    const canRespond = selectedReport.status === 'sent_to_tenant';
    const isLocked = selectedReport.status === 'locked';
    const hasResponded = selectedReport.status === 'tenant_responded';
    const st = statusInfo(selectedReport.status);

    return (
      <SafeAreaView style={s.safe} edges={['bottom']}>
        <View style={s.detailHeader}>
          <TouchableOpacity onPress={() => { setSelectedReport(null); setRoomStates(emptyRooms()); }} style={s.back}>
            <Ionicons name="chevron-back" size={24} color={BLUE} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.detailTitle}>{reportTypeLabel(selectedReport.type)}</Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, { backgroundColor: st.color }]} />
              <Text style={[s.statusLabel, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>
        </View>

        {loadingReport ? <ActivityIndicator style={{ flex: 1 }} color={BLUE} /> : (
          <ScrollView contentContainerStyle={s.checklistBody}>

            {canRespond && (
              <View style={s.infoBanner}>
                <Ionicons name="information-circle-outline" size={18} color={BLUE} />
                <Text style={s.infoBannerText}>Gå gjennom hvert rom. Du kan legge til kommentarer og egne bilder der du er uenig eller vil dokumentere noe ekstra.</Text>
              </View>
            )}

            {isLocked && (
              <View style={s.lockedBanner}>
                <Ionicons name="lock-closed" size={18} color="#10B981" />
                <Text style={s.lockedBannerText}>Rapporten er låst og ferdigstilt av begge parter.</Text>
              </View>
            )}

            {hasResponded && (
              <View style={s.waitingBanner}>
                <Ionicons name="time-outline" size={18} color="#F59E0B" />
                <Text style={s.waitingText}>Tilbakemeldingen er sendt. Venter på at utleier låser rapporten.</Text>
              </View>
            )}

            {ROOMS.map(room => {
              const rs = roomStates[room.key];
              // Skip rooms with no landlord data in read-only mode
              if (!canRespond && !rs.itemId) return null;
              const cond = rs.landlordCondition ? CONDITIONS.find(c => c.key === rs.landlordCondition) : null;
              const commentOpen = expandedComment === room.key;

              return (
                <View key={room.key} style={s.roomCard}>
                  {/* Room header */}
                  <View style={s.roomHeader}>
                    <Ionicons name={room.icon as any} size={20} color={BLUE} />
                    <Text style={s.roomLabel}>{room.label}</Text>
                    {cond && (
                      <View style={[s.condBadge, { backgroundColor: cond.bg, borderColor: cond.color }]}>
                        <Text style={[s.condBadgeText, { color: cond.color }]}>{cond.label}</Text>
                      </View>
                    )}
                  </View>

                  {/* Landlord notes */}
                  {rs.landlordNotes ? (
                    <View style={s.landlordNotes}>
                      <Text style={s.landlordNotesLabel}>Utleiers kommentar</Text>
                      <Text style={s.landlordNotesText}>{rs.landlordNotes}</Text>
                    </View>
                  ) : null}

                  {/* Landlord photos */}
                  {rs.landlordPhotos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {rs.landlordPhotos.map(p => p.url ? (
                        <TouchableOpacity key={p.id} onPress={() => setPreviewUrl(p.url)}>
                          <Image source={{ uri: p.url }} style={s.photoThumb} resizeMode="cover" />
                        </TouchableOpacity>
                      ) : null)}
                    </ScrollView>
                  )}

                  {/* Tenant response area */}
                  {canRespond && (
                    <View style={s.tenantResponseArea}>
                      <TouchableOpacity style={s.commentToggle}
                        onPress={() => setExpandedComment(commentOpen ? null : room.key)}>
                        <Ionicons name={rs.tenantComment ? 'chatbubble' : 'chatbubble-outline'} size={15}
                          color={rs.tenantComment ? '#7C3AED' : '#9CA3AF'} />
                        <Text style={[s.commentToggleText, rs.tenantComment && { color: '#7C3AED' }]}>
                          {rs.tenantComment || 'Legg til kommentar'}
                        </Text>
                        {!rs.newPhotoUri && (
                          <TouchableOpacity style={s.inlineCameraBtn} onPress={() => pickPhoto(room.key)}>
                            <Ionicons name="camera-outline" size={16} color="#6B7280" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {commentOpen && (
                        <TextInput
                          style={s.commentInput}
                          placeholder="Skriv din kommentar her…"
                          placeholderTextColor="#9CA3AF"
                          multiline autoFocus
                          value={rs.tenantComment}
                          onChangeText={v => setRoomStates(prev => ({ ...prev, [room.key]: { ...prev[room.key], tenantComment: v } }))}
                        />
                      )}

                      {rs.newPhotoUri && (
                        <View style={s.newPhotoWrap}>
                          <TouchableOpacity onPress={() => setPreviewUrl(rs.newPhotoUri)}>
                            <Image source={{ uri: rs.newPhotoUri }} style={s.photoThumb} resizeMode="cover" />
                          </TouchableOpacity>
                          <TouchableOpacity style={s.removePhotoBtn}
                            onPress={() => setRoomStates(prev => ({ ...prev, [room.key]: { ...prev[room.key], newPhotoUri: null } }))}>
                            <Ionicons name="close-circle" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Tenant response — read-only */}
                  {!canRespond && (rs.tenantComment || rs.existingTenantPhotos.length > 0) && (
                    <View style={s.tenantFeedbackReadOnly}>
                      <Text style={s.tenantFeedbackLabel}>Din tilbakemelding</Text>
                      {rs.tenantComment ? <Text style={s.tenantFeedbackText}>{rs.tenantComment}</Text> : null}
                      {rs.existingTenantPhotos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                          {rs.existingTenantPhotos.map(p => p.url ? (
                            <TouchableOpacity key={p.id} onPress={() => setPreviewUrl(p.url)}>
                              <Image source={{ uri: p.url }} style={s.photoThumb} resizeMode="cover" />
                            </TouchableOpacity>
                          ) : null)}
                        </ScrollView>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {canRespond && (
              <TouchableOpacity style={s.signBtn} onPress={handleSignAndSubmit} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="pencil-outline" size={18} color="#fff" /><Text style={s.signBtnText}>Signer og send tilbakemelding</Text></>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        <Modal visible={!!previewUrl} transparent animationType="fade">
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPreviewUrl(null)}>
            {previewUrl && <Image source={{ uri: previewUrl }} style={s.fullPreview} resizeMode="contain" />}
            <TouchableOpacity style={s.closePreview} onPress={() => setPreviewUrl(null)}>
              <Ionicons name="close-circle" size={36} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    );
  }

  // ─── LIST VIEW ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.listBody}>
        {reports.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="clipboard-outline" size={48} color="#D1D5DB" />
            <Text style={s.emptyTitle}>Ingen rapporter</Text>
            <Text style={s.emptySub}>Utleieren har ikke sendt noen rapport ennå.</Text>
          </View>
        ) : (
          reports.map(report => {
            const st = statusInfo(report.status);
            const needsAction = report.status === 'sent_to_tenant';
            return (
              <TouchableOpacity key={report.id} style={[s.reportCard, needsAction && s.reportCardHighlight]}
                onPress={() => openReport(report)}>
                <View style={[s.reportIcon, { backgroundColor: report.type === 'move_in' ? '#EBF4FF' : '#FFFBEB' }]}>
                  <Ionicons name={report.type === 'move_in' ? 'log-in-outline' : 'log-out-outline'} size={20}
                    color={report.type === 'move_in' ? BLUE : '#D97706'} />
                </View>
                <View style={s.reportInfo}>
                  <Text style={s.reportTitle}>{reportTypeLabel(report.type)}</Text>
                  <Text style={s.reportDate}>{new Date(report.created_at).toLocaleDateString('nb-NO')}</Text>
                </View>
                <View style={[s.statusPill, { backgroundColor: st.color + '22' }]}>
                  <Text style={[s.statusPillText, { color: st.color }]}>{st.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 8 },
  back: { padding: 4 },
  detailTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  listBody: { padding: 20, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  emptySub: { color: '#6B7280', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  reportCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  reportCardHighlight: { borderWidth: 1.5, borderColor: '#BFDBFE' },
  reportIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reportInfo: { flex: 1, gap: 2 },
  reportTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  reportDate: { fontSize: 12, color: '#6B7280' },
  statusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: '600' },
  // Checklist
  checklistBody: { padding: 16, gap: 10, paddingBottom: 40 },
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14 },
  infoBannerText: { color: '#1E40AF', fontSize: 13, flex: 1, lineHeight: 18 },
  lockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECFDF5', borderRadius: 14, padding: 14 },
  lockedBannerText: { color: '#065F46', fontWeight: '600', fontSize: 13, flex: 1 },
  waitingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14 },
  waitingText: { color: '#92400E', fontSize: 13, flex: 1 },
  roomCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  roomHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomLabel: { fontSize: 15, fontWeight: '600', color: '#1A1A2E', flex: 1 },
  condBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  condBadgeText: { fontSize: 12, fontWeight: '700' },
  landlordNotes: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, gap: 2 },
  landlordNotesLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase' },
  landlordNotesText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  photoThumb: { width: 72, height: 72, borderRadius: 10, marginRight: 8 },
  tenantResponseArea: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10, gap: 8 },
  commentToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentToggleText: { flex: 1, fontSize: 13, color: '#9CA3AF' },
  inlineCameraBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  commentInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, color: '#1A1A2E', backgroundColor: '#F9FAFB', minHeight: 68, textAlignVertical: 'top' },
  newPhotoWrap: { position: 'relative', alignSelf: 'flex-start' },
  removePhotoBtn: { position: 'absolute', top: -6, right: 2 },
  tenantFeedbackReadOnly: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: '#DDD6FE' },
  tenantFeedbackLabel: { fontSize: 11, fontWeight: '700', color: '#7C3AED', textTransform: 'uppercase' },
  tenantFeedbackText: { fontSize: 13, color: '#4C1D95', lineHeight: 18 },
  signBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16, marginTop: 4 },
  signBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fullPreview: { width: '95%', height: '80%' },
  closePreview: { position: 'absolute', top: 56, right: 20 },
});
