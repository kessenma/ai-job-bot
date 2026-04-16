export const JOB_DESCRIPTION_SELECTORS = [
  // ATS-specific selectors (most reliable)
  '.posting-page',
  '[data-testid="job-description"]',
  '.job-description',
  '#job-description',
  '.job-details',
  '.posting-description',
  '[class*="jobDescription"]',
  '[class*="job-posting"]',
  // Recruitee
  '.career-page-description',
  '.custom-css-style-job-widget-description',
  // Greenhouse (specific — avoid generic #content which matches too broadly)
  '.job__description',
  '#app_body',
  '.section-wrapper',
  '[class*="job-post"]',
  // Lever
  '.posting-page .content',
  // Ashby
  '[class*="ashby-job-posting"]',
  // Personio
  '.job-posting',
  // Join
  '.job-ad-display',
  // Workday
  '[data-automation-id="jobPostingDescription"]',
  '[class*="jobPostingDescription"]',
  // SmartRecruiters
  '.job-sections',
  '.job-description-container',
  // BambooHR
  '.BambooHR-ATS-board__JobPost',
  // Workable
  '[data-ui="job-description"]',
  // Generic but specific
  '[class*="career"][class*="description"]',
  '[class*="posting"][class*="content"]',
  // Generic fallbacks (broader)
  '#content',
  'article',
  'main',
  '[role="main"]',
]

/**
 * Minimum character count for a valid job description extraction.
 * If the extracted text is shorter, we try the next selector or fallbacks.
 */
export const MIN_DESCRIPTION_LENGTH = 200
