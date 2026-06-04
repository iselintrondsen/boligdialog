import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { DocumentRow, DocumentCategory } from '@/lib/types';

const BLUE = '#1A56A0';

const CATEGORIES: { key: DocumentCategory; label: string; icon: string; color: string }[] = [
  { key: 'contract',  label: 'Kontrakt',   icon: 'document-text-outline', color: '#1A56A0' },
  { key: 'rules',     label: 'Husregler',  icon: 'list-outline',           color: '#7C3AED' },
  { key: 'receipt',   label: 'Kvittering', icon: 'receipt-outline',        color: '#10B981' },
  { key: 'other',     label: 'Annet',      icon: 'attach-outline',         color: '#6B7280' },
];

type PendingFile = { uri: string; name: string; mimeType: string };

function isImage(name: string) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(name); }

export default function TenantDocumentsScreen() {
  const { user } = useAuthStore();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  const fetchDocs = useCallback(async (uid: string) => {
    const { data } = await supabase.from('documents').select('*').eq('unit_id', uid).order('created_at', { ascending: false });
    setDocs((data as DocumentRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from('units').select('id').eq('tenant_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.id) { setUnitId(data.id); fetchDocs(data.id).finally(() => setLoading(false)); }
      else setLoading(false);
    });
  }, [user, fetchDocs]);

  const uploadWithCategory = async (category: DocumentCategory) => {
    if (!pendingFile || !unitId) return;
    setShowCatModal(false);
    setUploading(true);
    try {
      const blob = await (await fetch(pendingFile.uri)).blob();
      const path = `${user!.id}/${unitId}/${Date.now()}_${pendingFile.name}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: pendingFile.mimeType });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('documents').insert({
        unit_id: unitId, uploaded_by: user!.id,
        name: pendingFile.name, category,
        storage_path: path, file_size: blob.size,
      });
      if (dbErr) throw dbErr;
      await fetchDocs(unitId);
    } catch (e: any) {
      Alert.alert('Feil', e.message ?? 'Kunne ikke laste opp filen.');
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setPendingFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' });
    setShowCatModal(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Tillatelse kreves', 'Gi tilgang til bildebiblioteket i innstillinger.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setPendingFile({ uri: a.uri, name: a.fileName ?? `bilde_${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' });
    setShowCatModal(true);
  };

  const showUploadOptions = () => {
    Alert.alert('Last opp', 'Velg type', [
      { text: 'Bilde fra bibliotek', onPress: pickImage },
      { text: 'Fil / dokument', onPress: pickDocument },
      { text: 'Avbryt', style: 'cancel' },
    ]);
  };

  const openDoc = async (doc: DocumentRow) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60);
    if (error || !data) { Alert.alert('Feil', 'Kunne ikke åpne filen.'); return; }
    if (isImage(doc.name)) { setPreviewUrl(data.signedUrl); setPreviewVisible(true); }
    else Alert.alert(doc.name, `Størrelse: ${(doc.file_size / 1024).toFixed(1)} KB`);
  };

  const handleDelete = (doc: DocumentRow) => {
    Alert.alert('Slett dokument', `Vil du slette "${doc.name}"? Dette kan ikke angres.`, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett', style: 'destructive', onPress: async () => {
        await supabase.storage.from('documents').remove([doc.storage_path]);
        await supabase.from('documents').delete().eq('id', doc.id);
        setDocs(prev => prev.filter(d => d.id !== doc.id));
      }},
    ]);
  };

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

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <FlatList
        data={docs}
        keyExtractor={d => d.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Text style={s.sectionTitle}>Dokumenter ({docs.length})</Text>
            <TouchableOpacity style={s.uploadBtn} onPress={showUploadOptions} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="cloud-upload-outline" size={16} color="#fff" /><Text style={s.uploadBtnText}>Last opp</Text></>}
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
            <Text style={s.emptyTitle}>Ingen dokumenter ennå</Text>
            <Text style={s.emptySub}>Last opp leiekontrakt, kvitteringer eller bilder.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const cat = CATEGORIES.find(c => c.key === item.category) ?? CATEGORIES[3];
          return (
            <TouchableOpacity style={s.card} onPress={() => openDoc(item)}>
              <View style={[s.iconWrap, { backgroundColor: cat.color + '18' }]}>
                <Ionicons name={(isImage(item.name) ? 'image-outline' : cat.icon) as any} size={22} color={cat.color} />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cardMeta}>{cat.label} · {(item.file_size / 1024).toFixed(1)} KB · {new Date(item.created_at).toLocaleDateString('nb-NO')}</Text>
              </View>
              {item.uploaded_by === user?.id && (
                <TouchableOpacity onPress={() => handleDelete(item)} style={s.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Category picker modal */}
      <Modal visible={showCatModal} transparent animationType="slide">
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => { setShowCatModal(false); setPendingFile(null); }}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Velg kategori</Text>
            {pendingFile && <Text style={s.sheetFile} numberOfLines={1}>{pendingFile.name}</Text>}
            <View style={s.catList}>
              {CATEGORIES.map(cat => (
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

      {/* Image preview */}
      <Modal visible={previewVisible} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPreviewVisible(false)}>
          {previewUrl && <Image source={{ uri: previewUrl }} style={s.previewImg} resizeMode="contain" />}
          <TouchableOpacity style={s.closePreview} onPress={() => setPreviewVisible(false)}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  list: { padding: 20, gap: 12 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A2E' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  uploadBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, gap: 3 },
  cardName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  cardMeta: { fontSize: 12, color: '#6B7280' },
  deleteBtn: { padding: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  emptySub: { color: '#6B7280', textAlign: 'center', fontSize: 14, lineHeight: 20 },
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
});
