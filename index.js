import { MODULE_NAME, EXTENSION_FOLDER, LEGACY_EXTENSION_FOLDER, DEFAULT_SETTINGS, DEFAULT_MAIL_REPLY_PROMPT, DEFAULT_MAIL_FORCE_PROMPT, DEFAULT_MAIL_INITIATIVE_PROMPT, DEFAULT_CALL_PROMPT, DEFAULT_MAIL_MEMORY_PROMPT, DEFAULT_MAIL_MEMORY_ENTRY, DEFAULT_MAIL_SEND_INSTRUCTIONS } from './lib/constants.js';
import { getSettings, saveSettings, getContext, toast } from './lib/settings.js';
import {
    initPhoneChrome,
    openPhone,
    closePhone,
    togglePhone,
    updateFabVisibility,
    refreshIfOpen,
    openInbox,
    isPhoneOpen,
    resetMailChipPosition,
    openTimeleapMachine,
    openCharacterPhone,
    userOpenPhone,
    refreshPhoneDock,
} from './lib/phone.js';
import {
    registerEmailTool,
    updateMailPrompt,
    ingestEmailsFromMessage,
    receiveEmail,
    sendUserEmail,
    setMailReceivedHandler,
    setMailOpenHandler,
    resolveSpeakingContact,
    setPhoneShownHandler,
} from './lib/email.js';
import { getActiveCharacterName } from './lib/store.js';
import { ensureNotifyHost } from './lib/notify.js';
import { updateWorldlinePrompt } from './lib/dmail.js';
import { updateCallMemoryPrompt } from './lib/callMemory.js';
import { updateTimeleapPrompt } from './lib/timeleap.js';
import { initMailUi } from './lib/mailUi.js';
import { initConsequences, refreshConsequences, updateIgnorePrompt } from './lib/consequences.js';
import { initFakeCallUi, onFakeCallMessage, openFakeCall } from './lib/fakeCall.js';
import { initBoardUi, resetBoardNav, openBoardApp } from './lib/board.js';
import { initTipsUi, refreshTips, noteTipsMessage, openTips } from './lib/tips.js';
import { initLabUi, refreshLab, labMemCommand } from './lib/labMembers.js';
import { initCardHistoryUi, cardUndoCommand } from './lib/cardHistory.js';
import { initWorldlineUi, refreshWorldlinePanels, setConvergenceChangeHandler } from './lib/worldline.js';
import { initStoryClockUi, syncStoryClockFlow, noteStoryMessage, onStoryChatChanged, updateStoryClockPrompt, storyTimeCommand } from './lib/storyClock.js';
import { mountMenu, openMenu, updateMenuStatus } from './lib/menu.js';
import { registerPhonesMenu, registerPhoneCardAction } from './lib/phonesMenu.js';
import {
    resolveOwner,
    addShownMails,
    listOwnerMails,
    logSnoop,
    clearOwnerPhone,
    updateSnoopPrompt,
} from './lib/phoneData.js';
import { USER_OWNER } from './lib/phoneSpec.js';
import { showCutscenePrompt, maybeShowFirstRunCutscenePrompt } from './lib/cutscenePrompt.js';
import {
    syncInitiativeScheduler,
    noteInitiativeActivity,
    setInitiativeGenerationBusy,
    tryInitiativeMail,
} from './lib/initiative.js';
import {
    syncCallInitiativeScheduler,
    noteCallInitiativeActivity,
    setCallInitiativeGenerationBusy,
    tryCallInitiative,
} from './lib/callInitiative.js';
import {
    listActors,
    resolveActor,
    forceAct,
    checkNow,
    noteCharacterMessage,
    setWorldGenerationBusy,
} from './lib/worldActs.js';
import { hasDynamicAudio, listSongs, songLabel, refreshMenuMusic } from './lib/menuMusic.js';
import { initMusicPlayer, openMusicPlayer, resetPlayerPosition } from './lib/musicPlayer.js';

const LOG = `[${MODULE_NAME}]`;

