// Intégration CinetPay (Mobile Money + cartes) pour encaisser les abonnements.
// Documentation : https://docs.cinetpay.com
// Sans clés CINETPAY_API_KEY / CINETPAY_SITE_ID, l'application passe en "mode démo"
// (l'abonnement est activé sans paiement réel, pratique pour tester).

const API = 'https://api-checkout.cinetpay.com/v2';

function isConfigured() {
  return Boolean(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID);
}

async function initPayment({ transactionId, amount, description, user, baseUrl }) {
  const body = {
    apikey: process.env.CINETPAY_API_KEY,
    site_id: process.env.CINETPAY_SITE_ID,
    transaction_id: transactionId,
    amount: Math.ceil(amount / 5) * 5, // CinetPay exige un multiple de 5
    currency: process.env.CINETPAY_CURRENCY || 'XOF',
    description,
    notify_url: `${baseUrl}/paiement/notification`,
    return_url: `${baseUrl}/paiement/retour?transaction_id=${transactionId}`,
    channels: 'ALL',
    lang: 'fr',
    customer_id: String(user.id),
    customer_name: user.name,
    customer_surname: user.name,
    customer_email: user.email,
    customer_phone_number: user.phone || '',
    customer_address: user.city || 'Abidjan',
    customer_city: user.city || 'Abidjan',
    customer_country: 'CI',
    customer_state: 'CI',
    customer_zip_code: '00225',
  };
  const res = await fetch(`${API}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.data || !json.data.payment_url) {
    throw new Error(`CinetPay: ${json.message || 'erreur inconnue'} ${json.description || ''}`);
  }
  return json.data.payment_url;
}

// Vérifie auprès de CinetPay si la transaction a bien été payée
async function checkPayment(transactionId) {
  const res = await fetch(`${API}/payment/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
    }),
  });
  const json = await res.json();
  return json.data && json.data.status === 'ACCEPTED';
}

module.exports = { isConfigured, initPayment, checkPayment };
