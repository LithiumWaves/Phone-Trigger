# Phone Trigger

SillyTavern extension that recreates the Steins;Gate **Phone Trigger** loop: open a handset UI, customize wallpaper and sounds, exchange dialogue-focused e-mail with characters.

## Features

- **System menu** — every setting in a Steins;Gate-style full-screen menu (Extensions drawer → **Open Phone Trigger menu**, the wand menu, `/phonemenu`, or phone Settings → Full menu)
- **Designed phones** — the AI designs a handset to suit you or any character: flip, candybar, slider or touchscreen, with colours, finish, charm, stickers, screen font and wallpaper; edit by hand or reset to the SG001
- **Other people's phones** — grab a character's phone (or anyone's, like FB) to read their mail and call log or send mail as them; characters can show you their phone with a `<phone>` tag
- **Phone UI** — draggable MAIL chip, Extensions wand menu, `/phone`
- **Handset chassis** — Okabe Rintarou's SG001 (truss crown, grey screen panel, gunmetal barrel hinge, wedge-key cluster, kana-printed keypad) with working multi-tap keypad (T9-style Latin)
- **Mobile** — `<dialog showModal()>` top layer + scale-to-fit (S25 Ultra–safe)
- **Mail** — inbox / outbox / read / compose; optional tap-to-reply phrases; trash on open mail
- **Calls** — dial a character and talk in the phone UI (not the main chat); optional call initiative (incoming rings); generation via unique prompt, main chat presets, or both
- **Character initiative** — optional VN-style unsolicited mail with interval, chance, idle, caps, quiet hours, and contact rules (off by default)
- **D-Mail** — permanent contact **PhoneWave (name subject to change)** (hideable); Spectacle (FX only) / Worldline / Propose / Apply; clearable worldline facts
- **Time Leap Machine** — call **PhoneWave** to open TLM.EXE; you or a character leaps back (48 h limit) to a chosen message, the chat branches there, and only the leaper remembers the abandoned future; **Original** or **Progressive** cutscene
- **Divergence meter** — per-chat divergence picked by the AI for each D-Mail; choose the **Original** cutscene (default) or a **Progressive** nixie-tube remake that lands on the new value (asked once on first boot); meter on the phone home screen
- **Strong Apply** — optional lorebook (pick which book) + optional smooth character-card rewrite (confirm screens; no chat paste, no worldline block dump)
- **Call memory** — persist finished calls; optional inject; summarize on hang-up (or per-call Σ) for token-friendly recollection
- **Do not reply** — compose toggle skips the AI reply so mail threads do not loop
- **Notifications** — Steins;Gate-styled mail alerts + chip unread badge
- **Send animation** — compose shows an e-mail-client send sequence
- **Wallpaper & sounds** — presets or custom URLs
- **Character → user** — `send_email` tool or `<email subject="…">…</email>` tags
- **User → character** — compose in-phone or `/mailsend`
- **Independent replies** — mail generation uses raw/OpenRouter (not the active chat turn), with a configurable delay and editable prompt template
- **Active-chat To:** — PhoneWave plus group members (or the solo chat character) appear in compose
- **Context toggles** — optional chat→mail summary; optional mail→chat memory with a phone **Memory** picker per character; optional worldline inject after D-Mail
- **Guided receive** — faint signal bars on Inbox open a From / Guide panel to force inbound mail

## Install

1. Extensions → Install extension → `https://github.com/LithiumWaves/Phone-Trigger`
2. Enable **Phone Trigger**
3. Folder should be `scripts/extensions/third-party/Phone-Trigger` (legacy `Penumbra-Phantasm` still works for assets/settings fallback)
4. Divergence clip: `lib/vid/divmeter.mp4` (the Original cutscene; also the Progressive cutscene's soundtrack)
5. Time leap clip: `lib/vid/timeleap.mp4` (same roles for the time leap)

## Commands

| Command | Action |
|--------|--------|
| `/phone` | Toggle phone |
| `/mail` | Open inbox |
| `/mailsend subject="Hi" Hello` | Send mail (`reply=off` to skip AI reply) |
| `/timeleap` (`/tlm`) | Open the Time Leap Machine |
| `/grabphone <name>` (`/snoop`) | Take someone's phone and look through it |
| `/phonemenu` (`/ptmenu`) | Open the settings menu |

## Character mail

**Tool:** `send_email` (`subject`, `body`, optional `replies`).

**Tag:**

```text
<email subject="Subject" replies="A|B|C">
Body
</email>
```

Mail replies are generated independently of the main chat character (To: contact card + editable prompt). A short delay (default 3–8s) runs before the reply arrives. Optional chat→mail summary keeps replies story-aware; optional mail→chat injection can be limited to the speaking character so group members do not share private mail.

Mail to **PhoneWave (name subject to change)** is a D-Mail: no character reply. **Spectacle** plays the divergence meter cutscene (video + audio) in the browser top layer and does not create worldline facts. **Propose** opens an edit gate before writers run. **Worldline (soft)** injects facts into the LLM prompt only; **Apply (hard)** optionally confirms a lorebook write and/or a smooth character-card rewrite. Soft and hard can both be on; Propose delays writers until you confirm. Compose shows sender/participants, selectable past context, **36-character ASCII** limit (on by default), **redirect phone** (own inbox vs character mail memory), and optional **arrival datetime**. Deliveries are always **three split parts** (e.g. 36 → 12+12+12). Character-routed D-Mails land in that character’s Mail memory and stay unchecked by default. They stay out of the Outbox unless **Show in outbox** is enabled.

### Divergence meter

Each chat has a divergence reading (starts at `1.130426`). When a D-Mail produces a worldline fact, the AI picks the new value — small personal changes move only the last digits, drastic ones cross attractor fields (`0.x` ↔ `1.x`). Two cutscenes are available, chosen on first boot in a side-by-side comparison (re-open it from **Compare cutscenes** in the extension drawer or the phone's D-Mail settings):

- **Original** (default) — the `divmeter.mp4` clip as-is. Its numbers are fixed (`1.130426 → 0.571024`), but the chat's divergence still updates and shows on the home screen.
- **Progressive** — rendered live: tubes roll and lock left → right onto the new value, timed to the clip's soundtrack.

Spectacle alone rolls back to the same reading. With **Propose**, the value is editable on the review screen and only committed on Continue. The phone's home screen shows the current reading; D-Mail settings can set it by hand or hide it.

### Phones

**Menu → Phones** lists your phone and every character in the chat. **Design with AI** (optionally with a hint such as "battered, covered in stickers") has the model pick a 2010-era handset that suits its owner: body (flip, candybar, slider, touchscreen), shell and key colours, finish (gloss, matte, metallic, pearl), screen colours and font, wallpaper, strap charm and stickers. **Edit** changes any of it by hand; **Back to SG001** / **Forget design** undoes it. Everything the model writes is validated, so a bad answer can't break the handset.

Your designed phone replaces the SG001 everywhere — mail, calls, D-Mail and Time Leap all work on it. Touchscreen phones have no keypad: tap the on-screen soft keys and the home button, and type with your keyboard. Wallpaper → **This phone's** uses the design's own wallpaper.

### Other people's phones

**Grab a phone** on your home screen (or `/grabphone Moeka`) takes a character's phone — or anyone named in the story, such as `FB`. It opens in its owner's own handset. The first time in each chat it fills with mail threads and a call log written for that person from their card and the story; your own mail with them shows up from their side. **Check for new mail** adds more.

On their phone you can read everything and **send mail as them**. Mail to you lands in your inbox as from them; mail to anyone else goes in their Sent, and that person's reply arrives in their inbox. The red key hands the phone back.

Characters can show you their phone. They are told (unless you turn it off) that they may write:

```text
<phone owner="Moeka"><mail from="FB" subject="M3">Retrieve it. Tonight.</mail></phone>
<phone owner="Moeka" show="latest"/>
```

The tag is removed from the message and the phone pops open on that mail. What you read or send on other people's phones is noted for the main chat ("Okabe read mail from FB on Moeka's phone…"); the owners only know if the story says so. Time leaps drop anything on those phones that has not happened yet.

### Time Leap Machine

Mail to PhoneWave is a D-Mail; **calling** PhoneWave (green ☎ → PhoneWave) boots **TLM.EXE**, the machine's configuration app:

- **CONFIG** — the leaper (you or any character in the chat), the message to arrive at, the story-time **NOW** and **DESTINATION** (with −1/3/12/24/48 h steps and a flip-clock readout), the ΔT gauge against the 48-hour limit, and the cutscene.
- **MEMORY** — **Compress memories** summarizes everything after the arrival message (chat, plus mail and calls from that future) into what the leaper remembers. Edit it, then **Execute time leap**.
- **LOG** — past leaps on this timeline (forget one or all) and machine toggles.

Executing plays the cutscene, then branches the chat at the arrival message (SillyTavern's `/branch-create`), so the abandoned future stays in its own chat file. The new branch keeps the worldline, divergence, D-Mails and earlier leaps; mail and calls from after the arrival point are dropped unless **Keep future phone** is on. A `/comment` arrival marker (not sent to the AI) notes the leap.

Memories are injected per leaper: yours are always in the prompt, marked as known only to you. A character's are only present while that character is speaking, so the rest of the cast (and you) don't know unless they tell you. Leaps stack, as Okabe's do. Contradicting an earlier D-Mail is done the canonical way: send another D-Mail.

Cutscenes (chosen on first boot, or **Compare cutscenes** under Extensions → Time Leap, or COMPARE in TLM.EXE):

- **Original** (default) — `timeleap.mp4` as-is; its clock always reads `8/13 19:56 → 16:56`.
- **Progressive** — rendered live: the flip clock counts back from your NOW to your DESTINATION (dates and weekdays roll over), with the HUD showing the leap's readout, timed to the clip's soundtrack.

### Character initiative

Optional VN-style unsolicited mail (Extensions drawer → **Character initiative**). Off by default. When enabled, the extension periodically rolls chance against idle / generation / phone-open / quiet-hours / unread / hourly-daily caps, then generates inbound mail with a dedicated prompt (or the Forced mail prompt). Use **Send initiative now** to test without waiting on chance.

### Calls

Calls live in the phone UI: green ☎ → pick a contact → talk in the call screen. The character always speaks first: they answer when you call, and when they call you they open with why (set an optional reason under Call initiative). To make someone ring you, tap the faint signal bars on the Call screen (or long-press its title), pick the caller and optionally guide why they call, then **Ring me**. Keep talking while they reply — lines said mid-reply get answered next — and they can hang up on you. A reply still generating when a call ends is dropped. Generation mode can be **unique call prompt**, **main chat completion presets** (`generateQuietPrompt`), or **both** (presets + full call template). Optional **Call initiative** rings you with mail-style throttling. Hang up with red ☎ or soft **End**.

Mail is stored in chat metadata. Wallpaper / sounds / reply prompt are extension settings.

## Keypad

Focus a subject/body field, then use the chassis keys:

- **2–9** multi-tap letters (classic phone timing)
- **Long-press** inserts the digit
- **0** space (long-press = `0`)
- **\*** toggles Aa / aa
- **Lower-centre wedge** (below the OK square) = backspace
- **Upper-left / upper-right wedges** = soft keys (captions show at the bottom of the screen)
