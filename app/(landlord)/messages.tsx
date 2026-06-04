import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { MessageRow } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';

const BLUE = '#1A56A0';

type UnitOption = { id: string; unit_number: string; address: string; unread: number };

export default function LandlordMessagesScreen() {
  const { user } = useAuthStore();
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const listRef = useRef<FlatList>(null);

  const fetchUnits = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('units')
      .select(`id, unit_number, properties!inner(address, landlord_id)`)
      .eq('properties.landlord_id', user.id) as any;
    if (!data) return;

    const unitIds = data.map((u: any) => u.id);
    const { data: unreadData } = await supabase
      .from('messages')
      .select('unit_id')
      .in('unit_id', unitIds)
      .neq('sender_id', user.id)
      .is('read_at', null) as any;

    const unreadByUnit: Record<string, number> = {};
    for (const m of (unreadData ?? [])) {
      unreadByUnit[m.unit_id] = (unreadByUnit[m.unit_id] ?? 0) + 1;
    }

    const mapped: UnitOption[] = data.map((u: any) => ({
      id: u.id,
      unit_number: u.unit_number,
      address: u.properties?.address ?? '',
      unread: unreadByUnit[u.id] ?? 0,
    }));
    setUnits(mapped);
    if (!selectedUnit && mapped.length > 0) setSelectedUnit(mapped[0]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  const markAsRead = useCallback(async (unitId: string) => {
    if (!user) return;
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('unit_id', unitId)
      .neq('sender_id', user.id)
      .is('read_at', null);
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, unread: 0 } : u));
    if (selectedUnit?.id === unitId) setSelectedUnit(prev => prev ? { ...prev, unread: 0 } : prev);
  }, [user, selectedUnit]);

  const fetchMessages = useCallback(async (unitId: string) => {
    const { data } = await supabase
      .from('messages').select('*').eq('unit_id', unitId).order('created_at', { ascending: true });
    if (data) setMessages(data as MessageRow[]);
    await markAsRead(unitId);
  }, [markAsRead]);

  useEffect(() => {
    if (!selectedUnit) return;
    fetchMessages(selectedUnit.id);
    const channel = supabase.channel(`landlord-messages:${selectedUnit.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `unit_id=eq.${selectedUnit.id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as MessageRow]);
          markAsRead(selectedUnit.id);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedUnit?.id]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const handleSelectUnit = (u: UnitOption) => {
    setSelectedUnit(u);
    setShowDropdown(false);
    fetchMessages(u.id);
  };

  const sendMessage = async () => {
    if (!text.trim() || !selectedUnit || sending) return;
    setSending(true);
    await supabase.from('messages').insert({ unit_id: selectedUnit.id, sender_id: user!.id, content: text.trim(), image_url: null, read_at: null });
    setText('');
    setSending(false);
  };

  const totalUnread = units.reduce((sum, u) => sum + u.unread, 0);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={BLUE} />;

  if (units.length === 0) return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.empty}>
        <Ionicons name="chatbubble-outline" size={48} color="#D1D5DB" />
        <Text style={s.emptyTitle}>Ingen enheter ennå</Text>
        <Text style={s.emptySub}>Legg til enheter og inviter leietakere for å starte samtaler.</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.header}>
        <TouchableOpacity style={s.dropdown} onPress={() => setShowDropdown(v => !v)} activeOpacity={0.85}>
          <View style={s.dropdownInner}>
            <View style={s.dropdownLeft}>
              <Text style={s.dropdownText} numberOfLines={1}>
                {selectedUnit ? `${selectedUnit.address} · Enhet ${selectedUnit.unit_number}` : 'Velg enhet'}
              </Text>
            </View>
            <View style={s.dropdownRight}>
              {(selectedUnit?.unread ?? 0) > 0 && (
                <View style={s.dropdownBadge}>
                  <Text style={s.dropdownBadgeText}>{selectedUnit!.unread}</Text>
                </View>
              )}
              <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={BLUE} />
            </View>
          </View>

          {showDropdown && (
            <View style={s.dropdownMenu}>
              {units.map(u => (
                <TouchableOpacity key={u.id}
                  style={[s.dropdownItem, selectedUnit?.id === u.id && s.dropdownItemActive]}
                  onPress={() => handleSelectUnit(u)}>
                  <View style={s.dropdownItemLeft}>
                    {u.unread > 0 && <View style={s.dot} />}
                    <View>
                      <Text style={[s.dropdownItemText, selectedUnit?.id === u.id && s.dropdownItemTextActive]}>
                        {u.address}
                      </Text>
                      <Text style={s.dropdownItemSub}>Enhet {u.unit_number}</Text>
                    </View>
                  </View>
                  <View style={s.dropdownItemRight}>
                    {u.unread > 0 && (
                      <View style={s.itemBadge}>
                        <Text style={s.itemBadgeText}>{u.unread}</Text>
                      </View>
                    )}
                    {selectedUnit?.id === u.id && <Ionicons name="checkmark" size={16} color={BLUE} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList ref={listRef} data={messages} keyExtractor={i => i.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={<View style={s.emptyChat}><Text style={s.emptyChatText}>Ingen meldinger ennå.</Text></View>}
          renderItem={({ item }) => {
            const isMe = item.sender_id === user?.id;
            return (
              <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                <Text style={[s.bubbleText, isMe ? s.bubbleTextMe : s.bubbleTextThem]}>{item.content}</Text>
                <Text style={[s.bubbleTime, !isMe && { color: '#9CA3AF' }]}>
                  {new Date(item.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
        />
        <View style={s.inputRow}>
          <TextInput style={s.input} placeholder="Skriv en melding..." placeholderTextColor="#9CA3AF"
            value={text} onChangeText={setText} multiline />
          <TouchableOpacity style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]} onPress={sendMessage} disabled={!text.trim() || sending}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', zIndex: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
  unreadBadge: { backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, minWidth: 24, alignItems: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dropdown: { position: 'relative' },
  dropdownInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EBF4FF', borderWidth: 1.5, borderColor: BLUE, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  dropdownLeft: { flex: 1 },
  dropdownText: { fontSize: 15, color: BLUE, fontWeight: '600' },
  dropdownRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropdownBadge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
  dropdownBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dropdownMenu: { position: 'absolute', top: 58, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, elevation: 10, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F5F7FA' },
  dropdownItemActive: { backgroundColor: '#EBF4FF' },
  dropdownItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  dropdownItemText: { fontSize: 15, color: '#1A1A2E', fontWeight: '500' },
  dropdownItemTextActive: { color: BLUE, fontWeight: '700' },
  dropdownItemSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  dropdownItemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemBadge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
  itemBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  list: { padding: 16, gap: 8 },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: BLUE, borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  bubbleText: { fontSize: 15 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: '#1A1A2E' },
  bubbleTime: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4, textAlign: 'right' },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  input: { flex: 1, backgroundColor: '#F5F7FA', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1A1A2E', maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },
  emptySub: { color: '#6B7280', textAlign: 'center', fontSize: 14 },
  emptyChat: { alignItems: 'center', paddingTop: 60 },
  emptyChatText: { color: '#9CA3AF', fontSize: 14 },
});
