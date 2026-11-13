// Classic (non-module) startup check. Runs even where ES modules cannot load (for example a
// file:// address) and replaces a blank screen with a clear explanation.
(function () {
  var root = document.getElementById("root");
  function show(title, paragraphs, detail) {
    window.__ccBlocked = true;
    var html = '<div class="fatal card" role="alert"><h1>' + title + "</h1>";
    for (var i = 0; i < paragraphs.length; i++) html += "<p>" + paragraphs[i] + "</p>";
    if (detail) html += "<pre>" + String(detail).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) + "</pre>";
    html += '<p><a href="docs/INSTALL.html">Installation instructions</a></p></div>';
    root.innerHTML = html;
  }
  window.__ccShowFatal = show;
  if (location.protocol === "file:") {
    show("Open Case Compass from a web address", [
      "This file was opened directly from your device (a <code>file://</code> address). Browsers block the encryption, storage, and offline features Case Compass needs in that mode, so the app will not run this way.",
      "<b>On a computer:</b> open a terminal in the Case Compass folder and run <code>python3 -m http.server 8080</code>, then visit <code>http://localhost:8080</code>. Or use the hosted HTTPS address.",
      "<b>On iPhone or iPad:</b> open the hosted HTTPS address in Safari, then choose Share › Add to Home Screen."
    ]);
    return;
  }
  var problems = [];
  if (!window.isSecureContext) problems.push("This page is not on a secure (HTTPS) address. Browsers only allow encryption and offline storage on HTTPS or on localhost.");
  if (!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues)) problems.push("This browser does not provide the Web Crypto features needed to encrypt your records.");
  if (!window.indexedDB) problems.push("This browser is not allowing local storage (IndexedDB). Private browsing modes and some privacy settings block it.");
  if (problems.length) {
    show("Secure storage is not available", problems.concat(["Case Compass will not store anything without encryption. Please open it over HTTPS in a current version of Safari, Chrome, Edge, or Firefox, outside private browsing."]));
    return;
  }
  window.__ccBootTimer = setTimeout(function () {
    if (!window.__ccStarted) show("Case Compass did not start", ["The application files did not finish loading. Check your connection and reload the page. If the problem continues, the app files may be incomplete."]);
  }, 15000);
  window.addEventListener("error", function (e) {
    if (!window.__ccStarted && e && e.message) show("Case Compass could not start", ["An error stopped the app from loading. Reloading the page usually fixes this."], e.message);
  });
})();
