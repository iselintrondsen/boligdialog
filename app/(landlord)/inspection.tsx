import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Image, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  InspectionReportRow, InspectionItemRow, InspectionPhotoRow,
  InspectionItemCategory, InspectionItemCondition, InspectionReportType,
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
  condition: InspectionItemCondition | null;
  notes: string;
  // Landlord photos
  landlordPhotos: PhotoMeta[];
  newPhotoUri: string | null;
  newPhotoName: string;
  newMimeType: string;
  // Loaded from DB
  itemId: string | null;
  // Tenant feedback (read-only for landlord)
  tenantComment: string | null;
  tenantPhotos: PhotoMeta[];
};

const emptyRoom = (): RoomState => ({
  condition: null, notes: '',
  landlordPhotos: [], newPhotoUri: null, newPhotoName: '', newMimeType: 'image/jpeg',
  itemId: null,
  tenantComment: null, tenantPhotos: [],
});
const emptyRooms = (): Record<InspectionItemCategory, RoomState> =>
  Object.fromEntries(ROOMS.map(r => [r.key, emptyRoom()])) as Record<InspectionItemCategory, RoomState>;

export default function InspectionScreen() {
  const { unit_id, unit_number } = useLocalSearchParams<{ unit_id: string; unit_number: string }>();
  const { user } = useAuthStore();
  const router = useRouter();

  const [view, setView] = useState<'list' | 'checklist'>('list');
  const [reports, setReports] = useState<InspectionReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selectedReport, setSelectedReport] = useState<InspectionReportRow | null>(null);
  const [roomStates, setRoomStates] = useState<Record<InspectionItemCategory, RoomState>>(emptyRooms());
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<InspectionItemCategory | null>(null);

  const fetchReports = useCallback(async () => {
    if (!unit_id) return;
    const { data } = await supabase
      .from('inspection_reports').select('*')
      .eq('unit_id', unit_id).order('created_at', { ascending: false });
    setReports((data as InspectionReportRow[]) ?? []);
    setLoadingReports(false);
  }, [unit_id]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const signUrl = async (path: string) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  };

  const loadChecklist = async (report: InspectionReportRow) => {
    setSelectedReport(report);
    setLoadingChecklist(true);
    setView('checklist');
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
          ...emptyRoom(),
          condition: item.condition as InspectionItemCondition | null,
          notes: item.notes ?? '',
          landlordPhotos,
          tenantPhotos,
          itemId: item.id,
          tenantComment: item.tenant_comment ?? null,
        };
      }
    }
    setRoomStates(rooms);
    setLoadingChecklist(false);
  };

  const startNewReport = async (type: InspectionReportType) => {
    const { data, error } = await supabase
      .from('inspection_reports')
      .insert({ unit_id: unit_id!, landlord_id: user!.id, type, status: 'draft', notes: null })
      .select().single();
    if (error) { Alert.alert('Feil', error.message); return; }
    const report = data as InspectionReportRow;
    setReports(prev => [report, ...prev]);
    setSelectedReport(report);
    setRoomStates(emptyRooms());
    setView('checklist');
  };

  const setCondition = (cat: InspectionItemCategory, cond: InspectionItemCondition) => {
    setRoomStates(prev => ({
      ...prev,
      [cat]: { ...prev[cat], condition: prev[cat].condition === cond ? null : cond },
    }));
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

  const removeNewPhoto = (cat: InspectionItemCategory) => {
    setRoomStates(prev => ({ ...prev, [cat]: { ...prev[cat], newPhotoUri: null, newPhotoName: '' } }));
  };

  const saveAndSend = async () => {
    if (!selectedReport) return;
    const filled = ROOMS.filter(r => roomStates[r.key].condition !== null || roomStates[r.key].newPhotoUri || roomStates[r.key].itemId);
    if (filled.length === 0) { Alert.alert('Tom rapport', 'Sett tilstand på minst ett rom.'); return; }
    setSaving(true);
    try {
      for (const room of ROOMS) {
        const rs = roomStates[room.key];
        if (rs.condition === null && !rs.newPhotoUri && !rs.itemId) continue;
        let itemId = rs.itemId;
        if (!itemId) {
          const { data, error } = await supabase.from('inspection_items')
            .insert({ report_id: selectedReport.id, category: room.key, condition: rs.condition, notes: rs.notes.trim() || null })
            .select().single();
          if (error) throw error;
          itemId = (data as InspectionItemRow).id;
        } else {
          await supabase.from('inspection_items').update({ condition: rs.condition, notes: rs.notes.trim() || null }).eq('id', itemId);
        }
        if (rs.newPhotoUri) {
          const blob = await (await fetch(rs.newPhotoUri)).blob();
          const path = `inspections/${selectedReport.id}/${itemId}_${rs.newPhotoName}`;
          const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: rs.newMimeType });
          if (upErr) throw upErr;
          await supabase.from('inspection_photos').insert({ item_id: itemId, storage_path: path, uploaded_by: user!.id });
        }
      }
      await supabase.from('inspection_reports').update({ status: 'sent_to_tenant' }).eq('id', selectedReport.id);
      setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, status: 'sent_to_tenant' } : r));
      setView('list');
      setSelectedReport(null);
      setRoomStates(emptyRooms());
      Alert.alert('Sendt!', 'Rapporten er sendt til leietakeren for gjennomgang og signering.');
    } catch (e: any) {
      Alert.alert('Feil', e.message ?? 'Noe gikk galt.');
    } finally { setSaving(false); }
  };

  const saveDraft = async () => {
    if (!selectedReport) return;
    setSaving(true);
    try {
      for (const room of ROOMS) {
        const rs = roomStates[room.key];
        if (rs.condition === null && !rs.newPhotoUri && !rs.itemId) continue;
        let itemId = rs.itemId;
        if (!itemId) {
          const { data, error } = await supabase.from('inspection_items')
            .insert({ report_id: selectedReport.id, category: room.key, condition: rs.condition, notes: rs.notes.trim() || null })
            .select().single();
          if (error) throw error;
          itemId = (data as InspectionItemRow).id;
          setRoomStates(prev => ({ ...prev, [room.key]: { ...prev[room.key], itemId } }));
        } else {
          await supabase.from('inspection_items').update({ condition: rs.condition, notes: rs.notes.trim() || null }).eq('id', itemId);
        }
        if (rs.newPhotoUri) {
          const blob = await (await fetch(rs.newPhotoUri)).blob();
          const path = `inspections/${selectedReport.id}/${itemId}_${rs.newPhotoName}`;
          const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: rs.newMimeType });
          if (upErr) throw upErr;
          const { data: pData } = await supabase.from('inspection_photos')
            .insert({ item_id: itemId, storage_path: path, uploaded_by: user!.id }).select().single();
          const url = await signUrl(path);
          const newMeta: PhotoMeta = { id: (pData as any).id, storage_path: path, uploaded_by: user!.id, url };
          setRoomStates(prev => ({
            ...prev,
            [room.key]: { ...prev[room.key], landlordPhotos: [...prev[room.key].landlordPhotos, newMeta], newPhotoUri: null, newPhotoName: '' },
          }));
        }
      }
      Alert.alert('Lagret', 'Utkastet er lagret.');
    } catch (e: any) {
      Alert.alert('Feil', e.message ?? 'Noe gikk galt.');
    } finally { setSaving(false); }
  };

  const lockReport = async () => {
    if (!selectedReport) return;
    Alert.alert('Lås rapport', 'Når rapporten låses kan ingen gjøre flere endringer. Begge parter har da et felles dokument.', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Lås rapport', onPress: async () => {
        await supabase.from('inspection_reports').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', selectedReport.id);
        setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, status: 'locked' } : r));
        setSelectedReport(prev => prev ? { ...prev, status: 'locked' } : prev);
      }},
    ]);
  };

  const deleteReport = (report: InspectionReportRow) => {
    Alert.alert('Slett rapport', 'Er du sikker? Dette kan ikke angres.', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett', style: 'destructive', onPress: async () => {
        await supabase.from('inspection_reports').delete().eq('id', report.id);
        setReports(prev => prev.filter(r => r.id !== report.id));
        setView('list');
        setSelectedReport(null);
        setRoomStates(emptyRooms());
      }},
    ]);
  };

  const reportTypeLabel = (type: string) => type === 'move_in' ? 'Innflyttingsrapport' : 'Utflyttingsrapport';
  const statusInfo = (status: string) => ({
    draft:            { label: 'Utkast',           color: '#6B7280' },
    sent_to_tenant:   { label: 'Hos leietaker',     color: '#3B82F6' },
    tenant_responded: { label: 'Leietaker svart',   color: '#F59E0B' },
    locked:           { label: 'Låst',              color: '#10B981' },
  }[status] ?? { label: status, color: '#6B7280' });

  // ─── CHECKLIST ────────────────────────────────────────────────────
  if (view === 'checklist' && selectedReport) {
    const isDraft = selectedReport.status === 'draft';
    const isSentToTenant = selectedReport.status === 'sent_to_tenant';
    const tenantResponded = selectedReport.status === 'tenant_responded';
    const isLocked = selectedReport.status === 'locked';
    const canEdit = isDraft;
    const st = statusInfo(selectedReport.status);
    const anyFilled = ROOMS.some(r => roomStates[r.key].condition !== null || roomStates[r.key].newPhotoUri);

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => {
            if (isDraft && anyFilled) {
              Alert.alert('Lagre utkast?', '', [
                { text: 'Ikke lagre', style: 'destructive', onPress: () => { setView('list'); setSelectedReport(null); setRoomStates(emptyRooms()); } },
                { text: 'Lagre utkast', onPress: async () => { await saveDraft(); setView('list'); setSelectedReport(null); } },
                { text: 'Avbryt', style: 'cancel' },
              ]);
            } else { setView('list'); setSelectedReport(null); setRoomStates(emptyRooms()); }
          }} style={s.back}>
            <Ionicons name="chevron-back" size={24} color={BLUE} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.title}>{reportTypeLabel(selectedReport.type)}</Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, { backgroundColor: st.color }]} />
              <Text style={[s.statusLabel, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>
          {isDraft && (
            <TouchableOpacity onPress={() => deleteReport(selectedReport)} style={s.trashBtn}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>

        {loadingChecklist ? <ActivityIndicator style={{ flex: 1 }} color={BLUE} /> : (
          <ScrollView contentContainerStyle={s.checklistBody}>

            {isLocked && (
              <View style={s.lockedBanner}>
                <Ionicons name="lock-closed" size={18} color="#10B981" />
                <Text style={s.lockedBannerText}>
                  Rapport låst · begge parter har godkjent
                  {(selectedReport as any).locked_at ? ` · ${new Date((selectedReport as any).locked_at).toLocaleDateString('nb-NO')}` : ''}
                </Text>
              </View>
            )}

            {tenantResponded && (
              <View style={s.tenantRespondedBanner}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#F59E0B" />
                <Text style={s.tenantRespondedText}>Leietakeren har svart. Gjennomgå kommentarene nedenfor og lås rapporten.</Text>
              </View>
            )}

            {isSentToTenant && (
              <View style={s.waitingBanner}>
                <Ionicons name="time-outline" size={18} color="#3B82F6" />
                <Text style={s.waitingText}>Venter på leietakerens gjennomgang og signatur.</Text>
              </View>
            )}

            {ROOMS.map(room => {
              const rs = roomStates[room.key];
              const hasTenantFeedback = rs.tenantComment || rs.tenantPhotos.length > 0;
              const notesOpen = expandedNotes === room.key;

              return (
                <View key={room.key} style={s.roomCard}>
                  {/* Room header */}
                  <View style={s.roomHeader}>
                    <Ionicons name={room.icon as any} size={20} color={BLUE} />
                    <Text style={s.roomLabel}>{room.label}</Text>
                  </View>

                  {/* Condition + camera row */}
                  <View style={s.condRow}>
                    {CONDITIONS.map(c => {
                      const active = rs.condition === c.key;
                      return (
                        <TouchableOpacity key={c.key}
                          style={[s.condBtn, active && { backgroundColor: c.bg, borderColor: c.color }]}
                          onPress={() => canEdit && setCondition(room.key, c.key)}
                          disabled={!canEdit}>
                          <Text style={[s.condBtnText, active && { color: c.color, fontWeight: '700' }]}>{c.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {canEdit && (
                      <TouchableOpacity style={s.cameraBtn} onPress={() => pickPhoto(room.key)}>
                        <Ionicons name="camera-outline" size={20} color="#6B7280" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Notes toggle */}
                  {canEdit && (
                    <TouchableOpacity style={s.notesToggle} onPress={() => setExpandedNotes(notesOpen ? null : room.key)}>
                      <Ionicons name={notesOpen ? 'chevron-up' : 'create-outline'} size={14} color="#6B7280" />
                      <Text style={s.notesToggleText}>{rs.notes ? rs.notes : 'Legg til kommentar'}</Text>
                    </TouchableOpacity>
                  )}
                  {notesOpen && canEdit && (
                    <TextInput
                      style={s.notesInput}
                      placeholder="Beskriv tilstand, eksisterende skader eller slitasje…"
                      placeholderTextColor="#9CA3AF"
                      multiline autoFocus
                      value={rs.notes}
                      onChangeText={v => setRoomStates(prev => ({ ...prev, [room.key]: { ...prev[room.key], notes: v } }))}
                    />
                  )}

                  {/* Landlord notes (read-only) */}
                  {!canEdit && rs.notes ? (
                    <View style={s.notesReadOnly}>
                      <Text style={s.notesReadOnlyLabel}>Utleiers kommentar</Text>
                      <Text style={s.notesReadOnlyText}>{rs.notes}</Text>
                    </View>
                  ) : null}

                  {/* Landlord photos */}
                  {(rs.landlordPhotos.length > 0 || rs.newPhotoUri) && (
                    <View style={s.photoSection}>
                      <Text style={s.photoSectionLabel}>Bilder</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {rs.landlordPhotos.map(p => p.url ? (
                          <TouchableOpacity key={p.id} onPress={() => setPreviewUrl(p.url)}>
                            <Image source={{ uri: p.url }} style={s.photoThumb} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : null)}
                        {rs.newPhotoUri && (
                          <View style={s.photoThumbWrap}>
                            <TouchableOpacity onPress={() => setPreviewUrl(rs.newPhotoUri)}>
                              <Image source={{ uri: rs.newPhotoUri }} style={s.photoThumb} resizeMode="cover" />
                            </TouchableOpacity>
                            {canEdit && (
                              <TouchableOpacity style={s.removePhotoBtn} onPress={() => removeNewPhoto(room.key)}>
                                <Ionicons name="close-circle" size={18} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  )}

                  {/* Tenant feedback */}
                  {hasTenantFeedback && (
                    <View style={s.tenantFeedback}>
                      <View style={s.tenantFeedbackHeader}>
                        <Ionicons name="person-outline" size={13} color="#7C3AED" />
                        <Text style={s.tenantFeedbackLabel}>Leietakers tilbakemelding</Text>
                      </View>
                      {rs.tenantComment ? (
                        <Text style={s.tenantComment}>{rs.tenantComment}</Text>
                      ) : null}
                      {rs.tenantPhotos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          {rs.tenantPhotos.map(p => p.url ? (
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

            {/* Bottom actions */}
            {isDraft && (
              <View style={s.actions}>
                <TouchableOpacity style={s.sendBtn} onPress={saveAndSend} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <><Ionicons name="send-outline" size={18} color="#fff" /><Text style={s.sendBtnText}>Send til leietaker</Text></>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={s.draftBtn} onPress={saveDraft} disabled={saving}>
                  <Text style={s.draftBtnText}>Lagre utkast</Text>
                </TouchableOpacity>
              </View>
            )}

            {tenantResponded && (
              <TouchableOpacity style={s.lockBtn} onPress={lockReport}>
                <Ionicons name="lock-closed-outline" size={18} color="#fff" />
                <Text style={s.lockBtnText}>Lås og ferdigstill rapport</Text>
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
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={24} color={BLUE} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Rapporter</Text>
          <Text style={s.subtitle}>Enhet {unit_number}</Text>
        </View>
      </View>

      {loadingReports ? <ActivityIndicator style={{ flex: 1 }} color={BLUE} /> : (
        <ScrollView contentContainerStyle={s.listBody}>
          <View style={s.newReportRow}>
            <TouchableOpacity style={[s.newReportBtn, { backgroundColor: '#EBF4FF', borderColor: '#BFDBFE' }]} onPress={() => startNewReport('move_in')}>
              <Ionicons name="log-in-outline" size={24} color={BLUE} />
              <Text style={[s.newReportBtnText, { color: BLUE }]}>Innflyttings-{'\n'}rapport</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.newReportBtn, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]} onPress={() => startNewReport('move_out')}>
              <Ionicons name="log-out-outline" size={24} color="#D97706" />
              <Text style={[s.newReportBtnText, { color: '#D97706' }]}>Utflyttings-{'\n'}rapport</Text>
            </TouchableOpacity>
          </View>

          {reports.length > 0 && <Text style={s.sectionLabel}>Tidligere rapporter</Text>}
          {reports.map(report => {
            const st = statusInfo(report.status);
            return (
              <TouchableOpacity key={report.id} style={s.reportCard} onPress={() => loadChecklist(report)}>
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
          })}

          {reports.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="clipboard-outline" size={44} color="#D1D5DB" />
              <Text style={s.emptyTitle}>Ingen rapporter ennå</Text>
              <Text style={s.emptySub}>Opprett en rapport for å dokumentere tilstanden ved inn- eller utflytting.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 8 },
  back: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  trashBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  // List
  listBody: { padding: 20, gap: 12 },
  newReportRow: { flexDirection: 'row', gap: 12 },
  newReportBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 16, paddingVertical: 20 },
  newReportBtnText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginTop: 4 },
  reportCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  reportIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  reportInfo: { flex: 1, gap: 2 },
  reportTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  reportDate: { fontSize: 12, color: '#6B7280' },
  statusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  emptySub: { color: '#6B7280', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  // Checklist
  checklistBody: { padding: 16, gap: 10, paddingBottom: 40 },
  lockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECFDF5', borderRadius: 14, padding: 14 },
  lockedBannerText: { color: '#065F46', fontWeight: '600', fontSize: 13, flex: 1 },
  tenantRespondedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14 },
  tenantRespondedText: { color: '#92400E', fontSize: 13, flex: 1, lineHeight: 18 },
  waitingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14 },
  waitingText: { color: '#1E40AF', fontSize: 13, flex: 1 },
  roomCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  roomHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomLabel: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  condRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  condBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, backgroundColor: '#F9FAFB' },
  condBtnText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  cameraBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  notesToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesToggleText: { fontSize: 13, color: '#6B7280' },
  notesInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, color: '#1A1A2E', backgroundColor: '#F9FAFB', minHeight: 68, textAlignVertical: 'top' },
  notesReadOnly: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, gap: 3 },
  notesReadOnlyLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase' },
  notesReadOnlyText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  photoSection: { gap: 6 },
  photoSectionLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase' },
  photoThumbWrap: { position: 'relative', marginRight: 8 },
  photoThumb: { width: 72, height: 72, borderRadius: 10, marginRight: 8 },
  removePhotoBtn: { position: 'absolute', top: -6, right: 2 },
  tenantFeedback: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: '#DDD6FE' },
  tenantFeedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  tenantFeedbackLabel: { fontSize: 11, fontWeight: '700', color: '#7C3AED', textTransform: 'uppercase' },
  tenantComment: { fontSize: 13, color: '#4C1D95', lineHeight: 18 },
  actions: { gap: 10, marginTop: 6 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  draftBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  draftBtnText: { color: '#6B7280', fontWeight: '500', fontSize: 14 },
  lockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, marginTop: 6 },
  lockBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fullPreview: { width: '95%', height: '80%' },
  closePreview: { position: 'absolute', top: 56, right: 20 },
});
