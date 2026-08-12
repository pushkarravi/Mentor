import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { api } from "../lib/api";
import type {
  Hypothesis,
  HypothesisDetail,
  Evidence,
  LinkType,
  ConfidenceCategory,
} from "../lib/types";

const CONFIDENCE_COLORS: Record<ConfidenceCategory, string> = {
  tentative: "#8b8b8b",
  moderate: "#d97706",
  strong: "#059669",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  tested_supports: "Tested — Supports",
  tested_contradicts: "Tested — Contradicts",
  superseded: "Superseded",
  confirmed: "Confirmed",
};

const LINK_COLORS: Record<LinkType, string> = {
  supports: "#059669",
  contradicts: "#dc2626",
};

export default function HypothesesScreen() {
  const [loading, setLoading] = useState(true);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create hypothesis modal
  const [showCreate, setShowCreate] = useState(false);
  const [newStatement, setNewStatement] = useState("");
  const [newRationale, setNewRationale] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HypothesisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evaluating, setEvaluating] = useState(false);

  // Link creation state
  const [linkEvidenceId, setLinkEvidenceId] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("supports");

  const loadHypotheses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hyps = await api.listHypotheses();
      setHypotheses(hyps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hypotheses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHypotheses();
  }, [loadHypotheses]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setSelectedId(id);
    try {
    const [d, evs] = await Promise.all([
        api.getHypothesis(id),
        api.listEvidence(),
      ]);
      setDetail(d);
      setEvidence(evs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newStatement.trim() || !newRationale.trim()) {
      setError("Statement and rationale are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api.createHypothesis(newStatement, newRationale);
      setShowCreate(false);
      setNewStatement("");
      setNewRationale("");
      await loadHypotheses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create hypothesis");
    } finally {
      setCreating(false);
    }
  }, [newStatement, newRationale, loadHypotheses]);

  const handleLink = useCallback(async () => {
    if (!selectedId || !linkEvidenceId) return;
    try {
      await api.linkEvidence(selectedId, linkEvidenceId, linkType);
      await loadDetail(selectedId);
      setLinkEvidenceId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link evidence");
    }
  }, [selectedId, linkEvidenceId, linkType, loadDetail]);

  const handleEvaluate = useCallback(async () => {
    if (!selectedId) return;
    setEvaluating(true);
    try {
      await api.evaluateHypothesis(selectedId);
      await loadDetail(selectedId);
      await loadHypotheses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to evaluate");
    } finally {
      setEvaluating(false);
    }
  }, [selectedId, loadDetail, loadHypotheses]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c3e50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Career Hypotheses</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setShowCreate(true)}
          >
            <Text style={styles.addButtonText}>+ New</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {hypotheses.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No hypotheses yet</Text>
            <Text style={styles.emptyText}>
              Create a career hypothesis from confirmed evidence or an
              explicit statement. Hypotheses are testable claims — not facts.
            </Text>
          </View>
        ) : (
          <View style={styles.hypList}>
            {hypotheses.map((hyp) => (
              <Pressable
                key={hyp.id}
                style={styles.hypCard}
                onPress={() => loadDetail(hyp.id)}
              >
                <Text style={styles.hypStatement}>{hyp.statement}</Text>
                <View style={styles.hypMetaRow}>
                  <View
                    style={[
                      styles.confidenceBadge,
                      { backgroundColor: CONFIDENCE_COLORS[hyp.confidence] },
                    ]}
                  >
                    <Text style={styles.confidenceText}>
                      {hyp.confidence}
                    </Text>
                  </View>
                  <Text style={styles.statusText}>
                    {STATUS_LABELS[hyp.status] ?? hyp.status}
                  </Text>
                </View>
                {hyp.rationale ? (
                  <Text style={styles.hypRationale} numberOfLines={3}>
                    {hyp.rationale}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Create Modal ──────────────────────────────────────────── */}
      <Modal
        visible={showCreate}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowCreate(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Hypothesis</Text>
            <Pressable onPress={() => setShowCreate(false)}>
              <Text style={styles.closeButton}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.field}>
              <Text style={styles.label}>Hypothesis statement</Text>
              <Text style={styles.hint}>
                A testable claim about your career. This remains a hypothesis,
                never a fact.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newStatement}
                onChangeText={setNewStatement}
                placeholder="e.g. My manager is excluding me from strategic decisions"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Why this hypothesis</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newRationale}
                onChangeText={setNewRationale}
                placeholder="What evidence or reasoning led to this hypothesis?"
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
              />
            </View>

            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleCreate}
              disabled={creating}
            >
              <Text style={styles.buttonText}>
                {creating ? "Creating..." : "Create Hypothesis"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Detail Modal ──────────────────────────────────────────── */}
      <Modal
        visible={selectedId !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setSelectedId(null);
          setDetail(null);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Hypothesis Detail</Text>
            <Pressable
              onPress={() => {
                setSelectedId(null);
                setDetail(null);
              }}
            >
              <Text style={styles.closeButton}>Close</Text>
            </Pressable>
          </View>

          {detailLoading || !detail ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#2c3e50" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.hypStatement}>{detail.statement}</Text>

              <View style={styles.hypMetaRow}>
                <View
                  style={[
                    styles.confidenceBadge,
                    {
                      backgroundColor: CONFIDENCE_COLORS[detail.confidence],
                    },
                  ]}
                >
                  <Text style={styles.confidenceText}>
                    {detail.confidence}
                  </Text>
                </View>
                <Text style={styles.statusText}>
                  {STATUS_LABELS[detail.status] ?? detail.status}
                </Text>
              </View>

              {detail.rationale ? (
                <View style={styles.rationaleBox}>
                  <Text style={styles.rationaleLabel}>Assessment</Text>
                  <Text style={styles.rationaleText}>{detail.rationale}</Text>
                </View>
              ) : null}

              {/* Linked evidence */}
              <Text style={styles.sectionTitle}>Linked Evidence</Text>
              {detail.links.length === 0 ? (
                <Text style={styles.emptyText}>
                  No evidence linked yet. Link supporting or contradicting
                  evidence below.
                </Text>
              ) : (
                detail.links.map((link) => (
                  <View key={link.id} style={styles.linkCard}>
                    <View
                      style={[
                        styles.linkBadge,
                        { backgroundColor: LINK_COLORS[link.linkType] },
                      ]}
                    >
                      <Text style={styles.linkBadgeText}>
                        {link.linkType}
                      </Text>
                    </View>
                    <View style={styles.linkContent}>
                      <Text style={styles.linkDescription}>
                        {link.evidence.description}
                      </Text>
                      <Text style={styles.linkMeta}>
                        {link.evidence.sourceType} /{" "}
                        {link.evidence.epistemicType}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {/* Link new evidence */}
              {evidence.length > 0 && (
                <View style={styles.linkForm}>
                  <Text style={styles.sectionTitle}>Link Evidence</Text>
                  <View style={styles.linkTypeRow}>
                    {(["supports", "contradicts"] as LinkType[]).map((lt) => (
                      <Pressable
                        key={lt}
                        style={[
                          styles.linkTypeButton,
                          linkType === lt && {
                            backgroundColor: LINK_COLORS[lt],
                          },
                        ]}
                        onPress={() => setLinkType(lt)}
                      >
                        <Text
                          style={[
                            styles.linkTypeText,
                            linkType === lt && styles.linkTypeTextActive,
                          ]}
                        >
                          {lt}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <FlatList
                    data={evidence.filter(
                      (e) =>
                        !detail.links.some((l) => l.evidenceId === e.id),
                    )}
                    keyExtractor={(item) => item.id}
                    style={styles.evidenceList}
                    renderItem={({ item }) => (
                      <Pressable
                        style={[
                          styles.evidenceItem,
                          linkEvidenceId === item.id &&
                            styles.evidenceItemSelected,
                        ]}
                        onPress={() => setLinkEvidenceId(item.id)}
                      >
                        <Text style={styles.evidenceItemText}>
                          {item.description}
                        </Text>
                        <Text style={styles.evidenceItemMeta}>
                          {item.sourceType} / {item.epistemicType}
                        </Text>
                      </Pressable>
                    )}
                    scrollEnabled={false}
                  />

                  {linkEvidenceId ? (
                    <Pressable
                      style={[styles.button, styles.buttonPrimary]}
                      onPress={handleLink}
                    >
                      <Text style={styles.buttonText}>Link Evidence</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}

              {/* Evaluate */}
              <Pressable
                style={[styles.button, styles.buttonSecondary, styles.evalButton]}
                onPress={handleEvaluate}
                disabled={evaluating}
              >
                <Text style={styles.buttonTextSecondary}>
                  {evaluating ? "Evaluating..." : "Evaluate Hypothesis"}
                </Text>
              </Pressable>

              <Text style={styles.hint}>
                Evaluation retrieves the actual linked evidence and produces
                a qualitative assessment. Strong confidence does not confirm
                a hypothesis — it remains testable.
              </Text>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f7",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 24,
    maxWidth: 640,
    alignSelf: "center",
    width: "100%",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f7",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1a1a2e",
  },
  addButton: {
    backgroundColor: "#2c3e50",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    color: "#c0392b",
    fontSize: 14,
    marginBottom: 16,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    lineHeight: 20,
  },
  hypList: {
    gap: 12,
  },
  hypCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  hypStatement: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 10,
    lineHeight: 22,
  },
  hypMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confidenceText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  statusText: {
    fontSize: 13,
    color: "#666",
  },
  hypRationale: {
    fontSize: 13,
    color: "#888",
    lineHeight: 18,
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f5f7",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5ea",
    backgroundColor: "#fff",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a2e",
  },
  closeButton: {
    color: "#2c3e50",
    fontSize: 16,
    fontWeight: "500",
  },
  modalContent: {
    padding: 24,
    maxWidth: 640,
    alignSelf: "center",
    width: "100%",
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    color: "#888",
    marginBottom: 6,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#1a1a2e",
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonPrimary: {
    backgroundColor: "#2c3e50",
  },
  buttonSecondary: {
    backgroundColor: "#e8e8ed",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonTextSecondary: {
    color: "#2c3e50",
    fontSize: 16,
    fontWeight: "600",
  },
  // Rationale
  rationaleBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#2c3e50",
  },
  rationaleLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  rationaleText: {
    fontSize: 14,
    color: "#2c3e50",
    lineHeight: 20,
  },
  // Sections
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginTop: 20,
    marginBottom: 10,
  },
  // Links
  linkCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e5ea",
    gap: 10,
  },
  linkBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    height: 28,
    justifyContent: "center",
  },
  linkBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  linkContent: {
    flex: 1,
  },
  linkDescription: {
    fontSize: 14,
    color: "#1a1a2e",
    marginBottom: 2,
  },
  linkMeta: {
    fontSize: 12,
    color: "#888",
  },
  // Link form
  linkForm: {
    marginTop: 8,
  },
  linkTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  linkTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  linkTypeText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  linkTypeTextActive: {
    color: "#fff",
  },
  evidenceList: {
    marginBottom: 8,
  },
  evidenceItem: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  evidenceItemSelected: {
    borderColor: "#2c3e50",
    borderWidth: 2,
  },
  evidenceItemText: {
    fontSize: 14,
    color: "#1a1a2e",
    marginBottom: 2,
  },
  evidenceItemMeta: {
    fontSize: 12,
    color: "#888",
  },
  evalButton: {
    marginTop: 20,
  },
});