function bindSettingsUi() {
    const s = getSettings();
    $('#pp_enabled').prop('checked', s.enabled);
    $('#pp_show_chip').prop('checked', s.showMailChip !== false);
    $('#pp_wand').prop('checked', s.showWandMenuItem);
    $('#pp_slash').prop('checked', s.enableSlashCommand);
    $('#pp_sound').prop('checked', s.soundEnabled);
    $('#pp_reduce_flashing').prop('checked', Boolean(s.reduceFlashing));
    $('#pp_open_shut').prop('checked', s.openShutFirst !== false);
    $('#pp_side_dock').prop('checked', Boolean(s.phoneSideDock));
    $('#pp_inject').prop('checked', s.injectPrompt);
    $('#pp_char_mail_chat').prop('checked', s.charMailInChat !== false);
    $('#pp_inject_worldline').prop('checked', s.dmailWorldline !== false);
    $('#pp_mail_memory_scope').val(s.mailMemoryScope === 'all' ? 'all' : 'speaker');
    $('#pp_mail_memory_max').val(s.mailMemoryMax ?? 6);
    $('#pp_mail_memory_preview').val(s.mailMemoryPreviewLength ?? 140);
    $('#pp_mail_memory_pos').val(s.mailMemoryPromptPosition ?? 1);
    $('#pp_mail_memory_depth').val(s.mailMemoryPromptDepth ?? 0);
    $('#pp_mail_memory_prompt').val(s.mailMemoryPrompt || DEFAULT_MAIL_MEMORY_PROMPT);
    $('#pp_mail_memory_entry').val(s.mailMemoryEntryTemplate || DEFAULT_MAIL_MEMORY_ENTRY);
    $('#pp_mail_memory_send').val(s.mailMemorySendInstructions ?? DEFAULT_MAIL_SEND_INSTRUCTIONS);
    $('#pp_inject_chat_mail').prop('checked', s.injectChatIntoMail !== false);
    $('#pp_chat_summary_n').val(s.chatSummaryMessages ?? 12);
    $('#pp_auto_open').prop('checked', s.autoOpenOnMail);
    $('#pp_notify_toast').prop('checked', s.notifyInChat);
    $('#pp_mail_backend').val(s.mailBackend || 'main');
    $('#pp_or_key').val(s.openRouterApiKey || '');
    $('#pp_or_model').val(s.openRouterModel || 'openai/gpt-4o-mini');
    $('#pp_mail_delay_min').val(s.mailReplyDelayMin ?? 3);
    $('#pp_mail_delay_max').val(s.mailReplyDelayMax ?? 8);
    $('#pp_mail_reply_prompt').val(s.mailReplyPrompt || DEFAULT_MAIL_REPLY_PROMPT);
    $('#pp_mail_force_prompt').val(s.mailForcePrompt || DEFAULT_MAIL_FORCE_PROMPT);

    $('#pp_initiative_enabled').prop('checked', Boolean(s.mailInitiativeEnabled));
    $('#pp_initiative_interval_min').val(s.mailInitiativeIntervalMin ?? 180);
    $('#pp_initiative_interval_max').val(s.mailInitiativeIntervalMax ?? 480);
    $('#pp_initiative_chance').val(Math.round(clampChancePct(s.mailInitiativeChance)));
    $('#pp_initiative_grace').val(s.mailInitiativeStartupGraceSec ?? 90);
    $('#pp_initiative_cooldown').val(s.mailInitiativeCooldownSec ?? 300);
    $('#pp_initiative_max_hour').val(s.mailInitiativeMaxPerHour ?? 2);
    $('#pp_initiative_max_day').val(s.mailInitiativeMaxPerDay ?? 6);
    $('#pp_initiative_max_pending').val(s.mailInitiativeMaxPending ?? 1);
    $('#pp_initiative_idle').prop('checked', s.mailInitiativeOnlyWhenIdle !== false);
    $('#pp_initiative_idle_sec').val(s.mailInitiativeIdleSeconds ?? 60);
    $('#pp_initiative_pause_gen').prop('checked', s.mailInitiativePauseDuringGeneration !== false);
    $('#pp_initiative_pause_phone').prop('checked', s.mailInitiativePauseWhilePhoneOpen !== false);
    $('#pp_initiative_tab').prop('checked', s.mailInitiativeRequireTabVisible !== false);
    $('#pp_initiative_skip_unread').prop('checked', Boolean(s.mailInitiativeSkipIfUnread));
    $('#pp_initiative_skip_unread_sender').prop('checked', s.mailInitiativeSkipIfUnreadFromSender !== false);
    $('#pp_initiative_contacts').val(
        ['active', 'all', 'weighted'].includes(s.mailInitiativeContacts) ? s.mailInitiativeContacts : 'active',
    );
    $('#pp_initiative_quiet').prop('checked', Boolean(s.mailInitiativeQuietHoursEnabled));
    $('#pp_initiative_quiet_start').val(s.mailInitiativeQuietStart ?? 23);
    $('#pp_initiative_quiet_end').val(s.mailInitiativeQuietEnd ?? 8);
    $('#pp_initiative_guidance').val(s.mailInitiativeGuidance || '');
    $('#pp_initiative_use_force').prop('checked', Boolean(s.mailInitiativeUseForcePrompt));
    $('#pp_initiative_prompt').val(s.mailInitiativePrompt || DEFAULT_MAIL_INITIATIVE_PROMPT);

    $('#pp_call_enabled').prop('checked', s.callEnabled !== false);
    $('#pp_call_mode').val(
        ['unique', 'main', 'both'].includes(s.callGenerationMode) ? s.callGenerationMode : 'unique',
    );
    $('#pp_call_dial_ms').val(s.callDialDelayMs ?? 900);
    $('#pp_call_context').val(s.callContextTurns ?? 16);
    $('#pp_call_guidance').val(s.callGuidance || '');
    $('#pp_call_prompt').val(s.callPrompt || DEFAULT_CALL_PROMPT);

    $('#pp_call_initiative_enabled').prop('checked', Boolean(s.callInitiativeEnabled));
    $('#pp_call_init_interval_min').val(s.callInitiativeIntervalMin ?? 240);
    $('#pp_call_init_interval_max').val(s.callInitiativeIntervalMax ?? 600);
    $('#pp_call_init_chance').val(Math.round(clampChancePct(s.callInitiativeChance ?? 0.2)));
    $('#pp_call_init_grace').val(s.callInitiativeStartupGraceSec ?? 120);
    $('#pp_call_init_cooldown').val(s.callInitiativeCooldownSec ?? 420);
    $('#pp_call_init_max_hour').val(s.callInitiativeMaxPerHour ?? 1);
    $('#pp_call_init_max_day').val(s.callInitiativeMaxPerDay ?? 4);
    $('#pp_call_init_ring_timeout').val(s.callInitiativeRingTimeoutSec ?? 45);
    $('#pp_call_init_idle').prop('checked', s.callInitiativeOnlyWhenIdle !== false);
    $('#pp_call_init_idle_sec').val(s.callInitiativeIdleSeconds ?? 90);
    $('#pp_call_init_pause_gen').prop('checked', s.callInitiativePauseDuringGeneration !== false);
    $('#pp_call_init_pause_phone').prop('checked', Boolean(s.callInitiativePauseWhilePhoneOpen));
    $('#pp_call_init_tab').prop('checked', s.callInitiativeRequireTabVisible !== false);
    $('#pp_call_init_skip_busy').prop('checked', s.callInitiativeSkipIfBusy !== false);
    $('#pp_call_init_auto_open').prop('checked', s.callInitiativeAutoOpen !== false);
    $('#pp_call_init_reason').val(s.callInitiativeGuidance || '');
    $('#pp_call_init_contacts').val(
        ['active', 'all', 'weighted'].includes(s.callInitiativeContacts) ? s.callInitiativeContacts : 'active',
    );
    $('#pp_call_init_quiet').prop('checked', Boolean(s.callInitiativeQuietHoursEnabled));
    $('#pp_call_init_quiet_start').val(s.callInitiativeQuietStart ?? 23);
    $('#pp_call_init_quiet_end').val(s.callInitiativeQuietEnd ?? 8);
    $('#pp_dmail_sound').prop('checked', s.dmailSpectacleSound !== false);
    $('#pp_dmail_cutscene').val(s.dmailCutscene === 'progressive' ? 'progressive' : 'original');
    $('#pp_timeleap_enabled').prop('checked', s.timeleapEnabled !== false);
    $('#pp_phone_grab').prop('checked', s.phoneGrab !== false);
    $('#pp_phone_ai_mode').val(s.phoneAiMode === 'free' ? 'free' : 'style');
    $('#pp_phone_show_tag').prop('checked', s.phoneShowTag !== false);
    $('#pp_snoop_inject').prop('checked', s.snoopInject !== false);
    $('#pp_snoop_max').val(s.snoopInjectMax ?? 8);
    $('#pp_snoop_depth').val(s.snoopPromptDepth ?? 3);
    $('#pp_timeleap_inject').prop('checked', s.timeleapInject !== false);
    $('#pp_timeleap_depth').val(s.timeleapPromptDepth ?? 2);
    $('#pp_timeleap_max').val(s.timeleapMaxMemories ?? 5);
    $('#pp_timeleap_limit').val(s.timeleapLimitHours ?? 48);
    $('#pp_timeleap_keep_phone').prop('checked', Boolean(s.timeleapKeepFuturePhone));
    $('#pp_timeleap_sound').prop('checked', s.timeleapSound !== false);
    $('#pp_timeleap_cutscene').val(s.timeleapCutscene === 'progressive' ? 'progressive' : 'original');
    $('#pp_world_init').prop('checked', Boolean(s.worldInitiativeEnabled));
    $('#pp_world_init_dmail').prop('checked', s.worldInitiativeDmail !== false);
    $('#pp_world_init_leap').prop('checked', s.worldInitiativeLeap !== false);
    $('#pp_world_urgent').prop('checked', Boolean(s.worldUrgentAct));
    $('#pp_world_init_every').val(s.worldInitiativeEveryMessages ?? 4);
    $('#pp_world_init_cooldown').val(s.worldInitiativeCooldownSec ?? 600);
    $('#pp_world_init_others').val(Math.round((s.worldInitiativeOthersChance ?? 0.3) * 100));
    $('#pp_char_leap_ask').prop('checked', s.charLeapAsk !== false);
    $('#pp_char_leap_cutscene').prop('checked', s.charLeapCutscene !== false);
    $('#pp_char_leap_discharge').prop('checked', s.charLeapDischarge !== false);
    $('#pp_timeleap_discharge').prop('checked', s.timeleapDischarge !== false);
    $('#pp_char_dmail_cutscene').prop('checked', s.charDmailCutscene !== false);
    $('#pp_home_meter').prop('checked', s.homeDivergenceMeter !== false);
    $('#pp_inject_call_memory').prop('checked', Boolean(s.injectCallMemory));
    $('#pp_call_summarize').prop('checked', Boolean(s.callSummarizeOnEnd));

    syncOpenRouterFields();
    syncInjectFields();
    syncChipFields();
    syncInitiativeFields();
    syncCallFields();
    syncCallInitiativeFields();
}

function clampChancePct(chance) {
    const n = Number(chance);
    if (!Number.isFinite(n)) {
        return 25;
    }
    return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}

function syncOpenRouterFields() {
    const useOr = String($('#pp_mail_backend').val() || 'main') === 'openrouter';
    $('.pp-openrouter-only').toggle(useOr);
}

function syncInjectFields() {
    const injectMail = Boolean($('#pp_inject').prop('checked'));
    const injectChat = Boolean($('#pp_inject_chat_mail').prop('checked'));
    $('.pp-inject-mail-only').toggle(injectMail);
    $('.pp-chat-summary-only').toggle(injectChat);
}

function syncChipFields() {
    const showChip = Boolean($('#pp_show_chip').prop('checked'));
    $('.pp-chip-only').toggle(showChip);
}

function syncInitiativeFields() {
    const on = Boolean($('#pp_initiative_enabled').prop('checked'));
    $('.pp-initiative-only').toggle(on);
    const idle = Boolean($('#pp_initiative_idle').prop('checked'));
    $('.pp-initiative-idle-only').toggle(on && idle);
    const quiet = Boolean($('#pp_initiative_quiet').prop('checked'));
    $('.pp-initiative-quiet-only').toggle(on && quiet);
    const useForce = Boolean($('#pp_initiative_use_force').prop('checked'));
    $('.pp-initiative-prompt-only').toggle(on && !useForce);
}

