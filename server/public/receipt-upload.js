'use strict';

const copy = {
  en: {
    title: 'Send receipts to Fire Tools', privacy: 'Photos stay queued on this phone until your app confirms they are stored. Use trusted Wi-Fi or your HTTPS tunnel.',
    camera: 'Take a receipt photo', files: 'Choose receipt photos', send: 'Send queued receipts',
    offline: 'Away from your app? Keep this page open to take photos. Return to the same Wi-Fi or tunnel and tap Send. If pairing expires, open a new pairing link on the same address; the queue is retained.',
    queued: '{{count}} photos queued on this phone.', sending: 'Sending receipt photos…', sent: 'Receipts stored by your app. Review them in the receipt inbox.',
    pair: 'Open a fresh pairing link from your app before sending. Queued photos are retained.',
    failed: 'Could not send. Photos are retained on this phone. Retry on the same Wi-Fi or tunnel.',
    storage: 'Could not save this photo on the phone. Storage may be full or disabled. Keep the original photo and retry.',
    download: 'Save original photo', remove: 'Remove', confirm: 'Remove this queued photo from the phone? Save its original first if you need it.',
    format: 'Use JPEG, PNG or WebP photos.', size: 'This photo exceeds 10 MB. Save the original, resize a copy and choose that copy. The original remains queued.',
    queueLabel: 'Queued receipt photos',
  },
  it: {
    title: 'Invia ricevute a Fire Tools', privacy: 'Le foto restano in coda sul telefono finché l’app ne conferma il salvataggio. Usa un Wi-Fi fidato o il tuo tunnel HTTPS.',
    camera: 'Fotografa una ricevuta', files: 'Scegli foto di ricevute', send: 'Invia le ricevute in coda',
    offline: 'Lontano dall’app? Tieni aperta questa pagina per scattare foto. Torna allo stesso Wi-Fi o tunnel e premi Invia. Se l’abbinamento scade, apri un nuovo link allo stesso indirizzo: la coda viene conservata.',
    queued: '{{count}} foto in coda su questo telefono.', sending: 'Invio delle foto…', sent: 'Ricevute salvate dall’app. Controllale nella raccolta delle ricevute.',
    pair: 'Apri un nuovo link di abbinamento dall’app prima di inviare. Le foto in coda sono conservate.',
    failed: 'Invio non riuscito. Le foto restano sul telefono. Riprova sullo stesso Wi-Fi o tunnel.',
    storage: 'Impossibile salvare la foto sul telefono. Lo spazio potrebbe essere esaurito o disabilitato. Conserva l’originale e riprova.',
    download: 'Salva la foto originale', remove: 'Rimuovi', confirm: 'Rimuovere questa foto dalla coda del telefono? Salva prima l’originale se ti serve.',
    format: 'Usa foto JPEG, PNG o WebP.', size: 'Questa foto supera 10 MB. Salva l’originale, ridimensiona una copia e scegli quella. L’originale resta in coda.',
    queueLabel: 'Foto di ricevute in coda',
  },
  fr: {
    title: 'Envoyer des reçus à Fire Tools', privacy: 'Les photos restent sur ce téléphone jusqu’à confirmation de leur stockage par l’application. Utilisez un Wi-Fi fiable ou votre tunnel HTTPS.',
    camera: 'Photographier un reçu', files: 'Choisir des photos de reçus', send: 'Envoyer les reçus en attente',
    offline: 'Loin de l’application ? Gardez cette page ouverte pour prendre des photos. Revenez sur le même Wi-Fi ou tunnel et appuyez sur Envoyer. Si l’appairage expire, ouvrez un nouveau lien à la même adresse : la file est conservée.',
    queued: '{{count}} photos en attente sur ce téléphone.', sending: 'Envoi des photos…', sent: 'Reçus stockés par l’application. Vérifiez-les dans la boîte de réception.',
    pair: 'Ouvrez un nouveau lien d’appairage depuis l’application avant d’envoyer. Les photos sont conservées.',
    failed: 'Envoi impossible. Les photos restent sur le téléphone. Réessayez sur le même Wi-Fi ou tunnel.',
    storage: 'Impossible de sauvegarder cette photo sur le téléphone. Le stockage est peut-être plein ou désactivé. Conservez l’original et réessayez.',
    download: 'Enregistrer la photo originale', remove: 'Retirer', confirm: 'Retirer cette photo de la file du téléphone ? Enregistrez d’abord l’original si nécessaire.',
    format: 'Utilisez des photos JPEG, PNG ou WebP.', size: 'Cette photo dépasse 10 Mo. Enregistrez l’original, redimensionnez une copie et sélectionnez-la. L’original reste en attente.',
    queueLabel: 'Photos de reçus en attente',
  },
  de: {
    title: 'Belege an Fire Tools senden', privacy: 'Fotos bleiben auf diesem Telefon, bis die App ihre Speicherung bestätigt. Verwenden Sie vertrauenswürdiges WLAN oder Ihren HTTPS-Tunnel.',
    camera: 'Beleg fotografieren', files: 'Belegfotos auswählen', send: 'Wartende Belege senden',
    offline: 'Nicht bei der App? Lassen Sie diese Seite zum Fotografieren geöffnet. Kehren Sie zum selben WLAN oder Tunnel zurück und tippen Sie auf Senden. Nach Ablauf öffnen Sie einen neuen Kopplungslink unter derselben Adresse; die Warteschlange bleibt erhalten.',
    queued: '{{count}} Fotos warten auf diesem Telefon.', sending: 'Belegfotos werden gesendet…', sent: 'Belege in der App gespeichert. Prüfen Sie den Beleg-Posteingang.',
    pair: 'Öffnen Sie vor dem Senden einen neuen Kopplungslink aus der App. Wartende Fotos bleiben erhalten.',
    failed: 'Senden fehlgeschlagen. Fotos bleiben auf dem Telefon. Versuchen Sie es im selben WLAN oder Tunnel erneut.',
    storage: 'Foto konnte nicht auf dem Telefon gespeichert werden. Speicher ist möglicherweise voll oder deaktiviert. Behalten Sie das Original und versuchen Sie es erneut.',
    download: 'Originalfoto speichern', remove: 'Entfernen', confirm: 'Dieses Foto aus der Warteschlange entfernen? Speichern Sie bei Bedarf zuerst das Original.',
    format: 'Verwenden Sie JPEG-, PNG- oder WebP-Fotos.', size: 'Dieses Foto überschreitet 10 MB. Original speichern, eine Kopie verkleinern und diese auswählen. Das Original bleibt in der Warteschlange.',
    queueLabel: 'Wartende Belegfotos',
  },
  es: {
    title: 'Enviar recibos a Fire Tools', privacy: 'Las fotos permanecen en este teléfono hasta que la app confirme su almacenamiento. Use una red Wi-Fi de confianza o su túnel HTTPS.',
    camera: 'Fotografiar un recibo', files: 'Elegir fotos de recibos', send: 'Enviar recibos pendientes',
    offline: '¿Lejos de la app? Mantenga abierta esta página para tomar fotos. Vuelva al mismo Wi-Fi o túnel y pulse Enviar. Si el enlace caduca, abra uno nuevo en la misma dirección: la cola se conserva.',
    queued: '{{count}} fotos pendientes en este teléfono.', sending: 'Enviando fotos…', sent: 'Recibos guardados por la app. Revíselos en la bandeja de recibos.',
    pair: 'Abra un nuevo enlace de vinculación desde la app antes de enviar. Las fotos se conservan.',
    failed: 'No se pudo enviar. Las fotos permanecen en el teléfono. Reintente en el mismo Wi-Fi o túnel.',
    storage: 'No se pudo guardar esta foto en el teléfono. El almacenamiento puede estar lleno o desactivado. Conserve el original y reintente.',
    download: 'Guardar foto original', remove: 'Quitar', confirm: '¿Quitar esta foto de la cola del teléfono? Guarde primero el original si lo necesita.',
    format: 'Use fotos JPEG, PNG o WebP.', size: 'Esta foto supera 10 MB. Guarde el original, redimensione una copia y seleccione esa copia. El original permanece en la cola.',
    queueLabel: 'Fotos de recibos pendientes',
  },
};

