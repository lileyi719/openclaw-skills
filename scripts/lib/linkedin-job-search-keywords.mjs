/**
 * LinkedIn Jobs search keywords for external-apply agent runs.
 * Keep in sync with skills/job-applications/prompts/linkedin-external-compact.md
 */

export const LINKEDIN_JOB_SEARCH_KEYWORDS = [
  'Software Engineer',
  'Backend Engineer',
  'Frontend Engineer',
  'Full Stack Engineer',
  'Python Engineer',
  'Node.js Engineer',
  'Java Developer',
  'Software Developer',
  'Site Reliability Engineer',
  'Machine Learning Engineer',
];

export const LINKEDIN_JOB_SEARCH_LOCATION = 'United States';

export function buildLinkedInJobSearchUrl(keywords, location = LINKEDIN_JOB_SEARCH_LOCATION) {
  const params = new URLSearchParams({
    keywords: keywords || LINKEDIN_JOB_SEARCH_KEYWORDS[0],
    location,
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export function formatKeywordRotationBlock() {
  const lines = LINKEDIN_JOB_SEARCH_KEYWORDS.map((kw, i) => {
    const url = buildLinkedInJobSearchUrl(kw);
    return `${i + 1}. \`${kw}\` → \`${url}\``;
  });
  return lines.join('\n');
}

export function formatKeywordListInline() {
  return LINKEDIN_JOB_SEARCH_KEYWORDS.join(' · ');
}