function syncCallFields() {
    const on = Boolean($('#pp_call_enabled').prop('checked'));
    $('.pp-call-only').toggle(on);
}

function syncCallInitiativeFields() {
    const callsOn = Boolean($('#pp_call_enabled').prop('checked'));
    const on = callsOn && Boolean($('#pp_call_initiative_enabled').prop('checked'));
    $('.pp-call-initiative-only').toggle(on);
    const idle = Boolean($('#pp_call_init_idle').prop('checked'));
    $('.pp-call-init-idle-only').toggle(on && idle);
    const quiet = Boolean($('#pp_call_init_quiet').prop('checked'));
    $('.pp-call-init-quiet-only').toggle(on && quiet);
}

function onToggle(key, selector, after) {
    $(selector).on('input', () => {
        const s = getSettings();
        s[key] = Boolean($(selector).prop('checked'));
        saveSettings();
        if (typeof after === 'function') {
            after(s);
        }
    });
}

async function loadSettingsPanel() {
    try {
        let html = '';
        try {
            html = await $.get(`${EXTENSION_FOLDER}/settings.html`);
        } catch {
            html = await $.get(`${LEGACY_EXTENSION_FOLDER}/settings.html`);
        }
        $('#extensions_settings2').append(html);
    } catch (err) {
        console.warn(LOG, 'Failed to load settings.html, trying alternate path', err);
        try {
            const ctx = getContext();
            if (typeof ctx.renderExtensionTemplateAsync === 'function') {
                let html = '';
                try {
                    html = await ctx.renderExtensionTemplateAsync('third-party/Phone-Trigger', 'settings');
                } catch {
                    html = await ctx.renderExtensionTemplateAsync('third-party/Penumbra-Phantasm', 'settings');
                }
                $('#extensions_settings2').append(html);
            }
        } catch (err2) {
            console.error(LOG, 'Could not mount settings UI', err2);
            return;
        }
    }

    // Settings sections live in the system menu dialog; move them before binding.
    registerPhonesMenu();
    mountMenu();
    bindSettingsUi();
    $('#pp_open_menu_btn').on('click', () => openMenu());
    updateMenuStatus();

    onToggle('enabled', '#pp_enabled', (s) => {
        updateFabVisibility();
        updateMailPrompt();
        updateWandItem();
        if (!s.enabled && isPhoneOpen()) {
            closePhone();
        }
        syncInitiativeScheduler();
        syncCallInitiativeScheduler();
    });
    onToggle('showMailChip', '#pp_show_chip', () => {
        syncChipFields();
        updateFabVisibility();
    });
    $('#pp_chip_reset').on('click', () => {
        resetMailChipPosition();
        toast('Chip position reset', 'info');
    });
    onToggle('showWandMenuItem', '#pp_wand', () => updateWandItem());
    onToggle('enableSlashCommand', '#pp_slash');
    onToggle('soundEnabled', '#pp_sound', () => refreshMenuMusic());
    onToggle('reduceFlashing', '#pp_reduce_flashing', (st) => {
        st.reduceFlashingAsked = true;
        saveSettings();
    });

    // Menu music (Dynamic Audio's song library)
    $('#pp_menu_song_enabled').prop('checked', Boolean(getSettings().menuSongEnabled));
    const fillMenuSongs = async () => {
        const sel = $('#pp_menu_song');
        const current = String(getSettings().menuSong || '');
        const installed = hasDynamicAudio();
        const songs = installed ? await listSongs() : [];
        sel.empty().append($('<option></option>').val('').text(installed ? (songs.length ? '— choose a song —' : '— no songs in Dynamic Audio —') : '— Dynamic Audio not installed —'));
        for (const path of songs) {
            sel.append($('<option></option>').val(path).text(songLabel(path)));
        }
        if (current && !songs.includes(current)) {
            sel.append($('<option></option>').val(current).text(`${songLabel(current)} (missing)`));
        }
        sel.val(current);
        sel.prop('disabled', !installed);
        $('#pp_menu_song_enabled').prop('disabled', !installed);
        $('#pp_menu_song_refresh').prop('disabled', !installed);
    };
    // Dynamic Audio may load after us: fill once things settle, and on demand.
    setTimeout(() => void fillMenuSongs(), 2500);
    $('#pp_menu_song_refresh').on('click', () => void fillMenuSongs());
    $('#pp_menu_song').on('focus', () => {
        if ($('#pp_menu_song option').length <= 1) {
            void fillMenuSongs();
        }
    });
    onToggle('menuSongEnabled', '#pp_menu_song_enabled', () => refreshMenuMusic());

    // Lab Radio
    $('#pp_radio_enabled').prop('checked', getSettings().musicPlayerEnabled !== false);
    onToggle('musicPlayerEnabled', '#pp_radio_enabled');
    $('#pp_radio_open').on('click', () => {
        if (!openMusicPlayer()) {
            toast('Lab Radio needs the Dynamic Audio extension', 'warning', 'LAB RADIO');
        }
    });
    $('#pp_radio_reset').on('click', () => resetPlayerPosition());
    initMusicPlayer();
    $('#pp_menu_song').on('change', () => {
        getSettings().menuSong = String($('#pp_menu_song').val() || '');
        saveSettings();
        refreshMenuMusic();
    });
    onToggle('openShutFirst', '#pp_open_shut');
    onToggle('phoneSideDock', '#pp_side_dock', () => refreshPhoneDock());
    onToggle('charMailInChat', '#pp_char_mail_chat', () => updateMailPrompt());
    onToggle('injectPrompt', '#pp_inject', () => {
        syncInjectFields();
        updateMailPrompt();
    });
    onToggle('dmailWorldline', '#pp_inject_worldline', (s) => {
        s.injectWorldline = s.dmailWorldline !== false;
        saveSettings();
        if (s.dmailWorldline === false) {
            try {
                const ctx = getContext();
                ctx.setExtensionPrompt?.('phone_trigger_worldline', '', 1, 0);
            } catch {
                /* ignore */
            }
        } else {
            updateWorldlinePrompt();
        }
    });
    $('#pp_mail_memory_scope').on('change', () => {
        const s = getSettings();
        s.mailMemoryScope = String($('#pp_mail_memory_scope').val() || 'speaker') === 'all' ? 'all' : 'speaker';
        s.injectMailOwnOnly = s.mailMemoryScope !== 'all';
        saveSettings();
        updateMailPrompt();
    });
    const clampInt = (selector, key, min, max, fallback) => {
        $(selector).on('change', () => {
            const s = getSettings();
            let n = Number($(selector).val());
            if (!Number.isFinite(n)) {
                n = fallback;
            }
            n = Math.max(min, Math.min(max, Math.floor(n)));
            s[key] = n;
            $(selector).val(n);
            saveSettings();
            updateMailPrompt();
        });
    };
    clampInt('#pp_mail_memory_max', 'mailMemoryMax', 1, 40, 6);
    clampInt('#pp_mail_memory_preview', 'mailMemoryPreviewLength', 20, 500, 140);
    clampInt('#pp_mail_memory_pos', 'mailMemoryPromptPosition', 0, 10, 1);
    clampInt('#pp_mail_memory_depth', 'mailMemoryPromptDepth', 0, 99, 0);

    $('#pp_mail_memory_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_memory_prompt').val() || '').trim();
        s.mailMemoryPrompt = value || DEFAULT_MAIL_MEMORY_PROMPT;
        saveSettings();
        updateMailPrompt();
    });
    $('#pp_mail_memory_entry').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_memory_entry').val() || '').trim();
        s.mailMemoryEntryTemplate = value || DEFAULT_MAIL_MEMORY_ENTRY;
        saveSettings();
        updateMailPrompt();
    });
    $('#pp_mail_memory_send').on('input', () => {
        const s = getSettings();
        s.mailMemorySendInstructions = String($('#pp_mail_memory_send').val() || '');
        saveSettings();
        updateMailPrompt();
    });
    $('#pp_mail_memory_reset').on('click', () => {
        const s = getSettings();
        s.mailMemoryPrompt = DEFAULT_MAIL_MEMORY_PROMPT;
        s.mailMemoryEntryTemplate = DEFAULT_MAIL_MEMORY_ENTRY;
        s.mailMemorySendInstructions = DEFAULT_MAIL_SEND_INSTRUCTIONS;
        $('#pp_mail_memory_prompt').val(DEFAULT_MAIL_MEMORY_PROMPT);
        $('#pp_mail_memory_entry').val(DEFAULT_MAIL_MEMORY_ENTRY);
        $('#pp_mail_memory_send').val(DEFAULT_MAIL_SEND_INSTRUCTIONS);
        saveSettings();
        updateMailPrompt();
        toast('Mail memory templates reset', 'info');
    });
    onToggle('injectChatIntoMail', '#pp_inject_chat_mail', () => syncInjectFields());
    $('#pp_chat_summary_n').on('change', () => {
        const s = getSettings();
        let n = Number($('#pp_chat_summary_n').val());
        if (!Number.isFinite(n) || n < 1) {
            n = 1;
        }
        if (n > 40) {
            n = 40;
        }
        s.chatSummaryMessages = Math.floor(n);
        $('#pp_chat_summary_n').val(s.chatSummaryMessages);
        saveSettings();
    });
    onToggle('autoOpenOnMail', '#pp_auto_open');
    onToggle('notifyInChat', '#pp_notify_toast');

    $('#pp_mail_backend').on('change', () => {
        const s = getSettings();
        s.mailBackend = String($('#pp_mail_backend').val() || 'main');
        saveSettings();
        syncOpenRouterFields();
    });
    $('#pp_or_key').on('input', () => {
        const s = getSettings();
        s.openRouterApiKey = String($('#pp_or_key').val() || '');
        saveSettings();
    });
    $('#pp_or_model').on('input', () => {
        const s = getSettings();
        s.openRouterModel = String($('#pp_or_model').val() || '').trim() || 'openai/gpt-4o-mini';
        saveSettings();
    });

    const clampDelay = () => {
        const s = getSettings();
        let min = Number($('#pp_mail_delay_min').val());
        let max = Number($('#pp_mail_delay_max').val());
        if (!Number.isFinite(min) || min < 0) {
            min = 0;
        }
        if (!Number.isFinite(max) || max < min) {
            max = min;
        }
        s.mailReplyDelayMin = min;
        s.mailReplyDelayMax = max;
        $('#pp_mail_delay_min').val(min);
        $('#pp_mail_delay_max').val(max);
        saveSettings();
    };
    $('#pp_mail_delay_min').on('change', clampDelay);
    $('#pp_mail_delay_max').on('change', clampDelay);

    $('#pp_mail_reply_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_reply_prompt').val() || '').trim();
        s.mailReplyPrompt = value || DEFAULT_MAIL_REPLY_PROMPT;
        saveSettings();
    });
    $('#pp_mail_prompt_reset').on('click', () => {
        const s = getSettings();
        s.mailReplyPrompt = DEFAULT_MAIL_REPLY_PROMPT;
        $('#pp_mail_reply_prompt').val(DEFAULT_MAIL_REPLY_PROMPT);
        saveSettings();
        toast('Mail reply prompt reset', 'info');
    });

    $('#pp_mail_force_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_mail_force_prompt').val() || '').trim();
        s.mailForcePrompt = value || DEFAULT_MAIL_FORCE_PROMPT;
        saveSettings();
    });
    $('#pp_mail_force_reset').on('click', () => {
        const s = getSettings();
        s.mailForcePrompt = DEFAULT_MAIL_FORCE_PROMPT;
        $('#pp_mail_force_prompt').val(DEFAULT_MAIL_FORCE_PROMPT);
        saveSettings();
        toast('Forced mail prompt reset', 'info');
    });

    // —— Character initiative ——
    onToggle('mailInitiativeEnabled', '#pp_initiative_enabled', () => {
        syncInitiativeFields();
        syncInitiativeScheduler();
    });
    const clampInitiativeInt = (selector, key, min, max, fallback, after) => {
        $(selector).on('change', () => {
            const s = getSettings();
            let n = Number($(selector).val());
            if (!Number.isFinite(n)) {
                n = fallback;
            }
            n = Math.max(min, Math.min(max, Math.floor(n)));
            s[key] = n;
            $(selector).val(n);
            saveSettings();
            if (typeof after === 'function') {
                after(s);
            }
        });
    };
    const restartInitiative = () => syncInitiativeScheduler();
    const clampInitiativePair = () => {
        const s = getSettings();
        let min = Number($('#pp_initiative_interval_min').val());
        let max = Number($('#pp_initiative_interval_max').val());
        if (!Number.isFinite(min) || min < 30) {
            min = 30;
        }
        if (!Number.isFinite(max) || max < min) {
            max = min;
        }
        s.mailInitiativeIntervalMin = Math.floor(min);
        s.mailInitiativeIntervalMax = Math.floor(max);
        $('#pp_initiative_interval_min').val(s.mailInitiativeIntervalMin);
        $('#pp_initiative_interval_max').val(s.mailInitiativeIntervalMax);
        saveSettings();
        restartInitiative();
    };
    $('#pp_initiative_interval_min').on('change', clampInitiativePair);
    $('#pp_initiative_interval_max').on('change', clampInitiativePair);
    $('#pp_initiative_chance').on('change', () => {
        const s = getSettings();
        let pct = Number($('#pp_initiative_chance').val());
        if (!Number.isFinite(pct)) {
            pct = 25;
        }
        pct = Math.max(0, Math.min(100, Math.round(pct)));
        s.mailInitiativeChance = pct / 100;
        $('#pp_initiative_chance').val(pct);
        saveSettings();
    });
    clampInitiativeInt('#pp_initiative_grace', 'mailInitiativeStartupGraceSec', 0, 3600, 90, restartInitiative);
    clampInitiativeInt('#pp_initiative_cooldown', 'mailInitiativeCooldownSec', 0, 7200, 300);
    clampInitiativeInt('#pp_initiative_max_hour', 'mailInitiativeMaxPerHour', 0, 60, 2);
    clampInitiativeInt('#pp_initiative_max_day', 'mailInitiativeMaxPerDay', 0, 200, 6);
    clampInitiativeInt('#pp_initiative_max_pending', 'mailInitiativeMaxPending', 0, 5, 1);
    onToggle('mailInitiativeOnlyWhenIdle', '#pp_initiative_idle', () => syncInitiativeFields());
    clampInitiativeInt('#pp_initiative_idle_sec', 'mailInitiativeIdleSeconds', 0, 3600, 60);
    onToggle('mailInitiativePauseDuringGeneration', '#pp_initiative_pause_gen');
    onToggle('mailInitiativePauseWhilePhoneOpen', '#pp_initiative_pause_phone');
    onToggle('mailInitiativeRequireTabVisible', '#pp_initiative_tab');
    onToggle('mailInitiativeSkipIfUnread', '#pp_initiative_skip_unread');
    onToggle('mailInitiativeSkipIfUnreadFromSender', '#pp_initiative_skip_unread_sender');
    $('#pp_initiative_contacts').on('change', () => {
        const s = getSettings();
        const v = String($('#pp_initiative_contacts').val() || 'active');
        s.mailInitiativeContacts = ['active', 'all', 'weighted'].includes(v) ? v : 'active';
        saveSettings();
    });
    onToggle('mailInitiativeQuietHoursEnabled', '#pp_initiative_quiet', () => syncInitiativeFields());
    clampInitiativeInt('#pp_initiative_quiet_start', 'mailInitiativeQuietStart', 0, 23, 23);
    clampInitiativeInt('#pp_initiative_quiet_end', 'mailInitiativeQuietEnd', 0, 23, 8);
    $('#pp_initiative_guidance').on('input', () => {
        const s = getSettings();
        s.mailInitiativeGuidance = String($('#pp_initiative_guidance').val() || '');
        saveSettings();
    });
    onToggle('mailInitiativeUseForcePrompt', '#pp_initiative_use_force', () => syncInitiativeFields());
    $('#pp_initiative_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_initiative_prompt').val() || '').trim();
        s.mailInitiativePrompt = value || DEFAULT_MAIL_INITIATIVE_PROMPT;
        saveSettings();
    });
    $('#pp_initiative_prompt_reset').on('click', () => {
        const s = getSettings();
        s.mailInitiativePrompt = DEFAULT_MAIL_INITIATIVE_PROMPT;
        $('#pp_initiative_prompt').val(DEFAULT_MAIL_INITIATIVE_PROMPT);
        saveSettings();
        toast('Initiative prompt reset', 'info');
    });
    $('#pp_initiative_test').on('click', async () => {
        const btn = /** @type {HTMLButtonElement | null} */ ($('#pp_initiative_test').get(0));
        if (btn) {
            btn.disabled = true;
        }
        try {
            await tryInitiativeMail({
                bypassChance: true,
                bypassIdle: true,
                bypassQuiet: true,
                bypassGeneration: true,
            });
        } finally {
            if (btn) {
                btn.disabled = false;
            }
        }
    });

    // —— Calls ——
    onToggle('callEnabled', '#pp_call_enabled', () => {
        syncCallFields();
        syncCallInitiativeFields();
        syncCallInitiativeScheduler();
    });
    $('#pp_call_mode').on('change', () => {
        const s = getSettings();
        const v = String($('#pp_call_mode').val() || 'unique');
        s.callGenerationMode = ['unique', 'main', 'both'].includes(v) ? v : 'unique';
        saveSettings();
    });
    $('#pp_call_dial_ms').on('change', () => {
        const s = getSettings();
        let n = Number($('#pp_call_dial_ms').val());
        if (!Number.isFinite(n) || n < 0) {
            n = 0;
        }
        n = Math.min(4000, Math.floor(n));
        s.callDialDelayMs = n;
        $('#pp_call_dial_ms').val(n);
        saveSettings();
    });
    $('#pp_call_context').on('change', () => {
        const s = getSettings();
        let n = Number($('#pp_call_context').val());
        if (!Number.isFinite(n)) {
            n = 16;
        }
        n = Math.max(2, Math.min(40, Math.floor(n)));
        s.callContextTurns = n;
        $('#pp_call_context').val(n);
        saveSettings();
    });
    $('#pp_call_guidance').on('input', () => {
        const s = getSettings();
        s.callGuidance = String($('#pp_call_guidance').val() || '');
        saveSettings();
    });
    $('#pp_call_prompt').on('input', () => {
        const s = getSettings();
        const value = String($('#pp_call_prompt').val() || '').trim();
        s.callPrompt = value || DEFAULT_CALL_PROMPT;
        saveSettings();
    });
    $('#pp_call_prompt_reset').on('click', () => {
        const s = getSettings();
        s.callPrompt = DEFAULT_CALL_PROMPT;
        $('#pp_call_prompt').val(DEFAULT_CALL_PROMPT);
        saveSettings();
        toast('Call prompt reset', 'info');
    });

    // —— Call initiative ——
    onToggle('callInitiativeEnabled', '#pp_call_initiative_enabled', () => {
        syncCallInitiativeFields();
        syncCallInitiativeScheduler();
    });
    const restartCallInitiative = () => syncCallInitiativeScheduler();
    const clampCallInitPair = () => {
        const s = getSettings();
        let min = Number($('#pp_call_init_interval_min').val());
        let max = Number($('#pp_call_init_interval_max').val());
        if (!Number.isFinite(min) || min < 30) {
            min = 30;
        }
        if (!Number.isFinite(max) || max < min) {
            max = min;
        }
        s.callInitiativeIntervalMin = Math.floor(min);
        s.callInitiativeIntervalMax = Math.floor(max);
        $('#pp_call_init_interval_min').val(s.callInitiativeIntervalMin);
        $('#pp_call_init_interval_max').val(s.callInitiativeIntervalMax);
        saveSettings();
        restartCallInitiative();
    };
    $('#pp_call_init_interval_min').on('change', clampCallInitPair);
    $('#pp_call_init_interval_max').on('change', clampCallInitPair);
    $('#pp_call_init_chance').on('change', () => {
        const s = getSettings();
        let pct = Number($('#pp_call_init_chance').val());
        if (!Number.isFinite(pct)) {
            pct = 20;
        }
        pct = Math.max(0, Math.min(100, Math.round(pct)));
        s.callInitiativeChance = pct / 100;
        $('#pp_call_init_chance').val(pct);
        saveSettings();
    });
    const clampCallInitInt = (selector, key, min, max, fallback, after) => {
        $(selector).on('change', () => {
            const s = getSettings();
            let n = Number($(selector).val());
            if (!Number.isFinite(n)) {
                n = fallback;
            }
            n = Math.max(min, Math.min(max, Math.floor(n)));
            s[key] = n;
            $(selector).val(n);
            saveSettings();
            if (typeof after === 'function') {
                after(s);
            }
        });
    };
    clampCallInitInt('#pp_call_init_grace', 'callInitiativeStartupGraceSec', 0, 3600, 120, restartCallInitiative);
    clampCallInitInt('#pp_call_init_cooldown', 'callInitiativeCooldownSec', 0, 7200, 420);
    clampCallInitInt('#pp_call_init_max_hour', 'callInitiativeMaxPerHour', 0, 60, 1);
    clampCallInitInt('#pp_call_init_max_day', 'callInitiativeMaxPerDay', 0, 200, 4);
    clampCallInitInt('#pp_call_init_ring_timeout', 'callInitiativeRingTimeoutSec', 0, 300, 45);
    onToggle('callInitiativeOnlyWhenIdle', '#pp_call_init_idle', () => syncCallInitiativeFields());
    clampCallInitInt('#pp_call_init_idle_sec', 'callInitiativeIdleSeconds', 0, 3600, 90);
    onToggle('callInitiativePauseDuringGeneration', '#pp_call_init_pause_gen');
    onToggle('callInitiativePauseWhilePhoneOpen', '#pp_call_init_pause_phone');
    onToggle('callInitiativeRequireTabVisible', '#pp_call_init_tab');
    onToggle('callInitiativeSkipIfBusy', '#pp_call_init_skip_busy');
    onToggle('callInitiativeAutoOpen', '#pp_call_init_auto_open');
    $('#pp_call_init_reason').on('input', () => {
        getSettings().callInitiativeGuidance = String($('#pp_call_init_reason').val() || '');
        saveSettings();
    });
    $('#pp_call_init_contacts').on('change', () => {
        const s = getSettings();
        const v = String($('#pp_call_init_contacts').val() || 'active');
        s.callInitiativeContacts = ['active', 'all', 'weighted'].includes(v) ? v : 'active';
        saveSettings();
    });
    onToggle('callInitiativeQuietHoursEnabled', '#pp_call_init_quiet', () => syncCallInitiativeFields());
    clampCallInitInt('#pp_call_init_quiet_start', 'callInitiativeQuietStart', 0, 23, 23);
    clampCallInitInt('#pp_call_init_quiet_end', 'callInitiativeQuietEnd', 0, 23, 8);
    $('#pp_call_initiative_test').on('click', async () => {
        const btn = /** @type {HTMLButtonElement | null} */ ($('#pp_call_initiative_test').get(0));
        if (btn) {
            btn.disabled = true;
        }
        try {
            await tryCallInitiative({
                bypassChance: true,
                bypassIdle: true,
                bypassQuiet: true,
                bypassGeneration: true,
            });
        } finally {
            if (btn) {
                btn.disabled = false;
            }
        }
    });

    onToggle('dmailSpectacleSound', '#pp_dmail_sound');
    $('#pp_dmail_cutscene').on('change', () => {
        const st = getSettings();
        st.dmailCutscene = $('#pp_dmail_cutscene').val() === 'progressive' ? 'progressive' : 'original';
        st.dmailCutsceneChosen = true;
        saveSettings();
    });
    $('#pp_dmail_cutscene_compare').on('click', async () => {
        const choice = await showCutscenePrompt();
        $('#pp_dmail_cutscene').val(choice);
    });

    onToggle('timeleapEnabled', '#pp_timeleap_enabled');
    onToggle('phoneGrab', '#pp_phone_grab', () => refreshIfOpen());
    $('#pp_phone_ai_mode').on('change', () => {
        getSettings().phoneAiMode = $('#pp_phone_ai_mode').val() === 'free' ? 'free' : 'style';
        saveSettings();
    });
    onToggle('phoneShowTag', '#pp_phone_show_tag', () => updateSnoopPrompt());
    onToggle('snoopInject', '#pp_snoop_inject', () => updateSnoopPrompt());
    for (const [sel, key, max, dflt] of [['#pp_snoop_max', 'snoopInjectMax', 20, 8], ['#pp_snoop_depth', 'snoopPromptDepth', 99, 3]]) {
        $(sel).on('change', () => {
            let n = Math.floor(Number($(sel).val()));
            n = Number.isFinite(n) ? Math.max(key === 'snoopInjectMax' ? 1 : 0, Math.min(max, n)) : dflt;
            getSettings()[key] = n;
            $(sel).val(n);
            saveSettings();
            updateSnoopPrompt();
        });
    }
    onToggle('timeleapInject', '#pp_timeleap_inject', () => updateTimeleapPrompt());
    onToggle('timeleapKeepFuturePhone', '#pp_timeleap_keep_phone');
    onToggle('timeleapSound', '#pp_timeleap_sound');
    const leapInt = (selector, key, min, max, fallback) => {
        $(selector).on('change', () => {
            const st = getSettings();
            let n = Number($(selector).val());
            if (!Number.isFinite(n)) {
                n = fallback;
            }
            n = Math.max(min, Math.min(max, Math.floor(n)));
            st[key] = n;
            $(selector).val(n);
            saveSettings();
            updateTimeleapPrompt();
        });
    };
    leapInt('#pp_timeleap_depth', 'timeleapPromptDepth', 0, 99, 2);
    leapInt('#pp_timeleap_max', 'timeleapMaxMemories', 1, 20, 5);
    leapInt('#pp_timeleap_limit', 'timeleapLimitHours', 0, 8760, 48);
    $('#pp_timeleap_cutscene').on('change', () => {
        const st = getSettings();
        st.timeleapCutscene = $('#pp_timeleap_cutscene').val() === 'progressive' ? 'progressive' : 'original';
        st.timeleapCutsceneChosen = true;
        saveSettings();
    });
    $('#pp_timeleap_cutscene_compare').on('click', async () => {
        const choice = await showCutscenePrompt({ kind: 'timeleap' });
        $('#pp_timeleap_cutscene').val(choice);
    });
    // Characters: D-Mail & Time Leap
    onToggle('worldInitiativeEnabled', '#pp_world_init');
    onToggle('worldInitiativeDmail', '#pp_world_init_dmail');
    onToggle('worldInitiativeLeap', '#pp_world_init_leap');
    onToggle('worldUrgentAct', '#pp_world_urgent');
    onToggle('charLeapAsk', '#pp_char_leap_ask');
    onToggle('charLeapCutscene', '#pp_char_leap_cutscene');
    onToggle('charLeapDischarge', '#pp_char_leap_discharge');
    onToggle('timeleapDischarge', '#pp_timeleap_discharge');
    onToggle('charDmailCutscene', '#pp_char_dmail_cutscene');
    const worldNum = (selector, key, min, max, fallback, scale = 1) => {
        $(selector).on('change', () => {
            const st = getSettings();
            let n = Number($(selector).val());
            if (!Number.isFinite(n)) {
                n = fallback;
            }
            n = Math.max(min, Math.min(max, Math.floor(n)));
            st[key] = n / scale;
            $(selector).val(n);
            saveSettings();
        });
    };
    worldNum('#pp_world_init_every', 'worldInitiativeEveryMessages', 1, 50, 4);
    worldNum('#pp_world_init_cooldown', 'worldInitiativeCooldownSec', 0, 86400, 600);
    worldNum('#pp_world_init_others', 'worldInitiativeOthersChance', 0, 100, 30, 100);
    const fillForceWho = () => {
        const sel = $('#pp_world_force_who');
        const was = sel.val();
        const actors = listActors();
        sel.empty();
        for (const c of actors) {
            sel.append($('<option></option>').val(c.key).text(c.name));
        }
        if (was && actors.some((c) => c.key === was)) {
            sel.val(was);
        }
    };
    fillForceWho();
    $('#pp_world_force_who').on('focus mousedown', fillForceWho);
    $('#pp_world_force_go').on('click', async () => {
        fillForceWho();
        const contact = listActors().find((c) => c.key === $('#pp_world_force_who').val());
        if (!contact) {
            toast('No character in this chat', 'warning', 'PHONEWAVE');
            return;
        }
        const act = $('#pp_world_force_act').val() === 'leap' ? 'leap' : 'dmail';
        const btn = $('#pp_world_force_go');
        btn.prop('disabled', true);
        try {
            await forceAct(contact, act, String($('#pp_world_force_guidance').val() || '').trim());
        } finally {
            btn.prop('disabled', false);
        }
    });
    $('#pp_world_check_now').on('click', async () => {
        fillForceWho();
        const contact = listActors().find((c) => c.key === $('#pp_world_force_who').val()) || null;
        const btn = $('#pp_world_check_now');
        btn.prop('disabled', true);
        try {
            await checkNow(contact);
        } finally {
            btn.prop('disabled', false);
        }
    });
    onToggle('homeDivergenceMeter', '#pp_home_meter');
    onToggle('injectCallMemory', '#pp_inject_call_memory', (st) => {
        if (st.injectCallMemory) {
            updateCallMemoryPrompt();
        } else {
            updateCallMemoryPrompt();
        }
    });
    onToggle('callSummarizeOnEnd', '#pp_call_summarize');

    $('#pp_open_phone_btn').on('click', () => {
        userOpenPhone();
    });
    $('#pp_test_mail_btn').on('click', async () => {
        await receiveEmail({
            from: getActiveCharacterName() || 'Unknown',
            subject: 'Test',
            body: 'Mail delivery check.',
            replyOptions: ['OK', 'Who?', 'Later'],
        });
        openInbox();
    });
}

