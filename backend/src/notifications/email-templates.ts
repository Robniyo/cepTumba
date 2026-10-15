/**
 * Professional HTML email template for the CEP Tumba Association
 * Management System. Inline styles only (most clients strip <style>).
 */

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export type EmailDetail = { label: string; value: string };

export type EmailTemplateInput = {
  /** Visible preview line shown in inbox snippets. */
  preheader?: string;
  /** Heading shown in the colored hero section. */
  heading: string;
  /** Optional sub-heading / tag below the title (e.g., "Announcement"). */
  eyebrow?: string;
  /** Greeting line, e.g., "Hello Emmy,". */
  greeting?: string;
  /** Main paragraphs of plain text. Each item becomes its own <p>. */
  paragraphs: string[];
  /** Optional key/value bullet section (e.g., "Title", "Submitted by"). */
  details?: EmailDetail[];
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
  /** Optional small foot note above the brand footer. */
  footnote?: string;
  /** Brand name shown in header + footer. */
  brandName?: string;
};

const BRAND_DEFAULT = 'CEP Tumba College Association';

const renderDetailsTable = (details: EmailDetail[]): string => {
  if (details.length === 0) return '';
  const rows = details
    .map(
      (d) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:600;width:35%;vertical-align:top;">${escapeHtml(d.label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;vertical-align:top;">${escapeHtml(d.value)}</td>
        </tr>`,
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:18px 0;">
      ${rows}
    </table>`;
};

const renderCta = (cta?: { label: string; url: string }): string => {
  if (!cta) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background:#4f46e5;">
          <a href="${escapeHtml(cta.url)}" target="_blank" rel="noopener"
             style="display:inline-block;padding:12px 24px;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
            ${escapeHtml(cta.label)}
          </a>
        </td>
      </tr>
    </table>`;
};

export const renderEmail = (input: EmailTemplateInput): string => {
  const brand = input.brandName ?? BRAND_DEFAULT;
  const year = new Date().getFullYear();
  const preheader = escapeHtml(input.preheader ?? '');
  const eyebrow = input.eyebrow
    ? `<div style="display:inline-block;padding:4px 10px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#4f46e5;background:#eef2ff;border-radius:999px;font-weight:600;margin-bottom:12px;">${escapeHtml(
        input.eyebrow,
      )}</div>`
    : '';
  const greeting = input.greeting
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#111827;">${escapeHtml(input.greeting)}</p>`
    : '';
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#374151;">${escapeHtml(p)}</p>`,
    )
    .join('');
  const details = renderDetailsTable(input.details ?? []);
  const cta = renderCta(input.cta);
  const footnote = input.footnote
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">${escapeHtml(input.footnote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
    <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.06);">
            <tr>
              <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 32px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;font-weight:600;">${escapeHtml(brand)}</div>
                <div style="margin-top:6px;font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(input.heading)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                ${eyebrow}
                ${greeting}
                ${paragraphs}
                ${details}
                ${cta}
                ${footnote}
              </td>
            </tr>
            <tr>
              <td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5;">
                <div>You are receiving this email because you are a member of ${escapeHtml(brand)}.</div>
                <div style="margin-top:6px;">&copy; ${year} ${escapeHtml(brand)}. All rights reserved.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

/** Build a plain-text fallback from the same content blocks. */
export const renderEmailPlainText = (input: EmailTemplateInput): string => {
  const lines: string[] = [];
  if (input.greeting) lines.push(input.greeting);
  for (const p of input.paragraphs) lines.push(p);
  if (input.details && input.details.length > 0) {
    lines.push('');
    for (const d of input.details) lines.push(`${d.label}: ${d.value}`);
  }
  if (input.cta) {
    lines.push('');
    lines.push(`${input.cta.label}: ${input.cta.url}`);
  }
  if (input.footnote) {
    lines.push('');
    lines.push(input.footnote);
  }
  return lines.join('\n');
};
