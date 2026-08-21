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
fullscreen, snapshot, recording, volume with mute and −5 / +5 % steps, playback
speed, random / loop / repeat, and title and chapter selection.

Under the title sits a **stream summary**: resolution, frame rate, aspect ratio,
channel layout, sample rate, the name of the selected audio track, and whether
subtitles are on. Anything that looks misconfigured is called out underneath in
plain words, for example:

* surround audio that is being downmixed on the way to the speakers
* a stereo mode forced to mono, left, right or reversed
* the `mono` or `headphone` audio filter loaded on a surround track
* Dolby surround decoding forced on a stereo or mono track
* no audio output open at all
* S/PDIF passthrough on, where the receiver, not VLC, picks the mode

The channel chip shows both sides when they differ, so `5.1 → Stereo` tells you
at a glance that the movie is surround but your speakers are not getting it.

**Pause at next** is a toggle with two behaviours, because VLC offers one and
the interface can fake the other:

| Mode | What happens | Where the state lives |
| --- | --- | --- |
| On the last frame of this track | VLC own `play-and-pause`. Playback freezes on the final frame and pressing play moves to the next track. | VLC, so it survives closing the page |
| Once the next track has started | The interface spots the track change and pauses the new item at the start. | The browser tab |

Both stay on until you switch them off. Picking a track yourself does not
trigger the second mode, only an automatic advance does.

The clock button next to the transport controls opens **Autostart**: play at a
clock time (`hh:mm`) or after a countdown (`mm:ss`), optionally announcing it on
screen ten seconds before, and optionally restarting the playlist, skipping to
the next item, or going fullscreen when it fires. The timer runs in the browser
tab and is stored there, so it survives a reload but not closing the page.

Below that sits a read-only view of the queue: it shows what is playing and what
is coming, dims what has already played, and scrolls to the current item.
Clicking a row jumps to it; reordering and deleting live on the Playlist tab.

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
* On-screen messages: type text, pick one of nine screen positions and a
  duration, and it is drawn over the video
* Rendering preferences: autodetect and fuzziness, preferred languages, vertical
  offset, frame rate, text encoding, alignment, formatting tags, font, absolute
  and relative size, bold, and colour + opacity for text, outline, shadow and
  background, plus outline thickness and the subtitle source/filter chains

### Video
* Video track, aspect ratio, crop, zoom, deinterlace on/off and mode, program
* Image adjust — contrast, brightness, hue, saturation, gamma — including
  loading the `adjust` filter for you when you enable it. See the note below
  about when these actually take effect.
* Preferences: video on/off, start fullscreen, always on top, wallpaper mode,
  title display, default deinterlace/aspect/crop, filter chain, and snapshot
  folder, format, prefix and numbering

### Playlist
Add several URLs or local paths at once, play now or enqueue, click to play,
reorder, delete, clear, filter, sort by title / artist / album / duration / id /
shuffle, and toggle any media source (UPnP, SAP, podcasts, Icecast, Jamendo,
discs, media folders...).

Only the real playlist is listed. VLC's playlist root also holds the media
library and a node for every active discovery service, so UPnP servers and the
like no longer leak into the queue; the media library sits behind a checkbox.

**Per-item options** are set on the add form and apply to everything you queue,
whether from this tab or from Browse:

| Control | VLC option | What it does |
| --- | --- | --- |
| Gain | `:gain=` | per-item volume, independent of the master volume |
| Still image duration | `:image-duration=` | how long a picture stays on screen |
| Start / stop time | `:start-time=` / `:stop-time=` | play only a slice of the item |
| Extra options | anything | free text, colon separated |

The form previews the exact option string before you commit it.

**Editing an item afterwards** — the slider button on each row opens a dialog for
that item's gain and extra options. VLC cannot edit a queued entry, so the
interface queues a fresh copy with the new options, moves it into the slot the
old one held, and deletes the old one. If the item was the one playing it is
started again. The gain is remembered per URL in the browser and shown as a
badge on the row, because VLC never reports an item's options back.

