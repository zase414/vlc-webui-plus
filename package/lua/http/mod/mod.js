/* VLC Web UI Plus - front end */
(function () {
"use strict";

var API = "api.json";
var S = {}, X = {}, C = {}, CFGVAL = {};
var curTab = "now", lastArtId = null, plCache = null;
var busy = {};   // element id -> timestamp until which polling must not touch it

/* ------------------------------------------------------------ helpers */
function $(id) { return document.getElementById(id); }
function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}
var SVGNS = "http://www.w3.org/2000/svg";
function svgIcon(name) {
  var s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("class", "ic");
  s.setAttribute("viewBox", "0 0 256 256");
  s.setAttribute("aria-hidden", "true");
  var u = document.createElementNS(SVGNS, "use");
  u.setAttribute("href", "#i-" + name);
  s.appendChild(u);
  return s;
}
/* prepend an icon to every [data-ic] element that has not got one yet */
function applyIcons(root) {
  var list = (root || document).querySelectorAll("[data-ic]");
  Array.prototype.forEach.call(list, function (e) {
    if (e._iced) return;
    e._iced = true;
    var hadText = !!e.textContent.trim();
    e.insertBefore(svgIcon(e.dataset.ic), e.firstChild);
    if (!hadText) e.classList.add("icon-only");
  });
}
function setIcon(e, name) {
  if (!e) return;
  var u = e.querySelector("svg.ic use");
  if (u) u.setAttribute("href", "#i-" + name);
  else { e.insertBefore(svgIcon(name), e.firstChild); e._iced = true; }
}

/* swap a button label without eating the icon that sits next to it */
function setLabel(e, txt) {
  if (!e) return;
  Array.prototype.slice.call(e.childNodes).forEach(function (n) {
    if (n.nodeType === 3) e.removeChild(n);
  });
  var s = e.querySelector(".lbl");
  if (!s) { s = el("span", "lbl"); e.appendChild(s); }
  s.textContent = txt;
}

function qs(o) {
  var p = [];
  Object.keys(o).forEach(function (k) {
    var v = o[k];
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach(function (i) { p.push(enc(k) + "=" + enc(i)); });
    else p.push(enc(k) + "=" + enc(v));
  });
  return p.join("&");
}
function enc(v) { return encodeURIComponent(v); }

function toast(msg, bad) {
  var t = $("toast");
  t.textContent = msg;
  t.className = "show" + (bad ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.className = ""; }, bad ? 5000 : 2200);
}

