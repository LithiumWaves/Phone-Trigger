/**
 * Data folder app — a thumbnail grid of every photo on your phone.
 */
import { getSettings } from './settings.js';
import { registerPhoneApp } from './phone.js';
import { listDataPhotos, viewDataPhoto } from './dataFolder.js';

registerPhoneApp('data', {
    title: 'Data folder',
    icon: '▣',
    menuIcon: 'data',
    home: () => getSettings().dataFolderEnabled !== false,
    render(view, a) {
        a.setSoftLabels('', 'Back');
        view.style.background = '';
        view.className = 'pp-view';
        const photos = listDataPhotos();
        view.innerHTML = `
            <div class="pp-title pp-title-bar"><span class="pp-title-text">Data folder</span><span class="pp-mail-count">${photos.length}</span></div>
            <div class="pp-scroll">
                ${photos.length ? `<div class="pp-data-grid">
                    ${photos.map((p, i) => `
                        <button type="button" class="pp-data-cell ${p.kept ? 'pp-data-kept' : ''}" data-photo="${i}" title="${a.escapeHtml([p.desc, p.from].filter(Boolean).join(' — '))}">
                            <img src="${a.escapeHtml(p.src)}" alt="${a.escapeHtml(p.desc || 'Photo')}" loading="lazy">
                            ${p.kept ? '<span class="pp-data-pin" aria-label="kept">◆</span>' : ''}
                        </button>`).join('')}
                </div>
                <p class="pp-settings-note">◆ kept: stays even if the mail is deleted or never existed on this worldline.</p>`
        : '<div class="pp-empty">No photos yet. Photos sent or received by mail show up here.</div>'}
            </div>`;
        view.querySelectorAll('[data-photo]').forEach((btn) => btn.addEventListener('click', () => {
            const photo = photos[Number(btn.getAttribute('data-photo'))];
            if (photo) {
                viewDataPhoto(photo, { onChange: () => a.isActive() && a.render() });
            }
        }));
    },
});