function updateWandItem() {
    const s = getSettings();
    const existing = document.getElementById('pp-wand-item');
    const show = s.enabled && s.showWandMenuItem;
    if (!show) {
        existing?.remove();
        document.getElementById('pp-wand-menu-item')?.remove();
        return;
    }
    if (existing) {
        return;
    }

    const wandRoot = document.getElementById('extensionsMenu')
        || document.querySelector('#extensions_settings .extensions_block')
        || document.querySelector('#rm_extensions_block .extensionsMenu');

    if (wandRoot) {
        const btn = document.createElement('div');
        btn.id = 'pp-wand-item';
        btn.className = 'list-group-item flex-container flexGap5 interactable';
        btn.title = 'Open Phone Trigger';
        btn.setAttribute('tabindex', '0');
        btn.innerHTML = `<div class="fa-solid fa-mobile-screen-button extensionsMenuExtensionButton"></div><span>Phone Trigger</span>`;
        const open = (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            userOpenPhone();
        };
        btn.addEventListener('click', open);
        wandRoot.appendChild(btn);

        const menuBtn = document.createElement('div');
        menuBtn.id = 'pp-wand-menu-item';
        menuBtn.className = 'list-group-item flex-container flexGap5 interactable';
        menuBtn.title = 'Phone Trigger settings';
        menuBtn.setAttribute('tabindex', '0');
        menuBtn.innerHTML = `<div class="fa-solid fa-gear extensionsMenuExtensionButton"></div><span>Phone Trigger menu</span>`;
        menuBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openMenu();
        });
        wandRoot.appendChild(menuBtn);
        return;
    }

    console.debug(LOG, 'Extensions wand menu not found yet; will retry');
}

