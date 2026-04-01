const nodemailer = require('nodemailer');
const polymerIndexes = require('../src/backend/polymer-indexes');
const { loadEnvFiles } = require('../src/backend/utils/env');

loadEnvFiles();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredEnvAny(names) {
  for (const name of names || []) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable (any of: ${names.join(', ')})`);
}

function firstEnv(names, fallback = '') {
  for (const name of names || []) {
    const value = process.env[name];
    if (value) return value;
  }
  return fallback;
}

function getEmailVisualSpacerLines(count = 4) {
  // Trailing truly empty lines can be trimmed by mail systems.
  // NBSP lines render as visually blank separators.
  return Array.from({ length: count }, () => '\u00A0');
}

async function sendReminderEmail(dueRows, dateIso) {
  const host = requiredEnvAny(['SMTP_HOST', 'MAIL_HOST']);
  const port = Number(firstEnv(['SMTP_PORT', 'MAIL_PORT'], '587'));
  const user = requiredEnvAny(['SMTP_USER', 'SMTP_USERNAME']);
  const pass = requiredEnvAny(['SMTP_PASS', 'SMTP_PASSWORD']);
  const secureFromEnv = String(firstEnv(['SMTP_SECURE'], '')).trim().toLowerCase();
  const secure = secureFromEnv === 'true' ? true : (secureFromEnv === 'false' ? false : port === 465);

  const from = firstEnv(['REMINDER_FROM_EMAIL', 'APPROVAL_FROM_EMAIL', 'SMTP_FROM_EMAIL', 'SMTP_USER', 'SMTP_USERNAME']);
  if (!from) {
    throw new Error('Missing sender email variable (REMINDER_FROM_EMAIL/APPROVAL_FROM_EMAIL/SMTP_FROM_EMAIL)');
  }

  const toRaw = firstEnv(['REMINDER_TO_EMAIL', 'RECIPE_SUBMISSION_NOTIFY_TO', 'RECIPE_APPROVAL_NOTIFY_TO', 'APPROVAL_NOTIFY_TO']);
  if (!toRaw) {
    throw new Error('Missing recipient variable (REMINDER_TO_EMAIL/RECIPE_SUBMISSION_NOTIFY_TO/RECIPE_APPROVAL_NOTIFY_TO/APPROVAL_NOTIFY_TO)');
  }
  const recipients = toRaw.split(',').map((item) => item.trim()).filter(Boolean);
  if (!recipients.length) {
    throw new Error('No valid reminder recipients configured');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  const textBody = [
    `Polymer index reminder for ${dateIso}`,
    '',
    'The following indexes are due for weekly value entry:',
    ...dueRows.map((row, i) => `${i + 1}. ${row.name} | last value date: ${row.latest_value_date || 'none'}`),
    '',
    'Open the app: /polymer-indexes',
    ...getEmailVisualSpacerLines(4)
  ].join('\n');

  await transporter.sendMail({
    from,
    to: recipients.join(', '),
    subject: `Polymer Index Reminder - ${dateIso} (${dueRows.length} due)` ,
    text: textBody
  });
}

async function main() {
  try {
    await polymerIndexes.initializeDatabase();
    const due = await polymerIndexes.getDueReminders(new Date());
    const dueRows = due.dueIndexes || [];

    if (!dueRows.length) {
      console.log(`No due indexes for ${due.date}. No email sent.`);
      process.exit(0);
    }

    await sendReminderEmail(dueRows, due.date);
    console.log(`Reminder email sent for ${dueRows.length} due indexes.`);
    process.exit(0);
  } catch (err) {
    console.error('Reminder job failed:', err.message);
    process.exit(1);
  }
}

main();