Paths pasted from Windows Explorer's *Copy as path* arrive wrapped in `"`
quotes. Those are stripped, in the browser as you paste and again on the server.

### Players — running more than one stream at once
A single VLC process plays one input at a time. Playing, say, an mp4 and a
separate mp3 together therefore needs **two VLC processes**, and the row above
the tabs is how you move between them.

Each entry is one player: a name and the address of its web interface. Clicking
one loads that player's own copy of this page, carrying the list of players
across so both sides stay in sync. Nothing is fetched across origins, so no CORS
or mixed-password trouble — but each player has its own web password, so the
browser asks for it the first time you visit that port.

**Add a player** opens a dialog. If the host VLC's Lua sandbox allows it (this
build does), *Launch* starts a second `vlc.exe` on the port you gave, with the
web interface enabled. It needs a password: VLC refuses to open the interface
without one, and the mod must already be installed for the new instance to
serve this page. You can also start it yourself:

```
vlc.exe --extraintf http --http-port 8100 --http-password yourpassword --no-one-instance
```

Removing a player from the row only forgets the address; it does not stop the
process.

### The docked transport
Every tab except Now Playing gets a fixed strip along the bottom of the window:
current title, progress with a seek bar, elapsed and total time, play/pause,
previous, next, stop, ±10 s, volume ±5 % with a mute button, and a jump back to
Now Playing. It is driven by the same status poll as the main view, so it never
disagrees with it.

### Browse
A proper file picker: a clickable breadcrumb, a parent button, home and drives
shortcuts, folders sorted before files, file sizes, per-type icons, and an
optional *media only* filter that hides anything that is not a media, subtitle
or playlist file. Click a folder to open it, a file to play it, or use the
per-row *play* / *queue* / *as sub* actions. Typing a raw path is still there
behind the text button. Paths are normalised, so no more `C:\/Desktop`.

### Drag and drop

Files and links can be dropped onto:

* the playlist on the **Playlist** tab and the queue on **Now Playing** — dropped
  media is enqueued straight away, with the current add options applied
* the file list on the **Browse** tab
* any path or URL field: the subtitle loader, the browse path box, the add-media
  box, the on-screen message field, and preference fields that hold a folder,
  a file or a font

Dropping a **link or text** always works: the URL or path is used as it stands.

Dropping a **file from the file manager** is more awkward, because browsers hand
over the file's name but never its path — there is nothing this interface can do
about that. So a dropped name is looked up in the folder currently open on the
Browse tab, then in your profile, Desktop, Downloads, Videos, Music, Pictures,
Documents and VLC's own home folder. If it is found, it is added; if it is not,
you are told so and asked to open its folder on the Browse tab and drop again,
which always works.

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
| `want=` | comma list of payloads: `status`, `caps`, `playlist`, `browse`, `config`, `vars`, `keys`, `now` |
| `can_spawn` | always returned: whether this build can start another player process |
| `want=browse` | `path=` (empty lists drives, `~` is home), `show=media` to filter |
| `want=resolve` | repeatable `name=` plus optional `dir=`, stats each name against the browse folder and the usual user folders, returns `path` and `uri` when found |
| `cmd=setconfig&name=play-and-pause` | VLC own pause-on-last-frame, used by the Pause at next toggle |
| `want=now` | stream summary: video res/fps, audio channels source vs decoded, selected track names, and a `warn` array of misconfigurations |
| `cmd=setvar` | `obj=input\|aout\|vout\|playlist\|libvlc`, `name=`, `val=`, optional `type=int\|float\|bool\|string` |
| `cmd=setconfig` | `name=`, `val=` — any VLC preference |
| `cmd=setconfig_multi` | `names=a,b,c` with `v_<name>=` per key |
| `cmd=key` | `val=` a hotkey action without the `key-` prefix |
| `cmd=osd` | `val=` text, `pos=` one of top-left..bottom-right, `dur=` seconds |
| `cmd=eq_set` | `enable=`, `preset=`, `preamp=`, `b0..b9=` |
| `cmd=addsub` | `val=` path or URL, `select=0` to load without selecting |
| `cmd=pl_add` | repeatable `uri=`, `opts=` colon separated, `play=1` to play now |
| `cmd=pl_move` | `id=` plus either `pos=` (1-based slot) or `target=` (the item to land behind) |
| `cmd=spawn` | `port=`, `pw=`, optional `exe=` — starts another VLC with the web interface on that port |
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
* `want=browse&path=...` returns a normalised path, its parent, a breadcrumb
  array and the sorted entries, each with type, size and a ready-made uri.

