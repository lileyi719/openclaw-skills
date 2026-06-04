import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { JOB_APPS_DIR } from './pipeline-log.mjs';

const PROFILE_JSON = resolve(JOB_APPS_DIR, 'applicant-profile.json');

export function loadApplicantProfile() {
  if (existsSync(PROFILE_JSON)) {
    const data = JSON.parse(readFileSync(PROFILE_JSON, 'utf8'));
    const resumePath = resolve(JOB_APPS_DIR, 'resume.txt');
    return {
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country,
      linkedIn: data.linkedinUrl || '',
      dateAvailable: data.dateAvailable,
      workAuthorization: data.workAuthorization,
      resumePath,
    };
  }

  const resumePath = resolve(JOB_APPS_DIR, 'resume.txt');
  const text = existsSync(resumePath) ? readFileSync(resumePath, 'utf8') : '';

  const email =
    process.env.APPLICANT_EMAIL ||
    process.env.LINKEDIN_EMAIL ||
    text.match(/\*\*Email:\*\*\s*(.+)/i)?.[1]?.trim() ||
    'unojose234@gmail.com';

  const phone =
    process.env.APPLICANT_PHONE || text.match(/\*\*Phone:\*\*\s*(.+)/i)?.[1]?.trim() || '';

  const name =
    process.env.APPLICANT_NAME ||
    text.match(/\*\*Name:\*\*\s*(.+)/i)?.[1]?.trim() ||
    'Yiqun Xu';

  const linkedIn = process.env.APPLICANT_LINKEDIN_URL || '';

  return { name, email, phone, linkedIn, resumePath };
}