function api(params) {
  return fetch(API + "?" + qs(params), { credentials: "same-origin" })
    .then(function (r) {
      if (r.status === 401) throw new Error("Not authorised — reload the page and enter the Lua HTTP password");
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then(function (txt) {
      var d;
      try { d = JSON.parse(txt); }
      catch (e) { throw new Error("bad response: " + txt.slice(0, 200)); }
      if (d.errors && d.errors.length) toast(d.errors.join(" | "), true);
      return d;
    })
    .catch(function (e) {
      setConn(false);
      toast(e.message, true);
      throw e;
    });
}

/* fire a command then refresh soon after */
function act(params, quick) {
  return api(params).then(function (d) {
    if (quick !== false) setTimeout(poll, 120);
    return d;
  });
}
function key(name)  { return act({ cmd: "key", val: name }); }
function cmd(name, extra) {
  // a track change we asked for is not an automatic one
  if (/^pl_(play|next|previous)$/.test(name)) pnSkipUntil = Date.now() + 2500;
  var p = { command: name };
  if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
  return act(p);
}
function setvar(obj, name, val, type) { return act({ cmd: "setvar", obj: obj, name: name, val: val, type: type }); }
function setcfg(name, val, type)      { return act({ cmd: "setconfig", name: name, val: val, type: type }); }

function hold(id, ms) { busy[id] = Date.now() + (ms || 1500); }
function held(id) { return (busy[id] || 0) > Date.now() || document.activeElement === $(id); }

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}
function arr(x) { return (x && x._array) ? x._array : (Array.isArray(x) ? x : []); }
function setConn(ok) {
  var c = $("conn");
  c.textContent = ok ? "connected" : "no connection";
  c.className = ok ? "on" : "off";
}

/* fill a <select> from a caps list, keeping the current value selected */
function fillSel(id, list, current, extra) {
  var s = $(id);
  if (!s || held(id)) return;
  var items = arr(list).slice();
  if (extra) items = extra.concat(items);
  var sig = JSON.stringify(items) + "|" + current;
  if (s._sig === sig) return;
  s._sig = sig;
  s.innerHTML = "";
  items.forEach(function (o) {
    var op = el("option", null, o.text);
    op.value = o.value;
    s.appendChild(op);
  });
  if (current !== undefined && current !== null) s.value = String(current);
  s.disabled = items.length === 0;
}

/* ------------------------------------------------------------ config field defs */
var CFG = {
  audio: [
    { k: "aout", l: "Output module", t: "text", h: "blank = automatic" },
    { k: "audio-visual", l: "Visualisation", t: "sel",
      o: ["", "none", "glspectrum", "spectrum", "spectrometer", "scope", "vuMeter", "goom", "projectm"] },
    { k: "audio-filter", l: "Audio filters", t: "text", h: "e.g. normvol:compressor:headphone" },
    { k: "audio-replay-gain-mode", l: "Replay gain mode", t: "sel", o: ["none", "track", "album"] },
    { k: "audio-replay-gain-preamp", l: "Replay gain preamp (dB)", t: "num", step: 0.5 },
    { k: "audio-replay-gain-default", l: "Default replay gain (dB)", t: "num", step: 0.5 },
    { k: "audio-replay-gain-peak-protection", l: "Peak protection", t: "bool" },
    { k: "audio-time-stretch", l: "Time stretching (keep pitch)", t: "bool" },
    { k: "force-dolby-surround", l: "Force Dolby Surround", t: "sel",
      o: [{ v: 0, l: "Auto" }, { v: 1, l: "On" }, { v: 2, l: "Off" }] },
    { k: "spdif", l: "S/PDIF passthrough", t: "bool" },
    { k: "audio-desync", l: "Global audio desync (ms)", t: "num", step: 10 },
    { k: "audio-language", l: "Preferred audio language(s)", t: "text", h: "eng,fre" },
    { k: "volume-step", l: "Volume step", t: "num", step: 1 },
    { k: "audio", l: "Audio enabled", t: "bool" }
  ],
  subs: [
    { k: "sub-autodetect-file", l: "Auto detect subtitle files", t: "bool" },
    { k: "sub-autodetect-fuzzy", l: "Autodetect fuzziness", t: "num", step: 1 },
    { k: "sub-language", l: "Preferred subtitle language(s)", t: "text", h: "eng,fre" },
    { k: "sub-margin", l: "Vertical offset (px)", t: "num", step: 5 },
    { k: "sub-fps", l: "Subtitle frame rate", t: "num", step: 0.001 },
    { k: "subsdec-encoding", l: "Text encoding", t: "sel",
      o: ["", "UTF-8", "System codeset", "windows-1252", "windows-1251", "windows-1250", "ISO-8859-1",
          "ISO-8859-2", "ISO-8859-5", "ISO-8859-7", "ISO-8859-9", "Shift_JIS", "GB18030", "Big5", "KOI8-R"] },
    { k: "subsdec-align", l: "Text alignment", t: "sel",
      o: [{ v: 0, l: "Centre" }, { v: 1, l: "Left" }, { v: 2, l: "Right" }] },
    { k: "subsdec-formatted", l: "Honour subtitle formatting tags", t: "bool" },
    { k: "freetype-font", l: "Font", t: "text", h: "Arial" },
    { k: "freetype-rel-fontsize", l: "Relative font size", t: "sel",
      o: [{ v: 20, l: "Smaller" }, { v: 18, l: "Small" }, { v: 16, l: "Normal" },
          { v: 12, l: "Large" }, { v: 6, l: "Larger" }] },
    { k: "freetype-fontsize", l: "Absolute font size (0 = auto)", t: "num", step: 1 },
    { k: "freetype-bold", l: "Bold", t: "bool" },
    { k: "freetype-color", l: "Text colour", t: "rgb" },
    { k: "freetype-opacity", l: "Text opacity", t: "range", min: 0, max: 255, step: 1 },
    { k: "freetype-outline-color", l: "Outline colour", t: "rgb" },
    { k: "freetype-outline-thickness", l: "Outline thickness", t: "sel",
      o: [{ v: 0, l: "None" }, { v: 2, l: "Thin" }, { v: 4, l: "Normal" }, { v: 6, l: "Thick" }] },
    { k: "freetype-outline-opacity", l: "Outline opacity", t: "range", min: 0, max: 255, step: 1 },
    { k: "freetype-shadow-color", l: "Shadow colour", t: "rgb" },
    { k: "freetype-shadow-opacity", l: "Shadow opacity", t: "range", min: 0, max: 255, step: 1 },
    { k: "freetype-background-color", l: "Background colour", t: "rgb" },
    { k: "freetype-background-opacity", l: "Background opacity", t: "range", min: 0, max: 255, step: 1 },
    { k: "sub-source", l: "Subtitle sources", t: "text", h: "e.g. marq:logo" },
    { k: "sub-filter", l: "Subtitle filters", t: "text" }
  ],
  video: [
    { k: "video", l: "Video enabled", t: "bool" },
    { k: "fullscreen", l: "Start fullscreen", t: "bool" },
    { k: "video-on-top", l: "Always on top", t: "bool" },
    { k: "video-wallpaper", l: "Wallpaper mode", t: "bool" },
    { k: "video-title-show", l: "Show media title on video", t: "bool" },
    { k: "deinterlace", l: "Deinterlace (default)", t: "sel",
      o: [{ v: -1, l: "Auto" }, { v: 0, l: "Off" }, { v: 1, l: "On" }] },
    { k: "deinterlace-mode", l: "Deinterlace mode (default)", t: "sel",
      o: ["auto", "discard", "blend", "mean", "bob", "linear", "x", "yadif", "yadif2x", "phosphor", "ivtc"] },
    { k: "aspect-ratio", l: "Aspect ratio (default)", t: "text", h: "16:9" },
    { k: "crop", l: "Crop (default)", t: "text", h: "16:9" },
    { k: "video-filter", l: "Video filters", t: "text", h: "e.g. adjust:sharpen" },
    { k: "snapshot-path", l: "Snapshot folder", t: "text" },
    { k: "snapshot-format", l: "Snapshot format", t: "sel", o: ["png", "jpg", "tiff"] },
    { k: "snapshot-prefix", l: "Snapshot prefix", t: "text" },
    { k: "snapshot-sequential", l: "Sequential snapshot numbering", t: "bool" }
  ]
};

var ADJUST = [
  { k: "contrast",   l: "Contrast",   min: 0, max: 2,   step: 0.01 },
  { k: "brightness", l: "Brightness", min: 0, max: 2,   step: 0.01 },
  { k: "hue",        l: "Hue",        min: -180, max: 180, step: 1 },
  { k: "saturation", l: "Saturation", min: 0, max: 3,   step: 0.01 },
  { k: "gamma",      l: "Gamma",      min: 0.01, max: 10, step: 0.01 }
];

var AFILTERS = [
  ["normvol", "Volume normaliser"], ["compressor", "Dynamic compressor"],
  ["spatializer", "Spatialiser"], ["headphone", "Headphone surround"],
  ["stereo_widen", "Stereo widen"], ["dolby_surround_decoder", "Dolby decoder"],
  ["scaletempo", "Scale tempo"], ["chorus_flanger", "Chorus / flanger"],
  ["param_eq", "Parametric EQ"], ["mono", "Downmix to mono"],
  ["gain", "Gain"], ["remap", "Channel remap"]
];

var KEYS = [
  ["play-pause", "Play / Pause"], ["stop", "Stop"], ["next", "Next"], ["prev", "Previous"],
  ["faster", "Faster"], ["slower", "Slower"], ["rate-normal", "Normal speed"],
  ["jump-short", "Back 3s"], ["jump+short", "Forward 3s"],
  ["jump-medium", "Back 10s"], ["jump+medium", "Forward 10s"],
  ["jump-long", "Back 1m"], ["jump+long", "Forward 1m"],
  ["frame-next", "Next frame"], ["record", "Record"], ["snapshot", "Snapshot"],
  ["toggle-fullscreen", "Toggle fullscreen"], ["leave-fullscreen", "Leave fullscreen"],
  ["wallpaper", "Wallpaper mode"], ["aspect-ratio", "Cycle aspect ratio"], ["crop", "Cycle crop"],
  ["deinterlace", "Toggle deinterlace"], ["deinterlace-mode", "Cycle deint. mode"],
  ["incr-scalefactor", "Zoom in"], ["decr-scalefactor", "Zoom out"], ["zoom-original", "Zoom 1:1"],
  ["zoom-half", "Zoom 1/2"], ["zoom-double", "Zoom 2x"],
  ["crop-top", "Crop top"], ["uncrop-top", "Uncrop top"],
  ["crop-bottom", "Crop bottom"], ["uncrop-bottom", "Uncrop bottom"],
  ["crop-left", "Crop left"], ["uncrop-left", "Uncrop left"],
  ["crop-right", "Crop right"], ["uncrop-right", "Uncrop right"],
  ["viewpoint-fov-in", "360: zoom in"], ["viewpoint-fov-out", "360: zoom out"],
  ["clear-playlist", "Clear playlist"], ["intf-popup-menu", "Popup menu"],
  ["intf-show", "Show interface"], ["position", "Show position"],
  ["vol-up", "Volume up"], ["vol-down", "Volume down"], ["vol-mute", "Mute"],
  ["audiodevice-cycle", "Cycle audio device"], ["audio-track", "Cycle audio track"],
  ["audiodelay-up", "Audio delay +"], ["audiodelay-down", "Audio delay -"],
  ["subtitle-track", "Cycle subtitle track"], ["subtitle-revtrack", "Cycle sub. backwards"],
  ["subtitle-toggle", "Toggle subtitles"], ["subdelay-up", "Sub delay +"], ["subdelay-down", "Sub delay -"],
  ["subpos-up", "Subs up"], ["subpos-down", "Subs down"],
  ["subtitle-text-scale-up", "Subs bigger"], ["subtitle-text-scale-down", "Subs smaller"],
  ["subtitle-text-scale-normal", "Subs normal size"],
  ["subsync-markaudio", "Sync: mark audio"], ["subsync-marksub", "Sync: mark sub"],
  ["subsync-apply", "Sync: apply"], ["subsync-reset", "Sync: reset"],
  ["title-prev", "Previous title"], ["title-next", "Next title"],
  ["chapter-prev", "Previous chapter"], ["chapter-next", "Next chapter"],
  ["disc-menu", "Disc menu"], ["nav-up", "Nav up"], ["nav-down", "Nav down"],
  ["nav-left", "Nav left"], ["nav-right", "Nav right"], ["nav-activate", "Nav select"],
  ["program-sid-next", "Next program"], ["program-sid-prev", "Previous program"],
  ["random", "Toggle random"], ["loop", "Toggle loop"]
];

/* ------------------------------------------------------------ config field builder */
function rgb2hex(n) {
  n = Number(n) || 0;
  return "#" + ("000000" + (n & 0xffffff).toString(16)).slice(-6);
}
function hex2rgb(h) { return parseInt(h.replace("#", ""), 16) || 0; }

function buildCfg(host, defs) {
  var box = $(host);
  box.innerHTML = "";
  defs.forEach(function (d) {
    var f = el("div", "field");
    var lab = el("label", null, d.l);
    var out = el("span", "val");
    var inp;

    if (d.t === "bool") {
      inp = el("input"); inp.type = "checkbox";
      lab.textContent = "";
      var w = el("label", "small");
      w.appendChild(inp); w.appendChild(document.createTextNode(" " + d.l));
      f.appendChild(w);
    } else if (d.t === "sel") {
      inp = el("select");
      d.o.forEach(function (o) {
        var v = (typeof o === "object") ? o.v : o;
        var t = (typeof o === "object") ? o.l : (o === "" ? "(default)" : o);
        var op = el("option", null, t); op.value = v; inp.appendChild(op);
      });
      f.appendChild(lab); f.appendChild(inp);
    } else if (d.t === "rgb") {
      inp = el("input"); inp.type = "color";
      f.appendChild(lab); f.appendChild(inp);
    } else if (d.t === "range") {
      inp = el("input"); inp.type = "range";
      inp.min = d.min; inp.max = d.max; inp.step = d.step;
      lab.appendChild(out);
      f.appendChild(lab); f.appendChild(inp);
    } else {
      inp = el("input"); inp.type = (d.t === "num") ? "number" : "text";
      if (d.step) inp.step = d.step;
      if (d.h) inp.placeholder = d.h;
      f.appendChild(lab); f.appendChild(inp);
    }

    if (d.h && d.t !== "text" && d.t !== "num") {
      var hint = el("span", "small muted", d.h); f.appendChild(hint);
    }
    inp.id = "cfg_" + d.k;
    inp._def = d;
    inp._out = out;
    inp.addEventListener("change", function () { pushCfg(d, inp); });
    if (d.t === "range") inp.addEventListener("input", function () {
      hold(inp.id); if (out) out.textContent = inp.value;
    });
    box.appendChild(f);
  });
}

function pushCfg(d, inp) {
  var v, t;
  if (d.t === "bool") { v = inp.checked ? "1" : "0"; t = "bool"; }
  else if (d.t === "rgb") { v = hex2rgb(inp.value); t = "int"; }
  else if (d.t === "num" || d.t === "range") { v = inp.value; t = undefined; }
  else { v = inp.value; t = undefined; }
  hold(inp.id, 2500);
  setcfg(d.k, v, t).then(function () { toast(d.l + " set"); });
}

var CFGUNKNOWN = [];
function applyCfg(defs, vals) {
  defs.forEach(function (d) {
    var inp = $("cfg_" + d.k);
    if (!inp || held(inp.id)) return;
    var v = vals[d.k];
    if (CFGUNKNOWN.indexOf(d.k) >= 0 || v === undefined || v === null) {
      inp.disabled = true;
      inp.title = "not available in this VLC build";
      return;
    }
    inp.disabled = false;
    if (d.t === "bool") inp.checked = !!v;
    else if (d.t === "rgb") inp.value = rgb2hex(v);
    else {
      inp.value = (typeof v === "number" && d.t !== "sel") ? Math.round(v * 1000) / 1000 : v;
      if (inp._out) inp._out.textContent = inp.value;
    }
  });
}

function cfgKeys() {
  var k = [];
  Object.keys(CFG).forEach(function (g) { CFG[g].forEach(function (d) { k.push(d.k); }); });
  ADJUST.forEach(function (d) { k.push(d.k); });
  k.push("equalizer-2pass");
  k.push("play-and-pause");
  return k.join(",");
}

/* ------------------------------------------------------------ static UI wiring */
function initTabs() {
  $("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (!b) return;
    curTab = b.dataset.tab;
    Array.prototype.forEach.call($("tabs").children, function (x) { x.classList.toggle("sel", x === b); });
    ["now", "audio", "subs", "video", "playlist", "browse", "keys", "info"].forEach(function (t) {
      $("tab-" + t).classList.toggle("sel", t === curTab);
    });
    if (curTab === "playlist") loadPlaylist();
    if (curTab === "browse" && !$("br-list").children.length) browse("~");
    poll();
  });
}