function registerSlashCommands() {
    const ctx = getContext();
    const Parser = ctx.SlashCommandParser;
    const SlashCommand = ctx.SlashCommand;
    const SlashCommandArgument = ctx.SlashCommandArgument;
    const SlashCommandNamedArgument = ctx.SlashCommandNamedArgument;
    const ARGUMENT_TYPE = ctx.ARGUMENT_TYPE;

    if (!Parser?.addCommandObject || !SlashCommand?.fromProps) {
        // Legacy fallback
        if (typeof ctx.registerSlashCommand === 'function') {
            ctx.registerSlashCommand('phone', () => {
                if (!getSettings().enableSlashCommand) {
                    return '';
                }
                togglePhone();
                return '';
            }, [], 'Toggle the phone UI', true, true);
            ctx.registerSlashCommand('mail', () => {
                if (!getSettings().enableSlashCommand) {
                    return '';
                }
                openInbox();
                return '';
            }, [], 'Open mail inbox', true, true);
        }
        return;
    }

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'phone',
        callback: () => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            togglePhone();
            return isPhoneOpen() ? 'Phone opened' : 'Phone closed';
        },
        aliases: ['phonetrigger'],
        helpString: 'Toggle Phone Trigger.',
    }));

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'mail',
        callback: () => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            openInbox();
            return 'Inbox opened';
        },
        aliases: ['email', 'inbox'],
        helpString: 'Open the phone e-mail inbox.',
    }));

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'grabphone',
        callback: (_named, unnamed) => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            const owner = resolveOwner(String(unnamed || '').trim());
            if (!owner) {
                toast('Whose phone? /grabphone <name>', 'warning', 'PHONE');
                return '';
            }
            openCharacterPhone(owner.key, owner.name);
            return `Holding ${owner.name}'s phone`;
        },
        aliases: ['snoop'],
        unnamedArgumentList: SlashCommandArgument?.fromProps ? [
            SlashCommandArgument.fromProps({
                description: 'Whose phone (a chat character, or any name from the story)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ] : [],
        helpString: 'Take a character\'s phone and look through it (or act as them).',
    }));

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'phonemenu',
        callback: () => {
            openMenu();
            return 'Phone Trigger menu opened';
        },
        aliases: ['ptmenu'],
        helpString: 'Open the Phone Trigger settings menu.',
    }));

    /** Newer commands: one optional free-text argument. */
    const simple = (name, callback, helpString, aliases = []) => {
        Parser.addCommandObject(SlashCommand.fromProps({
            name,
            callback: async (_named, text) => {
                if (!getSettings().enableSlashCommand) {
                    return 'Phone slash commands disabled';
                }
                return String(await callback(String(text ?? '').trim()) ?? '');
            },
            aliases,
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({ description: 'arguments', typeList: [ARGUMENT_TYPE.STRING], isRequired: false }),
            ],
            helpString,
        }));
    };
    simple('worldlines', async (text) => {
        (await import('./lib/worldlineMap.js')).openWorldlineMap(/^check|earlier/i.test(text) ? { section: 'earlier' } : {});
        return '';
    }, 'Open the worldline map. <code>/worldlines check</code> opens it on the earlier D-Mails.', ['wlmap']);
    simple('board', async (text) => {
        if (getSettings().boardEnabled === false) {
            return 'The board app is off';
        }
        await openBoardApp(text);
        return '';
    }, 'Open the @channel board app (optionally a board, e.g. <code>/board occult</code>).', ['atchannel']);
    simple('tips', async () => {
        await openTips();
        return '';
    }, 'Open the TIPS glossary.');
    simple('labmem', (text) => labMemCommand(text),
        'Lab members. <code>/labmem</code> lists them; <code>/labmem Kurisu 4 Assistant</code> sets a number and title.');
    simple('cardundo', (text) => cardUndoCommand(text),
        'Undo Phone Trigger\'s last rewrite of a character card (the active character, or a name).');
    simple('fakecall', (text) => {
        openFakeCall(text);
        return '';
    }, 'Take a fake phone call (optional: who you pretend to talk to).');
    simple('storytime', (text) => storyTimeCommand(text),
        'Story clock. No argument reports it; <code>pass 2h</code>, <code>sleep</code>, <code>set 2010-08-13 19:56</code>, <code>day 3</code>.',
        ['clock']);
    for (const extra of extraCommands) {
        simple(extra.name, extra.callback, extra.help, extra.aliases || []);
    }

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'timeleap',
        callback: () => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            openTimeleapMachine();
            return 'Time Leap Machine opened';
        },
        aliases: ['tlm'],
        helpString: 'Open the Time Leap Machine (same as calling PhoneWave).',
    }));

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'music',
        callback: () => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            if (!openMusicPlayer()) {
                toast('Lab Radio needs the Dynamic Audio extension', 'warning', 'LAB RADIO');
                return '';
            }
            return 'Lab Radio open';
        },
        aliases: ['radio'],
        helpString: 'Open Lab Radio, the music player (needs Dynamic Audio).',
    }));

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'worldcheck',
        callback: async (_named, unnamed) => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            const name = String(unnamed || '').trim();
            const contact = name ? resolveActor(name) : null;
            if (name && !contact) {
                toast(`Who? /worldcheck [character]`, 'warning', 'PHONEWAVE');
                return '';
            }
            return checkNow(contact);
        },
        unnamedArgumentList: SlashCommandArgument?.fromProps ? [
            SlashCommandArgument.fromProps({
                description: 'Character to consider (default: whoever is speaking)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ] : [],
        helpString: 'Ask now whether a character would send a D-Mail or time leap (skips the cooldown; usually they won\'t).',
    }));

    // /chardmail Name guidance… · /charleap Name guidance…
    for (const [name, act, help] of [
        ['chardmail', 'dmail', 'Make a character send a D-Mail now. /chardmail Name optional guidance'],
        ['charleap', 'leap', 'Make a character time leap now. /charleap Name optional guidance'],
    ]) {
        Parser.addCommandObject(SlashCommand.fromProps({
            name,
            callback: async (_named, unnamed) => {
                if (!getSettings().enableSlashCommand) {
                    return 'Phone slash commands disabled';
                }
                const text = String(unnamed || '').trim();
                // The longest cast name that starts the text wins (names can have spaces).
                const actors = listActors().sort((a, b) => b.name.length - a.name.length);
                let contact = actors.find((c) => text.toLowerCase().startsWith(c.name.toLowerCase())) || null;
                let guidance = contact ? text.slice(contact.name.length).trim() : '';
                if (!contact) {
                    const [first, ...rest] = text.split(/\s+/);
                    contact = resolveActor(first);
                    guidance = rest.join(' ');
                }
                if (!contact) {
                    toast(`Who? /${name} <character> [guidance]`, 'warning', 'PHONEWAVE');
                    return '';
                }
                return forceAct(contact, /** @type {'dmail' | 'leap'} */ (act), guidance);
            },
            unnamedArgumentList: SlashCommandArgument?.fromProps ? [
                SlashCommandArgument.fromProps({
                    description: 'Character name, then optional guidance',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                }),
            ] : [],
            helpString: help,
        }));
    }

    Parser.addCommandObject(SlashCommand.fromProps({
        name: 'mailsend',
        callback: async (namedArgs, unnamedArgs) => {
            if (!getSettings().enableSlashCommand) {
                return 'Phone slash commands disabled';
            }
            const subject = namedArgs.subject?.toString?.() || namedArgs.subject || 'Message';
            const body = unnamedArgs?.toString?.()?.trim() || '';
            if (!body) {
                return 'Usage: /mailsend subject="Hello" Your message here';
            }
            await sendUserEmail({
                subject: String(subject),
                body,
                requestReply: namedArgs.reply?.toString?.() !== 'off',
            });
            refreshIfOpen();
            return 'E-mail sent';
        },
        aliases: ['sendmail'],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'subject',
                description: 'E-mail subject',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'Message',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'reply',
                description: 'Request an AI e-mail reply (on/off)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'on',
                enumList: ['on', 'off'],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'E-mail body',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Send an e-mail from your phone (To defaults to active contact). AI reply is scheduled independently after a short delay.',
    }));
}

