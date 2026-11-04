# Phone Trigger

SillyTavern extension that recreates the Steins;Gate **Phone Trigger** loop: open a handset UI, customize wallpaper and sounds, exchange dialogue-focused e-mail with characters.

## Features

- **System menu** — every setting in a Steins;Gate-style full-screen menu (Extensions drawer → **Open Phone Trigger menu**, the wand menu, `/phonemenu`, or phone Settings → Full menu)
- **Designed phones** — 24 fashion styles (Jirai-kei, Scene, Gyaru, Gothic Lolita, Decora…) or an AI design to suit you or any character: four bodies, prints, finishes, key styles, rhinestones, charms and draggable stickers on the cover, front and keypad; phones open shut so you see the cover, and swipe up to flip them open
- **Other people's phones** — grab a character's phone (or anyone's, like FB) to read, edit or delete their mail, check their call log, or send mail as them; characters can show you their phone with a `<phone>` tag
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
- **Story clock** — the chat keeps its own date, time and Day; manual, real-time or per-message flow; Pass time and Sleep
- **Phone Trigger keywords** — character mail underlines a few words; tap one and your reply is written about it
- **Photo mail** — attach photos to mail; characters can send described photos (developed by `/sd` when installed)
- **Undoing D-Mails** — a D-Mail that contradicts an earlier one cancels it and the meter goes back
- **Worldline map** — every D-Mail, undo and leap on an oscilloscope-style chart of attractor fields
- **Convergence & milestones** — outcomes the worldline keeps reaching; field crossings and a target reading
- **@channel** — an anonymous textboard app where characters post too
- **Fake call**, **TIPS** glossary, **lab members**, and optional consequences for ignored mail and calls

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
| `/chardmail <name> [guidance]` | Make a character send a D-Mail now |
| `/charleap <name> [guidance]` | Make a character time leap now |
| `/worldcheck [name]` | Ask now whether a character would send a D-Mail or time leap |
| `/music` (`/radio`) | Open Lab Radio, the music player (needs Dynamic Audio) |
| `/phonemenu` (`/ptmenu`) | Open the settings menu |
| `/storytime` (`/clock`) | Story clock: `pass 2h`, `sleep`, `set 2010-08-13 19:56`, `day 3` (no argument reports it) |
| `/worldlines` (`/wlmap`) | Open the worldline map |
| `/board [name]` (`/atchannel`) | Open @channel (optionally a board, e.g. `/board occult`) |
| `/fakecall [who]` | Take a fake call |
| `/tips` | Open the TIPS glossary |
| `/labmem [name number title]` | List lab members, or set one (`/labmem Kurisu 4 Assistant`) |

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

**Menu → Phones** lists your phone and every character in the chat.

- **Styles** — 25 looks from 2010 fashion and subcultures: Jirai-kei, Yami-kawaii, Scene (MySpace-era neon green and hot pink, RAWR dinos), J-Scene, Emo, Gyaru, Hime-gyaru, Decoden, Sweet Lolita, Gothic Lolita, Visual-kei, Decora, Fairy-kei, Mori-kei, Punk, Cyber-goth, Otaku, Y2K chrome, Kawaii mascot, Sporty, Rugged, Business, Lab, Retro cream, Plain. Click one to roll a phone in that style; **🎲 Shuffle** rolls another.
- **Design with AI** (optionally add a hint) — the dropdown chooses how: **AI picks a style** (it may also answer "custom" and design freely), **Freeform** (no styles at all; it invents everything), or a specific style. Menu → Phones → *AI design starts on* sets the default.
- **★ Save design** keeps the current look in that phone's **Wardrobe**; every reroll, AI design or reset also keeps the previous look under **Recent** (last 10). Click any thumbnail to wear it again; × deletes, double-click a saved name to rename.
- **Edit → Look** — body (flip, candybar, slider, touchscreen), colours, shell print (zebra, leopard, tartan, lace, hearts, hazard, galaxy… 27 in all, on the shell, the cover or both), finish (gloss, matte, metallic, pearl, glitter, holo, candy, rubber, chrome, velvet), key style (candy, metal, rainbow, pearl, neon, gem), rhinestones, pearl trim, studs, cover print, outer display (or none), screen colours/font/style, the home-screen divergence meter (on for your phone, off for other people's by default), wallpaper and up to three charms.
- **Edit → Stickers** — drag stickers around the cover (or back), the front and the keypad; use the corner handle, a pinch or the mouse wheel to resize and turn them; tap × or double-click to remove; add from a sheet of ~50 (the style's own first), recolour, or re-scatter a side in style.

Opening the phone yourself shows it **shut first**: the decorated cover with its outer display (clock, unread mail, who is calling). Tap it, press any key, or swipe up — the lid follows your finger. Tap the phone's top edge (or long-press home on a touchscreen) to fold it shut again. Candybar, slider and touchscreen phones show their back and turn over instead. Turn this off with System → **Open shut first**.

Your designed phone replaces the SG001 everywhere — mail, calls, D-Mail and Time Leap all work on it. Wallpaper → **This phone's** uses the design's own wallpaper. Everything the model writes is validated, so a bad answer can't break the handset.

### Other people's phones

**Grab a phone** on your home screen (or `/grabphone Moeka`) takes a character's phone — or anyone named in the story, such as `FB`. It opens in its owner's own handset. The first time in each chat it fills with mail threads and a call log written for that person from their card and the story; your own mail with them shows up from their side. **Check for new mail** adds more.

On their phone you can read everything and **send mail as them**. Mail to you lands in your inbox as from them; mail to anyone else goes in their Sent, and that person's reply arrives in their inbox.

Open any of their mails to **Edit** or **Delete** it. Your own mail with them changes only on their phone; your copy stays. With **Tell the chat what you saw** on, each edit or delete asks whether to tell the chat (it goes in the note of what you did on their phone) or keep it a hidden action; with it off, it is always hidden. The red key hands the phone back.

### Characters reaching into the past

Characters can send D-Mails and time leap too:

- **From their phone.** Grab it and use **D-Mail** (or pick PhoneWave in the To list) or **Time Leap**. Their Time Leap Machine only lets them leap.
- **When you make them.** Settings → Time Leap → *Make them do it*, or `/chardmail Kurisu stop Mayuri taking the train` / `/charleap Kurisu`. Guidance is optional.
- **On their own** (off by default). Every few character messages, a short check asks whether someone in the chat — usually whoever just spoke, sometimes someone who isn't — has a real reason: they know the technology exists, and something urgent needs preventing or undoing. The answer is almost always no.
- **Check now.** *Check now* in the same panel (or `/worldcheck Kurisu`) runs that check immediately, skipping the cooldown. It is still their call, so usually nothing happens.

When a character's D-Mail shifts the worldline, only you notice (Reading Steiner); the sender doesn't remember sending it. The change is still saved and injected, and the note allows that a strong push can stir memories of other worldlines. A character's own leap first shows a prompt to let it happen or stop it (turn that off to let leaps just happen). The cutscenes for character D-Mails and leaps can each be turned off; without the cutscene, a short Reading Steiner note tells you the worldline shifted.

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

### Story clock

Each chat keeps its own date and time (Menu → **Clock**, or tap the clock on the phone's home screen). Set the date, time and **Day** directly; **Pass time** (+15 m, +1 h, +3 h or any amount) and **Sleep** (until the wake hour, Day +1). Choose how it flows: **Manual**, **Real time** (X real minutes = 1 story hour, only while the chat is open) or **Messages** (X messages = 1 story hour). Phone clocks, mail dates and the menu follow it, time leaps move it back, and an optional line tells the AI the time. A **story log** records mail, calls, D-Mails, leaps and sleeps with their story time.

### Mail on the handset

As in the VN, character mail underlines a few **keywords** — tap one and your reply is written about it (drafted for you to edit, or sent right away). The inbox shows sealed/opened envelopes, replies, photos and D-Mail parts; new mail plays a short *Receiving…* bar; the read view has prev/next through the conversation, forward, and a **conversation view**.

**Photos:** attach one from the compose screen (it's shrunk to fit the chat file; add a caption so they know what it shows). With *Characters can send photos* on, they sometimes attach one: SillyTavern's image generation (`/sd`) develops it when installed, otherwise its description shows.

**People notice** (optional, Mail settings): mail left unread and calls not returned for a few story hours become a note for the AI, and characters may mail you about it. **Closeness** (optional) moves with the words you tap, your replies and the tone of their mail.

### Undoing D-Mails

Send a D-Mail that contradicts an earlier one — from your phone or anyone's (grab FB's phone and tell the past to stop the search) — and that change is undone: it stops being true and the meter returns to its reading from before it. With **Propose**, the review screen lists what will be undone.

**Phone records follow the worldline** (optional): after a D-Mail, recent mail is rewritten to the new past. You still remember the old versions — ◇ on a mail shows them, and mail that never existed hides at the bottom of the inbox. Undoing the D-Mail puts it all back. (Time leaps already drop mail from after the arrival point.)

### Worldline map

D-Mail screen → **Worldline map**, Menu → D-Mail, or `/worldlines`. Divergence is split into attractor-field bands; your path is a glowing trace, D-Mails are lightning jumps, undone D-Mails leave ghost branches, time leaps curl back with the abandoned future trailing off, and convergence points lie across their field. Drag, scroll or pinch; arrow keys step through events; the side rail (a bottom sheet on phones) lists everything.

### Convergence & milestones

**Convergence points** (D-Mail settings or the phone's D-Mail screen) are outcomes the worldline reaches however anyone tries to stop them — until the divergence crosses into another attractor field. Optionally count how often each is reached (checked after each time leap). **Milestones** (optional): crossing a field makes the meter's first tube hesitate, and a target reading of your choice makes the home meter glow.

### @channel

A 2ch-style textboard app on the phone (home screen, or `/board`). Nothing is written in the background: opening a board writes its threads, opening a thread writes 4–6 replies, **Load more** writes more. Steer a board or thread, post yourself, start threads, or **＋ New board** with a topic that shapes everything posted there.

**Characters post too** (on by default): their cards decide whether they'd use the site and under what handle, or anonymously (editable in Menu → @channel). **Post as…** makes anyone post a reply or a new thread. Optional: threads react to the story, and a tripcode poster claims to be from the future. The ◎ Who toggle shows you who wrote what.

### Fake call

Dial screen → **☏ Fake call** (or `/fakecall the Organization`): talk into the phone with nobody on the line. Afterwards the people around you hear your side — as a hidden note for the next reply, or a narrator line — and **Let them react** asks for one now.

### TIPS and lab members

**TIPS** (optional, Menu → TIPS): terms the story mentions get a short glossary entry, as in the VN. Choose what's explained — science, otaku and internet terms by default — search, edit, or explain a term yourself. Reader-only.

**Lab members** (Menu → Phones, or `/labmem`): member numbers and titles, shown as badges on their mail and optionally told to the AI.

## Keypad

Focus a subject/body field, then use the chassis keys:

- **2–9** multi-tap letters (classic phone timing)
- **Long-press** inserts the digit
- **0** space (long-press = `0`)
- **\*** toggles Aa / aa
- **Lower-centre wedge** (below the OK square) = backspace
- **Upper-left / upper-right wedges** = soft keys (captions show at the bottom of the screen)

### Menu music

With the [Dynamic Audio](https://github.com/SillyTavern/Extension-Audio) extension installed, System → **Menu music** has Dynamic Audio play a song from its library (`assets/bgm`) while the Phone Trigger menu is open, at its music volume. It plays only in the menu: closing the menu puts Dynamic Audio back to what it was playing before, or to silence.

### Lab Radio

With Dynamic Audio installed, **Lab Radio** slides in while music plays. It is the Divergence Meter's sibling: the meter's own nixie tubes stand on a perfboard deck showing the track number and time (`03.01:27`), with the board on an aluminium box. A recessed window in the box holds the title in an amber VFD tube and a neon bargraph for the position (click or drag along it to jump). Below that are push buttons for previous / play-pause / next with a neon lamp that lights while playing, a toggle switch for play in order / shuffle / repeat one, a white trimmer knob for Dynamic Audio's volume (drag or scroll), and LIST for the song list: Dynamic Audio's library (plus any character songs it lists), a search box, and playlists you make yourself (＋ New, then ＋ on a song to add it). The list you pick from becomes the queue.

Songs play on Dynamic Audio's own player, picked through its song list, and Dynamic Audio is locked onto your pick so it doesn't switch by expression. Drag the panel by its tape label, fold it to a strip with the top rocker switch, or hide it with the bottom one (it comes back with the next song). System → Lab Radio turns it off, opens it with nothing playing, or resets its position; `/music` opens it too.
