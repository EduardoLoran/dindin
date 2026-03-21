const net = require("node:net");
const tls = require("node:tls");
const { HOST, PORT, SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_SECURE, SMTP_USER } = require("../config");
const { clientError } = require("../lib/errors");

function createPasswordResetLink(request, rawToken) {
  const host = request.headers.host || `${HOST}:${PORT}`;
  return `http://${host}/redefinir-senha?token=${encodeURIComponent(rawToken)}`;
}

function isSmtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

async function deliverPasswordResetEmail(email, displayName, resetLink) {
  if (!isSmtpConfigured()) {
    throw clientError("Envio de e-mail ainda nao configurado no servidor. Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM.");
  }

  const subject = "Redefinicao de senha do Dindin";
  const body = [
    `Oi, ${displayName || "usuario"}.`,
    "",
    "Recebemos um pedido para redefinir sua senha no Dindin.",
    "Use o link abaixo em ate 60 minutos:",
    resetLink,
    "",
    "Se voce nao pediu essa alteracao, ignore este e-mail.",
  ].join("\r\n");

  await sendSmtpMail({
    to: email,
    subject,
    text: body,
  });
}

async function sendSmtpMail({ to, subject, text }) {
  let socket = await openSmtpSocket();

  try {
    await readSmtpResponse(socket);
    let ehloResponse = await sendSmtpCommand(socket, "EHLO localhost");

    if (!SMTP_SECURE && /STARTTLS/i.test(ehloResponse)) {
      await sendSmtpCommand(socket, "STARTTLS");
      socket = await upgradeSocketToTls(socket);
      ehloResponse = await sendSmtpCommand(socket, "EHLO localhost");
    }

    await sendSmtpCommand(socket, "AUTH LOGIN");
    await sendSmtpCommand(socket, Buffer.from(SMTP_USER, "utf8").toString("base64"));
    await sendSmtpCommand(socket, Buffer.from(SMTP_PASS, "utf8").toString("base64"));
    await sendSmtpCommand(socket, `MAIL FROM:<${SMTP_FROM}>`);
    await sendSmtpCommand(socket, `RCPT TO:<${to}>`);
    await sendSmtpCommand(socket, "DATA");

    const payload = buildSmtpMessage({ to, subject, text });
    socket.write(`${payload}\r\n.\r\n`);
    await readSmtpResponse(socket);
    await sendSmtpCommand(socket, "QUIT");
  } finally {
    socket.end();
  }
}

function openSmtpSocket() {
  return new Promise((resolve, reject) => {
    const socket = SMTP_SECURE
      ? tls.connect(SMTP_PORT, SMTP_HOST, { servername: SMTP_HOST })
      : net.createConnection(SMTP_PORT, SMTP_HOST);

    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.removeListener("error", reject);
      resolve(socket);
    });
    socket.once("secureConnect", () => {
      socket.removeListener("error", reject);
      resolve(socket);
    });
  });
}

function upgradeSocketToTls(socket) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: SMTP_HOST,
    });

    secureSocket.setEncoding("utf8");
    secureSocket.once("error", reject);
    secureSocket.once("secureConnect", () => {
      secureSocket.removeListener("error", reject);
      resolve(secureSocket);
    });
  });
}

function sendSmtpCommand(socket, command) {
  socket.write(`${command}\r\n`);
  return readSmtpResponse(socket);
}

function readSmtpResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";

    function cleanup() {
      socket.off("data", onData);
      socket.off("error", onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      buffer += chunk;
      const lines = buffer.split("\r\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";

      if (!/^\d{3} /.test(lastLine)) {
        return;
      }

      cleanup();

      if (!/^[23]/.test(lastLine)) {
        reject(new Error(lastLine));
        return;
      }

      resolve(buffer);
    }

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function buildSmtpMessage({ to, subject, text }) {
  const escapedText = String(text || "").replace(/\r?\n/g, "\r\n");
  return [
    `From: Dindin <${SMTP_FROM}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    escapedText,
  ].join("\r\n");
}

module.exports = {
  createPasswordResetLink,
  deliverPasswordResetEmail,
};
