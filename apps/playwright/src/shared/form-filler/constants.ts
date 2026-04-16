import type { FormProfile } from './types'

/** CSS.escape polyfill for Node.js (not available outside browsers) */
export const cssEscape = typeof CSS !== 'undefined' && CSS.escape
  ? (s: string) => CSS.escape(s)
  : (s: string) => s.replace(/([^\w-])/g, '\\$1')

// Maps label keywords (EN/DE) to profile field names
export const LABEL_TO_FIELD: [RegExp, keyof FormProfile][] = [
  // Name fields
  [/\b(first\s*name|vorname|given\s*name)\b/i, 'firstName'],
  [/\b(last\s*name|nachname|surname|family\s*name|familienname)\b/i, 'lastName'],
  // Contact
  [/\b(e[\s-]*mail|email)\b/i, 'email'],
  [/\b(phone|telefon|tel\.?|handy|mobil|mobile)\b/i, 'phone'],
  [/\b(linkedin)\b/i, 'linkedinUrl'],
  // Location — specific fields first, then generic fallback
  [/\b(zip\s*code|postal\s*code|plz|postleitzahl)\b/i, 'zipCode'],
  [/\b(state|province|bundesland|region)\b/i, 'state'],
  [/\b(country|land)\b/i, 'country'],
  [/\b(city|stadt|ort)\b(?!.*country)/i, 'city'],
  [/\b(where.*based|current.*location|standort|wohnort|location)\b/i, 'currentLocation'],
  // Salary
  [/\b(salary|gehalt|gehaltsvorstellung|compensation|vergütung)\b/i, 'salaryExpectations'],
  // Availability & start date
  [/\b(earliest.*start|start\s*date|eintrittsdatum|frühest|starttermin|when.*start)\b/i, 'earliestStartDate'],
  [/\b(availability|verfügbar|notice\s*period|kündigungsfrist)\b/i, 'availability'],
  // Visa & nationality
  [/\b(nationality|staatsangehörigkeit|staatsbürgerschaft|citizenship)\b/i, 'nationality'],
  [/\b(visa|work\s*permit|blue\s*card|aufenthalt|arbeitserlaubnis|arbeitsvisum)\b/i, 'workVisaStatus'],
  // Gender
  [/\b(gender|geschlecht|i\s+identify)\b/i, 'gender'],
  // Referral
  [/\b(hear\s*about|how.*find|quelle|erfahren|woher|source|referral)\b/i, 'referralSource'],
]

// Synonym groups: when the user's stored value is X, also try matching these alternatives
export const DROPDOWN_SYNONYMS: Record<string, string[]> = {
  // Availability / notice period
  'immediately': ['sofort', 'ab sofort', 'right away', 'asap', 'now', 'as soon as possible'],
  '2 weeks': ['2 wochen', '14 days', '14 tage', 'two weeks', 'zwei wochen'],
  '1 month': ['1 monat', '4 weeks', '30 days', 'one month', 'ein monat'],
  '2 months': ['2 monate', 'two months', 'zwei monate'],
  '3 months': ['3 monate', 'three months', 'drei monate', '90 days'],
  '6 months': ['6 monate', 'six months', 'sechs monate'],

  // Work visa — expanded for US citizen applying to DE/AT jobs
  'no - will need sponsorship': ['no', 'nein', 'no i don\'t', 'need sponsorship', 'benötige visum',
    'not yet', 'noch nicht', 'will need', 'require sponsorship', 'require visa',
    'no work permit', 'keine arbeitserlaubnis'],
  'yes - have work visa': ['yes', 'ja', 'yes i do', 'i have', 'authorized', 'berechtigt',
    'have work permit', 'have visa', 'habe visum', 'habe arbeitserlaubnis'],
  'yes - blue card': ['blue card', 'blaue karte', 'blue card holder'],
  'yes - eu citizen': ['eu citizen', 'eu bürger', 'european citizen', 'eu national', 'eu/eea', 'eu/ewr'],
  'in process': ['in bearbeitung', 'pending', 'applied', 'beantragt', 'in progress'],
  'not required': ['nicht erforderlich', 'not needed', 'not applicable'],

  // Nationality
  'us citizen': ['american', 'united states', 'usa', 'us', 'amerikanisch'],
  'german': ['deutsch', 'germany', 'deutschland'],
  'austrian': ['österreichisch', 'austria', 'österreich'],

  // Gender
  'male': ['männlich', 'man', 'herr', 'm'],
  'female': ['weiblich', 'woman', 'frau', 'w', 'f'],
  'non-binary': ['nicht-binär', 'divers', 'other', 'sonstiges', 'andere'],
  'prefer not to say': ['keine angabe', 'not specified', 'not disclosed', 'rather not say',
    'möchte ich nicht angeben'],

  // Referral source
  'linkedin': ['social media', 'soziale medien'],
  'indeed': ['job board', 'jobbörse', 'stellenbörse'],
  'glassdoor': ['review site', 'bewertungsportal'],
  'company website': ['karriereseite', 'career page', 'website', 'webseite'],
  'job board': ['stellenportal', 'jobbörse', 'stepstone', 'xing'],
  'recruiter': ['headhunter', 'personalberater', 'staffing agency', 'personalvermittlung'],
  'friend / referral': ['empfehlung', 'friend', 'referral', 'freund', 'bekannter', 'employee referral'],
}
