import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env, isConfigured } from "./config/env.js";
import { authClient, serviceClient, userClient } from "./config/supabase.js";
import { LibraryRepository } from "./repositories/LibraryRepository.js";
import { StorageService } from "./services/StorageService.js";
import { CatalogService } from "./services/CatalogService.js";
import { CirculationService } from "./services/CirculationService.js";
import { AccountService } from "./services/AccountService.js";
import { DashboardService } from "./services/DashboardService.js";
import { authenticate } from "./middleware/auth.js";
import { requestId, errorHandler } from "./middleware/errors.js";
import { AppError, ForbiddenError } from "./models/AppError.js";
import { apiRouter } from "./routes/api.js";

export function createApp(options = {}) {
  const app = express();
  const origins = env.FRONTEND_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const repository = options.repository ?? new LibraryRepository(serviceClient);
  const storage = options.storage ?? new StorageService(repository);
  const catalog = new CatalogService(repository, storage);
  const circulation = new CirculationService(repository, storage);
  const accounts = new AccountService(repository, origins[0]);
  const dashboard = new DashboardService(
    repository,
    circulation,
    catalog,
    accounts,
  );
  app.disable("x-powered-by");
  if (env.TRUST_PROXY_HOPS) app.set("trust proxy", env.TRUST_PROXY_HOPS);
  const supabaseOrigin = env.SUPABASE_URL
    ? new URL(env.SUPABASE_URL).origin
    : null;
  app.use(
    requestId,
    helmet(
      env.SERVE_FRONTEND
        ? {
            contentSecurityPolicy: {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: [
                  "'self'",
                  "data:",
                  "blob:",
                  ...(supabaseOrigin ? [supabaseOrigin] : []),
                ],
                connectSrc: [
                  "'self'",
                  ...(supabaseOrigin
                    ? [
                        supabaseOrigin,
                        supabaseOrigin
                          .replace(/^https:/, "wss:")
                          .replace(/^http:/, "ws:"),
                      ]
                    : []),
                ],
                fontSrc: ["'self'", "data:"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                upgradeInsecureRequests:
                  env.NODE_ENV === "production" ? [] : null,
              },
            },
          }
        : {},
    ),
  );
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(
          origin && !origins.includes(origin)
            ? new ForbiddenError("This origin is not allowed.")
            : null,
          true,
        ),
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  app.use(express.json({ limit: "100kb", strict: true }));
  if (options.rateLimitEnabled !== false) {
    app.use(
      "/api",
      rateLimit({
        windowMs: 15 * 60000,
        limit: 600,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (req, res) =>
          res.status(429).json({
            error: {
              code: "RATE_LIMITED",
              message: "Too many requests. Please try again later.",
              request_id: req.id,
            },
          }),
      }),
    );
    const writes = rateLimit({
      windowMs: 60000,
      limit: 40,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method),
      handler: (req, res) =>
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Please wait before submitting more changes.",
            request_id: req.id,
          },
        }),
    });
    app.use("/api", writes);
  }
  app.get("/api/v1/health", (req, res) =>
    res.json({
      data: {
        status: "ok",
        configured: options.configured ?? isConfigured,
        service: "Archthea API",
      },
    }),
  );
  const authentication =
    options.authentication ??
    authenticate({ auth: authClient, repository, scopedClient: userClient });
  app.use(
    "/api/v1",
    apiRouter(
      { repository, storage, catalog, circulation, accounts, dashboard },
      authentication,
    ),
  );
  if (env.SERVE_FRONTEND) {
    const directory = fileURLToPath(
      new URL("../../frontend/dist/", import.meta.url),
    );
    const index = join(directory, "index.html");
    if (!existsSync(index))
      throw new Error(
        "The frontend build is missing. Run npm run build:render before starting.",
      );
    app.use(
      express.static(directory, {
        index: false,
        dotfiles: "deny",
        setHeaders(res, path) {
          res.setHeader(
            "Cache-Control",
            /[\\/]assets[\\/]/.test(path)
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          );
        },
      }),
    );
    app.get(/.*/, (req, res, next) => {
      if (
        req.path.startsWith("/api/") ||
        extname(req.path) ||
        !req.accepts("html")
      )
        return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(index);
    });
  }
  app.use((req, res, next) =>
    next(
      new AppError("Endpoint not found.", { status: 404, code: "NOT_FOUND" }),
    ),
  );
  app.use(errorHandler);
  return app;
}
