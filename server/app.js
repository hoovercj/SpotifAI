const express = require("express");
const app = express();
// Azure App Service (and most PaaS reverse proxies) terminate TLS at the edge
// and forward to the app as plain HTTP, setting X-Forwarded-Proto: https.
// Without `trust proxy`, express-session sees req.protocol === 'http' and
// refuses to set our `secure: true` cookie in production, so sign-in silently
// fails to persist a session.
app.set("trust proxy", 1);
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
const volleyball = require("volleyball");

app.use(volleyball);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

//sets session flag to true to indicate first load of app. This will be set to false after first song.
const sessionFlag = require("./services/utl/globalVariableModule");
sessionFlag.set(true);

// Static asset serving:
// - In production, Vite builds the client to dist/ and Express serves it directly.
// - In development, Vite runs its own dev server on :3000 and proxies /api to
//   this Express instance on :3001, so the static middleware below is unused.
// We still mount public/ so runtime assets (favicon, generated audio, etc.)
// remain reachable in both environments.
const distDir = path.join(__dirname, "..", "dist");
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(distDir));
app.use(express.static(publicDir));

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
  console.error(err.stack);
  res.status(err.status || 500).send(err.message || "Internal server error");
});

io.on("connection", (socket) => {
  console.log("user connected");
  socket.on("disconnect", function () {
    console.log("user disconnected");
  });
});

module.exports = httpServer;
