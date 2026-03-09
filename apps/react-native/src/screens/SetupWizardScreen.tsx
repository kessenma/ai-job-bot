import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  ImageSourcePropType,
  ActivityIndicator,
} from 'react-native';
import {Text} from '../components/ui/Text';
import {ZoomableImage} from '../components/ui/ZoomableImage';
import {KeyIcon, EnvelopeIcon, ChartBarIcon, CaretUpIcon, CaretDownIcon} from 'phosphor-react-native';
import {useNavigation} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import type {RootStackParamList} from '../navigation/RootNavigator';
import {saveGoogleCredentials} from '../api/config';
import {getLlmModels, switchLlmModel} from '../api/llm';

type Nav = StackNavigationProp<RootStackParamList>;

const MODEL_OPTIONS = [
  {id: '1b', name: 'Llama 3.2 1B', size: '0.8 GB', description: 'Fastest, lowest quality', specs: '2+ GB RAM · Any modern CPU'},
  {id: '3b', name: 'Llama 3.2 3B', size: '2.0 GB', description: 'Good balance of speed & quality', specs: '4+ GB RAM · 4-core CPU'},
  {id: '7b', name: 'Llama 3.1 7B', size: '4.9 GB', description: 'Best quality, needs more RAM', specs: '8+ GB RAM · 6-core CPU'},
];

// --- Step definitions ---

interface Step {
  title: string;
  description: string;
  image: ImageSourcePropType;
  link?: string;
}

const OAUTH_STEPS: Step[] = [
  {
    title: 'Create a Google Cloud Project',
    description:
      'Go to the Google Cloud Console and click "Create project" in the top right.',
    image: require('../../assets/setup/0-create-gcp-project.png'),
    link: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    title: 'Name your project',
    description:
      'Give it any name you like (e.g. "job-bot"). Leave the organization as "No organization" and click Create.',
    image: require('../../assets/setup/1-project-name.png'),
  },
  {
    title: 'Configure the OAuth consent screen',
    description:
      'After your project is created, you\'ll see a banner prompting you to configure the OAuth consent screen. Click "Configure consent screen".',
    image: require('../../assets/setup/2-configure-consent-screen.png'),
  },
  {
    title: 'Fill in consent screen details',
    description:
      'Enter an app name (e.g. "job-bot"), select your email as the support email, then click Next through the remaining steps and click Create.',
    image: require('../../assets/setup/3-consent-screen-details.png'),
  },
  {
    title: 'Create an OAuth client',
    description:
      'From the OAuth Overview page, click "Create OAuth client". Select "Web application" as the application type.',
    image: require('../../assets/setup/4-create-OAuth-client.png'),
  },
  {
    title: 'Configure the OAuth client',
    description:
      'Leave Authorized JavaScript origins blank. Under Authorized redirect URIs, click "+ Add URI" and enter: http://localhost:3000/auth/callback — then click Create.',
    image: require('../../assets/setup/5-OAuth-client-details.png'),
  },
  {
    title: 'Copy your credentials',
    description:
      'Google will show your Client ID and Client secret. Copy both values and paste them below.',
    image: require('../../assets/setup/6-copy-OAuth-credentials.png'),
  },
];

const GMAIL_STEPS: Step[] = [
  {
    title: 'Search for Gmail API',
    description:
      'In your GCP project, search for "Gmail" in the top search bar to find the Gmail API.',
    image: require('../../assets/setup/gmail/00-gmail-search-in-gcp.png'),
    link: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  },
  {
    title: 'Enable the Gmail API',
    description:
      'Click the "Enable" button to activate the Gmail API for your project. This is required for email scanning.',
    image: require('../../assets/setup/gmail/0.1-enable-gmail-api.png'),
  },
  {
    title: 'Add yourself as a test user',
    description:
      'Go to Google Auth Platform > Audience. Under Test users, click Add users and enter your Gmail address. This is required because the app is in "Testing" mode.',
    image: require('../../assets/setup/gmail/7-audience.png'),
    link: 'https://console.cloud.google.com/auth/audience',
  },
  {
    title: 'Add test user email',
    description:
      'Enter the Gmail address you want to connect (the same one you used to create the project works fine), then save.',
    image: require('../../assets/setup/gmail/8-set-testers.png'),
  },
];

const SHEETS_STEPS: Step[] = [
  {
    title: 'Search for Google Sheets API',
    description:
      'In your GCP project, search for "Google Sheets API" in the top search bar.',
    image: require('../../assets/setup/sheets/0-google-sheets-search.png'),
    link: 'https://console.cloud.google.com/apis/library/sheets.googleapis.com',
  },
  {
    title: 'Enable the Google Sheets API',
    description:
      'Click the "Enable" button to activate the Sheets API for your project.',
    image: require('../../assets/setup/sheets/1-enable-google-sheets-api.png'),
  },
];

// --- Components ---

