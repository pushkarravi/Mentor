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
} from "react-native";
import { api } from "../lib/api";
import type {
  Experiment,
  ExperimentProposal,
  Hypothesis,
  ExperimentStatus,
} from "../lib/types";

const STATUS_COLORS: Record<ExperimentStatus, string> = {
  proposed: "#d97706",
  active: "#2563eb",
  completed: "#059669",
  abandoned: "#8b8b8b",
};

const STATUS_LABELS: Record<ExperimentStatus, string> = {
  proposed: "Proposed",
  active: "Active",
  completed: "Completed",
  abandoned: "Abandoned",
};

export default function ExperimentsScreen() {
  const [loading, setLoading] = useState(true);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create experiment modal
  const [showCreate, setShowCreate] = useState(false);
  const [newHypothesisId, setNewHypothesisId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSuccessSignal, setNewSuccessSignal] = useState("");
  const [newReviewDate, setNewReviewDate] = useState("");
  const [creating, setCreating] = useState(false);

  // Recommendation modal
  const [showProposal, setShowProposal] = useState(false);
  const [proposal, setProposal] = useState<ExperimentProposal | null>(null);
  const [recommending, setRecommending] = useState(false);
  const [recommendHypothesisId, setRecommendHypothesisId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [exps, hyps] = await Promise.all([
        api.listExperiments(),
        api.listHypotheses(),
      ]);
      setExperiments(exps);
      setHypotheses(hyps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hypStatement = (id: string) =>
    hypotheses.find((h) => h.id === id)?.statement ?? "Unknown hypothesis";

  const handleCreate = useCallback(async () => {
    if (!newHypothesisId || !newDescription.trim() || !newSuccessSignal.trim()) {
      setError("Hypothesis, description, and success signal are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api.createExperiment(
        newHypothesisId,
        newDescription,
        newSuccessSignal,
        newReviewDate || null,
      );
      setShowCreate(false);
      setNewHypothesisId("");
      setNewDescription("");
      setNewSuccessSignal("");
      setNewReviewDate("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create experiment");
    } finally {
      setCreating(false);
    }
  }, [
    newHypothesisId,
    newDescription,
    newSuccessSignal,
    newReviewDate,
    load,
  ]);

  const handleRecommend = useCallback(async () => {
    if (!recommendHypothesisId) return;
    setRecommending(true);
    setError(null);
    try {
      const p = await api.recommendExperiment(recommendHypothesisId);
      setProposal(p);
      setShowProposal(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to get recommendation",
      );
    } finally {
      setRecommending(false);
    }
  }, [recommendHypothesisId]);

  const handleAcceptProposal = useCallback(async () => {
    if (!proposal) return;
    setCreating(true);
    try {
      await api.createExperiment(
        proposal.hypothesisId,
        proposal.description,
        proposal.successSignal,
        proposal.reviewDate,
      );
      setShowProposal(false);
      setProposal(null);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to create experiment",
      );
    } finally {
      setCreating(false);
    }
  }, [proposal, load]);

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
          <Text style={styles.title}>Experiments</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setShowCreate(true)}
          >
            <Text style={styles.addButtonText}>+ New</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {experiments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No experiments yet</Text>
            <Text style={styles.emptyText}>
              Create an experiment to test a hypothesis. Each experiment has a
              concrete success signal — something that could plausibly not
              happen.
            </Text>
          </View>
        ) : (
          <View style={styles.expList}>
            {experiments.map((exp) => (
              <View key={exp.id} style={styles.expCard}>
                <Text style={styles.expHypothesis}>
                  {hypStatement(exp.hypothesisId)}
                </Text>
                <Text style={styles.expDescription}>{exp.description}</Text>
                <View style={styles.expMetaRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: STATUS_COLORS[exp.status] },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {STATUS_LABELS[exp.status]}
                    </Text>
                  </View>
                  {exp.reviewDate && (
                    <Text style={styles.reviewDate}>
                      Review: {exp.reviewDate.split("T")[0]}
                    </Text>
                  )}
                </View>
                <View style={styles.signalBox}>
                  <Text style={styles.signalLabel}>Success Signal</Text>
                  <Text style={styles.signalText}>{exp.successSignal}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Recommend Experiment Section ─────────────────────────── */}
        {hypotheses.length > 0 && (
          <View style={styles.recommendSection}>
            <Text style={styles.sectionTitle}>Get an Experiment Suggestion</Text>
            <Text style={styles.hint}>
              The engine will propose a falsifiable experiment based on the
              hypothesis and its current evidence. You decide whether to create
              it.
            </Text>
            <View style={styles.hypPicker}>
              {hypotheses.map((h) => (
                <Pressable
                  key={h.id}
                  style={[
                    styles.hypPickerItem,
                    recommendHypothesisId === h.id &&
                      styles.hypPickerItemSelected,
                  ]}
                  onPress={() => setRecommendHypothesisId(h.id)}
                >
                  <Text
                    style={[
                      styles.hypPickerText,
                      recommendHypothesisId === h.id &&
                        styles.hypPickerTextSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {h.statement}
                  </Text>
                </Pressable>
              ))}
            </View>
            {recommendHypothesisId ? (
              <Pressable
                style={[styles.button, styles.buttonSecondary]}
                onPress={handleRecommend}
                disabled={recommending}
              >
                <Text style={styles.buttonTextSecondary}>
                  {recommending ? "Thinking..." : "Suggest Experiment"}
                </Text>
              </Pressable>
            ) : null}
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
            <Text style={styles.modalTitle}>New Experiment</Text>
            <Pressable onPress={() => setShowCreate(false)}>
              <Text style={styles.closeButton}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.field}>
              <Text style={styles.label}>Hypothesis to test</Text>
              <View style={styles.hypPicker}>
                {hypotheses.map((h) => (
                  <Pressable
                    key={h.id}
                    style={[
                      styles.hypPickerItem,
                      newHypothesisId === h.id && styles.hypPickerItemSelected,
                    ]}
                    onPress={() => setNewHypothesisId(h.id)}
                  >
                    <Text
                      style={[
                        styles.hypPickerText,
                        newHypothesisId === h.id &&
                          styles.hypPickerTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {h.statement}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>What will you do?</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="Describe the experiment you'll run"
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Success signal</Text>
              <Text style={styles.hint}>
                A concrete, observable outcome that would support the
                hypothesis. It must be something that could plausibly NOT
                happen.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newSuccessSignal}
                onChangeText={setNewSuccessSignal}
                placeholder="What specific observation would confirm or disconfirm?"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Review date (optional)</Text>
              <TextInput
                style={styles.input}
                value={newReviewDate}
                onChangeText={setNewReviewDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
              />
            </View>

            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleCreate}
              disabled={creating}
            >
              <Text style={styles.buttonText}>
                {creating ? "Creating..." : "Create Experiment"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Proposal Modal ────────────────────────────────────────── */}
      <Modal
        visible={showProposal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setShowProposal(false);
          setProposal(null);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Suggested Experiment</Text>
            <Pressable
              onPress={() => {
                setShowProposal(false);
                setProposal(null);
              }}
            >
              <Text style={styles.closeButton}>Close</Text>
            </Pressable>
          </View>

          {proposal ? (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.proposalBox}>
                <Text style={styles.proposalLabel}>What to do</Text>
                <Text style={styles.proposalText}>{proposal.description}</Text>
              </View>

              <View style={styles.proposalBox}>
                <Text style={styles.proposalLabel}>Success Signal</Text>
                <Text style={styles.proposalText}>
                  {proposal.successSignal}
                </Text>
              </View>

              <View style={styles.proposalBox}>
                <Text style={styles.proposalLabel}>Review Date</Text>
                <Text style={styles.proposalText}>
                  {proposal.reviewDate.split("T")[0]}
                </Text>
              </View>

              <View style={styles.proposalRationaleBox}>
                <Text style={styles.proposalLabel}>Why This Matters</Text>
                <Text style={styles.proposalText}>{proposal.rationale}</Text>
              </View>

              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleAcceptProposal}
                disabled={creating}
              >
                <Text style={styles.buttonText}>
                  {creating ? "Creating..." : "Create This Experiment"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => {
                  setShowProposal(false);
                  setProposal(null);
                }}
              >
                <Text style={styles.buttonTextSecondary}>Dismiss</Text>
              </Pressable>
            </ScrollView>
          ) : null}
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
  expList: {
    gap: 12,
  },
  expCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  expHypothesis: {
    fontSize: 13,
    color: "#888",
    marginBottom: 6,
    fontStyle: "italic",
  },
  expDescription: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 10,
    lineHeight: 22,
  },
  expMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  reviewDate: {
    fontSize: 13,
    color: "#666",
  },
  signalBox: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
  },
  signalLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  signalText: {
    fontSize: 14,
    color: "#2c3e50",
    lineHeight: 20,
  },
  // Recommend section
  recommendSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e5ea",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: "#888",
    marginBottom: 12,
    lineHeight: 18,
  },
  hypPicker: {
    gap: 6,
    marginBottom: 12,
  },
  hypPickerItem: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  hypPickerItemSelected: {
    borderColor: "#2c3e50",
    borderWidth: 2,
  },
  hypPickerText: {
    fontSize: 14,
    color: "#1a1a2e",
  },
  hypPickerTextSelected: {
    fontWeight: "600",
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
  // Proposal
  proposalBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
  },
  proposalRationaleBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#059669",
  },
  proposalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  proposalText: {
    fontSize: 14,
    color: "#2c3e50",
    lineHeight: 20,
  },
});
