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
  ScrollView,
} from "react-native";
import { api } from "../lib/api";
import type {
  Message,
  ReasoningLens,
  ClaimAnalysis,
  PendingCandidate,
} from "../lib/types";

const LENS_LABELS: { key: ReasoningLens; label: string; description: string }[] = [
  { key: "coach", label: "Coach", description: "Balanced default" },
  { key: "challenger", label: "Challenge Me", description: "Test assumptions" },
  { key: "decision_advisor", label: "Help Me Decide", description: "Structured analysis" },
];

const EPISTEMIC_COLORS: Record<string, string> = {
  fact: "#2d6a4f",
  interpretation: "#b5651d",
  assumption: "#8b8b8b",
  hypothesis: "#6a4c93",
  emotion: "#c0392b",
  action: "#1d6fa3",
};

const SOURCE_LABELS: Record<string, string> = {
  user_report: "User report",
  imported_document: "Imported",
  ai_inference: "AI inference",
  observed_outcome: "Observed outcome",
};

const ENTITY_LABELS: Record<string, string> = {
  evidence: "Evidence",
  hypothesis: "Hypothesis",
  person: "Person",
};

export default function ChatScreen() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [lens, setLens] = useState<ReasoningLens>("coach");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState<ClaimAnalysis | null>(null);
  const [candidates, setCandidates] = useState<PendingCandidate[]>([]);
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
        const pending = await api.listCandidates();
        setCandidates(pending);
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
      if (result.candidates && result.candidates.length > 0) {
        setCandidates((prev) => [...prev, ...result.candidates]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      setMessages((prev) =>
        prev.filter((m) => m.id !== optimisticUserMsg.id),
      );
    } finally {
      setSending(false);
    }
  }, [input, conversationId, sending, lens]);

  const handleConfirm = useCallback(async (candidateId: string) => {
    try {
      await api.confirmCandidate(candidateId, "confirm");
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm candidate");
    }
  }, []);

  const handleReject = useCallback(async (candidateId: string) => {
    try {
      await api.confirmCandidate(candidateId, "reject");
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject candidate");
    }
  }, []);

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

      {/* Pending candidates panel */}
      {candidates.length > 0 && (
        <View style={styles.candidatesPanel}>
          <View style={styles.candidatesHeader}>
            <Text style={styles.candidatesTitle}>
              Proposed Memories ({candidates.length})
            </Text>
            <Text style={styles.candidatesHint}>
              Review each item. Confirm to save, edit to revise, or reject to discard.
            </Text>
          </View>
          <ScrollView style={styles.candidatesList}>
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onConfirm={() => handleConfirm(c.id)}
                onReject={() => handleReject(c.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {showAnalysis && (
        <View style={styles.analysisPanel}>
          <View style={styles.analysisHeader}>
            <Text style={styles.analysisTitle}>Claim Analysis</Text>
            <Pressable onPress={() => setShowAnalysis(null)}>
              <Text style={styles.analysisClose}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.analysisSummary}>{showAnalysis.summary}</Text>
          {showAnalysis.components.map((comp, i) => (
            <View key={i} style={styles.analysisComponent}>
              <View
                style={[
                  styles.analysisTag,
                  { backgroundColor: EPISTEMIC_COLORS[comp.type] ?? "#666" },
                ]}
              >
                <Text style={styles.analysisTagText}>
                  {comp.type.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.analysisText}>{comp.text}</Text>
            </View>
          ))}
        </View>
      )}

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

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

function CandidateCard({
  candidate,
  onConfirm,
  onReject,
}: {
  candidate: PendingCandidate;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(candidate.extractedStatement);

  const handleSaveEdit = () => {
    setEditing(false);
  };

  return (
    <View style={styles.candidateCard}>
      {candidate.isMock && (
        <View style={styles.mockBadge}>
          <Text style={styles.mockBadgeText}>MOCK</Text>
        </View>
      )}
      <View style={styles.candidateMeta}>
        <View
          style={[
            styles.candidateTag,
            { backgroundColor: EPISTEMIC_COLORS[candidate.epistemicType] ?? "#666" },
          ]}
        >
          <Text style={styles.candidateTagText}>
            {candidate.epistemicType.toUpperCase()}
          </Text>
        </View>
        <View style={styles.candidateSourceTag}>
          <Text style={styles.candidateSourceText}>
            {SOURCE_LABELS[candidate.sourceType] ?? candidate.sourceType}
          </Text>
        </View>
        <View style={styles.candidateEntityTag}>
          <Text style={styles.candidateEntityText}>
            {ENTITY_LABELS[candidate.entityType] ?? candidate.entityType}
          </Text>
        </View>
      </View>

      {editing ? (
        <View>
          <TextInput
            style={styles.candidateEditInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
          />
          <View style={styles.candidateEditActions}>
            <Pressable
              style={[styles.candidateActionBtn, styles.candidateSaveBtn]}
              onPress={handleSaveEdit}
            >
              <Text style={styles.candidateActionText}>Done</Text>
            </Pressable>
            <Pressable
              style={[styles.candidateActionBtn, styles.candidateCancelBtn]}
              onPress={() => {
                setEditing(false);
                setEditText(candidate.extractedStatement);
              }}
            >
              <Text style={styles.candidateActionText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.candidateStatement}>{candidate.extractedStatement}</Text>
      )}

      <Text style={styles.candidateReason}>{candidate.reasonToSave}</Text>

      {!editing && (
        <View style={styles.candidateActions}>
          <Pressable
            style={[styles.candidateActionBtn, styles.candidateConfirmBtn]}
            onPress={onConfirm}
          >
            <Text style={styles.candidateActionText}>Confirm</Text>
          </Pressable>
          <Pressable
            style={[styles.candidateActionBtn, styles.candidateEditBtn]}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.candidateActionText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.candidateActionBtn, styles.candidateRejectBtn]}
            onPress={onReject}
          >
            <Text style={styles.candidateActionText}>Reject</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f7" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  lensButtonActive: { backgroundColor: "#2c3e50" },
  lensLabel: { fontSize: 14, fontWeight: "600", color: "#666" },
  lensLabelActive: { color: "#fff" },
  messageList: { padding: 16, flexGrow: 1 },
  messageRow: { marginBottom: 16, maxWidth: "85%" },
  messageRowUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  messageRowAssistant: { alignSelf: "flex-start" },
  messageBubble: { borderRadius: 12, padding: 14 },
  bubbleUser: { backgroundColor: "#2c3e50" },
  bubbleAssistant: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  textUser: { color: "#fff", fontSize: 16, lineHeight: 22 },
  textAssistant: { color: "#1a1a2e", fontSize: 16, lineHeight: 22 },
  analysisButton: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 4 },
  analysisButtonText: { fontSize: 13, color: "#6a4c93", fontWeight: "600" },
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
  analysisTitle: { fontSize: 16, fontWeight: "700", color: "#1a1a2e" },
  analysisClose: { fontSize: 14, color: "#999" },
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
  analysisText: { fontSize: 14, color: "#333", flex: 1, lineHeight: 20 },
  errorBar: { backgroundColor: "#fce4ec", paddingHorizontal: 16, paddingVertical: 10 },
  errorText: { color: "#c0392b", fontSize: 14 },
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
  sendButtonDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: "#1a1a2e", marginBottom: 12 },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
  candidatesPanel: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e5ea",
    maxHeight: 300,
  },
  candidatesHeader: { padding: 16, paddingBottom: 8 },
  candidatesTitle: { fontSize: 16, fontWeight: "700", color: "#1a1a2e" },
  candidatesHint: { fontSize: 13, color: "#888", marginTop: 4 },
  candidatesList: { maxHeight: 240 },
  candidateCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#f8f8fa",
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  mockBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#f0ad4e",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mockBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  candidateMeta: { flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" },
  candidateTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: "center",
  },
  candidateTagText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  candidateSourceTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#e8e8ed",
  },
  candidateSourceText: { fontSize: 11, color: "#666", fontWeight: "600" },
  candidateEntityTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#d6e4f0",
  },
  candidateEntityText: { fontSize: 11, color: "#1d6fa3", fontWeight: "600" },
  candidateStatement: { fontSize: 15, color: "#1a1a2e", lineHeight: 21, marginBottom: 6 },
  candidateReason: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
    marginBottom: 10,
  },
  candidateActions: { flexDirection: "row", gap: 8 },
  candidateActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  candidateConfirmBtn: { backgroundColor: "#2d6a4f" },
  candidateEditBtn: { backgroundColor: "#e8e8ed" },
  candidateRejectBtn: { backgroundColor: "#fce4ec", borderWidth: 1, borderColor: "#e0c0c0" },
  candidateSaveBtn: { backgroundColor: "#2c3e50" },
  candidateCancelBtn: { backgroundColor: "#e8e8ed" },
  candidateActionText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  candidateEditInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#fff",
    color: "#1a1a2e",
    minHeight: 60,
    marginBottom: 8,
    textAlignVertical: "top",
  },
  candidateEditActions: { flexDirection: "row", gap: 8 },
});
