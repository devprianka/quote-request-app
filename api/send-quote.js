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

// helper to parse price strings like "$12.50" or "12.50"
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const num = parseFloat(priceStr.replace(/[^0-9.-]+/g, ''));
  return isNaN(num) ? 0 : num;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const {
      name,
      email,
      invoice_contact,
      street,
      city,
      province,
      postal_code,
      country,
      preferred_contact,
      preferred_delivery,
      notes,
      cart_items,

      // labels
      language,
      label_name,
      label_email,
      label_invoice_contact,
      label_street,
      label_city,
      label_province,
      label_postal_code,
      label_country,
      label_contact,
      label_delivery,
      label_notes
    } = req.body || {};


    if (!name || !email) return res.status(400).json({ message: 'Name and Email are required' });

    let itemsArray = [];

    if (Array.isArray(cart_items)) {
      itemsArray = cart_items;
    } else if (typeof cart_items === 'string' && cart_items.trim()) {
      try {
        itemsArray = JSON.parse(cart_items);
        if (!Array.isArray(itemsArray)) itemsArray = [];
      } catch (e) {
        const lines = cart_items.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i += 3) {
          const title = lines[i] || '';
          const qtyLine = lines[i + 1] || '';
          const priceLine = lines[i + 2] || '';
          const quantityMatch = qtyLine.match(/Qty:\s*(\d+)/i);
          const priceMatch = priceLine.match(/Price:\s*(.*)/i);
          itemsArray.push({
            title,
            variant: null,
            quantity: quantityMatch ? parseInt(quantityMatch[1], 10) : 0,
            price_formatted: priceMatch ? priceMatch[1].trim() : '0'
          });
        }
      }
    }

    // Build table rows & calculate subtotal
    let subtotal = 0;
    const cartRows = itemsArray.map(item => {
      const title = escapeHtml(item.title || item.name || '');
      const variant = item.variant && item.variant !== 'null' ? escapeHtml(item.variant) : '';
      const qty = Number(item.quantity || 0);
      const priceNum = parsePrice(item.price_formatted || item.formatted_price || item.price || '0');
      subtotal += priceNum;

      const priceDisplay = item.price_formatted || `$${priceNum.toFixed(2)}`;
      return `<tr>
        <td style="border:1px solid #ddd;padding:8px;">${title}${variant ? ' (' + variant + ')' : ''}</td>
        <td style="border:1px solid #ddd;padding:8px;text-align:center;">${qty}</td>
        <td style="border:1px solid #ddd;padding:8px;text-align:right;">${priceDisplay}</td>
      </tr>`;
    }).join('');

    // Build full address block
    const fullAddress = [street, city, province, postal_code, country]
      .filter(Boolean)
      .map(escapeHtml)
      .join(', ');

    const t = (en, fr) => language === 'fr' ? fr : en;
   const emailHTML = `
<div style="font-family: Arial, sans-serif; color: #333; background:#f7f7f7;">
  <div style="max-width:800px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background:#82b517;color:#fff;padding:10px 20px;text-align:left;">
      <img src="https://www.organiknation.ca/cdn/shop/files/LOGO-Footer.png" alt="Organic Nation" style="height: 80px; width: 80px;" >
    </div>
    
    <!-- Body -->
    <div style="padding: 10px 25px;">
      <h2 style="font-size: 30px; font-weight: 600; color: #4b4a4a;">${t('Thank you for your order!', 'Merci pour votre commande!')}</h2>
      <p style="font-size:16px; line-height: 26px; color: #4b4a4a; margin:0px; margin-bottom: 15px;">
        ${t(
          "We’ve received your details and will now calculate the most efficient and cost-effective shipping option to make sure your products arrive safely.<br>Our team will get back to you within the next hours with a complete quote including shipping costs and delivery timeline.",
          "Nous avons reçu vos informations et allons maintenant calculer l'option d'expédition la plus efficace et la plus rentable afin que vos produits arrivent en toute sécurité.<br>Notre équipe vous recontactera dans les prochaines heures avec un devis complet incluant les frais de livraison et le délai."
        )}
      </p>
      <p style="font-size:16px; line-height: 26px; color: #4b4a4a; margin:0px;">
        <b>${t('Reminder:', 'Rappel :')}</b> ${t(
          "It’s never too late to modify or clarify your order. If you’d like to adjust anything, simply reply to this email. You can also reach us directly at",
          "Il n'est jamais trop tard pour modifier ou clarifier votre commande. Si vous souhaitez apporter des modifications, répondez simplement à cet e-mail. Vous pouvez également nous contacter directement au"
        )}
        <a href="tel:14185704073" style="font-size:16px; color: #82b517; line-height: 24px; text-decoration: none;"> (418) 570-4073</a>.
      </p>
    </div>
    
    <!-- Cart Items -->
    <div style="padding:10px 25px;">
      <h3 style="font-size:18px; color:#444;">${t('Cart Items', 'Articles du panier')}</h3>
      <table style="border-collapse:collapse;width:100%;margin-top:10px;font-size:14px;">
        <thead>
          <tr>
            <th style="border:1px solid #ddd; padding:10px; background:#231709;text-align:left; color: #fff; font-size:17px; font-weight: 500;">${t('Product','Produit')}</th>
            <th style="border:1px solid #ddd; padding:10px; background:#231709;text-align:center; color: #fff; font-size:17px; font-weight: 500;">${t('Quantity','Quantité')}</th>
            <th style="border:1px solid #ddd; padding:10px; background:#231709;text-align:right; color: #fff; font-size:17px; font-weight: 500;">${t('Price','Prix')}</th>
          </tr>
        </thead>
        <tbody>
          ${cartRows}
          <tr>
            <td colspan="2" style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold; font-size:16px; color: #231709;">${t('Subtotal','Sous-total')}</td>
            <td style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold; font-size:18px; color: #231709;">$${subtotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Customer Details -->
    <div style="padding:25px;">
      <div style="background-color: #fafafa; border: 1px solid #ddd; padding:25px;">
        <p style="font-size:15px; margin:0px; line-height: 28px; color: #4b4a4a;">
          <strong>${escapeHtml(label_name || 'Name')}:</strong> ${escapeHtml(name)}<br>
          <strong>${escapeHtml(label_email || 'Email')}:</strong> ${escapeHtml(email)}<br>
          <strong>${escapeHtml(label_invoice_contact || 'Contact for Invoicing')}:</strong> ${escapeHtml(invoice_contact)}<br>
          <strong>${escapeHtml(label_street || 'Street Address')}:</strong> ${escapeHtml(street)}<br>
          <strong>${escapeHtml(label_city || 'City')}:</strong> ${escapeHtml(city)}<br>
          <strong>${escapeHtml(label_province || 'Province/State')}:</strong> ${escapeHtml(province)}<br>
          <strong>${escapeHtml(label_postal_code || 'Postal Code')}:</strong> ${escapeHtml(postal_code)}<br>
          <strong>${escapeHtml(label_country || 'Country')}:</strong> ${escapeHtml(country)}<br>
          <strong>${escapeHtml(label_contact || 'Preferred Contact')}:</strong> ${escapeHtml(preferred_contact)}<br>
          <strong>${escapeHtml(label_delivery || 'Delivery Options')}:</strong> ${escapeHtml(preferred_delivery)}<br>
        </p>
      </div>

      ${notes ? `
      <div style="margin:20px 0;">
        <h3 style="font-size:16px;margin-bottom:8px;color:#444;">${escapeHtml(label_notes || 'Notes / Instructions')}</h3>
        <p style="background:#fafafa;padding:12px;border-left:4px solid #82b517;border-radius:4px;font-size:14px;line-height:1.5;">
          ${escapeHtml(notes).replace(/\n/g, '<br>')}
        </p>
      </div>` : ''}
    </div>
    
    <!-- Footer -->
    <div style="background: #231709; padding:15px; text-align:left;">
      <table style="width: 100%;">
        <tr>
          <td style="width: 20%;">
            <img src="https://www.organiknation.ca/cdn/shop/files/LOGO-Footer.png" alt="Organic Nation" style="height: 90px; width: 90px;" >
          </td>
          <td style="padding: 20px; width: 70%;">
            <h4 style="font-size:18px; line-height: 28px; font-weight: 600; color:#fff; margin: 0;">${t('Contact Us','Contactez-nous')}</h4>
            <a href="https://www.organiknation.ca/" style="font-size:16px; line-height: 24px; color:#fff; text-decoration: none;">${t('Website','Site Web')}: www.organiknation.ca</a><br>
            <a href="mailto:info@organiknation.ca" style="font-size:16px; line-height: 24px; color:#fff; text-decoration: none;"> ${t('Email','Courriel')}: info@organiknation.ca</a><br>
            <a href="tel:14185704073" style="font-size:16px; color:#fff; line-height: 24px; text-decoration: none;">${t('Phone','Téléphone')}: +1 (418) 570-4073</a>
          </td>
          <td style="width: 10%;">
            <a href="https://instagram.com/organik_nation_/">
              <img src="https://cdn.shopify.com/s/files/1/0720/5473/5000/files/instagram.png" alt="instagram" style="height: 35px; width: 35px;">
            </a>
          </td>
        </tr>
      </table>
    </div>
  </div>
</div>`;


    // Send emails
    await sendgrid.send({
      to: process.env.ADMIN_EMAIL,
      from: process.env.FROM_EMAIL,
      subject: `${t('New Quote Request from', 'Nouvelle demande de devis de')} ${name}`,
      html: emailHTML
    });

    await sendgrid.send({
      to: email,
      from: process.env.FROM_EMAIL,
      subject: `${t('Quote Request Received -', 'Demande de devis reçue -')} ${name} ${process.env.STORE_NAME || ''}`,
      html: emailHTML
    });

    return res.status(200).json({ message: 'Emails sent successfully!' });
  } catch (error) {
    console.error('SendGrid error:', error);
    return res.status(500).json({ message: 'Error sending email', error: String(error) });
  }
}
