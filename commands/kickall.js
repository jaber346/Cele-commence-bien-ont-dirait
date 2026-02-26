const config = require("../config");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
global.kickallJobs = global.kickallJobs || new Map();

function newsletterCtx() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: "120363423249667073@newsletter",
      newsletterName: config.BOT_NAME || "NOVA XMD V1",
      serverMessageId: 1,
    },
  };
}

// compare “numéro” (résout :device / formats)
function num(jid = "") {
  return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}
function isAdminByNumber(participants = [], jid = "") {
  const n = num(jid);
  const found = participants.find((p) => num(p.id) === n);
  return !!found?.admin;
}

module.exports = {
  name: "kickall",
  category: "Group",
  description: "Purifier le groupe (kick tous les non-admins) + stop",

  async execute(sock, m, args, { isGroup, isOwner, prefix } = {}) {
    const from = m.key.remoteJid;
    const sender = m.key.participant || m.sender;

    if (!isGroup) {
      return sock.sendMessage(from, { text: "❌ Groupe uniquement." }, { quoted: m });
    }

    // owner only (tu peux changer si tu veux)
    if (!isOwner) {
      return sock.sendMessage(from, { text: "🚫 Owner seulement." }, { quoted: m });
    }

    // évite double purge
    if (global.kickallJobs.has(from)) {
      return sock.sendMessage(
        from,
        {
          text: `⚠️ Purification déjà en cours.\nEnvoie *${prefix || "."}stop* pour arrêter.`,
          contextInfo: newsletterCtx(),
        },
        { quoted: m }
      );
    }

    const meta = await sock.groupMetadata(from);
    const participants = meta.participants || [];

    // bot admin ?
    const botId = String(sock.user?.id || "");
    const botIsAdmin = isAdminByNumber(participants, botId);
    if (!botIsAdmin) {
      return sock.sendMessage(
        from,
        { text: "❌ Je dois être *admin* pour purifier.", contextInfo: newsletterCtx() },
        { quoted: m }
      );
    }

    // sender admin ? (fix robuste)
    const senderIsAdmin = isAdminByNumber(participants, sender);
    if (!senderIsAdmin) {
      return sock.sendMessage(
        from,
        { text: "🚫 Seuls les *admins* peuvent lancer.", contextInfo: newsletterCtx() },
        { quoted: m }
      );
    }

    const job = { stop: false, startedBy: num(sender) };
    global.kickallJobs.set(from, job);

    await sock.sendMessage(
      from,
      {
        text:
`╭━━〔 🧹 PURIFICATION 〕━━╮
┃ Groupe : ${meta.subject || "Groupe"}
┃ Début dans : 3 secondes…
┃ ✅ Stop : *${prefix || "."}stop*
╰━━━━━━━━━━━━━━━━━━━━━━╯`,
        contextInfo: newsletterCtx(),
      },
      { quoted: m }
    );

    for (let i = 3; i >= 1; i--) {
      if (job.stop) {
        global.kickallJobs.delete(from);
        return sock.sendMessage(from, { text: "🛑 Purification annulée.", contextInfo: newsletterCtx() }, { quoted: m });
      }
      await delay(1000);
    }

    await sock.sendMessage(
      from,
      {
        text:
`╭━━〔 🧹 PURIFICATION 〕━━╮
┃ ✅ Début…
┃ ℹ️ Admins ignorés.
╰━━━━━━━━━━━━━━━━━━━━━━╯`,
        contextInfo: newsletterCtx(),
      },
      { quoted: m }
    );

    const admins = participants.filter((p) => p.admin).map((p) => p.id);

    const targets = participants
      .map((p) => p.id)
      .filter((jid) => !isAdminByNumber(participants, jid) && num(jid) !== num(botId));

    let removed = 0;

    for (const user of targets) {
      if (job.stop) {
        global.kickallJobs.delete(from);
        return sock.sendMessage(
          from,
          {
            text: `🛑 Purification stoppée.\n✅ Supprimés : ${removed}/${targets.length}`,
            contextInfo: newsletterCtx(),
          },
          { quoted: m }
        );
      }

      try {
        await sock.groupParticipantsUpdate(from, [user], "remove");
        removed++;
      } catch {}

      await delay(1100);
    }

    global.kickallJobs.delete(from);

    return sock.sendMessage(
      from,
      {
        text:
`✅ *GROUPE PURIFIÉ AVEC SUCCÈS*
👥 Groupe : ${meta.subject || "Groupe"}
🧹 Membres supprimés : ${removed}
🛡️ Admins ignorés : ${admins.length}`,
        contextInfo: newsletterCtx(),
      },
      { quoted: m }
    );
  },
};