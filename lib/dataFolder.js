/**
 * Data folder — every photo that came or went by mail, plus copies you chose to keep.
 *
 * Kept copies (getMailStore().dataFolder) survive deleting the mail and worldline
 * rewrites: you still have the picture, even if the mail never existed here.
 * A photo can also become this chat's wallpaper (getMailStore().wallpaper).
 */
import { toast } from './settings.js';
import { getMailStore, persistMailStore, getEmails } from './store.js';
import { openPhotoViewer } from './mailUi.js';
import { peerLabel } from './contacts.js';

/**
 * @typedef {{ id: string, src: string, desc: string, from: string, t: number, mailId?: string, kept?: boolean }} DataPhoto
 */

function kept() {
    const store = getMailStore();
    if (!Array.isArray(store.dataFolder)) {
        store.dataFolder = [];
    }
    return /** @type {DataPhoto[]} */ (store.dataFolder);
}

/** Newest first: kept copies, then photos still in mail. */
export function listDataPhotos() {
    const keep = kept();
    const keptMail = new Set(keep.map((k) => k.mailId).filter(Boolean));
    /** @type {DataPhoto[]} */
    const fromMail = getEmails()
        .filter((e) => e.photo && !keptMail.has(e.id))
        .map((e) => ({
            id: `mail:${e.id}`,
            src: String(e.photo),
            desc: String(e.photoDesc || ''),
            from: e.direction === 'in' ? peerLabel(e.from) : 'You',
            t: Number(e.timestamp) || 0,
            mailId: e.id,
        }));
    return [...keep.map((k) => ({ ...k, kept: true })), ...fromMail].sort((a, b) => b.t - a.t);
}

export function isKept(mailId) {
    return Boolean(mailId) && kept().some((k) => k.mailId === mailId);
}

/** Keep a copy of a photo in the Data folder. */
export async function keepPhoto(photo) {
    if (!photo?.src) {
        return;
    }
    if (photo.mailId && isKept(photo.mailId)) {
        return;
    }
    kept().push({
        id: `keep:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        src: photo.src,
        desc: String(photo.desc || ''),
        from: String(photo.from || ''),
        t: Number(photo.t) || Date.now(),
        mailId: photo.mailId || undefined,
    });
    await persistMailStore();
}

export async function forgetPhoto(id) {
    const store = getMailStore();
    store.dataFolder = kept().filter((k) => k.id !== id);
    await persistMailStore();
}

/** This chat's wallpaper photo ('' = none). */
export function getChatWallpaper() {
    return String(getMailStore().wallpaper || '');
}

export async function setChatWallpaper(src) {
    getMailStore().wallpaper = String(src || '');
    await persistMailStore();
    document.dispatchEvent(new CustomEvent('pt:wallpaper'));
}

/**
 * Open a photo with Keep / Set as wallpaper.
 * @param {DataPhoto} photo
 * @param {{ onChange?: () => void }} [opts]
 */
export function viewDataPhoto(photo, opts = {}) {
    const caption = [photo.desc, photo.from ? `— ${photo.from}` : ''].filter(Boolean).join(' ');
    const actions = [];
    if (photo.kept) {
        actions.push({
            label: 'Forget copy',
            run: async () => {
                await forgetPhoto(photo.id);
                opts.onChange?.();
                return 'Forgotten';
            },
        });
    } else {
        actions.push({
            label: isKept(photo.mailId) ? 'Kept ✓' : 'Keep',
            run: async () => {
                await keepPhoto(photo);
                opts.onChange?.();
                return 'Kept ✓';
            },
        });
    }
    actions.push({
        label: 'Set as wallpaper',
        run: async () => {
            await setChatWallpaper(photo.src);
            toast('This chat\'s wallpaper', 'success', 'Data folder');
            return 'Wallpaper ✓';
        },
    });
    openPhotoViewer(photo.src, caption, { actions });
}

/** Photo of a mail, ready for viewDataPhoto. */
export function photoFromMail(mail) {
    return {
        id: `mail:${mail.id}`,
        src: String(mail.photo || ''),
        desc: String(mail.photoDesc || ''),
        from: mail.direction === 'in' ? peerLabel(mail.from) : 'You',
        t: Number(mail.timestamp) || Date.now(),
        mailId: mail.id,
    };
}
