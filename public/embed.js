(function () {
  var script = document.currentScript;
  if (!script || !script.src) return;
  var host = new URL(script.src, window.location.href).origin;
  var mode = script.getAttribute("data-mode") === "inline" ? "inline" : "floating";
  var target = script.getAttribute("data-target") || "#chat-slot";
  var MESSAGE = "illawarra-chat";
  var HOST_MESSAGE = "illawarra-chat-host";

  function frame(src) {
    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "Illawarra Dentists chat";
    iframe.setAttribute("allow", "microphone");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "origin");
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.style.colorScheme = "normal";
    return iframe;
  }

  function mobile() {
    if (window.matchMedia) return window.matchMedia("(max-width: 640px)").matches;
    return window.innerWidth <= 640;
  }

  if (mode === "inline") {
    var slot = null;
    try {
      slot = document.querySelector(target);
    } catch (_error) {
      slot = null;
    }
    if (!slot) return;
    var inlineFrame = frame(host + "/embed?inline=1");
    inlineFrame.style.width = "100%";
    inlineFrame.style.height = "100%";
    inlineFrame.style.minHeight = "640px";
    inlineFrame.style.display = "block";
    slot.appendChild(inlineFrame);
    return;
  }

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.textContent = "Ask the clinics";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "illawarra-chat-frame");
  launcher.style.position = "fixed";
  launcher.style.right = "20px";
  launcher.style.bottom = "20px";
  launcher.style.zIndex = "2147483000";
  launcher.style.border = "0";
  launcher.style.borderRadius = "999px";
  launcher.style.padding = "14px 18px";
  launcher.style.background = "#0d1b22";
  launcher.style.color = "#f5f2ec";
  launcher.style.font = "600 15px/1.2 Inter Tight, Segoe UI, sans-serif";
  launcher.style.cursor = "pointer";
  launcher.style.boxShadow = "0 14px 40px rgba(13, 27, 34, 0.28)";

  var iframe = frame(host + "/embed?open=1");
  iframe.id = "illawarra-chat-frame";
  iframe.style.position = "fixed";
  iframe.style.zIndex = "2147483001";
  iframe.style.display = "none";
  document.body.appendChild(launcher);
  document.body.appendChild(iframe);

  var open = false;

  function place() {
    var full = open && mobile();
    if (full) {
      iframe.style.top = "0";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.left = "0";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.borderRadius = "0";
      iframe.style.boxShadow = "none";
      return;
    }
    iframe.style.top = "auto";
    iframe.style.left = "auto";
    iframe.style.right = "20px";
    iframe.style.bottom = "84px";
    iframe.style.width = "min(400px, calc(100vw - 24px))";
    iframe.style.height = "min(640px, calc(100dvh - 112px))";
    iframe.style.borderRadius = "28px";
    iframe.style.boxShadow = "0 24px 70px rgba(13, 27, 34, 0.22)";
  }

  function tell(type) {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ source: HOST_MESSAGE, type: type }, host);
  }

  function setOpen(next) {
    open = next;
    iframe.style.display = open ? "block" : "none";
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    launcher.textContent = open ? "Close chat" : "Ask the clinics";
    place();
    if (open) tell("open");
  }

  launcher.addEventListener("click", function () {
    setOpen(!open);
  });

  window.addEventListener("resize", function () {
    if (open) place();
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== host) return;
    if (event.source && iframe.contentWindow && event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || data.source !== MESSAGE) return;
    if (data.type === "close") setOpen(false);
    else if (data.type === "open") setOpen(true);
    else if (data.type === "resize" && open && !mobile()) {
      var width = Number(data.width);
      var height = Number(data.height);
      if (width > 0) iframe.style.width = Math.min(width, window.innerWidth - 24) + "px";
      if (height > 0) iframe.style.height = Math.min(height, window.innerHeight - 112) + "px";
    }
  });
})();
