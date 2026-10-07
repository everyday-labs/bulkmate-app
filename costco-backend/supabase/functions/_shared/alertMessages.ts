// Copy and links for price-drop emails and texts, shared by price-match-check
// (immediate email) and weekly-price-texts (Friday SMS digest).

// Universal link: opens the app's /alerts screen when Bulkmate is installed
// (apple-app-site-association on everyday-labs.org), otherwise a web page
// that explains how to open it. Plain bulkmate:// links aren't clickable in
// most SMS and email clients.
export const ALERTS_URL = 'https://everyday-labs.org/alerts';

const SITE_URL = 'https://everyday-labs.org';

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Weekly SMS. Must stay a single SMS: <= 160 characters, GSM-7 only (plain
 * ASCII here) — see sendBrevoSms. The STOP line is required for recurring
 * texts by US carriers.
 */
export function buildWeeklySms(dropCount: number, totalSavings: number): string {
  const drops = dropCount === 1 ? '1 price drop' : `${dropCount} price drops`;
  const msg =
    `Bulkmate: ${drops} on items you bought. You could get ${formatUsd(totalSavings)} back. ` +
    `View: ${ALERTS_URL} Reply STOP to opt out`;
  if (msg.length > 160) {
    // Only reachable with an absurd count/amount; keep it to one SMS regardless.
    return `Bulkmate: price drops on items you bought. View: ${ALERTS_URL} Reply STOP to opt out`;
  }
  return msg;
}

/** Immediate price-drop email: total savings + a button into the app. */
export function buildPriceDropEmail(
  dropCount: number,
  totalSavings: number,
  unsubscribeUrl: string,
): { subject: string; html: string; text: string } {
  const amount = formatUsd(totalSavings);
  const items = dropCount === 1 ? '1 item' : `${dropCount} items`;
  const subject = `Price drop: you could get ${amount} back`;

  const text = [
    `You could get ${amount} back on ${items} you bought.`,
    '',
    `The price dropped after your purchase. Costco offers a price adjustment within 30 days of purchase - bring your receipt to the membership counter.`,
    '',
    `View the details in Bulkmate: ${ALERTS_URL}`,
    '',
    `Bulkmate by Everyday Labs - ${SITE_URL}`,
    `An independent app, not affiliated with Costco Wholesale.`,
    `Stop these emails: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<div style="background:#FDFAF3;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:440px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px 28px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:12px;background:#D1373A;color:#FFFFFF;font-size:24px;font-weight:900;">B</div>
      <div style="margin-top:10px;font-size:18px;font-weight:800;letter-spacing:4px;color:#1B2A4A;">BULKMATE</div>
    </div>
    <p style="margin:0 0 4px;text-align:center;font-size:13px;font-weight:700;letter-spacing:2px;color:#8A8A8A;">PRICE DROP</p>
    <h1 style="margin:0 0 8px;text-align:center;font-size:30px;color:#1B2A4A;">You could get ${amount} back</h1>
    <p style="margin:0 0 24px;text-align:center;font-size:15px;line-height:1.5;color:#4A4A4A;">on ${items} you bought, now that the price has dropped.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${ALERTS_URL}" style="display:inline-block;background:#D1373A;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 28px;border-radius:12px;">View in Bulkmate</a>
    </div>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#8A8A8A;">Costco offers a price adjustment within 30 days of purchase &mdash; bring your receipt to the membership counter.</p>
  </div>
  <p style="max-width:440px;margin:16px auto 0;text-align:center;font-size:11px;line-height:1.6;color:#A0A0A0;">
    <a href="${SITE_URL}" style="color:#A0A0A0;">Bulkmate by Everyday Labs</a> &middot; An independent app, not affiliated with Costco Wholesale.<br>
    <a href="${unsubscribeUrl}" style="color:#A0A0A0;">Stop price-drop emails</a>
  </p>
</div>`;

  return { subject, html, text };
}
