/* Engine page — E2E chat lab: two phones + relay attacker view */
(function () {
  var chatA = document.getElementById("chatA");
  var chatB = document.getElementById("chatB");
  if (!chatA || !chatB) return;

  var inputA = document.getElementById("inputA");
  var inputB = document.getElementById("inputB");
  var sendA = document.getElementById("sendA");
  var sendB = document.getElementById("sendB");
  var relayLog = document.getElementById("relayLog");
  var seq = 0;

  function now() {
    var d = new Date();
    return d.toTimeString().slice(0, 8);
  }
  function cipher(len) {
    var chars = "0123456789abcdef", out = "";
    for (var i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 16)];
    return out;
  }
  function lang() {
    return document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en";
  }
  function addMsg(box, side, text, status, cls) {
    var div = document.createElement("div");
    div.className = "msg " + side;
    div.textContent = text;
    if (status) {
      var st = document.createElement("span");
      st.className = "mstatus " + (cls || "ok");
      st.textContent = status;
      div.appendChild(st);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  function addCipherMsg(box, text, ctext) {
    var div = document.createElement("div");
    div.className = "msg me";
    div.textContent = text;
    var c = document.createElement("span");
    c.className = "cipher";
    c.textContent = ctext;
    div.appendChild(c);
    var st = document.createElement("span");
    st.className = "mstatus lock";
    st.textContent = "🔒 AES-256-GCM · AAD(src,dst,seq)";
    div.appendChild(st);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  function relayLine(html) {
    if (!relayLog) return;
    var div = document.createElement("div");
    div.className = "rl-line";
    div.innerHTML = '<span class="t">[' + now() + ']</span> ' + html;
    relayLog.appendChild(div);
    relayLog.scrollTop = relayLog.scrollHeight;
  }

  function send(from) {
    var input = from === "A" ? inputA : inputB;
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    seq += 1;

    var senderBox = from === "A" ? chatA : chatB;
    var receiverBox = from === "A" ? chatB : chatA;
    var senderName = from === "A" ? "Alice" : "Bob";
    var fp = from === "A" ? "e7:21:…:8d" : "a3:9f:…:c2";
    var ct = cipher(46) + "…";

    /* sender sees plaintext + ciphertext preview */
    addCipherMsg(senderBox, text, ct);

    /* relay logs the frame — noise only */
    relayLine('<span class="k">MSG</span> from=<span class="v">' + fp + '</span> seq=' + seq + ' len=' + (text.length * 2 + 88) + 'B');
    relayLine('&nbsp;&nbsp;payload=<span class="v">' + ct.slice(0, 38) + '…</span> <span class="warn">' + (lang() === "zh" ? "不可读" : "unreadable") + '</span>');

    /* receiver decrypts after transit */
    setTimeout(function () {
      addMsg(receiverBox, "peer", text, "✓ " + senderName + " · sig ✓ · seq " + seq + " ✓", "ok");
      relayLine('<span class="k">ACK</span> to=<span class="v">' + fp + '</span> <span class="ok">delivered</span> <span class="warn">0 stored</span>');
    }, 620);
  }

  if (sendA) sendA.addEventListener("click", function () { send("A"); });
  if (sendB) sendB.addEventListener("click", function () { send("B"); });
  if (inputA) inputA.addEventListener("keydown", function (e) { if (e.key === "Enter") send("A"); });
  if (inputB) inputB.addEventListener("keydown", function (e) { if (e.key === "Enter") send("B"); });

  /* quick chips */
  document.querySelectorAll(".chip[data-msg]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var input = chip.closest(".sp-screen").querySelector("input");
      if (input) {
        input.value = chip.getAttribute(lang() === "zh" ? "data-zh" : "data-msg") || chip.getAttribute("data-msg");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        input.focus();
      }
    });
  });

  /* seed conversation */
  setTimeout(function () {
    addMsg(chatA, "me", lang() === "zh" ? "今晚的密钥派对来吗？🔑" : "Coming to the key party tonight? 🔑");
    relayLine('<span class="k">MSG</span> from=<span class="v">e7:21:…:8d</span> seq=1 <span class="warn">' + (lang() === "zh" ? "密文转发" : "ciphertext relayed") + '</span>');
  }, 500);
  setTimeout(function () {
    addMsg(chatB, "peer", lang() === "zh" ? "来！消息已端到端加密 ✨" : "In! This message is E2E encrypted ✨", "✓ Alice · sig ✓ · seq 1 ✓", "ok");
  }, 1200);
})();
