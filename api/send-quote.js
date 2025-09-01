import sendgrid from '@sendgrid/mail';
sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

// simple HTML-escape helper
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const {
      name = '',
      email = '',
      location = '',
      preferred_contact = '',
      notes = '',
      
      cart_items // might be array or string
    } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and Email are required' });
    }

    // Normalize cart_items into an array of objects:
    let itemsArray = [];

    if (Array.isArray(cart_items)) {
      itemsArray = cart_items;
    } else if (typeof cart_items === 'string' && cart_items.trim()) {
      // attempt to parse JSON string
      try {
        itemsArray = JSON.parse(cart_items);
        if (!Array.isArray(itemsArray)) itemsArray = [];
      } catch (e) {
        // fallback: try to parse legacy text format (best-effort)
        const lines = cart_items.split('\n').map(l => l.trim()).filter(Boolean);
        // Attempt grouping: each item may consist of 3 lines: title, Qty: X, Price: Y
        for (let i = 0; i < lines.length; i += 3) {
          const title = lines[i] || '';
          const qtyLine = lines[i + 1] || '';
          const priceLine = lines[i + 2] || '';
          const quantityMatch = qtyLine.match(/Qty:\s*(\d+)/i);
          const priceMatch = priceLine.match(/Price:\s*(.*)/i);
          itemsArray.push({
            title,
            variant: null,
            quantity: quantityMatch ? parseInt(quantityMatch[1], 10) : '',
            price_formatted: priceMatch ? priceMatch[1].trim() : ''
          });
        }
      }
    }

    // Build table rows from itemsArray
    const cartRows = itemsArray.map(item => {
      const title = escapeHtml(item.title || item.name || '');
      const variant = item.variant && item.variant !== 'null' ? escapeHtml(item.variant) : '';
      const qty = escapeHtml(String(item.quantity || ''));
      const price = escapeHtml(item.price_formatted || item.formatted_price || item.price || '');
      return `<tr>
        <td style="border:1px solid #ddd;padding:8px;">${title}</td>
        <td style="border:1px solid #ddd;padding:8px;text-align:center;">${qty}</td>
        <td style="border:1px solid #ddd;padding:8px;text-align:right;">${price}</td>
      </tr>`;
    }).join('');

    const emailHTML = `
  <div style="font-family: Arial, sans-serif; color: #333; background:#f7f7f7; padding:30px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.1);">
      
      <!-- Header -->
      <div style="background:#82b517;color:#fff;padding:20px;text-align:center;">
        <h2 style="margin:0;font-size:22px;">Quote Request Details</h2>
      </div>
      
      <!-- Body -->
      <div style="padding:25px;">
        <p style="font-size:15px;margin-bottom:12px;">
          <strong>Name:</strong> ${escapeHtml(name)}<br>
          <strong>Email:</strong> ${escapeHtml(email)}<br>
          <strong>Location:</strong> ${escapeHtml(location)}<br>
          <strong>Preferred Contact:</strong> ${escapeHtml(preferred_contact)}<br>
          
        </p>

        ${notes ? `
          <div style="margin:20px 0;">
            <h3 style="font-size:16px;margin-bottom:8px;color:#444;">Notes / Instructions</h3>
            <p style="background:#fafafa;padding:12px;border-left:4px solid #82b517;border-radius:4px;font-size:14px;line-height:1.5;">
              ${escapeHtml(notes).replace(/\n/g, '<br>')}
            </p>
          </div>
        ` : ''}

        <h3 style="font-size:16px;margin-top:25px;color:#444;">Cart Items</h3>
        <table style="border-collapse:collapse;width:100%;margin-top:10px;font-size:14px;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd;padding:10px;background:#f3f3f3;text-align:left;">Product</th>
              <th style="border:1px solid #ddd;padding:10px;background:#f3f3f3;text-align:center;">Quantity</th>
              <th style="border:1px solid #ddd;padding:10px;background:#f3f3f3;text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${cartRows}
          </tbody>
        </table>
      </div>
      
      <!-- Footer -->
      <div style="background:#f9f9f9;padding:15px;text-align:center;font-size:12px;color:#888;">
        <p style="margin:0;">This request was submitted via <strong>${process.env.STORE_NAME || 'Our Store'}</strong>.</p>
      </div>
    </div>
  </div>
`;


    // Send to admin
    await sendgrid.send({
      to: process.env.ADMIN_EMAIL,
      from: process.env.FROM_EMAIL,
      subject: `New Quote Request from ${name}`,
      html: emailHTML
    });

    // Send same email to customer
    await sendgrid.send({
      to: email,
      from: process.env.FROM_EMAIL,
      subject: `Quote Request Received - ${process.env.STORE_NAME || ''}`,
      html: emailHTML
    });

    return res.status(200).json({ message: 'Emails sent successfully!' });
  } catch (error) {
    console.error('SendGrid error:', error);
    return res.status(500).json({ message: 'Error sending email', error: String(error) });
  }
}
