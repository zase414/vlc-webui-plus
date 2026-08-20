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
  $("osd-send").addEventListener("click", function () {
    act({ cmd: "osd", val: $("osd-text").value }).then(function () { toast("shown on screen"); });
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
    if (!uris.length) return toast("nothing to add", true);
    act({ cmd: "pl_add", uri: uris, opts: $("add-opts").value, play: play ? "1" : "0" })
      .then(function () { toast(uris.length + " item(s) added"); $("add-uris").value = ""; loadPlaylist(); });
  }
  $("add-play").addEventListener("click", function () { add(true); });
  $("add-enq").addEventListener("click", function () { add(false); });

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

  $("br-list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-path]");
    var row = e.target.closest(".item");
    if (b) {
      e.stopPropagation();
      var p = b.dataset.path;
      if (b.dataset.act === "play") act({ cmd: "pl_add", uri: p, play: "1" }).then(function () { toast("playing"); });
      if (b.dataset.act === "enq")  act({ cmd: "pl_add", uri: p }).then(function () { toast("enqueued"); });
      if (b.dataset.act === "sub")  act({ cmd: "addsub", val: p }).then(function () { toast("subtitle loaded"); });
      return;
    }
    if (row) {
      if (row.dataset.dir) browse(row.dataset.dir);
      else act({ cmd: "pl_add", uri: row.dataset.file, play: "1" }).then(function () { toast("playing"); });
    }
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
var brDir = "~";
function browse(dir) {
  brDir = dir;
  $("br-path").value = dir;
  api({ want: "browse", dir: dir }).then(function (d) {
    setConn(true);
    var list = $("br-list");
    list.innerHTML = "";
    var items = arr(d.browse && d.browse.element);
    $("br-crumb").textContent = dir === "" ? "Drives" : dir;
    if (!items.length) list.appendChild(el("div", "item muted", "empty or not readable"));
    items.forEach(function (it) {
      var isDir = it.type === "dir";
      var row = el("div", "item");
      row.appendChild(el("span", "ico", isDir ? "\u{1F4C1}" : "\u{1F4C4}"));
      row.appendChild(el("span", "name", it.name));
      if (isDir) {
        row.dataset.dir = it.path;
      } else {
        row.dataset.file = it.uri || it.path;
        ["play", "enq", "sub"].forEach(function (a) {
          var b = el("button", "lnk", a === "play" ? "play" : (a === "enq" ? "queue" : "as sub"));
          b.dataset.act = a; b.dataset.path = it.uri || it.path;
          row.appendChild(b);
        });
      }
      list.appendChild(row);
    });
  });
}

/* ------------------------------------------------------------ playlist */
function loadPlaylist() {
  return api({ want: "playlist" }).then(function (d) {
    setConn(true);
    plCache = d.playlist;
    renderPlaylist();
  });
}
function flatten(node, out) {
  if (!node) return out;
  var kids = arr(node.children);
  if (kids.length) kids.forEach(function (c) { flatten(c, out); });
  else if (node.type === "leaf") out.push(node);
  return out;
}
function renderPlaylist() {
  var list = $("pl-list");
  var items = flatten(plCache, []);
  var f = ($("pl-search").value || "").toLowerCase();
  if (f) items = items.filter(function (i) { return (i.name || "").toLowerCase().indexOf(f) >= 0; });
  list.innerHTML = "";
  if (!items.length) { list.appendChild(el("div", "item muted", "playlist is empty")); return; }
  items.forEach(function (it, idx) {
    var row = el("div", "item" + (it.current ? " cur" : ""));
    row.dataset.plid = it.id;
    row.appendChild(el("span", "ico", it.current ? "▶" : ""));
    var n = el("span", "name", it.name || it.uri);
    n.title = it.uri || "";
    row.appendChild(n);
    row.appendChild(el("span", "dur", it.duration > 0 ? fmt(it.duration) : ""));
    [["up", "▲"], ["down", "▼"], ["del", "✕"]].forEach(function (a) {
      var b = el("button", "lnk", a[1]);
      b.dataset.act = a[0]; b.dataset.plid = it.id; b.dataset.idx = idx;
      row.appendChild(b);
    });
    list.appendChild(row);
  });
}

/* ------------------------------------------------------------ status polling */
function poll() {
  var want = "status";
  if (curTab === "audio" || curTab === "subs" || curTab === "video" || curTab === "now") want += ",caps";
  if (curTab === "playlist") want += ",caps";
  if (curTab === "info") want += ",caps";
  return api({ want: want, info: "1" }).then(function (d) {
    setConn(true);
    S = d.status || {};
    X = d.ext || {};
    if (d.caps) C = d.caps;
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

  if (S.currentplid !== lastArtId) {
    lastArtId = S.currentplid;
    var img = $("art");
    img.onerror = function () { img.style.visibility = "hidden"; };
    img.onload = function () { img.style.visibility = "visible"; };
    img.style.visibility = "hidden";
    if (S.currentplid > 0) img.src = "/art?item=" + S.currentplid + "&_=" + Date.now();
    if (curTab === "playlist" || curTab === "now") loadPlaylist();
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
  $("b-mute").textContent = X.mute ? "Muted — click to unmute" : "Sound on — click to mute";
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
  }

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
initPlaylist(); initBrowse(); initKeys();
pollAll();
loadPlaylist();
setInterval(poll, 1000);
setInterval(function () { if (curTab === "playlist") loadPlaylist(); }, 5000);
})();
