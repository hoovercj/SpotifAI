const express = require("express");
const app = express();
// Azure App Service (and most PaaS reverse proxies) terminate TLS at the edge
// and forward to the app as plain HTTP, setting X-Forwarded-Proto: https.
// Without `trust proxy`, express-session sees req.protocol === 'http' and
// refuses to set our `secure: true` cookie in production, so sign-in silently
// fails to persist a session.
app.set("trust proxy", 1);
const crypto = require("node:crypto");
const session = require("express-session");
const conn = require("./db/conn");
const { User } = require("./db");
const SequelizeStore = require("connect-session-sequelize")(session.Store);
const sessionStore = new SequelizeStore({ db: conn });
const { auth } = require("./routes");
const { createServer } = require("http");
const httpServer = createServer(app);
const { Server } = require("socket.io");
const io = new Server(httpServer, { cors: { origin: "*" } });
const path = require("path");
const logger = require("./services/logger");
const pinoHttp = require("pino-http");
const { runWithContext } = require("./services/telemetry");
const { hashUserId } = require("./services/utl/hashUserId");
const { isValidListenSessionId } = require("../shared/listenSession.mjs");

// Per-request UUID stamped onto every log line + every App Insights
// correlation. Honor an upstream X-Request-Id (so a load balancer or
// e2e test harness can thread one through) but mint our own when
// absent. Echoed back in the response so the client can include it
// in error reports.
app.use((req, res, next) => {
  const headerId = req.headers["x-request-id"];
  req.requestId =
    typeof headerId === "string" && headerId.length > 0 && headerId.length < 100
      ? headerId
      : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);

  // Per-tab listen-session id from the client. Strict UUID v4 — see
  // shared/listenSession.js. Anything else is dropped so we can't be
  // tricked into stamping arbitrary attacker-controlled strings onto
  // log lines.
  const rawListen = req.headers["x-listen-session-id"];
  if (isValidListenSessionId(rawListen)) {
    req.listenSessionId = rawListen;
  }

  next();
});

// Wrap the rest of the request in an AsyncLocalStorage context so any
// trackEvent/trackException call deep inside services automatically
// picks up requestId / listenSessionId / userIdHash without prop
// threading. Updated lazily once req.session.email is available.
app.use((req, res, next) => {
  runWithContext(
    {
      requestId: req.requestId,
      listenSessionId: req.listenSessionId,
    },
    () => next()
  );
});

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      requestId: req.requestId,
      listenSessionId: req.listenSessionId,
    }),
    // Spotify auth headers + cookies are noise. Don't log them.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
      ],
      remove: true,
    },
    // Health checks are noisy. Log them at debug so they don't
    // dominate the info stream in prod.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      if (res.req?.url === "/healthz" || res.req?.url === "/readyz") return "debug";
      return "info";
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

//sets session flag to true to indicate first load of app. This will be set to false after first song.
const sessionFlag = require("./services/utl/globalVariableModule");
sessionFlag.set(true);

// Health endpoints — mounted at the root (NOT under /api) so probes
// don't need to know about our routing convention. Wired to the App
// Service health-check path in infra/modules/appService.bicep.
app.use(require("./routes/health"));

// Static asset serving:
// - In production, Vite builds the client to dist/ and Express serves it directly.
// - In development, Vite runs its own dev server on :3000 and proxies /api to
//   this Express instance on :3001, so the static middleware below is unused.
//
// Two asset sources, both mounted at the URL root so /audio/<file> and
// /images/<file> resolve transparently from either:
//   - public/   committed seed assets (DJ avatars, station covers,
//               pre-baked dj-intro WAVs, generic_segue.mp3, favicon).
//   - runtime/  gitignored runtime output (per-session/per-track TTS WAVs
//               written by server/services/tts). Created lazily by the
//               TTS pipeline; express.static is tolerant of it missing.
const distDir = path.join(__dirname, "..", "dist");
const publicDir = path.join(__dirname, "..", "public");
const runtimeDir = path.join(__dirname, "..", "runtime");
app.use(express.static(distDir));
app.use(express.static(publicDir));
app.use(express.static(runtimeDir));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      // 30 days. Without an explicit maxAge the cookie evaporates when the
      // browser closes, defeating server-side session persistence.
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Enrich the ALS telemetry context with the hashed user id now that
// the session middleware has populated req.session.email. We mutate
// the existing store rather than re-running runWithContext so the
// downstream handlers stay on the same async chain.
const { getContext } = require("./services/telemetry");
app.use((req, _res, next) => {
  if (req.session?.email) {
    const ctx = getContext();
    if (ctx && typeof ctx === "object") {
      ctx.userIdHash = hashUserId(req.session.email);
    }
  }
  next();
});

app.use("/api", require("./routes"));

// SPA fallback (prod only) — any non-API request that wasn't matched by static
// middleware gets the built index.html so React Router can take over.
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  const indexPath = path.join(distDir, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  logger.error(
    { err: err?.message, stack: err?.stack, requestId: req.requestId },
    "express.unhandled"
  );
  res.status(err.status || 500).send(err.message || "Internal server error");
});

io.on("connection", (socket) => {
  logger.debug("socket.connected");
  socket.on("disconnect", function () {
    logger.debug("socket.disconnected");
  });
});

module.exports = httpServer;