/**
 * Slash commands registered by newer feature modules.
 * @type {{ name: string, callback: (text: string) => any, help: string, aliases?: string[] }[]}
 */
const extraCommands = [];

/** Newer features bind their own menu controls and prompts. */
function initFeatureUi() {
    const steps = [
        () => initStoryClockUi(),
        () => syncStoryClockFlow(),
        () => updateStoryClockPrompt(),
        () => initMailUi(),
        () => initConsequences(),
        () => initFakeCallUi(),
        () => initBoardUi(),
        () => initTipsUi(),
        () => initLabUi(),
        () => initCardHistoryUi(),
        () => initWorldlineUi(() => updateWorldlinePrompt()),
        () => setConvergenceChangeHandler(() => updateWorldlinePrompt()),
        () => document.getElementById('pp_open_worldline_map')?.addEventListener('click', () => {
            void import('./lib/worldlineMap.js').then((m) => m.openWorldlineMap());
        }),
        () => document.getElementById('pp_check_earlier_dmails')?.addEventListener('click', () => {
            void import('./lib/worldlineMap.js').then((m) => m.openWorldlineMap({ section: 'earlier' }));
        }),
    ];
    for (const step of steps) {
        try {
            step();
        } catch (err) {
            console.error(LOG, 'feature init failed', err);
        }
    }
}

