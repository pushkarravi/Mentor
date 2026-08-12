import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import type { CareerContext } from "../lib/types";

export default function ContextScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasContext, setHasContext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentRole, setCurrentRole] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [targetOutcome, setTargetOutcome] = useState("");
  const [whyNotYet, setWhyNotYet] = useState("");

  useEffect(() => {
    api
      .getContext()
      .then((ctx) => {
        if (ctx) {
          setCurrentRole(ctx.currentRole);
          setYearsExperience(String(ctx.yearsExperience));
          setTargetOutcome(ctx.targetOutcome);
          setWhyNotYet(ctx.whyNotYet);
          setHasContext(true);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentRole || !yearsExperience || !targetOutcome || !whyNotYet) {
      setError("Please fill in all fields.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data: CareerContext = {
        currentRole,
        yearsExperience: parseInt(yearsExperience, 10),
        targetOutcome,
        whyNotYet,
      };
      await api.saveContext(data);
      setHasContext(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save context");
    } finally {
      setSaving(false);
    }
  }, [currentRole, yearsExperience, targetOutcome, whyNotYet]);

  const handleStartConversation = useCallback(() => {
    router.push("/chat");
  }, [router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c3e50" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Career Context</Text>
      <Text style={styles.subtitle}>
        Enough to make the first conversation meaningful. Not a profiling form.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Current role / title</Text>
        <TextInput
          style={styles.input}
          value={currentRole}
          onChangeText={setCurrentRole}
          placeholder="e.g. Senior Staff Engineer"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Years of experience</Text>
        <TextInput
          style={styles.input}
          value={yearsExperience}
          onChangeText={setYearsExperience}
          placeholder="e.g. 19"
          placeholderTextColor="#999"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          The career outcome you&apos;re trying to achieve
        </Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={targetOutcome}
          onChangeText={setTargetOutcome}
          placeholder="e.g. Move into an engineering management role"
          placeholderTextColor="#999"
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          Why you believe you haven&apos;t reached it yet
        </Text>
        <Text style={styles.hint}>
          This is your own theory — the system will treat it as an
          interpretation, not a fact.
        </Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={whyNotYet}
          onChangeText={setWhyNotYet}
          placeholder="e.g. My manager keeps deferring promotion conversations"
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
        />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.buttonPrimary]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.buttonText}>
            {saving ? "Saving..." : hasContext ? "Update Context" : "Save Context"}
          </Text>
        </Pressable>

        {hasContext && (
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleStartConversation}
          >
            <Text style={styles.buttonTextSecondary}>Start Coaching</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f7",
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
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginBottom: 28,
    lineHeight: 22,
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
    fontStyle: "italic",
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
  error: {
    color: "#c0392b",
    fontSize: 14,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    flexWrap: "wrap",
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 160,
    alignItems: "center",
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
});
