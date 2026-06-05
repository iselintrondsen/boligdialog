import { useState, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { uploadToStorage } from '@/lib/uploadFile';
import { DocumentCategory, DocumentRow } from '@/lib/types';
import { useAuthStore } from '@/stores/authStore';

const BLUE = '#1A56A0';

const DOC_CATEGORIES: { key: DocumentCategory; label: string; icon: string; color: string }[] = [
  { key: 'contract', label: 'Kontrakt',   icon: 'document-text-outline', color: '#1A56A0' },
  { key: 'rules',    label: 'Husregler',  icon: 'list-outline',           color: '#7C3AED' },
  { key: 'receipt',  label: 'Kvittering', icon: 'receipt-outline',        color: '#10B981' },
  { key: 'other',    label: 'Annet',      icon: 'attach-outline',         color: '#6B7280' },
];

function isImage(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|tif|svg)$/i.test(name);
}

interface Props {
  visible: boolean;
  onClose: () => void;
  unitId: string;
  unitNumber: string;
}

export function DocsModal({ visible, onClose, unitId, unitNumber }: Props) {
  const { user } = useAuthStore();
  const [docs, setDocs]           = useState<DocumentRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('documents').select('*')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false });
    setDocs((data as DocumentRow[]) ?? []);
    setLoading(false);
  }, [unitId]);

  // ── Upload ──────────────────────────────────────────────────────────────────

  const upload = async (uri: string, name: string, mimeType: string, category: DocumentCategory) => {
    setUploading(true);
    try {
      const path = `${user!.id}/${unitId}/${Date.now()}_${name}`;
      const { error } = await uploadToStorage('documents', path, uri, mimeType, name);
      if (error) throw error;
      await supabase.from('documents').insert({
        unit_id: unitId, uploaded_by: user!.id,
        name, category, storage_path: path, file_size: 0,
      });
      await fetchDocs();
    } catch (e: any) {
      Alert.alert('Feil', e.message ?? 'Kunne ikke laste opp.');
    } finally {
      setUploading(false);
    }
  };

  const pickDoc = async (category: DocumentCategory) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'image/*', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    await upload(a.uri, a.name, a.mimeType ?? 'application/octet-stream', category);
  };

  const pickImage = async (category: DocumentCategory) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Tillatelse kreves', 'Gi tilgang til bildebiblioteket i innstillinger.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const ext = a.mimeType === 'image/heic' ? 'heic' : (a.mimeType?.split('/')[1] ?? 'jpg');
    await upload(a.uri, a.fileName ?? `bilde_${Date.now()}.${ext}`, a.mimeType ?? 'image/jpeg', category);
  };

  const takePhoto = async (category: DocumentCategory) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Tillatelse kreves', 'Gi tilgang til kameraet i innstillinger.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85, mediaTypes: 'images' });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const ext = a.mimeType?.split('/')[1] ?? 'jpg';
    await upload(a.uri, `foto_${Date.now()}.${ext}`, a.mimeType ?? 'image/jpeg', category);
  };

  // Category selected → show source picker via Alert (works inside modal)
  const onCategorySelected = (category: DocumentCategory) => {
    setShowCatPicker(false);
    Alert.alert('Velg fil', 'Hvor vil du hente filen fra?', [
      { text: 'Ta bilde med kamera',       onPress: () => takePhoto(category) },
      { text: 'Velg fra bildebibliotek',   onPress: () => pickImage(category) },
      { text: 'Velg fil (PDF, Word, Excel)', onPress: () => pickDoc(category) },
      { text: 'Avbryt', style: 'cancel' },
    ]);
  };

  // ── Doc actions ─────────────────────────────────────────────────────────────

  const openDoc = async (doc: DocumentRow) => {
    const { data, error } = await supabase.storage
      .from('documents').createSignedUrl(doc.storage_path, 60);
    if (error || !data) { Alert.alert('Feil', 'Kunne ikke åpne filen.'); return; }
    if (isImage(doc.name)) {
      setPreviewUrl(data.signedUrl);
    } else {
      Alert.alert(doc.name, `Kategori: ${DOC_CATEGORIES.find(c => c.key === doc.category)?.label ?? doc.category}`);
    }
  };

  const deleteDoc = (doc: DocumentRow) => {
    Alert.alert('Slett dokument', `Vil du slette "${doc.name}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Slett', style: 'destructive', onPress: async () => {
        await supabase.storage.from('documents').remove([doc.storage_path]);
        await supabase.from('documents').delete().eq('id', doc.id);
        setDocs(prev => prev.filter(d => d.id !== doc.id));
      }},
    ]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={fetchDocs}
    >
      {/* Outer container — fills the sheet */}
      <SafeAreaView style={s.safe}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.cancel}>Lukk</Text>
          </TouchableOpacity>
          <Text style={s.title}>Dokumenter – {unitNumber}</Text>
          <TouchableOpacity
            onPress={() => setShowCatPicker(true)}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color={BLUE} size="small" />
              : <Text style={s.uploadBtn}>+ Last opp</Text>}
          </TouchableOpacity>
        </View>

        {/* Doc list */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
        ) : docs.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-outline" size={48} color="#D1D5DB" />
            <Text style={s.emptyText}>Ingen dokumenter lastet opp ennå.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.list}>
            {docs.map(doc => {
              const cat = DOC_CATEGORIES.find(c => c.key === doc.category) ?? DOC_CATEGORIES[3];
              return (
                <TouchableOpacity key={doc.id} style={s.docRow} onPress={() => openDoc(doc)}>
                  <View style={[s.docIcon, { backgroundColor: cat.color + '18' }]}>
                    <Ionicons name={(isImage(doc.name) ? 'image-outline' : cat.icon) as any} size={20} color={cat.color} />
                  </View>
                  <View style={s.docInfo}>
                    <Text style={s.docName} numberOfLines={1}>{doc.name}</Text>
                    <Text style={s.docMeta}>{cat.label}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => deleteDoc(doc)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Category picker — absolute overlay INSIDE the sheet, no nested Modal ── */}
        {showCatPicker && (
          <TouchableWithoutFeedback onPress={() => setShowCatPicker(false)}>
            <View style={s.catBackdrop}>
              <TouchableWithoutFeedback>
                <View style={s.catSheet}>
                  <View style={s.handle} />
                  <Text style={s.sheetTitle}>Velg kategori</Text>
                  {DOC_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat.key}
                      style={s.catRow}
                      onPress={() => onCategorySelected(cat.key)}
                    >
                      <View style={[s.catIcon, { backgroundColor: cat.color + '18' }]}>
                        <Ionicons name={cat.icon as any} size={22} color={cat.color} />
                      </View>
                      <Text style={s.catLabel}>{cat.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        )}

        {/* ── Image preview — absolute overlay INSIDE the sheet ── */}
        {previewUrl && (
          <TouchableOpacity
            style={s.previewOverlay}
            activeOpacity={1}
            onPress={() => setPreviewUrl(null)}
          >
            <Image source={{ uri: previewUrl }} style={s.previewImg} resizeMode="contain" />
            <Ionicons name="close-circle" size={36} color="#fff" style={s.closeIcon} />
          </TouchableOpacity>
        )}

      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:        { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  cancel:       { color: '#6B7280', fontSize: 16 },
  uploadBtn:    { color: BLUE, fontSize: 16, fontWeight: '600' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText:    { color: '#6B7280', fontSize: 14, textAlign: 'center' },
  list:         { padding: 16, gap: 10 },
  docRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14 },
  docIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docInfo:      { flex: 1 },
  docName:      { fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  docMeta:      { fontSize: 12, color: '#6B7280', marginTop: 2 },
  // Category picker overlay (no nested Modal)
  catBackdrop:  { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  catSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, gap: 10 },
  handle:       { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitle:   { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  catRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14 },
  catIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catLabel:     { flex: 1, fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  // Image preview overlay
  previewOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  previewImg:   { width: '100%', height: '80%' },
  closeIcon:    { position: 'absolute', top: 20, right: 20 },
});
