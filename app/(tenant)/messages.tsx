import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { MessageRow } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';

const BLUE = '#1A56A0';

export default function TenantMessagesScreen() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const fetchMessages = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('messages').select('*').eq('unit_id', uid).order('created_at', { ascending: true });
    if (data) setMessages(data as MessageRow[]);
  }, []);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const { data } = await supabase.from('units').select('id').eq('tenant_id', user.id).maybeSingle();
      if (data) {
        setUnitId(data.id);
        await fetchMessages(data.id);
      }
      setLoading(false);
    };
    init();
  }, [user]);

  useEffect(() => {
    if (!unitId) return;
    const channel = supabase.channel(`messages:${unitId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `unit_id=eq.${unitId}` },
        (payload) => setMessages(prev => [...prev, payload.new as MessageRow]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [unitId]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const sendMessage = async () => {
    if (!text.trim() || !unitId || sending) return;
    setSending(true);
    await supabase.from('messages').insert({ unit_id: unitId, sender_id: user!.id, content: text.trim(), image_url: null, read_at: null });
    setText('');
    setSending(false);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={BLUE} />;

  if (!unitId) return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.empty}>
        <Ionicons name="chatbubble-outline" size={48} color="#D1D5DB" />
        <Text style={s.emptyTitle}>Ingen aktiv leiekontrakt</Text>
        <Text style={s.emptySub}>Meldinger blir tilgjengelig når du er koblet til en enhet.</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <FlatList ref={listRef} data={messages} keyExtractor={i => i.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={<View style={s.emptyChat}><Text style={s.emptyChatText}>Ingen meldinger ennå. Si hei til utleier!</Text></View>}
          renderItem={({ item }) => {
            const isMe = item.sender_id === user?.id;
            return (
              <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                <Text style={[s.bubbleText, isMe ? s.bubbleTextMe : s.bubbleTextThem]}>{item.content}</Text>
                <Text style={s.bubbleTime}>{new Date(item.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            );
          }}
        />
        <View style={s.inputRow}>
          <TextInput style={s.input} placeholder="Skriv en melding..." placeholderTextColor="#9CA3AF"
            value={text} onChangeText={setText} multiline returnKeyType="send" onSubmitEditing={sendMessage} />
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
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A2E' },
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
