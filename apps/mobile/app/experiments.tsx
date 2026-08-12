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
  OutcomeClassification,
  ExperimentReviewResult,
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

const CLASSIFICATION_LABELS: Record<OutcomeClassification, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  inconclusive: "Inconclusive",
};

const CLASSIFICATION_COLORS: Record<OutcomeClassification, string> = {
  supports: "#059669",
  contradicts: "#dc2626",
  inconclusive: "#8b8b8b",
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
  const [newSupporting, setNewSupporting] = useState("");
  const [newContradicting, setNewContradicting] = useState("");
  const [newInconclusive, setNewInconclusive] = useState("");
  const [newRationale, setNewRationale] = useState("");
  const [newReviewDate, setNewReviewDate] = useState("");
  const [creating, setCreating] = useState(false);

  // Recommendation modal
  const [showProposal, setShowProposal] = useState(false);
  const [proposal, setProposal] = useState<ExperimentProposal | null>(null);
  const [recommending, setRecommending] = useState(false);
  const [recommendHypothesisId, setRecommendHypothesisId] = useState("");

  // Outcome recording modal
  const [outcomeExpId, setOutcomeExpId] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState("");
  const [observedFact, setObservedFact] = useState("");
  const [outcomeClassification, setOutcomeClassification] =
    useState<OutcomeClassification>("supports");
  const [recordingOutcome, setRecordingOutcome] = useState(false);

  // Review result modal
  const [reviewResult, setReviewResult] =
    useState<ExperimentReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);

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
    if (
      !newHypothesisId ||
      !newDescription.trim() ||
      !newSupporting.trim() ||
      !newContradicting.trim() ||
      !newInconclusive.trim() ||
      !newRationale.trim()
    ) {
      setError(
        "Hypothesis, description, all three signals, and rationale are required.",
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api.createExperiment(
        newHypothesisId,
        newDescription,
        newSupporting,
        newContradicting,
        newInconclusive,
        newRationale,
        newReviewDate || null,
      );
      setShowCreate(false);
      setNewHypothesisId("");
      setNewDescription("");
      setNewSupporting("");
      setNewContradicting("");
      setNewInconclusive("");
      setNewRationale("");
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
    newSupporting,
    newContradicting,
    newInconclusive,
    newRationale,
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
        proposal.supportingSignal,
        proposal.contradictingSignal,
        proposal.inconclusiveSignal,
        proposal.rationale,
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

  const openOutcomeModal = (expId: string) => {
    setOutcomeExpId(expId);
    setOutcomeText("");
    setObservedFact("");
    setOutcomeClassification("supports");
  };

  const handleRecordOutcome = useCallback(async () => {
    if (!outcomeExpId || !outcomeText.trim()) return;
    if (
      (outcomeClassification === "supports" ||
        outcomeClassification === "contradicts") &&
      !observedFact.trim()
    ) {
      setError(
        "A factual observation is required when the outcome supports or contradicts the hypothesis.",
      );
      return;
    }
    setRecordingOutcome(true);
    setError(null);
    try {
      await api.recordOutcome(
        outcomeExpId,
        outcomeText,
        outcomeClassification === "inconclusive" ? null : observedFact,
        outcomeClassification,
      );
      setOutcomeExpId(null);
      setOutcomeText("");
      setObservedFact("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record outcome");
    } finally {
      setRecordingOutcome(false);
    }
  }, [outcomeExpId, outcomeText, observedFact, outcomeClassification, load]);

  const handleReview = useCallback(
    async (expId: string) => {
      setReviewing(true);
      setError(null);
      try {
        const result = await api.reviewExperiment(expId);
        setReviewResult(result);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to review experiment",
        );
      } finally {
        setReviewing(false);
      }
    },
    [],
  );

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
              Create an experiment to gather information about a hypothesis.
              Each experiment defines what would support, contradict, or be
              inconclusive for the hypothesis.
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
                <View style={[styles.signalBox, { borderLeftColor: "#059669" }]}>
                  <Text style={styles.signalLabel}>Would Support</Text>
                  <Text style={styles.signalText}>{exp.supportingSignal}</Text>
                </View>
                <View style={[styles.signalBox, { borderLeftColor: "#dc2626" }]}>
                  <Text style={styles.signalLabel}>Would Contradict</Text>
                  <Text style={styles.signalText}>{exp.contradictingSignal}</Text>
                </View>
                <View style={[styles.signalBox, { borderLeftColor: "#8b8b8b" }]}>
                  <Text style={styles.signalLabel}>Inconclusive If</Text>
                  <Text style={styles.signalText}>{exp.inconclusiveSignal}</Text>
                </View>
                <View style={[styles.signalBox, { borderLeftColor: "#2c3e50" }]}>
                  <Text style={styles.signalLabel}>Why This Matters</Text>
                  <Text style={styles.signalText}>{exp.rationale}</Text>
                </View>

                {/* ── Outcome section (Stage E) ─────────────────────── */}
                {exp.outcome && (
                  <View style={styles.outcomeBox}>
                    <Text style={styles.outcomeLabel}>Recorded Outcome</Text>
                    <Text style={styles.outcomeText}>{exp.outcome}</Text>
                    {exp.outcomeClassification && (
                      <View
                        style={[
                          styles.classificationBadge,
                          {
                            backgroundColor:
                              CLASSIFICATION_COLORS[exp.outcomeClassification],
                          },
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {CLASSIFICATION_LABELS[exp.outcomeClassification]}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* ── Action buttons ────────────────────────────────── */}
                <View style={styles.actionRow}>
                  {!exp.outcome && exp.status !== "completed" && (
                    <Pressable
                      style={[styles.actionButton, styles.actionPrimary]}
                      onPress={() => openOutcomeModal(exp.id)}
                    >
                      <Text style={styles.actionButtonText}>
                        Record Outcome
                      </Text>
                    </Pressable>
                  )}
                  {exp.outcome && !exp.reviewedAt && (
                    <Pressable
                      style={[styles.actionButton, styles.actionReview]}
                      onPress={() => handleReview(exp.id)}
                      disabled={reviewing}
                    >
                      <Text style={styles.actionButtonText}>
                        {reviewing ? "Reviewing..." : "Review & Reassess"}
                      </Text>
                    </Pressable>
                  )}
                  {exp.reviewedAt && (
                    <Text style={styles.reviewedTag}>
                      Reviewed {exp.reviewedAt.split("T")[0]}
                    </Text>
                  )}
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
              The engine will propose an experiment based on the hypothesis
              and its current evidence. You decide whether to create it.
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
              <Text style={styles.label}>Would support the hypothesis</Text>
              <Text style={styles.hint}>
                An observable outcome that would strengthen the hypothesis.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newSupporting}
                onChangeText={setNewSupporting}
                placeholder="What observation would support this hypothesis?"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Would contradict the hypothesis</Text>
              <Text style={styles.hint}>
                An observable outcome that would weaken the hypothesis.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newContradicting}
                onChangeText={setNewContradicting}
                placeholder="What observation would contradict this hypothesis?"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Inconclusive if</Text>
              <Text style={styles.hint}>
                Circumstances under which the experiment did not meaningfully
                test the hypothesis.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newInconclusive}
                onChangeText={setNewInconclusive}
                placeholder="When would this experiment not tell us anything?"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Why this matters</Text>
              <Text style={styles.hint}>
                Explain why this experiment matters and what it is intended to
                test. This is saved with the experiment.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={newRationale}
                onChangeText={setNewRationale}
                placeholder="Why does this experiment matter?"
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

              <View style={[styles.proposalBox, { borderLeftColor: "#059669" }]}>
                <Text style={styles.proposalLabel}>Would Support</Text>
                <Text style={styles.proposalText}>
                  {proposal.supportingSignal}
                </Text>
              </View>

              <View style={[styles.proposalBox, { borderLeftColor: "#dc2626" }]}>
                <Text style={styles.proposalLabel}>Would Contradict</Text>
                <Text style={styles.proposalText}>
                  {proposal.contradictingSignal}
                </Text>
              </View>

              <View style={[styles.proposalBox, { borderLeftColor: "#8b8b8b" }]}>
                <Text style={styles.proposalLabel}>Inconclusive If</Text>
                <Text style={styles.proposalText}>
                  {proposal.inconclusiveSignal}
                </Text>
              </View>

              <View style={styles.proposalRationaleBox}>
                <Text style={styles.proposalLabel}>Why This Matters</Text>
                <Text style={styles.proposalText}>{proposal.rationale}</Text>
              </View>

              <View style={styles.proposalBox}>
                <Text style={styles.proposalLabel}>Review Date</Text>
                <Text style={styles.proposalText}>
                  {proposal.reviewDate.split("T")[0]}
                </Text>
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

      {/* ── Outcome Recording Modal (Stage E) ─────────────────────── */}
      <Modal
        visible={outcomeExpId !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setOutcomeExpId(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Record Outcome</Text>
            <Pressable onPress={() => setOutcomeExpId(null)}>
              <Text style={styles.closeButton}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.field}>
              <Text style={styles.label}>What happened? (raw narrative)</Text>
              <Text style={styles.hint}>
                Describe what happened in your own words. This may include
                interpretations and feelings. It is preserved as-is.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={outcomeText}
                onChangeText={setOutcomeText}
                placeholder="Describe what actually happened..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Classification</Text>
              <View style={styles.classificationPicker}>
                {(
                  ["supports", "contradicts", "inconclusive"] as const
                ).map((c) => (
                  <Pressable
                    key={c}
                    style={[
                      styles.classificationItem,
                      outcomeClassification === c &&
                        styles.classificationItemSelected,
                      {
                        borderColor:
                          outcomeClassification === c
                            ? CLASSIFICATION_COLORS[c]
                            : "#d1d5db",
                      },
                    ]}
                    onPress={() => setOutcomeClassification(c)}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight:
                          outcomeClassification === c ? "600" : "400",
                        color:
                          outcomeClassification === c
                            ? CLASSIFICATION_COLORS[c]
                            : "#666",
                      }}
                    >
                      {CLASSIFICATION_LABELS[c]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {outcomeClassification !== "inconclusive" && (
              <View style={styles.field}>
                <Text style={styles.label}>Factual observation</Text>
                <Text style={styles.hint}>
                  A normalized, observable fact distilled from the narrative.
                  This becomes fact-grade evidence. It must be something you
                  actually observed, not an interpretation.
                </Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={observedFact}
                  onChangeText={setObservedFact}
                  placeholder="e.g. I was not invited to the roadmap planning meeting on Aug 12."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}

            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleRecordOutcome}
              disabled={recordingOutcome}
            >
              <Text style={styles.buttonText}>
                {recordingOutcome ? "Recording..." : "Record Outcome"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Review Result Modal (Stage F) ─────────────────────────── */}
      <Modal
        visible={reviewResult !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setReviewResult(null);
          load();
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Hypothesis Reassessment</Text>
            <Pressable
              onPress={() => {
                setReviewResult(null);
                load();
              }}
            >
              <Text style={styles.closeButton}>Close</Text>
            </Pressable>
          </View>

          {reviewResult && (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.reviewHypStatement}>
                {reviewResult.hypothesisStatement}
              </Text>

              {/* Before */}
              <View style={styles.deltaSection}>
                <Text style={styles.deltaLabel}>Before</Text>
                <Text style={styles.confidenceText}>
                  {reviewResult.previousConfidence}
                </Text>
                <Text style={styles.countsText}>
                  {reviewResult.previousSupportingCount} supporting /{" "}
                  {reviewResult.previousContradictingCount} contradicting
                </Text>
              </View>

              {/* New evidence */}
              {reviewResult.classification !== "inconclusive" && (
                <View style={styles.deltaSection}>
                  <Text style={styles.deltaLabel}>New evidence</Text>
                  <Text style={styles.classificationText}>
                    Classification:{" "}
                    {CLASSIFICATION_LABELS[reviewResult.classification]}
                  </Text>
                </View>
              )}

              {/* After */}
              <View style={styles.deltaSection}>
                <Text style={styles.deltaLabel}>After</Text>
                <Text style={styles.confidenceText}>
                  {reviewResult.newConfidence}
                </Text>
                <Text style={styles.countsText}>
                  {reviewResult.newSupportingCount} supporting /{" "}
                  {reviewResult.newContradictingCount} contradicting
                </Text>
                {reviewResult.confidenceChanged ? (
                  <Text style={styles.changedTag}>Confidence changed</Text>
                ) : (
                  <Text style={styles.unchangedTag}>
                    Confidence unchanged
                  </Text>
                )}
              </View>

              {/* What changed */}
              <View style={styles.explanationBox}>
                <Text style={styles.deltaLabel}>What changed</Text>
                <Text style={styles.explanationText}>
                  {reviewResult.explanation}
                </Text>
              </View>

              {reviewResult.newUntestedAssumptions.length > 0 && (
                <View style={styles.assumptionsBox}>
                  <Text style={styles.deltaLabel}>Untested assumptions</Text>
                  {reviewResult.newUntestedAssumptions.map((a, i) => (
                    <Text key={i} style={styles.assumptionText}>
                      {"\u2022"} {a}
                    </Text>
                  ))}
                </View>
              )}

              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => {
                  setReviewResult(null);
                  load();
                }}
              >
                <Text style={styles.buttonText}>Done</Text>
              </Pressable>
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
    marginBottom: 8,
    borderLeftWidth: 3,
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
  outcomeBox: {
    backgroundColor: "#fef9e7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#f0e6c0",
  },
  outcomeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  outcomeText: {
    fontSize: 14,
    color: "#2c3e50",
    lineHeight: 20,
    marginBottom: 8,
  },
  classificationBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionPrimary: {
    backgroundColor: "#2c3e50",
  },
  actionReview: {
    backgroundColor: "#059669",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  reviewedTag: {
    fontSize: 13,
    color: "#059669",
    fontWeight: "500",
  },
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
  classificationPicker: {
    flexDirection: "row",
    gap: 8,
  },
  classificationItem: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  classificationItemSelected: {
    borderWidth: 2,
  },
  // ── Review result styles ─────────────────────────────────────────
  reviewHypStatement: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 20,
    lineHeight: 24,
    fontStyle: "italic",
  },
  deltaSection: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  deltaLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  confidenceText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  countsText: {
    fontSize: 14,
    color: "#666",
  },
  classificationText: {
    fontSize: 15,
    color: "#2c3e50",
    fontWeight: "500",
  },
  changedTag: {
    fontSize: 13,
    color: "#d97706",
    fontWeight: "600",
    marginTop: 6,
  },
  unchangedTag: {
    fontSize: 13,
    color: "#666",
    marginTop: 6,
  },
  explanationBox: {
    backgroundColor: "#eef6ff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
  },
  explanationText: {
    fontSize: 14,
    color: "#2c3e50",
    lineHeight: 22,
  },
  assumptionsBox: {
    backgroundColor: "#fef9e7",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  assumptionText: {
    fontSize: 13,
    color: "#8b6914",
    lineHeight: 20,
    marginBottom: 4,
  },
});