function registerEvents() {
    const ctx = getContext();
    const { eventSource, event_types } = ctx;
    if (!eventSource || !event_types) {
        console.warn(LOG, 'eventSource unavailable');
        return;
    }

    eventSource.on(event_types.APP_READY, () => {
        initPhoneChrome();
        updateFabVisibility();
        updateWandItem();
        updateMailPrompt();
        if (getSettings().dmailWorldline !== false) {
            updateWorldlinePrompt();
        }
        if (getSettings().injectCallMemory) {
            updateCallMemoryPrompt();
        }
        updateTimeleapPrompt();
        updateSnoopPrompt();
        noteInitiativeActivity();
        noteCallInitiativeActivity();
        syncInitiativeScheduler();
        syncCallInitiativeScheduler();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        onStoryChatChanged();
        refreshConsequences();
        resetBoardNav();
        refreshTips();
        refreshLab();
        refreshWorldlinePanels();
        updateMenuStatus();
        updateMailPrompt();
        if (getSettings().dmailWorldline !== false) {
            updateWorldlinePrompt();
        }
        if (getSettings().injectCallMemory) {
            updateCallMemoryPrompt();
        }
        updateTimeleapPrompt();
        updateSnoopPrompt();
        refreshIfOpen();
        noteInitiativeActivity();
        noteCallInitiativeActivity();
        syncInitiativeScheduler();
        syncCallInitiativeScheduler();
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, async (messageId) => {
        noteStoryMessage();
        onFakeCallMessage();
        noteInitiativeActivity();
        noteCallInitiativeActivity();
        try {
            // A character spoke: now and then, does anyone have reason to reach into the past?
            const msg = getContext().chat?.[Number(messageId)];
            if (msg && !msg.is_user && !msg.is_system) {
                noteTipsMessage();
                noteCharacterMessage(resolveSpeakingContact(msg) || null);
            }
        } catch (err) {
            console.debug(LOG, 'world initiative note failed', err);
        }
        try {
            await ingestEmailsFromMessage(messageId);
            refreshIfOpen();
        } catch (err) {
            console.error(LOG, 'ingestEmailsFromMessage failed', err);
        }
    });

    if (event_types.MESSAGE_SENT) {
        eventSource.on(event_types.MESSAGE_SENT, () => {
            noteStoryMessage();
            noteInitiativeActivity();
            noteCallInitiativeActivity();
        });
    }
    if (event_types.USER_MESSAGE_RENDERED) {
        eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
            noteInitiativeActivity();
            noteCallInitiativeActivity();
        });
    }

    // Refresh per-character mail injection before a generation when possible
    const refreshSpeakerMemory = (...args) => {
        try {
            const hint = args.find((a) => a && (typeof a === 'object' || typeof a === 'string')) || args[0];
            const speaker = resolveSpeakingContact(hint);
            updateMailPrompt(speaker);
            updateTimeleapPrompt(speaker);
        } catch (err) {
            console.debug(LOG, 'mail memory refresh failed', err);
        }
    };
    if (event_types.GENERATION_STARTED) {
        eventSource.on(event_types.GENERATION_STARTED, (...args) => {
            updateIgnorePrompt();
            setInitiativeGenerationBusy(true);
            setCallInitiativeGenerationBusy(true);
            setWorldGenerationBusy(true);
            refreshSpeakerMemory(...args);
        });
    }
    if (event_types.GENERATION_AFTER_COMMANDS) {
        eventSource.on(event_types.GENERATION_AFTER_COMMANDS, refreshSpeakerMemory);
    }
    if (event_types.GROUP_WRAPPER) {
        eventSource.on(event_types.GROUP_WRAPPER, refreshSpeakerMemory);
    }
    const clearGenBusy = () => {
        setInitiativeGenerationBusy(false);
        setCallInitiativeGenerationBusy(false);
        setWorldGenerationBusy(false);
    };
    if (event_types.GENERATION_ENDED) {
        eventSource.on(event_types.GENERATION_ENDED, clearGenBusy);
    }
    if (event_types.GENERATION_STOPPED) {
        eventSource.on(event_types.GENERATION_STOPPED, clearGenBusy);
    }
    // Some ST versions emit CHARACTER_MESSAGE_RENDERED after DOM paint
    if (event_types.CHARACTER_MESSAGE_RENDERED) {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
            clearGenBusy();
            refreshIfOpen();
        });
    }
}