function initDelegated() {
  document.body.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.key)  { key(b.dataset.key); }
    else if (b.dataset.cmd) { cmd(b.dataset.cmd); }
    else if (b.dataset.seek) { act({ cmd: "seek", val: b.dataset.seek }); }
    else if (b.dataset.rate) { setvar("input", "rate", b.dataset.rate, "float"); }
  });
  $("btnrefresh").addEventListener("click", function () { pollAll(); loadPlaylist(); });
}

function initNow() {
  var seek = $("seek");
  seek.addEventListener("input", function () { hold("seek", 3000); $("t-now").textContent = fmt(seek.value / 1000 * (S.length || 0)); });
  seek.addEventListener("change", function () {
    hold("seek", 1200);
    act({ cmd: "seek", val: (seek.value / 10).toFixed(2) + "%" });
  });

  var vol = $("vol");
  vol.addEventListener("input", function () { hold("vol", 2000); $("vol-val").textContent = vol.value + "%"; });
  vol.addEventListener("change", function () {
    hold("vol", 1200);
    act({ cmd: "volume", val: Math.round(vol.value * 256 / 100) });
  });

  var rate = $("rate");
  rate.addEventListener("input", function () { hold("rate", 2000); $("rate-val").textContent = (+rate.value).toFixed(2) + "x"; });
  rate.addEventListener("change", function () { hold("rate", 1200); setvar("input", "rate", rate.value, "float"); });

  $("sel-title").addEventListener("change", function () { setvar("input", "title", this.value, "int"); });
  $("sel-chapter").addEventListener("change", function () { setvar("input", "chapter", this.value, "int"); });

  // read-only queue: click to jump to an item, nothing else
  $("np-list").addEventListener("click", function (e) {
    var row = e.target.closest(".item[data-plid]");
    if (row) cmd("pl_play", { id: row.dataset.plid });
  });
  $("np-plgoto").addEventListener("click", function () {
    document.querySelector('#tabs button[data-tab="playlist"]').click();
  });
}

function initAudio() {
  $("sel-audio-es").addEventListener("change", function () { setvar("input", "audio-es", this.value, "int"); });
  $("sel-device").addEventListener("change", function () { act({ cmd: "aout_device", val: this.value }); });
  $("device-manual").addEventListener("change", function () {
    if (this.value) act({ cmd: "aout_device", val: this.value }).then(function () { toast("device set"); });
  });
  $("sel-stereo").addEventListener("change", function () { setvar("aout", "stereo-mode", this.value, "int"); });
  $("adelay").addEventListener("change", function () { hold("adelay"); cmd("audiodelay", { val: this.value }); });

  // equaliser bands
  var HZ = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"];
  var box = $("eqbands");
  HZ.forEach(function (h, i) {
    var b = el("div", "eqband");
    var db = el("div", "db", "0.0");
    var r = el("input"); r.type = "range"; r.min = -20; r.max = 20; r.step = 0.5; r.value = 0; r.id = "eqb" + i;
    r.addEventListener("input", function () { hold(r.id, 2000); db.textContent = (+r.value).toFixed(1); });
    r.addEventListener("change", function () {
      hold(r.id, 1200);
      var p = { cmd: "eq_set" }; p["b" + i] = r.value;
      act(p);
    });
    b.appendChild(db); b.appendChild(r); b.appendChild(el("div", "hz", h));
    box.appendChild(b);
  });

  $("preamp").addEventListener("input", function () { hold("preamp", 2000); $("preamp-val").textContent = (+this.value).toFixed(1) + " dB"; });
  $("preamp").addEventListener("change", function () { hold("preamp", 1200); act({ cmd: "eq_set", preamp: this.value }); });
  $("eq-enable").addEventListener("click", function () {
    act({ cmd: "eq_set", enable: this.classList.contains("on") ? "0" : "1" });
  });
  $("eq-preset").addEventListener("change", function () { act({ cmd: "eq_set", preset: this.value }); });
  $("eq-2pass").addEventListener("change", function () { setcfg("equalizer-2pass", this.checked ? "1" : "0", "bool"); });
  $("eq-flat").addEventListener("click", function () {
    var p = { cmd: "eq_set", preamp: 0 };
    for (var i = 0; i < 10; i++) p["b" + i] = 0;
    act(p);
  });

  $("b-mute").addEventListener("click", function () {
    setvar("aout", "mute", this.classList.contains("on") ? "0" : "1", "bool");
    this.classList.toggle("on");
  });
  $("sel-visual").addEventListener("change", function () { setvar("aout", "visual", this.value, "string"); });
  $("sel-rgain").addEventListener("change", function () { setvar("aout", "audio-replay-gain-mode", this.value, "string"); });

  var box = $("afilters");
  AFILTERS.forEach(function (f) {
    var b = el("button", null, f[1]);
    b.dataset.filter = f[0];
    b.addEventListener("click", function () {
      var cur = ($("afilter-raw").value || "").split(":").filter(Boolean);
      var i = cur.indexOf(f[0]);
      if (i >= 0) cur.splice(i, 1); else cur.push(f[0]);
      applyFilters(cur.join(":"));
    });
    box.appendChild(b);
  });
  $("afilter-set").addEventListener("click", function () { applyFilters($("afilter-raw").value); });
  applyIcons(box);

  buildCfg("cfg-audio", CFG.audio);
}

