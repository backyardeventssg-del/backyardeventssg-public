// Public site backend. Serves only what visitors need: events, images, booking requests.
// It has no admin features and no password. Needs D1 binding "DB" and R2 binding "BUCKET".
// Optional secret HITPAY_SALT lets HitPay tell us a booking was paid (signature is checked).
const J = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const CATS = ["Food & beverage", "Jewellery & accessories", "Fashion & apparel", "Art & prints", "Home & living", "Beauty & wellness", "Plants & florals", "Kids & toys", "Stationery & crafts", "Zero-waste & sustainable", "Other"];
// Site content (hero, FAQ, contact details, categories...) saved from the admin. Safe if the table doesn't exist yet.
async function getSite(db) {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'site'").first();
    return row ? parse(row.value, {}) : {};
  } catch { return {}; }
}
const catsOf = (site) => (Array.isArray(site.cats) && site.cats.length ? site.cats : CATS);
const NOT_HELD = "('Cancelled','Waitlist','Applied','Declined')"; // statuses that don't use up a booth
const evOut = (r, vend = []) => {
  const o = { ...r, booths: parse(r.booths, []), images: parse(r.images, []), apply: r.apply ? 1 : 0 };
  delete o.pack; delete o.pack_token; // the vendor info pack is only given out through its private link
  const seen = new Set();
  o.vendors = vend.filter((v) => v.event_id === r.id && !seen.has(v.business.toLowerCase()) && seen.add(v.business.toLowerCase()))
    .map((v) => ({ business: v.business, category: v.category, social: v.social }));
  return o;
};

// Optional emails through Resend (resend.com). Does nothing until RESEND_API_KEY, MAIL_FROM are set.
async function sendMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, text }),
    });
  } catch { /* an email problem must never lose a booking */ }
}
const owners = (env) => String(env.NOTIFY_EMAIL || "").split(",").map((x) => x.trim()).filter(Boolean);

async function signedBy(raw, sig, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((x) => x.toString(16).padStart(2, "0")).join("");
  return sig.length === hex.length && [...hex].reduce((n, c, i) => n | (c.charCodeAt(0) ^ sig.charCodeAt(i)), 0) === 0;
}