setMailOpenHandler(() => openInbox());

// A character shows their phone: <phone owner="…" show="latest"/> or with inline <mail> tags.
setPhoneShownHandler(async (shows) => {
    if (getSettings().phoneShowTag === false) {
        return;
    }
    let last = null;
    for (const show of shows) {
        const owner = resolveOwner(show.owner);
        if (!owner) {
            continue;
        }
        const ids = await addShownMails(owner.key, owner.name, show.mails);
        let mailId = ids[ids.length - 1] || '';
        if (!mailId) {
            const subject = show.show && show.show !== 'latest' ? show.show.toLowerCase() : '';
            const mails = listOwnerMails(owner.key, owner.name);
            mailId = (subject && mails.find((m) => m.subject.toLowerCase().includes(subject))?.id) || mails[0]?.id || '';
        }
        await logSnoop(owner.key, 'shown', `was shown ${owner.name}'s phone${mailId ? ' and read what was on screen' : ''}`);
        last = { ...owner, mailId };
    }
    if (last) {
        openCharacterPhone(last.key, last.name, last.mailId ? { mailId: last.mailId } : {});
    }
});

registerPhoneCardAction('open', (owner) => (owner === USER_OWNER
    ? ''
    : '<button type="button" class="pp-menu-btn" data-phone-action="open">◆ Open phone</button><button type="button" class="pp-menu-btn" data-phone-action="clear">Clear contents</button>'), async (owner, action) => {
    const who = resolveOwner(owner);
    if (!who) {
        return;
    }
    if (action === 'open') {
        openCharacterPhone(who.key, who.name);
    } else if (action === 'clear' && confirm(`Clear everything on ${who.name}'s phone in this chat? It will be regenerated next time.`)) {
        await clearOwnerPhone(who.key);
        toast(`${who.name}'s phone cleared`, 'info', 'PHONE');
    }
});

setMailReceivedHandler((email) => {
    refreshIfOpen();
    updateFabVisibility();
    const s = getSettings();
    if (s.autoOpenOnMail) {
        openPhone('inbox');
    }
    console.debug(LOG, 'Mail received', email.id, email.subject);
});

jQuery(async () => {
    // Ensure defaults exist
    getSettings();
    Object.assign(getSettings(), {
        ...DEFAULT_SETTINGS,
        ...getSettings(),
    });

    ensureNotifyHost();
    await loadSettingsPanel();
    initPhoneChrome();
    updateFabVisibility();
    registerEmailTool();
    registerSlashCommands();
    registerEvents();
    initFeatureUi();
    updateMailPrompt();
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt();
    }
    if (getSettings().injectCallMemory) {
        updateCallMemoryPrompt();
    }
    updateTimeleapPrompt();
    updateSnoopPrompt();
    updateWandItem();

    // Retry wand item — menu may mount late
    setTimeout(updateWandItem, 1500);

    noteInitiativeActivity();
    noteCallInitiativeActivity();
    syncInitiativeScheduler();
    syncCallInitiativeScheduler();
    maybeShowFirstRunCutscenePrompt();

    console.log(LOG, 'loaded');
});

export function onActivate() {
    getSettings();
    initPhoneChrome();
    updateFabVisibility();
    updateMailPrompt();
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt();
    }
    if (getSettings().injectCallMemory) {
        updateCallMemoryPrompt();
    }
    updateTimeleapPrompt();
    updateSnoopPrompt();
    noteInitiativeActivity();
    noteCallInitiativeActivity();
    syncInitiativeScheduler();
    syncCallInitiativeScheduler();
}