function applyFilters(chain) {
  hold("afilter-raw", 2500);
  $("afilter-raw").value = chain;
  setvar("aout", "audio-filter", chain, "string");
  setcfg("audio-filter", chain, "string");
}

function initSubs() {
  $("sel-spu-es").addEventListener("change", function () { setvar("input", "spu-es", this.value, "int"); });
  $("sdelay").addEventListener("change", function () { hold("sdelay"); cmd("subdelay", { val: this.value }); });
  $("sscale").addEventListener("input", function () { hold("sscale", 2000); $("sscale-val").textContent = this.value + "%"; });
  $("sscale").addEventListener("change", function () { hold("sscale", 1200); setvar("playlist", "sub-text-scale", this.value, "int"); });
  $("subadd").addEventListener("click", function () {
    var v = $("subpath").value;
    if (v) act({ cmd: "addsub", val: v }).then(function () { toast("subtitle loaded"); });
  });
  var send = function () {
    var v = $("osd-text").value;
    if (!v) { toast("type something first", true); return; }
    act({ cmd: "osd", val: v, pos: $("osd-pos").value, dur: $("osd-dur").value })
      .then(function () { toast("shown on screen"); });
  };
  $("osd-send").addEventListener("click", send);
  $("osd-text").addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
  buildCfg("cfg-subs", CFG.subs);
}

function initVideo() {
  $("sel-video-es").addEventListener("change", function () { setvar("input", "video-es", this.value, "int"); });
  $("sel-aspect").addEventListener("change", function () { setvar("vout", "aspect-ratio", this.value, "string"); });
  $("sel-crop").addEventListener("change", function () { setvar("vout", "crop", this.value, "string"); });
  $("zoom").addEventListener("input", function () { hold("zoom", 2000); $("zoom-val").textContent = (+this.value).toFixed(2) + "x"; });
  $("zoom").addEventListener("change", function () { hold("zoom", 1200); setvar("vout", "zoom", this.value, "float"); });
  $("sel-deint-on").addEventListener("change", function () { setvar("vout", "deinterlace", this.value, "int"); });
  $("sel-deint-mode").addEventListener("change", function () { setvar("vout", "deinterlace-mode", this.value, "string"); });
  $("sel-program").addEventListener("change", function () { setvar("input", "program", this.value, "int"); });

  $("adjust-on").addEventListener("change", function () {
    var on = this.checked;
    setvar("vout", "video-filter", on ? "adjust" : "", "string");
    setcfg("video-filter", on ? "adjust" : "", "string");
  });

  var box = $("adjust");
  ADJUST.forEach(function (d) {
    var f = el("div", "field");
    var lab = el("label", null, d.l);
    var out = el("span", "val"); lab.appendChild(out);
    var r = el("input"); r.type = "range"; r.min = d.min; r.max = d.max; r.step = d.step; r.id = "adj_" + d.k;
    r.addEventListener("input", function () { hold(r.id, 2000); out.textContent = r.value; });
    r.addEventListener("change", function () {
      hold(r.id, 1200);
      setvar("vout", d.k, r.value, "float");
      setcfg(d.k, r.value);
    });
    r._out = out;
    f.appendChild(lab); f.appendChild(r);
    box.appendChild(f);
  });

  buildCfg("cfg-video", CFG.video);
}

function initPlaylist() {
  function collect() {
    return $("add-uris").value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function add(play) {
    var uris = collect();
    addMedia(uris, play).then(function () { $("add-uris").value = ""; });
  }
  $("add-play").addEventListener("click", function () { add(true); });
  $("add-enq").addEventListener("click", function () { add(false); });
  ["add-gain", "add-imgdur", "add-start", "add-stop", "add-opts"].forEach(function (id) {
    $(id).addEventListener("input", refreshOptPreview);
  });
  $("add-imgdur-def").addEventListener("click", function () {
    $("add-imgdur").value = ""; refreshOptPreview();
  });
  $("pl-showlib").addEventListener("change", renderPlaylist);
  refreshOptPreview();

  $("pl-clear").addEventListener("click", function () {
    if (confirm("Clear the whole playlist?")) cmd("pl_empty").then(loadPlaylist);
  });
  $("pl-sort").addEventListener("change", function () {
    if (this.value) cmd("pl_sort", { val: this.value, id: 0 }).then(loadPlaylist);
    this.value = "";
  });
  $("pl-search").addEventListener("input", function () { renderPlaylist(); });

  $("pl-list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-plid]");
    var row = e.target.closest(".item");
    if (b) {
      e.stopPropagation();
      if (b.dataset.act === "del") act({ cmd: "pl_delete_many", id: b.dataset.plid }).then(loadPlaylist);
      if (b.dataset.act === "up") act({ cmd: "pl_move", id: b.dataset.plid, target: Math.max(0, +b.dataset.idx - 1) }).then(loadPlaylist);
      if (b.dataset.act === "down") act({ cmd: "pl_move", id: b.dataset.plid, target: +b.dataset.idx + 2 }).then(loadPlaylist);
      return;
    }
    if (row && row.dataset.plid) cmd("pl_play", { id: row.dataset.plid });
  });
}

function initBrowse() {
  $("br-go").addEventListener("click", function () { browse($("br-path").value || "~"); });
  $("br-path").addEventListener("keydown", function (e) { if (e.key === "Enter") browse(this.value || "~"); });
  $("br-home").addEventListener("click", function () { browse("~"); });
  $("br-drives").addEventListener("click", function () { browse(""); });
  $("br-up").addEventListener("click", function () { browse(brParent); });
  $("br-media").addEventListener("change", function () { browse(brDir); });
  $("br-edit").addEventListener("click", function () {
    var r = $("br-editrow");
    r.classList.toggle("hidden");
    if (!r.classList.contains("hidden")) $("br-path").focus();
  });

  $("br-crumbs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-crumb]");
    if (b) browse(b.dataset.crumb);
  });

  $("br-list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-path]");
    var row = e.target.closest(".item");
    if (b) {
      e.stopPropagation();
      var p = b.dataset.path;
      if (b.dataset.act === "play") addMedia([p], true);
      if (b.dataset.act === "enq")  addMedia([p], false);
      if (b.dataset.act === "sub")  act({ cmd: "addsub", val: b.dataset.raw || p })
        .then(function () { toast("subtitle loaded"); });
      return;
    }
    if (row) {
      if (row.dataset.dir) browse(row.dataset.dir);
      else addMedia([row.dataset.file], true);
    }
  });
}