export async function onRequest({ request: r, env, params }) {
  const [a, id] = params.path || [];
  const m = r.method;
  const db = env.DB;

  try {
    if (a === "events" && m === "GET") {
      const { results } = await db
        .prepare(
          `SELECT e.*, COALESCE((SELECT SUM(qty) FROM bookings b
             WHERE b.event_id = e.id AND b.status NOT IN ${NOT_HELD}), 0) AS booked
           FROM events e ORDER BY start_date`
        ).all();
      let vend = [];
      try {
        vend = (await db.prepare("SELECT event_id, business, category, social FROM bookings WHERE show_public = 1 AND business != '' AND status IN ('Approved','Paid') ORDER BY lower(business)").all()).results;
      } catch { /* upgrade.sql not run yet */ }
      return J(results.map((r) => evOut(r, vend)));
    }

    // Private vendor info pack: only works with the secret link the admin copies for each event.
    if (a === "pack" && id && m === "GET") {
      const row = await db.prepare("SELECT title, pack, pack_token FROM events WHERE id = ?").bind(id).first();
      const t = new URL(r.url).searchParams.get("t") || "";
      if (!row || !row.pack || !row.pack_token || t !== row.pack_token) return J({ error: "This link isn't valid." }, 404);
      return new Response(JSON.stringify({ title: row.title, pack: row.pack }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }

    // Shoppers joining the WhatsApp list.
    if (a === "subscribe" && m === "POST") {
      const b = await r.json();
      if (b.website) return J({ ok: true });
      const name = String(b.name || "").trim().slice(0, 80);
      let n = String(b.phone || "").replace(/\D/g, "");
      if (n.length === 8) n = "65" + n;
      if (!name || n.length < 9 || n.length > 15) return J({ error: "Please add your name and a valid WhatsApp number." }, 400);
      if (b.consent !== true) return J({ error: "Please tick the box so we know you're happy to hear from us." }, 400);
      await db.prepare("INSERT INTO subscribers (name, phone) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name").bind(name, n).run();
      return J({ ok: true }, 201);
    }

    if (a === "settings" && m === "GET") {
      const site = await getSite(db);
      return new Response(JSON.stringify(site), { headers: { "content-type": "application/json", "cache-control": "public, max-age=30" } });
    }

    if (a === "img" && id && m === "GET") {
      const o = await env.BUCKET.get(id);
      if (!o) return new Response("Not found", { status: 404 });
      return new Response(o.body, {
        headers: {
          "content-type": o.httpMetadata?.contentType || "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (a === "book" && m === "POST") {
      const b = await r.json();
      if (b.website) return J({ ok: true }); // spam trap: real people leave this empty
      const name = (b.name || "").trim().slice(0, 100);
      const phone = (b.phone || "").trim().slice(0, 30);
      if (!name || !phone || !b.event_id) return J({ error: "Name, phone and event are needed." }, 400);
      const ev = await db.prepare("SELECT * FROM events WHERE id = ?").bind(b.event_id).first();
      if (!ev) return J({ error: "That event no longer exists." }, 404);
      const email = (b.email || "").trim().slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return J({ error: "A valid email address is needed." }, 400);
      const site = await getSite(db);
      const terms = site.terms && site.terms.text ? site.terms : null;
      if (terms && b.terms !== true) return J({ error: "Please accept the terms to continue." }, 400);
      const cats = catsOf(site);
      const category = cats.includes(b.category) ? b.category : (cats.includes("Other") ? "Other" : cats[cats.length - 1]);
      const duration = b.duration === "Full week" ? "Full week" : "Weekend";
      const qty = Math.min(Math.max(+b.qty || 1, 1), 20);
      const social = String(b.social || "").trim().slice(0, 200);
      const note = (b.note || "").slice(0, 500);
      if (ev.apply && (!social || !note.trim())) return J({ error: "This market is by application. Please add a link to your products and tell us what you sell." }, 400);
      const booth = parse(ev.booths, []).find((x) => x.name === b.booth_type);
      const price = booth ? (duration === "Full week" ? +booth.week : +booth.weekend) || 0 : 0;
      const held = (await db.prepare(`SELECT COALESCE(SUM(qty),0) AS n FROM bookings WHERE event_id = ? AND status NOT IN ${NOT_HELD}`).bind(ev.id).first()).n;
      let status = "New";
      if (ev.apply) status = "Applied";
      else if (ev.slots > 0 && held + qty > ev.slots) status = "Waitlist";
      const business = (b.business || "").slice(0, 100);
      const when = new Date().toISOString();
      try {
        await db
          .prepare("INSERT INTO bookings (event_id, booth_type, duration, total, name, business, phone, email, social, category, qty, note, status, terms_at, terms_ver) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(ev.id, (b.booth_type || "").slice(0, 80), duration, price * qty, name, business, phone, email, social, category, qty, note, status,
                terms ? when : "", terms ? String(terms.ver || "") : "").run();
      } catch {
        // Database not upgraded yet (see upgrade.sql): still save the booking the old way.
        await db
          .prepare("INSERT INTO bookings (event_id, booth_type, duration, total, name, business, phone, email, social, category, qty, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(ev.id, (b.booth_type || "").slice(0, 80), duration, price * qty, name, business, phone, email, social, category, qty, note).run();
      }
      // Keep a contact list: add the vendor, or update their brand details if we already know them.
      try {
        const digits = phone.replace(/\D/g, "");
        const known = await db
          .prepare("SELECT id FROM contacts WHERE (? != '' AND lower(email) = lower(?)) OR (? != '' AND replace(replace(replace(replace(phone, ' ', ''), '+', ''), '-', ''), '(', '') = ?) LIMIT 1")
          .bind(email, email, digits, digits).first();
        if (known) {
          await db.prepare("UPDATE contacts SET category = ?, business = COALESCE(NULLIF(?, ''), business), social = COALESCE(NULLIF(?, ''), social) WHERE id = ?")
            .bind(category, business, social, known.id).run();
        } else {
          await db.prepare("INSERT INTO contacts (name, business, category, phone, email, social) VALUES (?,?,?,?,?,?)")
            .bind(name, business, category, phone, email, social).run();
        }
      } catch (e) { /* a contacts problem must never lose a booking */ }

      // Emails (only if Resend is set up): a heads-up to you, and a receipt for the vendor.
      const wa = (site.contact && site.contact.wa) || env.WA_NUMBER || "6590267588";
      const what = `${ev.title}: ${qty} x ${b.booth_type || "booth"}, ${duration}` + (price ? `, total $${price * qty}` : "");
      await sendMail(env, owners(env), `New ${status === "New" ? "booking" : status.toLowerCase()}: ${business || name}`,
        `${status === "New" ? "New booking request" : "New " + status.toLowerCase() + " entry"}\n\n${what}\n\nName: ${name}\nBrand: ${business}\nCategory: ${category}\nWhatsApp: ${phone}\nEmail: ${email}\nLink: ${social}\nNote: ${note}\n\nOpen your admin site to reply.`);
      const next = status === "Applied" ? "We'll look through your application and reply on WhatsApp."
        : status === "Waitlist" ? "This market is currently full, so you're on our waitlist. If a space opens up, we'll message you on WhatsApp."
        : `To confirm, please message us on WhatsApp: https://wa.me/${wa}\nOnce confirmed, we'll send you a PayNow link for the exact amount.`;
      await sendMail(env, email, `We got your request: ${ev.title}`,
        `Hi ${name},\n\nThanks for your interest in ${ev.title}.\n\n${what}\n\n${next}\n\nBackyard Events SG`);
      return J({ ok: true, total: price * qty, duration, status }, 201);
    }

    // HitPay tells us a payment went through. Handles both kinds of HitPay callback:
    // new webhooks (JSON + Hitpay-Signature) and the older payment-request callback (form + hmac).
    if (a === "hitpay" && m === "POST") {
      const raw = await r.text();
      const sig = (r.headers.get("hitpay-signature") || "").toLowerCase();
      let ref = "", status = "";
      if (sig) {
        const salt = env.HITPAY_WEBHOOK_SALT || env.HITPAY_SALT;
        if (!salt || !(await signedBy(raw, sig, salt))) return J({ error: "Bad signature." }, 401);
        let p = {};
        try { p = JSON.parse(raw); } catch { return J({ ok: true }); }
        ref = String(p.reference_number || p.payment_request?.reference_number || "");
        status = String(p.status || p.payment_request?.status || "").toLowerCase();
      } else {
        const f = new URLSearchParams(raw);
        const hm = (f.get("hmac") || "").toLowerCase();
        const body = [...f.keys()].filter((k) => k !== "hmac").sort().map((k) => k + f.get(k)).join("");
        if (!env.HITPAY_SALT || !hm || !(await signedBy(body, hm, env.HITPAY_SALT))) return J({ error: "Bad signature." }, 401);
        ref = String(f.get("reference_number") || "");
        status = String(f.get("status") || "").toLowerCase();
      }
      const bid = /^BYE-(\d+)$/.exec(ref)?.[1];
      if (bid && ["completed", "succeeded"].includes(status)) {
        const res = await db.prepare("UPDATE bookings SET status = 'Paid' WHERE id = ? AND pay_id != '' AND status != 'Paid'").bind(bid).run();
        if (res.meta && res.meta.changes) {
          const b = await db.prepare("SELECT b.*, e.title AS t FROM bookings b LEFT JOIN events e ON e.id = b.event_id WHERE b.id = ?").bind(bid).first();
          if (b) await sendMail(env, owners(env), `Payment received: ${b.business || b.name}`, `${b.business || b.name} paid $${b.total} for ${b.t}. The booking is now marked Paid.`);
        }
      }
      return J({ ok: true });
    }

    return J({ error: "Not found." }, 404);
  } catch (err) {
    return J({ error: "Something went wrong on our side." }, 500);
  }
}
