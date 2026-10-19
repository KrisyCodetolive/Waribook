// Petites interactions côté navigateur (aucune librairie nécessaire)
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';

  // Menu mobile (landing)
  $$('[data-toggle-nav]').forEach((b) => b.addEventListener('click', () => $('#nav').classList.toggle('open')));
  $$('#nav a').forEach((a) => a.addEventListener('click', () => $('#nav').classList.remove('open')));

  // Ombre de l'en-tête au défilement
  const header = $('.site-header');
  if (header) window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 8), { passive: true });

  // Menu latéral mobile (application)
  $$('[data-toggle-sidebar]').forEach((b) => b.addEventListener('click', () => $('#sidebar').classList.toggle('open')));

  // Fenêtres (dialog)
  $$('[data-open-dialog]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    const d = document.getElementById(b.dataset.openDialog);
    if (d && d.showModal) d.showModal();
  }));
  $$('[data-close-dialog]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  // Confirmation avant suppression
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => {
    if (!confirm(f.dataset.confirm)) e.preventDefault();
  }));

  // Lignes de tableau cliquables
  $$('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    window.location = tr.dataset.href;
  }));

  // Copier le lien
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const input = $(b.dataset.copy);
    try { await navigator.clipboard.writeText(input.value); } catch (_) { input.select(); document.execCommand('copy'); }
    const old = b.textContent; b.textContent = 'Copié ✓'; setTimeout(() => (b.textContent = old), 1500);
  }));

  // Formulaire de facture : lignes dynamiques + total
  const items = $('#items');
  if (items) {
    const recompute = () => {
      let total = 0;
      $$('.item-row', items).forEach((row) => {
        const q = parseInt($('[name=quantity]', row).value, 10) || 0;
        const p = parseInt(String($('[name=unit_price]', row).value).replace(/\D/g, ''), 10) || 0;
        $('.line-total', row).textContent = fmt(q * p);
        total += q * p;
      });
      $('#grand-total').textContent = fmt(total);
    };
    items.addEventListener('input', recompute);
    items.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-row]');
      if (!btn) return;
      if ($$('.item-row', items).length > 1) btn.closest('tr').remove();
      recompute();
    });
    $('#add-row').addEventListener('click', () => {
      const tpl = $('.item-row', items).cloneNode(true);
      $$('input', tpl).forEach((i) => (i.value = i.name === 'quantity' ? '1' : ''));
      $('.line-total', tpl).textContent = fmt(0);
      items.appendChild(tpl);
      $('[name=description]', tpl).focus();
    });
    recompute();
  }
})();
