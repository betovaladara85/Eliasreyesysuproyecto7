/* Proyecto 7 | contenido público aprobado desde Manager (Supabase RLS).
   GitHub Pages es estático: la clave sb_publishable_ es pública por diseño,
   NUNCA usar service_role, sb_secret_ ni tokens privados.
   La seguridad real depende de RLS, tanto en tablas como en Storage. */
(() => {
  'use strict';
  const section = document.getElementById('p7-web-contenido');
  const mediaBox = document.getElementById('p7-web-multimedia');
  const calendar = document.getElementById('p7-web-calendario');
  const datesBox = document.getElementById('p7-web-fechas');
  const key = (document.querySelector('meta[name="p7-supabase-public-key"]')?.content || '').trim();
  const base = 'https://plihjyompjqkgymtsshb.supabase.co';

  if (!section || !mediaBox || !calendar || !datesBox || !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/.test(key)) return;

  const publicHeaders = { apikey: key };
  if (key.startsWith('eyJ')) publicHeaders.Authorization = 'Bearer ' + key;

  async function apiJson(path, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      mode: 'cors',
      cache: 'no-store',
      headers: { ...publicHeaders, ...options.headers },
    });
    if (!response.ok) throw new Error('No se pudo consultar el contenido público');
    return response.json();
  }

  function currentMeridaDate() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Merida', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return byType.year + '-' + byType.month + '-' + byType.day;
  }

  async function signedMediaUrl(item) {
    if (!item || !['foto', 'video'].includes(item.kind)) return null;
    const path = String(item.storage_path || '');
    if (!/^(fotos|videos)\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov)$/i.test(path)) return null;
    if ((item.kind === 'foto' && !path.startsWith('fotos/')) ||
        (item.kind === 'video' && !path.startsWith('videos/'))) return null;
    const storagePath = path.split('/').map(encodeURIComponent).join('/');
    const signed = await apiJson('/storage/v1/object/sign/p7-web-media/' + storagePath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 1800 }),
    });
    const relative = signed.signedURL || signed.signedUrl;
    if (typeof relative !== 'string' || !relative.startsWith('/object/sign/p7-web-media/')) return null;
    return base + '/storage/v1' + relative;
  }

  function appendMedia(item, url) {
    const figure = document.createElement('figure');
    figure.className = 'foto-publicada';
    const description = String(item.alt || item.title || 'Proyecto 7').slice(0, 200);
    let visual;
    if (item.kind === 'video') {
      visual = document.createElement('video');
      visual.controls = true;
      visual.preload = 'metadata';
      visual.playsInline = true;
      visual.style.width = '100%';
      visual.style.aspectRatio = '4/3';
      visual.style.objectFit = 'contain';
      visual.setAttribute('aria-label', description);
    } else {
      visual = document.createElement('img');
      visual.alt = description;
      visual.loading = 'lazy';
      visual.decoding = 'async';
    }
    visual.src = url;
    const caption = document.createElement('figcaption');
    caption.textContent = String(item.title || 'Proyecto 7').slice(0, 120);
    figure.append(visual, caption);
    mediaBox.append(figure);
  }

  function appendDate(item) {
    if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date_public || '')) return;
    const card = document.createElement('article');
    card.className = 'foto-publicada';
    const title = document.createElement('h4');
    title.style.padding = '15px 16px 0';
    title.style.fontWeight = '800';
    title.textContent = String(item.title || 'Presentación de Proyecto 7').slice(0, 120);
    const description = document.createElement('p');
    description.style.padding = '8px 16px 16px';
    const time = String(item.time_public || '').slice(0, 5);
    const place = String(item.place_public || '').slice(0, 120);
    description.textContent = item.date_public + (time ? ' · ' + time + ' h' : '') + (place ? ' · ' + place : '');
    card.append(title, description);
    datesBox.append(card);
  }

  (async () => {
    try {
      const today = currentMeridaDate();
      const [media, dates] = await Promise.all([
        apiJson('/rest/v1/p7_web_media?select=kind,storage_path,title,alt,category,sort_order&published=eq.true&order=sort_order.asc,created_at.desc&limit=60'),
        apiJson('/rest/v1/p7_web_agenda?select=title,place_public,date_public,time_public&published=eq.true&date_public=gte.' + encodeURIComponent(today) + '&order=date_public.asc,time_public.asc&limit=50'),
      ]);

      const result = await Promise.allSettled((Array.isArray(media) ? media : []).map(async item => {
        const url = await signedMediaUrl(item);
        return url ? { item, url } : null;
      }));
      for (const entry of result) {
        if (entry.status === 'fulfilled' && entry.value) appendMedia(entry.value.item, entry.value.url);
      }

      for (const item of (Array.isArray(dates) ? dates : [])) appendDate(item);
      calendar.hidden = datesBox.children.length === 0;
      section.hidden = mediaBox.children.length === 0 && datesBox.children.length === 0;
    } catch (error) {
      // Never expose internal errors or unpublished content to visitors.
      console.warn('[Proyecto 7] Contenido público temporalmente no disponible');
    }
  })();
})();
