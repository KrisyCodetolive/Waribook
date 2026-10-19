const crypto = require('crypto');

// Offres d'abonnement (prix en FCFA / mois). Modifiez ici pour changer vos tarifs.
const PLANS = {
  gratuit: { id: 'gratuit', name: 'Gratuit', price: 0, invoicesPerMonth: 10, clients: 20 },
  pro: { id: 'pro', name: 'Pro', price: 5000, invoicesPerMonth: Infinity, clients: Infinity },
  business: { id: 'business', name: 'Business', price: 15000, invoicesPerMonth: Infinity, clients: Infinity },
};

function formatMoney(amount, currency = 'FCFA') {
  const n = Math.round(Number(amount) || 0);
  return n.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' ' + currency;
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Statut "réel" d'une facture : payée, partielle, en retard ou en attente
function invoiceStatus(inv) {
  if (inv.status === 'annulee') return 'annulee';
  if (inv.amount_paid >= inv.total && inv.total > 0) return 'payee';
  if (inv.due_date < today()) return 'en_retard';
  if (inv.amount_paid > 0) return 'partielle';
  return 'en_attente';
}

const STATUS_LABELS = {
  payee: 'Payée',
  partielle: 'Paiement partiel',
  en_retard: 'En retard',
  en_attente: 'En attente',
  annulee: 'Annulée',
};

// Numéro de téléphone au format international pour WhatsApp (par défaut +225 Côte d'Ivoire)
function waNumber(phone, defaultPrefix = process.env.DEFAULT_COUNTRY_CODE || '225') {
  if (!phone) return '';
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p.slice(1);
  if (p.startsWith('00')) return p.slice(2);
  if (p.startsWith(defaultPrefix) && p.length > 10) return p;
  return defaultPrefix + p;
}

function whatsappLink(phone, message) {
  const num = waNumber(phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

function getPlan(user) {
  if (!user) return PLANS.gratuit;
  if (user.plan !== 'gratuit' && user.plan_expires_at && user.plan_expires_at < today()) {
    return PLANS.gratuit; // abonnement expiré
  }
  return PLANS[user.plan] || PLANS.gratuit;
}

module.exports = {
  PLANS, formatMoney, formatDate, today, addDays, randomToken,
  invoiceStatus, STATUS_LABELS, whatsappLink, waNumber, getPlan,
};