## Notes and limitations

* Audio **device** enumeration is not exposed to Lua by VLC 3.x. If the output
  module offers no choice list, the interface falls back to a free-text device
  id field and the *cycle device* button, which always works.
* Settings on the *Rendering* and *Preferences* cards are VLC preferences. They
  behave exactly as they do in the player's own preferences dialog: most apply
  to the next item played, not the one currently on screen. Everything on the
  live cards applies immediately.
* Preferences changed here are not written to `vlcrc`; they last until VLC exits.
* Info keys from VLC are translated to the player language, so the stream
  summary matches on the shape of the values rather than on English key names.
* Browsers do not expose a dropped file's path, only its name, so file drops
  are resolved by looking the name up in a short list of folders. Dropping a
  link, or dropping onto the Browse tab while its folder is open, is exact.
* The autostart timer lives in the browser tab, not in VLC. Closing the page
  cancels it; reloading does not.
* `sub-text-scale` lives on the playlist object rather than the input in VLC
  3.x, which is why the size slider keeps working between items.
  Doing the queue, move and delete inside one request corrupts VLC's playlist
  and crashes it, so those steps are deliberately sent as separate requests.
* Per-item options (gain, image duration, start/stop) can only be set when an
  item is added. VLC 3.x offers no way to change the options of an entry that
  already exists, so the item volume editor re-adds the item in its slot.
  Queueing, moving and deleting inside one request corrupts VLC's playlist and
  crashes it, so those steps are deliberately sent as separate requests.
* `vlc.playlist.move(id, target)` places the item **after** `target`, it is not
  an index. `cmd=pl_move&pos=` does the translation.
* An item's options are never reported back by VLC, so the gain shown on a
  playlist row is remembered by the browser, per URL. Clearing site data or
  editing the item from the player itself loses that note.
* Image adjust values are **not live** on VLC 3.0.23. Loading and unloading the
  filter chain works immediately (`invert` visibly changes the picture), but
  `brightness`, `contrast` and `saturation` set on the running video output are
  ignored: the filter reads them once when it is created and nothing forwards
  later changes to it. Snapshots taken at brightness 0.1 and 1.0 came back byte
  identical. They apply to the next video that starts.
* There is **no crossfade between playlist items**, and no way to build one from
  here. VLC plays one input at a time, tears it down and creates the next, so
  there is no overlap to fade across. A fade to black is not reachable either,
  for the reason above.
* Multiple simultaneous streams need multiple VLC processes; VLC 3.x plays one
  input per instance. The Players row switches between them by navigation, not
  by cross-origin requests, so each player asks for its own password once.
* `vlc.strings.make_uri` mangles Windows paths given with forward slashes, so
  paths are converted back to backslashes before a uri is built.

## Licence

GPL-2.0-or-later, matching VLC's own Lua interface that this builds on. See
[LICENSE](LICENSE).

## Third-party assets

Icons are [Phosphor Icons](https://phosphoricons.com/) (regular weight),
Copyright (c) 2023 Phosphor Icons, used under the MIT licence. The full notice
travels with the package in [LICENSE-phosphor.txt](LICENSE-phosphor.txt) and in
the installed `lua/http/mod/` folder. MIT is GPL-compatible, so redistributing
them inside this GPL-2.0-or-later package is fine as long as that notice stays
with them.

They are inlined as an SVG sprite in `index.html` — no CDN, no network access,
so the interface works fully offline.