function StepCard({
  stepNumber,
  step,
  expanded,
  onToggle,
}: {
  stepNumber: number;
  step: Step;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.stepCard}>
      <Pressable style={styles.stepHeader} onPress={onToggle}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{stepNumber}</Text>
        </View>
        <Text style={styles.stepTitle}>{step.title}</Text>
        {expanded ? (
          <CaretUpIcon size={12} color="#666" />
        ) : (
          <CaretDownIcon size={12} color="#666" />
        )}
      </Pressable>

      {expanded && (
        <View style={styles.stepBody}>
          <Text style={styles.stepDescription}>{step.description}</Text>
          {step.link && (
            <Pressable
              style={styles.linkButton}
              onPress={() => Linking.openURL(step.link!)}>
              <Text style={styles.linkButtonText}>Open in Google Cloud</Text>
            </Pressable>
          )}
          <ZoomableImage
            source={step.image}
            style={styles.stepImage}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
}

function SetupSection({
  icon,
  title,
  subtitle,
  steps,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  steps: Step[];
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const allExpanded = expandedSteps.size === steps.length;

  function toggleStep(i: number) {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) {
      setExpandedSteps(new Set());
    } else {
      setExpandedSteps(new Set(steps.map((_, i) => i)));
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>{icon}</View>
        <View style={{flex: 1}}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <Pressable style={styles.expandAllButton} onPress={toggleAll}>
          <Text style={styles.expandAllText}>
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </Text>
        </Pressable>
      </View>
      {steps.map((step, i) => (
        <StepCard
          key={i}
          stepNumber={i + 1}
          step={step}
          expanded={expandedSteps.has(i)}
          onToggle={() => toggleStep(i)}
        />
      ))}
    </View>
  );
}

export function SetupWizardScreen() {
  const navigation = useNavigation<Nav>();
  const [showGuide, setShowGuide] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [credentialsSaved, setCredentialsSaved] = useState(false);

  // Model selection state
  const [selectedModel, setSelectedModel] = useState('3b');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSaveCredentials() {
    if (!clientId.trim() || !clientSecret.trim()) {
      Alert.alert('Error', 'Please enter both Client ID and Client Secret');
      return;
    }
    try {
      await saveGoogleCredentials(clientId.trim(), clientSecret.trim());
      setCredentialsSaved(true);
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to save credentials',
      );
    }
  }

  function navigateToMain() {
    if (pollRef.current) clearInterval(pollRef.current);
    navigation.reset({index: 0, routes: [{name: 'Main'}]});
  }

  async function handleStartDownload() {
    setDownloading(true);
    setDownloadProgress(0);
    try {
      await switchLlmModel(selectedModel);
      pollRef.current = setInterval(async () => {
        try {
          const res = await getLlmModels();
          const model = res.models.find(m => m.id === selectedModel);
          if (model) {
            setDownloadProgress(Math.round(model.download_progress));
            if (model.status === 'ready') {
              if (pollRef.current) clearInterval(pollRef.current);
              setDownloading(false);
            } else if (model.status === 'error') {
              if (pollRef.current) clearInterval(pollRef.current);
              setDownloading(false);
              Alert.alert('Error', model.error || 'Download failed');
            }
          }
        } catch {}
      }, 3000);
    } catch (err) {
      setDownloading(false);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start download');
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <Text style={styles.pageTitle}>Welcome to Job App Bot</Text>
      <Text style={styles.pageSubtitle}>
        Set up your AI model and Google account to get started. Start the model
        download first — it'll continue in the background while you configure Google.
      </Text>

      {/* --- AI Model Section --- */}
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionDividerText}>AI Model</Text>
      </View>

      <Text style={styles.aboutText}>
        Powered by{' '}
        <Text style={styles.linkText} onPress={() => Linking.openURL('https://ai.meta.com/llama/')}>
          Meta Llama
        </Text>
        {' '}(open-source). Models are downloaded as quantized GGUF files from{' '}
        <Text style={styles.linkText} onPress={() => Linking.openURL('https://huggingface.co/bartowski')}>
          HuggingFace
        </Text>
        . You can manage or delete them later in Settings.
      </Text>

      {MODEL_OPTIONS.map(opt => (
        <Pressable
          key={opt.id}
          style={[
            styles.modelCard,
            selectedModel === opt.id && styles.modelCardSelected,
          ]}
          onPress={() => !downloading && setSelectedModel(opt.id)}
        >
          <View style={styles.modelCardHeader}>
            <Text style={styles.modelCardTitle}>{opt.name}</Text>
            <Text style={styles.modelCardSize}>{opt.size}</Text>
          </View>
          <Text style={styles.modelCardDesc}>{opt.description}</Text>
          <Text style={styles.modelCardSpecs}>{opt.specs}</Text>
          {opt.id === '3b' && (
            <Text style={styles.recommendedBadge}>RECOMMENDED</Text>
          )}
        </Pressable>
      ))}

      {downloading && (
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            Downloading... {downloadProgress}%
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, {width: `${downloadProgress}%`}]}
            />
          </View>
        </View>
      )}

      <Pressable
        style={[styles.primaryButton, downloading && {opacity: 0.6}]}
        onPress={handleStartDownload}
        disabled={downloading}
      >
        {downloading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Download Model</Text>
        )}
      </Pressable>

      {/* --- Google API Section --- */}
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionDividerText}>Google API</Text>
      </View>

      <View style={styles.credentialsCard}>
        <Text style={styles.credentialsTitle}>Google API Credentials</Text>
        <Text style={styles.credentialsHint}>
          Paste your OAuth Client ID and Secret from Google Cloud Console.
        </Text>

        <Text style={styles.label}>Client ID</Text>
        <TextInput
          style={styles.input}
          value={clientId}
          onChangeText={setClientId}
          placeholder="xxx.apps.googleusercontent.com"
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!credentialsSaved}
        />

        <Text style={styles.label}>Client Secret</Text>
        <TextInput
          style={styles.input}
          value={clientSecret}
          onChangeText={setClientSecret}
          placeholder="GOCSPX-..."
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!credentialsSaved}
        />

        {credentialsSaved ? (
          <View style={styles.savedBadge}>
            <Text style={styles.savedBadgeText}>Credentials saved</Text>
          </View>
        ) : (
          <Pressable style={styles.primaryButton} onPress={handleSaveCredentials}>
            <Text style={styles.primaryButtonText}>Save Credentials</Text>
          </Pressable>
        )}
      </View>

      {/* Toggle guide */}
      <Pressable
        style={styles.guideToggle}
        onPress={() => setShowGuide(!showGuide)}>
        <View style={styles.guideToggleContent}>
          {showGuide ? (
            <CaretUpIcon size={14} color="#6366f1" />
          ) : (
            <CaretDownIcon size={14} color="#6366f1" />
          )}
          <Text style={styles.guideToggleText}>
            {showGuide
              ? 'Hide Setup Guide'
              : "Don't have credentials? Follow the setup guide"}
          </Text>
        </View>
      </Pressable>

      {/* Expandable guide sections */}
      {showGuide && (
        <View style={styles.guideContainer}>
          <SetupSection
            icon={<KeyIcon size={20} color="#6366f1" />}
            title="1. Google OAuth Credentials"
            subtitle="Create a GCP project and OAuth client to authenticate with Google APIs."
            steps={OAUTH_STEPS}
          />

          <SetupSection
            icon={<EnvelopeIcon size={20} color="#6366f1" />}
            title="2. Enable Gmail"
            subtitle="Enable the Gmail API and add yourself as a test user for email scanning."
            steps={GMAIL_STEPS}
          />

          <SetupSection
            icon={<ChartBarIcon size={20} color="#6366f1" />}
            title="3. Enable Google Sheets"
            subtitle="Enable the Sheets API so the app can read your job tracking spreadsheet."
            steps={SHEETS_STEPS}
          />
        </View>
      )}

      {/* Finish button */}
      <Pressable style={styles.finishButton} onPress={navigateToMain}>
        <Text style={styles.primaryButtonText}>Get Started</Text>
      </Pressable>
      <Text style={styles.finishHint}>
        You can always update these settings later.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    lineHeight: 20,
  },

  // Credentials card
  credentialsCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  credentialsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  credentialsHint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    marginBottom: 16,
  },

  // Guide toggle
  guideToggle: {
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  guideToggleContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  guideToggleText: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '600',
  },
  guideContainer: {
    marginTop: 8,
  },

  // Sections
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  sectionIcon: {
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  expandAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
    marginTop: 2,
  },
  expandAllText: {
    color: '#6366f1',
    fontSize: 11,
    fontWeight: '600',
  },

  // Step cards
  stepCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  chevron: {
    fontSize: 10,
    color: '#666',
  },
  stepBody: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
    padding: 14,
  },
  stepDescription: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 12,
  },
  stepImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  linkButton: {
    backgroundColor: '#6366f1',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Buttons
  primaryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 12,
    padding: 8,
    alignItems: 'center',
  },
  skipText: {
    color: '#888',
    fontSize: 14,
  },

  aboutText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    marginBottom: 16,
  },
  linkText: {
    color: '#6366f1',
    fontWeight: '600',
  },

  // Model selection cards
  modelCard: {
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  modelCardSelected: {
    borderColor: '#6366f1',
  },
  modelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modelCardSize: {
    fontSize: 13,
    color: '#888',
  },
  modelCardDesc: {
    fontSize: 13,
    color: '#aaa',
  },
  modelCardSpecs: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  recommendedBadge: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: '600',
    marginTop: 6,
  },
  progressSection: {
    marginVertical: 16,
  },
  progressText: {
    fontSize: 13,
    color: '#ccc',
    marginBottom: 6,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#6366f1',
    borderRadius: 3,
  },
  sectionDivider: {
    marginTop: 24,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 8,
  },
  sectionDividerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  savedBadge: {
    backgroundColor: '#1a3a2a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  savedBadgeText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  finishButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 32,
  },
  finishHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
});