let pairing;
function readPairing() {
  const parameters = new URLSearchParams(location.hash.slice(1));
  try {
    pairing = parameters.get('token') ? {
      token: parameters.get('token'), expiresAt: parameters.get('expiresAt'), language: parameters.get('lang') || 'en',
    } : JSON.parse(sessionStorage.getItem('fire-tools-receipt-pairing') || 'null');
    if (pairing && (!/^[A-Za-z0-9_-]{43}$/.test(pairing.token) || !Number.isFinite(Date.parse(pairing.expiresAt)))) pairing = null;
    if (pairing) sessionStorage.setItem('fire-tools-receipt-pairing', JSON.stringify(pairing));
  } catch {
    pairing = null;
  }
  history.replaceState(null, '', location.pathname);
}
readPairing();
let text;
function renderCopy() {
  const language = pairing && Object.hasOwn(copy, pairing.language) ? pairing.language : 'en';
  text = copy[language];
  document.documentElement.lang = language;
  document.title = text.title;
  document.querySelectorAll('[data-copy]').forEach(element => { element.textContent = text[element.dataset.copy]; });
}
renderCopy();
const status = document.getElementById('status');
const queue = document.getElementById('queue');
queue.setAttribute('aria-label', text.queueLabel);
const sendButton = document.getElementById('send');
let sending = false;
let pendingController;

