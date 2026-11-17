(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* stroke-drawn marks need to know their own length before they can draw */
  [].forEach.call(document.querySelectorAll(".thread-path, .ring"), function (el) {
    var len = Math.ceil(el.getTotalLength());
    el.style.setProperty("--len", len);
  });

  var risers = [].slice.call(document.querySelectorAll(".rise, .thread-path, .ring"));

  if (reduce || !("IntersectionObserver" in window)) {
    risers.forEach(function (el) { el.classList.add("lit"); });
  } else {
    var lift = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("lit");
        lift.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    risers.forEach(function (el) { lift.observe(el); });
  }

  /* put a stop on the road beside each gathering, wherever the text lands */

  var thread = document.querySelector(".thread");
  var road = thread && thread.querySelector(".road-line");

  function placeStops() {
    if (!road) return;
    [].forEach.call(thread.querySelectorAll(".stop"), function (s) { s.remove(); });

    var VB_W = 600, VB_H = 640;
    var len = road.getTotalLength();
    var box = thread.getBoundingClientRect();
    if (!box.height) return;

    var half = 16;  /* half the road's width, in page pixels */

    [].forEach.call(thread.querySelectorAll(".rite h3"), function (h3, i) {
      var onRight = (i % 2 === 0);   /* entries alternate, first one right */
      var r = h3.getBoundingClientRect();
      var vy = ((r.top + r.height / 2) - box.top) / box.height * VB_H;

      var best = null, gap = Infinity;
      for (var k = 0; k <= 320; k++) {
        var p = road.getPointAtLength(len * k / 320);
        var d = Math.abs(p.y - vy);
        if (d < gap) { gap = d; best = p; }
      }
      if (!best) return;

      var sb = road.ownerSVGElement.getBoundingClientRect();
      var dot = document.createElement("span");
      dot.className = "stop";
      var edge = window.innerWidth >= 768 ? (onRight ? half : -half) : 0;
      dot.style.left = ((sb.left - box.left) + best.x / VB_W * sb.width + edge) + "px";
      dot.style.top = ((sb.top - box.top) + vy / VB_H * sb.height) + "px";
      dot.style.setProperty("--d", (i * 140) + "ms");
      thread.appendChild(dot);
      if (!reduce) { requestAnimationFrame(function () { dot.classList.add("lit"); }); }
      else { dot.classList.add("lit"); }
    });
  }

  if (road) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeStops);
    else addEventListener("load", placeStops);
    var t = null;
    addEventListener("resize", function () { clearTimeout(t); t = setTimeout(placeStops, 180); }, { passive: true });
  }

  /* the bar borrows the ink of whichever band it is sitting over */
  var bar = document.getElementById("bar");
  var meta = document.querySelector('meta[name="theme-color"]');
  var bands = [].slice.call(document.querySelectorAll(".band"));

  if ("IntersectionObserver" in window) {
    var overhead = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var bg = getComputedStyle(e.target).backgroundColor;
        if (meta) meta.setAttribute("content", bg);
      });
    }, { rootMargin: "0px 0px -96% 0px" });
    bands.forEach(function (b) { overhead.observe(b); });
  }

  /* the account number copies itself, because nobody enjoys typing ten digits */

  [].forEach.call(document.querySelectorAll("[data-copy]"), function (copyBtn) {
    if (!navigator.clipboard) return;
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(copyBtn.dataset.copy).then(function () {
        var tag = copyBtn.querySelector("em");
        var was = tag.textContent;
        tag.textContent = "Copied";
        setTimeout(function () { tag.textContent = was; }, 1800);
      });
    });
  });

  /* contents */
  var panel = document.getElementById("contents");
  var openBtn = document.getElementById("menuBtn");
  var closeBtn = document.getElementById("menuClose");

  function setPanel(open) {
    panel.setAttribute("data-open", open ? "1" : "0");
    openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.style.overflow = open ? "hidden" : "";
    (open ? closeBtn : openBtn).focus();
  }
  openBtn.addEventListener("click", function () { setPanel(true); });
  closeBtn.addEventListener("click", function () { setPanel(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.getAttribute("data-open") === "1") setPanel(false);
  });

  /* music, everywhere a guest goes. a phone will not start a song by itself,
     so this is a button that waits to be pressed, and it carries its place
     from page to page rather than starting over on each one.

     the admin and the gate never load this script, so they are already out.
     what is left to exclude is the page that says a pass was not found or has
     been cancelled, which marks itself quiet: offering somebody a song at the
     moment they are told they cannot come in is not the tone to strike. */
  if (document.body.hasAttribute("data-quiet")) return;

  fetch("/api/music", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.tracks || !data.tracks.length) return;
      buildPlayer(data.tracks, data.mode === "repeat");
    })
    .catch(function () {});

  function buildPlayer(tracks, repeatOne) {
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem("ks-music") || "{}"); } catch (e) {}

    var index = repeatOne ? 0 : Math.min(Number(saved.index) || 0, tracks.length - 1);
    var audio = new Audio();
    audio.preload = "none";          /* nothing downloads until they ask for it */
    audio.loop = repeatOne;
    audio.src = tracks[index].src;

    var button = document.createElement("button");
    button.className = "music-btn glass";
    button.type = "button";
    button.setAttribute("aria-label", "Play the music");
    button.innerHTML = noteMark();

    var live = document.createElement("span");
    live.className = "music-name";
    live.textContent = tracks[index].title;
    button.appendChild(live);
    document.body.appendChild(button);

    function remember() {
      try {
        sessionStorage.setItem("ks-music", JSON.stringify({
          index: index, at: audio.currentTime, playing: !audio.paused,
        }));
      } catch (e) {}
    }

    function paint() {
      var on = !audio.paused;
      button.setAttribute("data-playing", on ? "1" : "0");
      button.setAttribute("aria-label", on ? "Pause the music" : "Play the music");
      live.textContent = tracks[index].title;
    }

    button.addEventListener("click", function () {
      if (audio.paused) audio.play().catch(function () {});
      else audio.pause();
    });

    audio.addEventListener("play", paint);
    audio.addEventListener("pause", function () { paint(); remember(); });
    audio.addEventListener("timeupdate", function () {
      if (!audio.paused && Math.floor(audio.currentTime) % 3 === 0) remember();
    });
    audio.addEventListener("ended", function () {
      if (repeatOne) return;
      index = (index + 1) % tracks.length;
      audio.src = tracks[index].src;
      audio.play().catch(function () {});
      paint();
    });
    addEventListener("pagehide", remember);

    /* they pressed play on the other page, so pick it up where it stopped */
    if (saved.playing) {
      if (saved.at) audio.currentTime = Number(saved.at) || 0;
      audio.play().then(paint).catch(function () { paint(); });
    }
    paint();
    nudge(button, audio, tracks[index].title);
  }

  /* the button is small and quiet by design, so it says once what it is. once
     a visit, never again after it has been used or waved away. */
  function nudge(button, audio, title) {
    var seen;
    try { seen = sessionStorage.getItem("ks-music-nudge"); } catch (e) { seen = null; }
    if (seen || !audio.paused) return;
    /* not while they are filling in the form. it lands on the submit button,
       and getting a pass is the one thing on the site that has to go smoothly */
    if (document.getElementById("passForm")) return;

    var tip = document.createElement("div");
    tip.className = "music-tip glass";
    tip.setAttribute("role", "status");

    var words = document.createElement("p");
    words.className = "music-tip-words";
    words.textContent = "We chose " + title + " for our wedding. Tap to hear it.";

    var close = document.createElement("button");
    close.className = "music-tip-close";
    close.type = "button";
    close.setAttribute("aria-label", "No music, thank you");
    close.textContent = "×";

    tip.appendChild(words);
    tip.appendChild(close);
    document.body.appendChild(tip);

    /* it stays until it has been answered. an earlier version faded itself
       after eleven seconds and wrote down that it had been seen, so anyone who
       happened to be looking elsewhere never got told about the music again. */
    var timer = setTimeout(function () { tip.setAttribute("data-open", "1"); }, 2200);

    function dismiss() {
      clearTimeout(timer);
      tip.removeAttribute("data-open");
      try { sessionStorage.setItem("ks-music-nudge", "1"); } catch (e) {}
      setTimeout(function () { tip.remove(); }, 400);
    }

    close.addEventListener("click", function (event) {
      event.stopPropagation();
      dismiss();
    });
    button.addEventListener("click", dismiss);
    audio.addEventListener("play", dismiss);
  }

  function noteMark() {
    return '<svg class="music-ico" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor"' +
      ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M8 14V5l8-1.6V12"/><circle cx="6" cy="14.5" r="2"/><circle cx="14" cy="12.5" r="2"/></svg>' +
      '<span class="music-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
  }
})();
