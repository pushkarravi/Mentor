import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "../lib/api";
import type { Message, ReasoningLens, ClaimAnalysis } from "../lib/types";

const LENS_LABELS: { key: ReasoningLens; label: string; description: string }[] = [
  { key: "coach", label: "Coach", description: "Balanced default" },
  { key: "challenger", label: "Challenge Me", description: "Test assumptions" },
  { key: "decision_advisor", label: "Help Me Decide", description: "Structured analysis" },
];

const EPISTEMIC_COLORS: Record<string, string> = {
  fact: "#2d6a4f",
  interpretation: "#b5651d",
  hypothesis: "#6a4c93",
  emotion: "#c0392b",
  action: "#1d6fa3",
  assumption: "#8b8b8b",
};

export default function ChatScreen() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [lens, setLens] = useState<ReasoningLens>("coach");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState<ClaimAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    (async () => {
      try {
        const convs = await api.listConversations();
        if (convs.length > 0) {
          setConversationId(convs[0].id);
          setMessages(convs[0].messages);
        } else {
          const conv = await api.createConversation("Coaching Session");
          setConversationId(conv.id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load conversation");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !conversationId || sending) return;

    const content = input.trim();
    setInput("");
    setSending(true);
    setError(null);

    // Optimistic add of user message
    const optimisticUserMsg: Message = {
      id: `temp_${Date.now()}`,
      conversationId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const result = await api.sendMessage(conversationId, content, lens);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        result.userMessage,
        result.assistantMessage,
      ]);
      setShowAnalysis(result.claimAnalysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      // Remove optimistic message on failure
      setMessages((prev) =>
        prev.filter((m) => m.id !== optimisticUserMsg.id),
      );
    } finally {
      setSending(false);
    }
  }, [input, conversationId, sending, lens]);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.messageRow,
          isUser ? styles.messageRowUser : styles.messageRowAssistant,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ]}
        >
          <Text style={isUser ? styles.textUser : styles.textAssistant}>
            {item.content}
          </Text>
        </View>
        {item.claimAnalysis && !isUser && (
          <Pressable
            style={styles.analysisButton}
            onPress={() => setShowAnalysis(item.claimAnalysis!)}
          >
            <Text style={styles.analysisButtonText}>View Analysis</Text>
          </Pressable>
        )}
      </View>
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c3e50" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Lens selector */}
      <View style={styles.lensBar}>
        {LENS_LABELS.map((l) => (
          <Pressable
            key={l.key}
            style={[
              styles.lensButton,
              lens === l.key && styles.lensButtonActive,
            ]}
            onPress={() => setLens(l.key)}
          >
            <Text
              style={[
                styles.lensLabel,
                lens === l.key && styles.lensLabelActive,
              ]}
            >
              {l.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptyText}>
              Describe a real career situation. The system will separate
              facts from interpretations, connect to evidence, and help you
              think through next steps.
            </Text>
          </View>
        }
      />

      {/* Claim analysis panel */}
      {showAnalysis && (
        <View style={styles.analysisPanel}>
          <View style={styles.analysisHeader}>
            <Text style={styles.analysisTitle}>Claim Analysis</Text>
            <Pressable onPress={() => setShowAnalysis(null)}>
              <Text style={styles.analysisClose}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.analysisSummary}>{showAnalysis.summary}</Text>
          {showAnalysis.components.map((c, i) => (
            <View key={i} style={styles.analysisComponent}>
              <View
                style={[
                  styles.analysisTag,
                  { backgroundColor: EPISTEMIC_COLORS[c.type] ?? "#666" },
                ]}
              >
                <Text style={styles.analysisTagText}>
                  {c.type.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.analysisText}>{c.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe a career situation..."
          placeholderTextColor="#999"
          multiline
          editable={!sending}
        />
        <Pressable
          style={[
            styles.sendButton,
            (!input.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f7",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  lensBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5ea",
    gap: 8,
  },
  lensButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f5",
  },
  lensButtonActive: {
    backgroundColor: "#2c3e50",
  },
  lensLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  lensLabelActive: {
    color: "#fff",
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  messageRow: {
    marginBottom: 16,
    maxWidth: "85%",
  },
  messageRowUser: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  messageRowAssistant: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    borderRadius: 12,
    padding: 14,
  },
  bubbleUser: {
    backgroundColor: "#2c3e50",
  },
  bubbleAssistant: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  textUser: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
  },
  textAssistant: {
    color: "#1a1a2e",
    fontSize: 16,
    lineHeight: 22,
  },
  analysisButton: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  analysisButtonText: {
    fontSize: 13,
    color: "#6a4c93",
    fontWeight: "600",
  },
  analysisPanel: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e5ea",
    padding: 16,
    maxHeight: 280,
  },
  analysisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  analysisTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a2e",
  },
  analysisClose: {
    fontSize: 14,
    color: "#999",
  },
  analysisSummary: {
    fontSize: 14,
    color: "#555",
    marginBottom: 12,
    fontStyle: "italic",
  },
  analysisComponent: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
  },
  analysisTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    minWidth: 100,
    alignItems: "center",
  },
  analysisTagText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  analysisText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
    lineHeight: 20,
  },
  errorBar: {
    backgroundColor: "#fce4ec",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    color: "#c0392b",
    fontSize: 14,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e5ea",
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: "#fff",
    color: "#1a1a2e",
  },
  sendButton: {
    backgroundColor: "#2c3e50",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 70,
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
});
