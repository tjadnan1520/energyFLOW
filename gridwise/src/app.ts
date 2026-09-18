import express from "express";
import helmet from "helmet";

import healthRouter from "./routes/health.routes";
import optimizeRouter from "./routes/optimize.routes";

import {
  toPublicError,
} from "./utils/error.utils";

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

app.use(
  (_req, res) => {
    res.status(404).json({
      error: "Route not found",
    });
  }
);

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(error);

    const result =
      toPublicError(error);

    res
      .status(result.statusCode)
      .json(result.body);
  }
);

export default app;