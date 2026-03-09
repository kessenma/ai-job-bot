import React, {useEffect, useState} from 'react';
import {View, Pressable, StyleSheet, Alert, ActivityIndicator, Linking, ScrollView} from 'react-native';
import {Text} from '../components/ui/Text';
import {getAuthStatus, disconnectAuth} from '../api/auth';
import {getConfigStatus} from '../api/config';
import {getLlmHealth, getLlmModels, switchLlmModel, deleteLlmModel} from '../api/llm';
import type {ModelStatusInfo} from '../api/llm';

export function SettingsScreen() {
  const [authStatus, setAuthStatus] = useState({configured: false, authenticated: false});
  const [configStatus, setConfigStatus] = useState({googleConfigured: false, dataDir: ''});
  const [llmConnected, setLlmConnected] = useState(false);
  const [models, setModels] = useState<ModelStatusInfo[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    loadStatuses();
  }, []);

  // Poll when any model is downloading or loading
  useEffect(() => {
    const hasActive = models.some(m => m.status === 'downloading' || m.status === 'loading');
    if (!hasActive) return;
    const interval = setInterval(async () => {
      try {
        const res = await getLlmModels();
        setModels(res.models);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [models]);

  async function loadStatuses() {
    try {
      const [auth, config, health, modelsRes] = await Promise.all([
        getAuthStatus(),
        getConfigStatus(),
        getLlmHealth().catch(() => ({connected: false})),
        getLlmModels().catch(() => ({models: [], current_model: null})),
      ]);
      setAuthStatus(auth);
      setConfigStatus(config);
      setLlmConnected(health.connected);
      setModels(modelsRes.models);
    } catch (err) {
      console.error('Failed to load statuses:', err);
    }
  }

  async function handleSwitchModel(modelId: string) {
    setSwitching(modelId);
    try {
      await switchLlmModel(modelId);
      const res = await getLlmModels();
      setModels(res.models);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to switch model');
    } finally {
      setSwitching(null);
    }
  }

  async function handleDeleteModel(modelId: string) {
    Alert.alert('Delete Model', 'This will remove the downloaded model file. You can re-download it later.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteLlmModel(modelId);
          const res = await getLlmModels();
          setModels(res.models);
        } catch (err) {
          Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete model');
        }
      }},
    ]);
  }

  async function handleDisconnect() {
    try {
      await disconnectAuth();
      await loadStatuses();
      Alert.alert('Disconnected', 'Google account disconnected');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Google API</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Credentials</Text>
          <Text style={[styles.value, configStatus.googleConfigured ? styles.ok : styles.notOk]}>
            {configStatus.googleConfigured ? 'Configured' : 'Not configured'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Account</Text>
          <Text style={[styles.value, authStatus.authenticated ? styles.ok : styles.notOk]}>
            {authStatus.authenticated ? 'Connected' : 'Not connected'}
          </Text>
        </View>
        {authStatus.authenticated && (
          <Pressable style={styles.dangerButton} onPress={handleDisconnect}>
            <Text style={styles.dangerText}>Disconnect Google</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>App Info</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Data directory</Text>
          <Text style={styles.value} numberOfLines={1}>{configStatus.dataDir || 'N/A'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.aiTitleRow}>
          <Text style={styles.cardTitle}>Cover Letter AI</Text>
          <View style={[styles.connectionDot, {backgroundColor: llmConnected ? '#22c55e' : '#ef4444'}]} />
        </View>

        <Text style={styles.aboutText}>
          Powered by{' '}
          <Text style={styles.linkText} onPress={() => Linking.openURL('https://ai.meta.com/llama/')}>
            Meta Llama
          </Text>
          . Models are downloaded as quantized GGUF files from{' '}
          <Text style={styles.linkText} onPress={() => Linking.openURL('https://huggingface.co/bartowski')}>
            HuggingFace
          </Text>
          . Delete models below to free disk space.
        </Text>

        {models.length === 0 ? (
          <Text style={styles.label}>No models available. Is the LLM service running?</Text>
        ) : (
          models.map((model) => (
            <View key={model.id} style={styles.modelRow}>
              <View style={styles.modelHeader}>
                <Pressable onPress={() => {
                  const urls: Record<string, string> = {
                    '1b': 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF',
                    '3b': 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
                    '7b': 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
                  };
                  if (urls[model.id]) Linking.openURL(urls[model.id]);
                }}>
                  <Text style={styles.modelNameLink}>{model.name} ↗</Text>
                </Pressable>
                <Text style={styles.modelSize}>{model.size_gb} GB</Text>
              </View>

              <Text style={[
                styles.modelStatus,
                model.status === 'ready' && model.active ? {color: '#22c55e'} :
                model.status === 'downloading' ? {color: '#6366f1'} :
                model.status === 'loading' ? {color: '#f59e0b'} :
                model.status === 'error' ? {color: '#ef4444'} :
                {color: '#888'},
              ]}>
                {model.status === 'ready' && model.active ? 'Active' :
                 model.status === 'ready' ? 'Downloaded' :
                 model.status === 'downloading' ? `Downloading ${Math.round(model.download_progress)}%` :
                 model.status === 'loading' ? 'Loading...' :
                 model.status === 'error' ? `Error: ${model.error || 'Unknown'}` :
                 'Not downloaded'}
              </Text>

              {model.status === 'downloading' && (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, {width: `${model.download_progress}%`}]} />
                </View>
              )}

              <View style={styles.modelActions}>
                {!model.active && model.status !== 'downloading' && model.status !== 'loading' && (
                  <Pressable
                    style={[styles.actionButton, switching !== null && styles.actionButtonDisabled]}
                    onPress={() => handleSwitchModel(model.id)}
                    disabled={switching !== null}
                  >
                    {switching === model.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>
                        {model.downloaded ? 'Activate' : 'Download & Activate'}
                      </Text>
                    )}
                  </Pressable>
                )}
                {model.downloaded && model.status !== 'downloading' && model.status !== 'loading' && (
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => handleDeleteModel(model.id)}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  label: {
    fontSize: 14,
    color: '#ccc',
  },
  value: {
    fontSize: 14,
    color: '#888',
  },
  ok: {
    color: '#22c55e',
  },
  notOk: {
    color: '#888',
  },
  dangerButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  dangerText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  aiTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modelRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  modelSize: {
    fontSize: 12,
    color: '#888',
  },
  modelStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginTop: 6,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#6366f1',
    borderRadius: 2,
  },
  actionButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  aboutText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    marginBottom: 12,
  },
  linkText: {
    color: '#6366f1',
    fontWeight: '600',
  },
  modelNameLink: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '600',
  },
  modelActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
});
