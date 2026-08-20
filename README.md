# VLC Web UI Plus

An extended web interface for VLC 3.x that exposes far more of the player than
the stock Lua HTTP interface does: full audio configuration, subtitle
configuration and rendering options, live video filters, a real playlist
manager, a file browser and every VLC hotkey action.

It installs as a **new folder** next to the stock interface
(`lua/http/mod/`). Nothing that ships with VLC is modified or replaced, so the
original interface at `http://localhost:8080/` keeps working exactly as before.

Tested against VLC **3.0.23 Vetinari** on Windows 11.

---

## Install

1. Close VLC.
2. Run `install.bat` (it asks for administrator rights, because VLC lives in
   `C:\Program Files`).
3. Enable the web interface in VLC:
   * `Tools > Preferences > Show settings: All`
   * `Interface > Main interfaces` — tick **Web**
   * `Interface > Main interfaces > Lua` — set a **Lua HTTP password**
4. Restart VLC. New interface files are only picked up when the HTTP interface
   starts, so a restart is required after installing.
5. Open **http://localhost:8080/mod/** — leave the user name empty and use the
   password from step 3.

To install into a non-default location:

```bash
install.bat "D:\Apps\VideoLAN\VLC"
```

### Reaching it from other devices

VLC binds to localhost only by default. To allow the phone/tablet on your LAN,
add `--http-host 0.0.0.0` to VLC's command line, or set *Host address* under
`Interface > Main interfaces > Lua`. The interface has no transport security, so
only do this on a network you trust.

## Uninstall

Run `uninstall.bat`. It removes `lua/http/mod/` and leaves everything else
untouched. Restart VLC afterwards.

## Backups

`install.bat` zips the whole `lua` folder to `backup\vlc-lua-<timestamp>.zip`
before it copies anything. `restore-backup.bat` puts the newest of those back,
replacing the current `lua` folder — that is the escape hatch if anything ever
goes wrong, including damage caused by something other than this mod.

---

## What you get

### Now Playing
Artwork, title and metadata, seek bar, transport controls, frame step,
fullscreen, snapshot, recording, volume, playback speed, random / loop / repeat,
title and chapter selection, and an on-screen-message box that prints text over
the video.

### Audio
* Audio track selection
* Audio device selection, plus a *cycle device* button
* Stereo / channel mode (mono, stereo, left, right, reversed)
* Audio delay, both as a number and as ±50 ms steps
* Mute with live state
* Visualisation (spectrum, spectrometer, scope, VU meter, goom, projectM, 3D spectrum)
* Replay gain mode
* 10-band equaliser with preamp, all built-in presets, 2-pass and a flat reset
* Live audio filter chain — normaliser, compressor, spatialiser, headphone
  surround, stereo widen, Dolby decoder, scale tempo, chorus/flanger,
  parametric EQ, mono downmix, gain, channel remap — plus a raw chain field
* Output module, replay gain preamp/default/peak protection, time stretching,
  Dolby forcing, S/PDIF, global desync, preferred language, volume step

### Subtitles
* Track selection and cycling, toggle on/off
* Delay as a number and as ±50 ms steps
* On-screen size (25–500 %) and the A- / A+ actions
* Load a subtitle file from a path or URL
* Sync helper (mark audio, mark subtitle, apply, reset)
* Move subtitles up / down
* Rendering preferences: autodetect and fuzziness, preferred languages, vertical
  offset, frame rate, text encoding, alignment, formatting tags, font, absolute
  and relative size, bold, and colour + opacity for text, outline, shadow and
  background, plus outline thickness and the subtitle source/filter chains

### Video
* Video track, aspect ratio, crop, zoom, deinterlace on/off and mode, program
* Live image adjust — contrast, brightness, hue, saturation, gamma — including
  loading the `adjust` filter for you when you enable it
* Preferences: video on/off, start fullscreen, always on top, wallpaper mode,
  title display, default deinterlace/aspect/crop, filter chain, and snapshot
  folder, format, prefix and numbering

### Playlist
Add several URLs or local paths at once with per-item options, play now or
enqueue, click to play, reorder, delete, clear, filter, sort by title / artist /
album / duration / id / shuffle, and toggle any media source (UPnP, SAP,
podcasts, Icecast, Jamendo, discs, media folders...).

### Browse
Walk the file system from VLC's side, including a drive list, and play, enqueue
or attach any file as a subtitle.

### Hotkeys
Every VLC action as a button — navigation, disc menu, titles, chapters, crop
edges, 360° field of view, zoom presets, programs and more. The grid hides
actions your VLC build does not have, and there is a free-text field for
anything not listed.

### Info
Full media information, codec details, live statistics and the raw status JSON.

---

## The API

`GET /mod/api.json` is a superset of the stock `requests/status.json`. Every
stock `?command=` still works. On top of that:

| Parameter | Meaning |
| --- | --- |
| `want=` | comma list of payloads: `status`, `caps`, `playlist`, `browse`, `config`, `vars`, `keys` |
| `cmd=setvar` | `obj=input\|aout\|vout\|playlist\|libvlc`, `name=`, `val=`, optional `type=int\|float\|bool\|string` |
| `cmd=setconfig` | `name=`, `val=` — any VLC preference |
| `cmd=setconfig_multi` | `names=a,b,c` with `v_<name>=` per key |
| `cmd=key` | `val=` a hotkey action without the `key-` prefix |
| `cmd=osd` | `val=` text, `pos=`, `dur=` seconds |
| `cmd=eq_set` | `enable=`, `preset=`, `preamp=`, `b0..b9=` |
| `cmd=addsub` | `val=` path or URL, `select=0` to load without selecting |
| `cmd=pl_add` | repeatable `uri=`, `opts=` colon separated, `play=1` to play now |
| `cmd=pl_move` | `id=`, `target=` |
| `cmd=pl_delete_many` | repeatable `id=` |
| `cmd=sd_toggle` | `val=` service name |
| `cmd=aout_device` | `val=` device id |
| `cmd=seek`, `cmd=volume` | same values the stock interface accepts |

Types are inferred from what VLC currently holds, so `type=` is only needed for
options that are unset. Failures never abort the request: they come back in an
`errors` array with the response still valid.

Two payloads are worth knowing about when extending this:

* `want=vars&obj=aout&names=a,b,c` returns the current value **and the choice
  list** for arbitrary VLC variables. This is how the device, stereo mode,
  crop, aspect and deinterlace pickers are populated, and it is the quickest way
  to discover what a given VLC build exposes.
* `want=keys&names=a,b,c` reports which hotkey actions exist, without firing
  them.

## Notes and limitations

* Audio **device** enumeration is not exposed to Lua by VLC 3.x. If the output
  module offers no choice list, the interface falls back to a free-text device
  id field and the *cycle device* button, which always works.
* Settings on the *Rendering* and *Preferences* cards are VLC preferences. They
  behave exactly as they do in the player's own preferences dialog: most apply
  to the next item played, not the one currently on screen. Everything on the
  live cards applies immediately.
* Preferences changed here are not written to `vlcrc`; they last until VLC exits.
* `sub-text-scale` lives on the playlist object rather than the input in VLC
  3.x, which is why the size slider keeps working between items.

## Licence

GPL-2.0-or-later, matching VLC's own Lua interface that this builds on. See
[LICENSE](LICENSE).
