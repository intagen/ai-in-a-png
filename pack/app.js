(function () {
  function tokenize(text) {
    return (text || "").toLowerCase().match(/[a-z0-9']+/g) || [];
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function predictIntent(email, model) {
    const toks = tokenize(email);
    const counts = new Map();
    for (const t of toks) counts.set(t, (counts.get(t) || 0) + 1);

    if (!model._stoi) {
      const m = new Map();
      for (let i = 0; i < model.vocab.length; i++) m.set(model.vocab[i], i);
      model._stoi = m;
    }

    let zq = model.bq;
    for (const [w, c] of counts.entries()) {
      const j = model._stoi.get(w);
      if (j !== undefined) zq += model.Wq[j] * c;
    }

    const z = zq * model.scale;
    const pScheduling = sigmoid(z);
    const label = pScheduling >= 0.5 ? "scheduling" : "other";
    return { label, pScheduling };
  }

  function extractSlots(email) {
    const t = (email || "").toLowerCase();
    const tzMatch = email.match(/\b(UTC|GMT|CET|CEST|EET|EEST|PST|PDT|MST|MDT|CST|CDT|EST|EDT|BST|IST|SGT|HKT|JST|AEST|AEDT)\b/);
    const timezone = tzMatch ? tzMatch[1] : "";

    const durMatch = email.match(/\b(\d{1,3})\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b/i);
    let duration = "";
    if (durMatch) {
      const n = parseInt(durMatch[1], 10);
      const unit = durMatch[2].toLowerCase();
      duration = unit.startsWith("h") ? `${n} hour${n === 1 ? "" : "s"}` : `${n} min`;
    }

    const dayTokens = ["mon", "monday", "tue", "tues", "tuesday", "wed", "wednesday", "thu", "thur", "thurs", "thursday", "fri", "friday", "sat", "saturday", "sun", "sunday"];
    const dayFound = dayTokens.filter(d => t.includes(d));

    const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/ig;
    const times = [];
    let m;
    while ((m = timeRegex.exec(email)) !== null) {
      const hh = m[1];
      const mm = m[2] || "00";
      const ap = m[3].toUpperCase();
      times.push(`${hh}:${mm} ${ap}`);
    }

    return {
      timezone,
      duration,
      dayMentions: Array.from(new Set(dayFound)).map(capitalizeDay).slice(0, 2),
      timeMentions: Array.from(new Set(times)).slice(0, 2),
      missingTimezone: !timezone,
      missingDuration: !duration
    };
  }

  function capitalizeDay(d) {
    const map = {
      mon: "Mon", monday: "Mon",
      tue: "Tue", tues: "Tue", tuesday: "Tue",
      wed: "Wed", wednesday: "Wed",
      thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
      fri: "Fri", friday: "Fri",
      sat: "Sat", saturday: "Sat",
      sun: "Sun", sunday: "Sun"
    };
    return map[d] || d.charAt(0).toUpperCase() + d.slice(1);
  }

  function proposeWindows(slots) {
    const tz = slots.timezone ? ` ${slots.timezone}` : "";
    const day = slots.dayMentions[0] || "";
    const prefix = day ? `${day} ` : "";

    if (slots.timeMentions.length >= 2) {
      return [`${prefix}${slots.timeMentions[0]}${tz}`, `${prefix}${slots.timeMentions[1]}${tz}`];
    } else if (slots.timeMentions.length === 1) {
      return [`${prefix}${slots.timeMentions[0]}${tz}`];
    }

    return [`Tue 10:00-10:30${tz}`, `Thu 15:00-15:30${tz}`];
  }

  function composeReplies(intent, p, slots, model) {
    const signName = model.sign_name || "Pawel";
    const windows = proposeWindows(slots);
    const durationHint = slots.duration ? ` for ${slots.duration}` : "";
    const timeChoice = windows.length > 1 ? `${windows[0]} or ${windows[1]}` : windows[0];

    const needAsk = [];
    if (slots.missingTimezone) needAsk.push("What timezone are you in?");
    if (slots.missingDuration) needAsk.push("How long should we book? (15 or 30 min?)");
    const askLine = needAsk.length ? ("\n\n" + needAsk.join("\n")) : "";

    if (intent !== "scheduling") {
      const fallback =
        `Hi there,

Thanks for your email. This tiny assistant is tuned for scheduling requests. If you are trying to set up time, please share your timezone and a couple of time options.

Best,
${signName}`;
      return [{ title: `Fallback (p=${p.toFixed(2)})`, text: fallback }];
    }

    const shortText =
      `Hi there,

Happy to chat. I can do ${timeChoice}${durationHint}. Which works best?${askLine}

Best,
${signName}`;

    const friendlyText =
      `Hi there,

Thanks for reaching out, happy to connect. I can do ${timeChoice}${durationHint}. If it doesn't work, share 2-3 times that suit you and I will confirm.${askLine}

Best,
${signName}`;

    const firmText =
      `Hi there,

Thanks. I can do ${timeChoice}${durationHint}. I am booked outside that window this week, so please confirm and I will send an invite.${askLine}

Best,
${signName}`;

    return [
      { title: `Short (p=${p.toFixed(2)})`, text: shortText },
      { title: `Friendly (p=${p.toFixed(2)})`, text: friendlyText },
      { title: `Firm (p=${p.toFixed(2)})`, text: firmText },
    ];
  }

  window.__AIPNG_DRAFT = function (email) {
    const model = api.payload.model;
    const pred = predictIntent(email, model);
    const slots = extractSlots(email);

    api.setChips([
      { level: "ok", text: `ML intent: ${pred.label} (p=${pred.pScheduling.toFixed(2)})` },
      { level: slots.timezone ? "ok" : "warn", text: slots.timezone ? `Timezone: ${slots.timezone}` : "Timezone: missing" },
      { level: slots.duration ? "ok" : "warn", text: slots.duration ? `Duration: ${slots.duration}` : "Duration: missing" },
      { level: slots.timeMentions.length ? "ok" : "warn", text: slots.timeMentions.length ? `Times: ${slots.timeMentions.join(", ")}` : "Times: none" },
      { level: "ok", text: `Model: LogReg, vocab=${model.vocab.length}` },
    ]);

    api.setReplies(composeReplies(pred.label, pred.pScheduling, slots, model));
  };

  api.setChips([{ level: "ok", text: "PNG loaded. This one includes a trained ML intent model." }]);
})();