/* per-item VLC options built from the Playlist tab's add form */
function addOptions() {
  var o = [];
  var gain = parseFloat($("add-gain").value);
  if (!isNaN(gain) && Math.abs(gain - 1) > 0.001) o.push("gain=" + gain);
  var dur = $("add-imgdur").value;
  if (dur !== "") o.push("image-duration=" + dur);
  var st = $("add-start").value;
  if (st !== "") o.push("start-time=" + st);
  var sp = $("add-stop").value;
  if (sp !== "") o.push("stop-time=" + sp);
  ($("add-opts").value || "").split(":").forEach(function (x) {
    x = x.trim();
    if (x) o.push(x);
  });
  return o.join(":");
}
function refreshOptPreview() {
  var o = addOptions();
  $("add-gain-val").textContent = (+$("add-gain").value).toFixed(2) + "x";
  $("add-preview").textContent = o ? "applied: :" + o.split(":").join(" :") : "no extra options";
}
function addMedia(uris, play) {
  if (!uris.length) { toast("nothing to add", true); return Promise.resolve(); }
  return act({ cmd: "pl_add", uri: uris, opts: addOptions(), play: play ? "1" : "0" })
    .then(function () {
      toast((play ? "playing " : "queued ") + uris.length + " item(s)");
      loadPlaylist();
    });
}

function initKeys() {
  var g = $("keygrid");
  KEYS.forEach(function (k) {
    var b = el("button", null, k[1]);
    b.dataset.key = k[0];
    b.title = "key-" + k[0];
    g.appendChild(b);
  });
  applyIcons(g);

  $("key-send").addEventListener("click", function () {
    var v = $("key-custom").value.trim();
    if (v) key(v).then(function () { toast("fired key-" + v); });
  });

  // hide actions this VLC build does not know about
  api({ want: "keys", names: KEYS.map(function (k) { return k[0]; }).join(",") })
    .then(function (d) {
      Array.prototype.forEach.call(g.children, function (b) {
        if (d.keys && d.keys[b.dataset.key] === false) b.classList.add("hidden");
      });
    }).catch(function () {});
}

/* ------------------------------------------------------------ browse */
var brDir = "~", brParent = "";
function fmtSize(n) {
  if (!n && n !== 0) return "";
  var u = ["B", "KB", "MB", "GB", "TB"], i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + " " + u[i];
}
function browse(dir) {
  return api({ want: "browse", path: dir, show: $("br-media").checked ? "media" : "all" })
    .then(function (d) {
      setConn(true);
      var b = d.browse || {};
      brDir = b.path !== undefined ? b.path : dir;
      brParent = b.parent || "";
      $("br-path").value = brDir;
      $("br-up").disabled = !brParent && brDir === "";

      // breadcrumb
      var cr = $("br-crumbs");
      cr.innerHTML = "";
      var crumbs = arr(b.crumbs);
      crumbs.forEach(function (c, i) {
        if (i) {
          var sep = el("span", "sep");
          sep.dataset.ic = "caret-right";
          cr.appendChild(sep);
        }
        var btn = el("button", i === crumbs.length - 1 ? "last" : null, c.name);
        btn.dataset.crumb = c.path;
        cr.appendChild(btn);
      });
      applyIcons(cr);

      // entries
      var list = $("br-list");
      list.innerHTML = "";
      var items = arr(b.entries);
      if (!items.length) {
        list.appendChild(el("div", "item muted", "empty, or VLC cannot read this folder"));
        return;
      }
      items.forEach(function (it) {
        var isDir = it.type === "dir";
        var row = el("div", "item");
        var ico = el("span", "ico");
        ico.dataset.ic = isDir ? "folder" : iconFor({ uri: it.name });
        row.appendChild(ico);
        var n = el("span", "name", it.name);
        n.title = it.path;
        row.appendChild(n);
        if (isDir) {
          row.dataset.dir = it.path;
        } else {
          row.dataset.file = it.uri || it.path;
          row.appendChild(el("span", "meta2", fmtSize(it.size)));
          [["play", "play", "play"], ["enq", "queue", "plus"], ["sub", "as sub", "subtitles"]]
            .forEach(function (a) {
              var btn = el("button", "lnk", a[1]);
              btn.dataset.act = a[0];
              btn.dataset.path = it.uri || it.path;
              btn.dataset.raw = it.path;
              row.appendChild(btn);
            });
        }
        list.appendChild(row);
      });
      applyIcons(list);
    });
}

/* ------------------------------------------------------------ playlist */
function loadPlaylist() {
  return api({ want: "playlist" }).then(function (d) {
    setConn(true);
    plCache = d.playlist;
    renderPlaylist();
    renderMini();
  });
}
function flatten(node, out) {
  if (!node) return out;
  var kids = arr(node.children);
  if (kids.length) kids.forEach(function (c) { flatten(c, out); });
  else if (node.type === "leaf") out.push(node);
  return out;
}
/* VLC's root holds two nodes: the real playlist and the media library */
function plGroups() {
  var kids = arr(plCache && plCache.children);
  if (!kids.length) return [{ name: "Playlist", items: flatten(plCache, []) }];
  return kids.map(function (n) {
    return { name: n.name || "Playlist", items: flatten(n, []) };
  });
}
function isLibrary(name) { return /libr|knihov|biblio|mediat/i.test(name || ""); }

