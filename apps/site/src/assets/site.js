/* global document, window, fetch */
/* Orynt site: mobile menu + contact form. No dependencies, no tracking, no cookies. */
(function () {
  "use strict";

  // ---- mobile menu -----------------------------------------------------------------------------------
  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("is-open", open);
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia("(min-width: 940px)").addEventListener("change", function (e) {
      if (e.matches) setOpen(false);
    });
  }

  // ---- contact form ----------------------------------------------------------------------------------
  var form = document.getElementById("lead-form");
  if (!form) return;
  var endpoint = form.getAttribute("data-endpoint");
  var status = document.getElementById("form-status");
  var button = form.querySelector("button[type=submit]");
  var labels = { name: "name", email: "email", organization: "organisation", message: "message", consent: "consent" };

  function showStatus(kind, title, text) {
    status.hidden = false;
    status.className = "form-status form-status--" + (kind === "ok" ? "ok" : "err");
    status.setAttribute("role", kind === "ok" ? "status" : "alert");
    status.innerHTML = "";
    var strong = document.createElement("strong");
    strong.textContent = title;
    var p = document.createElement("p");
    p.textContent = text;
    status.appendChild(strong);
    status.appendChild(p);
    status.setAttribute("tabindex", "-1");
    status.focus();
  }
  function clearErrors() {
    Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function (el) {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
    Array.prototype.forEach.call(form.querySelectorAll(".field__error"), function (el) {
      el.textContent = "";
    });
    status.hidden = true;
  }
  function fieldError(name, message) {
    var input = form.elements[name];
    var out = document.getElementById("err-" + name);
    if (!input || !out) return false;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", out.id);
    out.textContent = message;
    return true;
  }
  function validate() {
    var bad = [];
    var f = form.elements;
    if (!f.name.value.trim()) bad.push(["name", "Please enter your name."]);
    var email = f.email.value.trim();
    if (!email) bad.push(["email", "Please enter your email address."]);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad.push(["email", "That does not look like an email address."]);
    if (!f.consent.checked) bad.push(["consent", "Please tick the box so we may reply to you."]);
    return bad;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();
    var bad = validate();
    if (bad.length) {
      bad.forEach(function (b) { fieldError(b[0], b[1]); });
      form.elements[bad[0][0]].focus();
      return;
    }
    var f = form.elements;
    var payload = {
      email: f.email.value.trim(),
      name: f.name.value.trim(),
      organization: f.organization.value.trim(),
      message: f.message.value.trim(),
      consent: true,
      source: "site"
    };
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    var original = button.textContent;
    button.textContent = "Sending…";

    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (res.status === 201 || res.ok) {
          form.reset();
          showStatus("ok", "Thank you. Your request was received.", "This is a one-person project, so replies can take a few days. Nothing was charged and no account was created.");
          return;
        }
        return res.json().catch(function () { return {}; }).then(function (problem) {
          var shown = false;
          if (res.status === 422 && Array.isArray(problem.errors)) {
            problem.errors.forEach(function (er) {
              var key = String(er.path || "").split(".")[0];
              if (labels[key] && fieldError(key, er.message || "Please check this field.")) shown = true;
            });
          }
          if (shown) {
            showStatus("err", "Please check the highlighted fields.", "Your request was not accepted yet.");
          } else if (res.status === 429) {
            showStatus("err", "Too many requests.", "Please wait a minute and try again.");
          } else {
            showStatus("err", "Sorry, we could not send your request.", "Please try again later; the service may be unavailable. (HTTP " + res.status + (problem.request_id ? ", request " + problem.request_id : "") + ")");
          }
        });
      })
      .catch(function () {
        showStatus("err", "Could not reach the server.", "Check your connection and try again. We could not confirm that your request was sent.");
      })
      .then(function () {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = original;
      });
  });
})();
