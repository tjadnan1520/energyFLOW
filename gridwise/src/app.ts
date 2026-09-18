import express from "express";
import helmet from "helmet";

import healthRouter from "./routes/health.routes";
import optimizeRouter from "./routes/optimize.routes";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: false,
  })
);

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "GridWise LLM API",
    status: "ok",
  });
});

app.use(healthRouter);

app.use(optimizeRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(error);

    if (error instanceof SyntaxError) {
      res.status(400).json({
        error: "Malformed JSON request",
      });

      return;
    }

    res.status(500).json({
      error: "Internal server error",
    });
  }
);

export default app;