import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  optimizeEnergyRequestSchema,
} from "../schemas/request.schema";

import {
  optimizeEnergyScenario,
} from "../services/optimize.service";

export async function optimizeEnergyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const validation =
    optimizeEnergyRequestSchema.safeParse(
      req.body
    );

  if (!validation.success) {
    res.status(400).json({
      error: "Invalid request",
      details:
        validation.error.issues.map(
          (issue) => ({
            path: issue.path,
            message:
              issue.message,
          })
        ),
    });

    return;
  }

  try {
    const result =
      await optimizeEnergyScenario(
        validation.data
      );

    res.status(200).json(
      result
    );
  } catch (error) {
    next(error);
  }
}