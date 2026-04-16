export interface Step {
  title: string
  description: React.ReactNode
  image: string
  link?: string
}

export const OAUTH_STEPS: Step[] = [
  {
    title: 'Create a Google Cloud Project',
    description:
      'Go to the Google Cloud Console and click "Create project" in the top right.',
    image: '/setup/0-create-gcp-project.png',
    link: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    title: 'Name your project',
    description:
      'Give it any name you like (e.g. "job-bot"). Leave the organization as "No organization" and click Create.',
    image: '/setup/1-project-name.png',
  },
  {
    title: 'Configure the OAuth consent screen',
    description:
      'After your project is created, you\'ll see a banner prompting you to configure the OAuth consent screen. Click "Configure consent screen".',
    image: '/setup/2-configure-consent-screen.png',
  },
  {
    title: 'Fill in consent screen details',
    description:
      'Enter an app name (e.g. "job-bot"), select your email as the support email, then click Next through the remaining steps (Audience, Contact Info) and click Create.',
    image: '/setup/3-consent-screen-details.png',
  },
  {
    title: 'Create an OAuth client',
    description:
      'From the OAuth Overview page, click "Create OAuth client". Select "Web application" as the application type.',
    image: '/setup/4-create-OAuth-client.png',
  },
  {
    title: 'Configure the OAuth client',
    description: (
      <>
        Leave <strong>Authorized JavaScript origins</strong> blank. Under{' '}
        <strong>Authorized redirect URIs</strong>, click "+ Add URI" and enter:
        <code className="my-2 block rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
          http://localhost:3000/auth/callback
        </code>
        Then click Create.
      </>
    ),
    image: '/setup/5-OAuth-client-details.png',
  },
  {
    title: 'Copy your credentials',
    description: (
      <>
        Google will show your <strong>Client ID</strong> and{' '}
        <strong>Client secret</strong>. Copy both values — you&apos;ll need them for your{' '}
        <code>.env</code> file.
      </>
    ),
    image: '/setup/6-copy-OAuth-credentials.png',
  },
]

export const GMAIL_STEPS: Step[] = [
  {
    title: 'Search for Gmail API',
    description:
      'In your GCP project, search for "Gmail" in the top search bar to find the Gmail API.',
    image: '/setup/gmail/00-gmail-search-in-gcp.png',
    link: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  },
  {
    title: 'Enable the Gmail API',
    description:
      'Click the "Enable" button to activate the Gmail API for your project. This is required for email scanning.',
    image: '/setup/gmail/0.1-enable-gmail-api.png',
  },
  {
    title: 'Add yourself as a test user',
    description: (
      <>
        Go to <strong>Google Auth Platform &rarr; Audience</strong>. Under{' '}
        <strong>Test users</strong>, click <strong>Add users</strong> and enter your Gmail
        address. This is required because the app is in &ldquo;Testing&rdquo; mode.
      </>
    ),
    image: '/setup/gmail/7-audience.png',
    link: 'https://console.cloud.google.com/auth/audience',
  },
  {
    title: 'Add test user email',
    description:
      'Enter the Gmail address you want to connect (the same one you used to create the project works fine), then save.',
    image: '/setup/gmail/8-set-testers.png',
  },
  {
    title: 'Connect Gmail from the app',
    description: (
      <>
        After adding your credentials to <code>.env</code> and restarting the dev server,
        go to the <strong>Email Scanner</strong> page and click{' '}
        <strong>Connect Gmail</strong>.
      </>
    ),
    image: '/setup/gmail/9-connect-gmail.png',
  },
  {
    title: 'Sign in with Google',
    description:
      'You\'ll be redirected to Google\'s sign-in page. Select your account and grant read-only access to Gmail and Sheets.',
    image: '/setup/gmail/10-sign-in.png',
  },
  {
    title: 'Scan your emails',
    description:
      'Once connected, you can scan for rejection and interview emails across all companies in your spreadsheet.',
    image: '/setup/gmail/11-scan-emails.png',
  },
]

export const SHEETS_STEPS: Step[] = [
  {
    title: 'Search for Google Sheets API',
    description:
      'In your GCP project, search for "Google Sheets API" in the top search bar.',
    image: '/setup/sheets/0-google-sheets-search.png',
    link: 'https://console.cloud.google.com/apis/library/sheets.googleapis.com',
  },
  {
    title: 'Enable the Google Sheets API',
    description:
      'Click the "Enable" button to activate the Sheets API for your project.',
    image: '/setup/sheets/1-enable-google-sheets-api.png',
  },
]