function announce(message, error = false) {
  status.dataset.error = String(error);
  status.setAttribute('role', error ? 'alert' : 'status');
  status.textContent = message;
}

const database = new Promise((resolve, reject) => {
  const opened = indexedDB.open('fire-tools-receipt-queue', 1);
  opened.onupgradeneeded = () => opened.result.createObjectStore('photos', { keyPath: 'id' });
  opened.onsuccess = () => resolve(opened.result);
  opened.onerror = () => reject(opened.error);
  opened.onblocked = () => reject(new Error(text.storage));
});

async function transaction(mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const request = operation(tx.objectStore('photos'));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error(text.storage));
  });
}

function download(record) {
  const url = URL.createObjectURL(record.blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = record.name;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderQueue(updateStatus = true) {
  const records = await transaction('readonly', store => store.getAll());
  queue.replaceChildren();
  for (const record of records) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = record.name;
    item.append(name);
    const actions = document.createElement('div');
    actions.className = 'queue-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = text.download;
    save.disabled = sending;
    save.addEventListener('click', () => download(record));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = text.remove;
    remove.disabled = sending;
    remove.addEventListener('click', async () => {
      if (!confirm(text.confirm)) return;
      try {
        await transaction('readwrite', store => store.delete(record.id));
        await renderQueue();
      } catch {
        announce(text.storage, true);
      }
    });
    actions.append(save, remove);
    item.append(actions);
    queue.append(item);
  }
  sendButton.disabled = sending || !records.length;
  if (updateStatus) announce(text.queued.replace('{{count}}', String(records.length)));
  return records;
}

async function queuePhotos(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  try {
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(text.format);
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      await transaction('readwrite', store => store.add({ id, name: file.name || `receipt-${id}.jpg`, blob: file }));
    }
    input.value = '';
    await renderQueue();
  } catch (error) {
    announce(error instanceof Error && error.message === text.format ? text.format : text.storage, true);
  }
}

async function sendQueue() {
  if (sending) return;
  if (!pairing || Date.now() >= Date.parse(pairing.expiresAt)) {
    announce(text.pair, true);
    return;
  }
  sending = true;
  sendButton.disabled = true;
  announce(text.sending);
  let completed = false;
  try {
    const records = await renderQueue(false);
    for (const record of records) {
      if (record.blob.size > 10 * 1024 * 1024) throw new Error(text.size);
      const fileName = record.name.replace(/[/\\\u0000-\u001f\u007f]/g, '_').slice(0, 255);
      pendingController = new AbortController();
      const timeout = setTimeout(() => pendingController.abort(), 30_000);
      try {
        const response = await fetch(`/receipts?fileName=${encodeURIComponent(fileName)}`, {
          method: 'POST', headers: { 'Content-Type': record.blob.type, Authorization: `Bearer ${pairing.token}` },
          body: record.blob, signal: pendingController.signal,
        });
        const result = await response.json();
        if (!response.ok || !Number.isInteger(result.id) || result.id <= 0 || result.byteLength !== record.blob.size) {
          throw new Error(response.status === 401 ? text.pair : text.failed);
        }
        await transaction('readwrite', store => store.delete(record.id));
      } finally {
        clearTimeout(timeout);
        pendingController = undefined;
      }
    }
    completed = true;
  } catch (error) {
    announce(error instanceof Error && [text.pair, text.size].includes(error.message) ? error.message : text.failed, true);
  } finally {
    sending = false;
    try {
      await renderQueue(false);
      if (completed) announce(text.sent);
    } catch {
      announce(text.storage, true);
    }
  }
}

document.getElementById('receipt-camera').addEventListener('change', event => { void queuePhotos(event.currentTarget); });
document.getElementById('receipt-files').addEventListener('change', event => { void queuePhotos(event.currentTarget); });
sendButton.addEventListener('click', () => { void sendQueue(); });
window.addEventListener('hashchange', () => {
  if (!location.hash) return;
  pendingController?.abort();
  readPairing();
  renderCopy();
  queue.setAttribute('aria-label', text.queueLabel);
  void renderQueue().catch(() => announce(text.storage, true));
});
window.addEventListener('pagehide', event => {
  pendingController?.abort();
  if (!event.persisted) void database.then(db => db.close()).catch(() => {});
});
void renderQueue().catch(() => announce(text.storage, true));
