# Phone Trigger assets

Divergence meter clip used for D-Mail:

- **Primary:** `lib/vid/divmeter.mp4` (H.264 + AAC audio, faststart)
- **Fallback path:** `assets/divmeter.mp4` (optional copy)

When you send mail to **PhoneWave (name subject to change)**, Phone Trigger plays this video fullscreen (with its soundtrack when Sounds / Play cutscene audio are on), then applies a short screen distortion. If the file fails to load, a CSS divergence-meter fallback runs instead.

Progressive mode reuses the clip's soundtrack and renders the meter itself (`lib/divmeter.js`).

`meter-original.gif` / `meter-progressive.gif` are the previews shown in the first-boot cutscene chooser.

Re-encode tip (keep audio):

```bash
ffmpeg -i source.mp4 -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k lib/vid/divmeter.mp4
```

## Time leap

- **Clip:** `lib/vid/timeleap.mp4` (fallback `assets/timeleap.mp4`), played by the Original time leap cutscene; Progressive mode plays only its soundtrack and renders the scene itself (`lib/timeleapScene.js`).
- `leap-original.gif` / `leap-progressive.gif` are the previews in the time leap cutscene chooser.