function iconFor(it) {
  var e = (it.uri || it.name || "").toLowerCase().replace(/[?#].*$/, "");
  if (/\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|wma|ape|mka|ac3|dts)$/.test(e)) return "file-audio";
  if (/\.(jpg|jpeg|png|gif|bmp|webp|tiff)$/.test(e)) return "image";
  if (/^(https?|rtsp|rtmp|mms|udp|rtp):/.test(e)) return "hard-drives";
  return "file-video";
}

function plRow(it, idx, readonly) {
  var row = el("div", "item" + (it.current ? " cur" : ""));
  row.dataset.plid = it.id;
  var ico = el("span", "ico");
  ico.dataset.ic = it.current ? "play" : iconFor(it);
  row.appendChild(ico);
  var n = el("span", "name", it.name || it.uri);
  n.title = it.uri || "";
  row.appendChild(n);
  row.appendChild(el("span", "dur", it.duration > 0 ? fmt(it.duration) : ""));
  if (!readonly) {
    [["up", "caret-up"], ["down", "caret-down"], ["del", "x"]].forEach(function (a) {
      var b = el("button", "lnk");
      b.dataset.ic = a[1]; b.dataset.act = a[0]; b.dataset.plid = it.id; b.dataset.idx = idx;
      row.appendChild(b);
    });
  }
  return row;
}

function renderPlaylist() {
  var list = $("pl-list");
  var f = ($("pl-search").value || "").toLowerCase();
  var showlib = $("pl-showlib").checked;
  list.innerHTML = "";
  var any = false;
  plGroups().forEach(function (g) {
    if (!showlib && isLibrary(g.name)) return;
    var items = f ? g.items.filter(function (i) {
      return (i.name || "").toLowerCase().indexOf(f) >= 0;
    }) : g.items;
    if (!items.length) return;
    any = true;
    list.appendChild(el("div", "grouphdr", g.name + " — " + items.length));
    items.forEach(function (it, idx) { list.appendChild(plRow(it, idx, false)); });
  });
  if (!any) list.appendChild(el("div", "item muted", f ? "nothing matches" : "playlist is empty"));
  applyIcons(list);
}

/* read-only queue shown on the Now Playing tab */
function renderMini() {
  var list = $("np-list");
  if (!list) return;
  var items = [];
  plGroups().forEach(function (g) { if (!isLibrary(g.name)) items = items.concat(g.items); });
  list.innerHTML = "";
  $("np-plcount").textContent = items.length ? items.length + " item(s)" : "";
  if (!items.length) { list.appendChild(el("div", "item muted", "playlist is empty")); return; }
  var cur = items.findIndex(function (i) { return i.current; });
  items.forEach(function (it, idx) {
    var row = plRow(it, idx, true);
    if (cur >= 0 && idx < cur) row.classList.add("past");
    list.appendChild(row);
  });
  applyIcons(list);
  var c = list.querySelector(".item.cur");
  if (c && !list._scrolled) { list.scrollTop = Math.max(0, c.offsetTop - 60); list._scrolled = true; }
}

/* ------------------------------------------------------------ pause at next */
/* native: VLC's own play-and-pause, freezes on the last frame of the item
   client: we watch for the track change and pause the new item ourselves */
var PN_KEY = "vlcplus.pausenext";
var pnMode = "native", pnArmed = false, pnSkipUntil = 0;

function pnLoad() {
  var s = null;
  try { s = JSON.parse(localStorage.getItem(PN_KEY) || "null"); } catch (e) {}
  if (s) { pnMode = s.mode || "native"; pnArmed = !!s.armed; }
  $("pausenext-mode").value = pnMode;
  // the native flag lives in VLC, so it survives page reloads on its own
  if (pnMode === "native") pnArmed = false;
}
function pnSave() {
  localStorage.setItem(PN_KEY, JSON.stringify({ mode: pnMode, armed: pnArmed }));
}
function pnOn() {
  return pnMode === "native" ? !!CFGVAL["play-and-pause"] : pnArmed;
}
function pnPaint() {
  var b = $("b-pausenext");
  if (!b) return;
  var on = pnOn();
  b.classList.toggle("on", on);
  setLabel(b, on ? "On" : "Off");
  $("pausenext-hint").textContent = on
    ? (pnMode === "native"
        ? "Playback will stop on the last frame. Press play to go to the next track."
        : "The next track will start and then pause at the beginning.")
    : "";
}
function pnSet(on) {
  if (pnMode === "native") {
    return setcfg("play-and-pause", on ? "1" : "0", "bool").then(function () {
      CFGVAL["play-and-pause"] = on;
      pnPaint();
    });
  }
  pnArmed = on; pnSave(); pnPaint();
  return Promise.resolve();
}
function initPauseNext() {
  $("b-pausenext").addEventListener("click", function () { pnSet(!pnOn()); });
  $("pausenext-mode").addEventListener("change", function () {
    var was = pnOn();
    // moving between modes must not leave the old one still armed
    pnSet(false).then(function () {
      pnMode = this.value; pnSave(); pnPaint();
      if (was) pnSet(true);
    }.bind(this));
  });
  pnLoad();
}
/* called from render() when the current item changes */
function pnOnTrackChange() {
  if (pnMode !== "client" || !pnArmed) return;
  if (Date.now() < pnSkipUntil) return;   // the user picked this track themselves
  // give the new input a moment to actually start, then stop it
  setTimeout(function () {
    cmd("pl_pause").then(function () { toast("paused on the new track"); });
  }, 250);
}

/* ------------------------------------------------------------ stream summary */
var N = {};

function chip(icon, label, value, cls) {
  var c = el("span", "chip" + (cls ? " " + cls : ""));
  var i = el("span"); i.dataset.ic = icon; c.appendChild(i);
  c.appendChild(el("b", null, value));
  c.title = label + ": " + value;
  return c;
}

/* how VLC names the channel layout is not stable, keep the raw string */
function renderNowInfo() {
  var box = $("np-chips");
  if (!box) return;
  box.innerHTML = "";
  if (!X.hasinput) { $("np-warn").classList.add("hidden"); return; }

  var v = N.video || {}, a = N.audio || {};
  if (v.res) {
    var r = String(v.res);
    if (v.display && v.display !== v.res) r += " \u2192 " + v.display;
    box.appendChild(chip("monitor-play", "Resolution", r));
  }
  if (v.fps) box.appendChild(chip("gauge", "Frame rate", String(v.fps)));
  var ar = X.aspect || N.aspect;
  box.appendChild(chip("crop", "Aspect ratio", ar ? ar : "source default"));

  if (a.channels) {
    var ch = a.channels;
    if (a.decoded && a.decoded !== a.channels) ch += " \u2192 " + a.decoded;
    box.appendChild(chip("waveform", "Audio channels", ch,
      N.downmixed ? "bad" : (N.surround ? "good" : "")));
  }
  if (a.rate) box.appendChild(chip("speaker-high", "Sample rate", String(a.rate)));
  if (N.atrack) box.appendChild(chip("music-note", "Audio track", N.atrack));
  box.appendChild(chip("subtitles", "Subtitles",
    N.subs_on ? (N.strack || "on") : "off", N.subs_on ? "good" : ""));
  applyIcons(box);

  var w = $("np-warn");
  var warns = arr(N.warn);
  w.innerHTML = "";
  w.classList.toggle("hidden", !warns.length);
  warns.forEach(function (m) {
    var d = el("div", "warnrow");
    var i = el("span"); i.dataset.ic = "warning"; d.appendChild(i);
    d.appendChild(el("span", null, m));
    w.appendChild(d);
  });
  applyIcons(w);
}

/* ------------------------------------------------------------ autostart timer */
var AUTO_KEY = "vlcplus.autostart";
var autoJob = null, autoMode = "in", autoAnnounced = false;

function autoLoad() {
  try { autoJob = JSON.parse(localStorage.getItem(AUTO_KEY) || "null"); } catch (e) { autoJob = null; }
  if (autoJob && autoJob.at < Date.now() - 60000) autoJob = null;   // too stale to fire
  autoSave();
}
function autoSave() {
  if (autoJob) localStorage.setItem(AUTO_KEY, JSON.stringify(autoJob));
  else localStorage.removeItem(AUTO_KEY);
  autoPaint();
}
function two(n) { return (n < 10 ? "0" : "") + n; }
function clockOf(ms) { var d = new Date(ms); return two(d.getHours()) + ":" + two(d.getMinutes()); }
function left(ms) {
  var s = Math.max(0, Math.round(ms / 1000));
  var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return (h ? h + ":" + two(m) : m) + ":" + two(s % 60);
}
function autoPaint() {
  var b = $("auto-btn"), info = $("auto-info");
  if (!b) return;
  b.classList.toggle("on", !!autoJob);
  if (!autoJob) { info.classList.add("hidden"); info.textContent = ""; return; }
  info.classList.remove("hidden");
  info.textContent = "Autostart in " + left(autoJob.at - Date.now()) + " (at " + clockOf(autoJob.at) + ")";
  b.title = info.textContent;
}

/* mm:ss, hh:mm:ss or a bare number of minutes */
function parseDelay(s) {
  var p = String(s).trim().split(":").map(Number);
  if (p.some(isNaN) || !p.length) return null;
  if (p.length === 1) return p[0] * 60000;
  if (p.length === 2) return (p[0] * 60 + p[1]) * 1000;
  return (p[0] * 3600 + p[1] * 60 + p[2]) * 1000;
}
/* hh:mm today, or the same time tomorrow when it has already passed */
function parseClock(s) {
  var m = /^(\d{1,2})[:.](\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  var d = new Date();
  d.setHours(h, mi, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function autoResolve() {
  var v = $("auto-val").value;
  if (autoMode === "in") {
    var ms = parseDelay(v);
    return (ms === null || ms <= 0) ? null : Date.now() + ms;
  }
  return parseClock(v);
}
function autoHint() {
  var at = autoResolve();
  $("auto-hint").textContent = at
    ? "fires at " + clockOf(at) + ", in " + left(at - Date.now())
    : ($("auto-val").value ? "cannot read that" : "");
}
function autoModeSet(m) {
  autoMode = m;
  $("auto-mode-in").classList.toggle("on", m === "in");
  $("auto-mode-at").classList.toggle("on", m === "at");
  $("auto-lbl").textContent = m === "in" ? "Countdown, mm:ss" : "Clock time, hh:mm";
  $("auto-val").placeholder = m === "in" ? "10:00" : "20:30";
  autoHint();
}

function autoFire(job) {
  var chain = Promise.resolve();
  if (job.what === "pl_play") {
    var items = [];
    plGroups().forEach(function (g) { if (!isLibrary(g.name)) items = items.concat(g.items); });
    if (items.length) chain = cmd("pl_play", { id: items[0].id });
    else chain = cmd("pl_play");
  } else if (job.what === "pl_next") {
    chain = cmd("pl_next");
  } else {
    chain = cmd("pl_play");
  }
  if (job.what === "fullscreen") chain = chain.then(function () { return cmd("fullscreen"); });
  chain.then(function () { toast("autostart fired"); }, function () { toast("autostart failed", true); });
}

function autoTick() {
  if (!autoJob) return;
  var ms = autoJob.at - Date.now();
  if (autoJob.osd && !autoAnnounced && ms <= 10000 && ms > 0) {
    autoAnnounced = true;
    act({ cmd: "osd", val: "Playback starts in 10 seconds", pos: "center", dur: 5 }).catch(function () {});
  }
  if (ms <= 0) {
    var job = autoJob;
    autoJob = null; autoAnnounced = false;
    autoSave();
    autoFire(job);
    return;
  }
  autoPaint();
}

function initAuto() {
  var dlg = $("auto-dlg");
  $("auto-btn").addEventListener("click", function () {
    if (autoJob) {
      autoMode = "at";
      $("auto-val").value = clockOf(autoJob.at);
      $("auto-what").value = autoJob.what;
      $("auto-osd").checked = !!autoJob.osd;
    }
    autoModeSet(autoMode);
    dlg.showModal();
    $("auto-val").focus();
  });
  $("auto-mode-in").addEventListener("click", function () { autoModeSet("in"); });
  $("auto-mode-at").addEventListener("click", function () { autoModeSet("at"); });
  $("auto-val").addEventListener("input", autoHint);
  $("auto-val").addEventListener("keydown", function (e) { if (e.key === "Enter") $("auto-set").click(); });
  $("auto-close").addEventListener("click", function () { dlg.close(); });
  $("auto-cancel").addEventListener("click", function () {
    autoJob = null; autoAnnounced = false; autoSave();
    toast("timer cancelled"); dlg.close();
  });
  $("auto-set").addEventListener("click", function () {
    var at = autoResolve();
    if (!at) { toast("give a time like 10:00", true); return; }
    autoJob = { at: at, what: $("auto-what").value, osd: $("auto-osd").checked };
    autoAnnounced = false;
    autoSave();
    toast("autostart set for " + clockOf(at));
    dlg.close();
  });
  autoLoad();
  setInterval(autoTick, 1000);
}

/* ------------------------------------------------------------ drag and drop */
/* browsers expose a dropped file's name but never its path, so names get
   resolved against the folder on the Browse tab and the usual user folders */
function resolveNames(names) {
  return api({ want: "resolve", name: names, dir: brDir && brDir !== "~" ? brDir : "" });
}

/* text wins over files: a dragged link or path is already usable as is */
function droppedItems(dt) {
  var txt = "";
  try { txt = dt.getData("text/uri-list") || dt.getData("text/plain") || ""; } catch (e) {}
  var lines = txt.split(/[\r\n]+/).map(function (s) { return s.trim(); })
                 .filter(function (s) { return s && s.charAt(0) !== "#"; });
  if (lines.length) return Promise.resolve({ items: lines, missed: [] });

  var names = Array.prototype.map.call(dt.files || [], function (f) { return f.name; });
  if (!names.length) return Promise.resolve({ items: [], missed: [] });
  return resolveNames(names).then(function (d) {
    var out = [], missed = [];
    arr(d.resolve).forEach(function (r) {
      if (r.found) out.push(r.uri || r.path); else missed.push(r.name);
    });
    return { items: out, missed: missed };
  });
}

/* one toast for the whole drop, so a partial failure is not hidden by success */
function dropNote(n, missed, verb) {
  var msg = n ? verb + " " + n + " item(s)" : "";
  if (missed.length) {
    msg += (msg ? ". " : "") + "Could not locate " + missed.join(", ") +
           " — browsers hide file paths. Open its folder on the Browse tab, then drop again.";
  }
  if (msg) toast(msg, missed.length > 0);
}

function installDrop(node, handler) {
  if (!node || node._drop) return;
  node._drop = true;
  var depth = 0;
  var off = function () { depth = 0; node.classList.remove("dragover"); };
  node.addEventListener("dragenter", function (e) {
    e.preventDefault(); e.stopPropagation();
    depth++; node.classList.add("dragover");
  });
  node.addEventListener("dragover", function (e) {
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  });
  node.addEventListener("dragleave", function (e) {
    e.stopPropagation();
    if (--depth <= 0) off();
  });
  node.addEventListener("drop", function (e) {
    e.preventDefault(); e.stopPropagation();
    off();
    droppedItems(e.dataTransfer).then(function (res) {
      if (res.items.length || res.missed.length) handler(res.items, res.missed);
    }, function (err) { toast(err.message, true); });
  });
}

function initDrop() {
  // a stray drop anywhere else must not make the browser navigate away
  ["dragover", "drop"].forEach(function (t) {
    window.addEventListener(t, function (e) { e.preventDefault(); }, false);
  });

  // text fields that hold a path or a url
  var fields = ["subpath", "br-path", "add-uris", "osd-text"];
  Array.prototype.forEach.call(document.querySelectorAll('[id^="cfg_"]'), function (f) {
    if (f.type === "text" && /dir|path|file|font/i.test(f.id)) fields.push(f.id);
  });
  fields.forEach(function (id) {
    var f = $(id);
    if (!f) return;
    f.dataset.drop = "path";
    installDrop(f, function (items, missed) {
      if (items.length) {
        if (f.tagName === "TEXTAREA") {
          var cur = f.value.replace(/\s+$/, "");
          f.value = (cur ? cur + "\n" : "") + items.join("\n");
        } else {
          f.value = items[0];
        }
        f.dispatchEvent(new Event("input"));
        f.dispatchEvent(new Event("change"));
      }
      dropNote(items.length, missed, "dropped");
    });
  });

  // the queues take media straight away
  ["pl-list", "np-list", "br-list"].forEach(function (id) {
    var n = $(id);
    if (!n) return;
    installDrop(n, function (items, missed) {
      if (!items.length) { dropNote(0, missed, "queued"); return; }
      act({ cmd: "pl_add", uri: items, opts: addOptions(), play: "0" }).then(function () {
        dropNote(items.length, missed, "queued");
        loadPlaylist();
      });
    });
  });
}

/* ------------------------------------------------------------ status polling */
var polling = false;
function poll() {
  if (polling) return Promise.resolve();
  polling = true;
  var done = function () { polling = false; };
  return pollOnce().then(done, done);
}
function pollOnce() {
  var want = "status";
  if (curTab === "audio" || curTab === "subs" || curTab === "video" || curTab === "now") want += ",caps";
  if (curTab === "now") want += ",now";
  if (curTab === "playlist") want += ",caps";
  if (curTab === "info") want += ",caps";
  return api({ want: want, info: "1" }).then(function (d) {
    setConn(true);
    S = d.status || {};
    X = d.ext || {};
    if (d.caps) C = d.caps;
    if (d.now) N = d.now;
    render();
  }).catch(function () {});
}
function pollAll() {
  poll();
  api({ want: "config", keys: cfgKeys() }).then(function (d) {
    CFGVAL = d.config || {};
    CFGUNKNOWN = arr(d.config_unknown);
    applyCfg(CFG.audio, CFGVAL);
    applyCfg(CFG.subs, CFGVAL);
    applyCfg(CFG.video, CFGVAL);
    ADJUST.forEach(function (a) {
      var r = $("adj_" + a.k);
      if (r && !held(r.id) && CFGVAL[a.k] !== undefined && CFGVAL[a.k] !== null) {
        r.value = CFGVAL[a.k];
        if (r._out) r._out.textContent = r.value;
      }
    });
    if (!held("eq-2pass")) $("eq-2pass").checked = !!CFGVAL["equalizer-2pass"];
    pnPaint();
  }).catch(function () {});
}

function render() {
  $("vlcver").textContent = S.version || "";

  // now playing
  var meta = (S.information && S.information.category && S.information.category.meta) || {};
  var title = meta.title || meta.filename || "Nothing playing";
  $("np-title").textContent = title;
  $("np-artist").textContent = [meta.artist, meta.album].filter(Boolean).join(" — ");
  $("np-state").textContent = S.state + (X.hasvout ? " · video" : "") + (X.record ? " · REC" : "");

  if (!held("seek")) {
    $("seek").value = Math.round((S.position || 0) * 1000);
    $("t-now").textContent = fmt(S.time);
  }
  $("t-len").textContent = fmt(S.length);

  setIcon(document.querySelector('[data-key="play-pause"]'), S.state === "playing" ? "pause" : "play");

  if (S.currentplid !== lastArtId) {
    var first = (lastArtId === null);
    lastArtId = S.currentplid;
    if (!first && S.currentplid > 0) pnOnTrackChange();
    var img = $("art");
    img.onerror = function () { img.classList.remove("on"); };
    img.onload = function () { img.classList.add("on"); };
    img.classList.remove("on");
    if (S.currentplid > 0) img.src = "/art?item=" + S.currentplid + "&_=" + Date.now();
    $("np-list")._scrolled = false;
    loadPlaylist();
  }

  if (!held("vol")) {
    var pct = Math.round((S.volume || 0) * 100 / 256);
    $("vol").value = pct; $("vol-val").textContent = pct + "%";
  }
  if (!held("rate")) { $("rate").value = S.rate || 1; $("rate-val").textContent = (+(S.rate || 1)).toFixed(2) + "x"; }

  $("b-random").classList.toggle("on", !!S.random);
  $("b-loop").classList.toggle("on", !!S.loop);
  $("b-repeat").classList.toggle("on", !!S["repeat"]);

  // audio
  if (!held("adelay")) $("adelay").value = (S.audiodelay || 0).toFixed(3);
  $("adelay-val").textContent = Math.round((S.audiodelay || 0) * 1000) + " ms";

  // subs
  if (!held("sdelay")) $("sdelay").value = (S.subtitledelay || 0).toFixed(3);
  $("sdelay-val").textContent = Math.round((S.subtitledelay || 0) * 1000) + " ms";
  var sc = $("sscale");
  if (X.sub_scale === null || X.sub_scale === undefined) {
    sc.disabled = true; $("sscale-val").textContent = "n/a";
  } else {
    sc.disabled = false;
    if (!held("sscale")) { sc.value = X.sub_scale; $("sscale-val").textContent = X.sub_scale + "%"; }
  }

  // video
  if (!held("zoom") && X.zoom != null) { $("zoom").value = X.zoom; $("zoom-val").textContent = (+X.zoom).toFixed(2) + "x"; }
  if (!held("sel-deint-on") && X.deinterlace != null) $("sel-deint-on").value = X.deinterlace;
  $("adjust-on").checked = /adjust/.test(X.video_filter || CFGVAL["video-filter"] || "");

  // equaliser
  var eq = S.equalizer || {};
  if (!held("preamp") && eq.preamp != null) {
    $("preamp").value = eq.preamp; $("preamp-val").textContent = (+eq.preamp).toFixed(1) + " dB";
  }
  // VLC only reports bands while the equaliser is running, use that as the state
  var bands = eq.bands || {};
  $("eq-enable").classList.toggle("on", Object.keys(bands).length > 0);
  for (var i = 0; i < 10; i++) {
    var r = $("eqb" + i);
    if (!r || held(r.id)) continue;
    var v = bands[i] != null ? bands[i] : bands[String(i)];
    if (v != null) { r.value = v; r.previousSibling.textContent = (+v).toFixed(1); }
  }
  var presets = eq.presets && (eq.presets.preset || eq.presets);
  if (presets && !$("eq-preset")._built) {
    var s = $("eq-preset");
    s.innerHTML = "";
    var names = arr(presets);
    if (!names.length && typeof presets === "object") names = Object.keys(presets).map(function (k) { return presets[k]; });
    names.sort();
    names.forEach(function (p) { var o = el("option", null, p); o.value = p; s.appendChild(o); });
    if (names.length) s._built = true;
  }

  // live audio filters
  $("b-mute").classList.toggle("on", !!X.mute);
  setLabel($("b-mute"), X.mute ? "Muted — click to unmute" : "Sound on — click to mute");
  if (!held("afilter-raw")) {
    var chain = X.audio_filter != null ? X.audio_filter : (CFGVAL["audio-filter"] || "");
    $("afilter-raw").value = chain;
    var active = chain.split(":").filter(Boolean);
    Array.prototype.forEach.call($("afilters").children, function (b) {
      b.classList.toggle("on", active.indexOf(b.dataset.filter) >= 0);
    });
  }

  // caps driven selects
  fillSel("sel-visual", C.visual, X.visual);
  fillSel("sel-rgain", C.replaygain, X.replaygain);
  fillSel("sel-audio-es", C.audio_tracks, X.audio_es);
  fillSel("sel-video-es", C.video_tracks, X.video_es);
  fillSel("sel-spu-es", C.sub_tracks, X.spu_es);
  fillSel("sel-program", C.programs, X.program);
  fillSel("sel-title", C.titles, X.title);
  fillSel("sel-chapter", C.chapters, X.chapter);
  fillSel("sel-stereo", C.stereo_modes, X.stereo);
  fillSel("sel-aspect", C.aspect, X.aspect);
  fillSel("sel-crop", C.crop, X.crop);
  fillSel("sel-deint-mode", C.deinterlace_modes, X.deinterlace_mode);

  var devs = arr(C.devices);
  if (devs.length) {
    fillSel("sel-device", C.devices, X.device);
    $("device-manual").classList.add("hidden");
  } else {
    fillSel("sel-device", { _array: [{ value: "", text: X.device || "(no list from this output module)" }] }, "");
    $("device-manual").classList.remove("hidden");
  }

  // services discovery
  var sd = arr(C.sd);
  var sdBox = $("sd-list");
  if (sd.length && sdBox._n !== sd.length + ":" + sd.filter(function (s) { return s.loaded; }).length) {
    sdBox._n = sd.length + ":" + sd.filter(function (s) { return s.loaded; }).length;
    sdBox.innerHTML = "";
    sd.forEach(function (s) {
      var b = el("button", s.loaded ? "on" : "", s.text);
      b.addEventListener("click", function () {
        act({ cmd: "sd_toggle", val: s.value }).then(function () { setTimeout(poll, 400); });
      });
      sdBox.appendChild(b);
    });
    applyIcons(sdBox);
  }

  if (curTab === "now") renderNowInfo();
  if (curTab === "info") renderInfo();
}

function renderInfo() {
  var cat = (S.information && S.information.category) || {};
  var box = $("infobox");
  box.innerHTML = "";
  Object.keys(cat).forEach(function (k) {
    box.appendChild(el("h3", null, k));
    var t = el("table", "info");
    Object.keys(cat[k]).forEach(function (kk) {
      var tr = el("tr");
      tr.appendChild(el("td", null, kk.replace(/_/g, " ")));
      tr.appendChild(el("td", null, String(cat[k][kk])));
      t.appendChild(tr);
    });
    box.appendChild(t);
  });
  if (!Object.keys(cat).length) box.textContent = "No media playing.";

  var st = el("table", "info");
  Object.keys(S.stats || {}).forEach(function (k) {
    var tr = el("tr");
    tr.appendChild(el("td", null, k));
    tr.appendChild(el("td", null, String(S.stats[k])));
    st.appendChild(tr);
  });
  $("statbox").innerHTML = "";
  $("statbox").appendChild(st);
  $("rawbox").textContent = JSON.stringify({ status: S, ext: X }, null, 1);
}

/* ------------------------------------------------------------ boot */
initTabs(); initDelegated(); initNow(); initAudio(); initSubs(); initVideo();
initPlaylist(); initBrowse(); initKeys(); initAuto(); initDrop(); initPauseNext();
applyIcons();
pollAll();
loadPlaylist();
browse("~");
setInterval(poll, 1000);
setInterval(function () { if (curTab === "playlist" || curTab === "now") loadPlaylist(); }, 5000);
})();
