import { z } from "zod";

import {
  directiveInterpretationsSchema,
} from "./directive.schema";

const nonNegativeNumber = z
  .number()
  .finite()
  .nonnegative();

const planHourSchema = z
  .number()
  .int()
  .min(0)
  .max(23);

export const hourlyPlanEntrySchema = z
  .object({
    hour: planHourSchema,

    grid_kwh: nonNegativeNumber,

    solar_used_kwh: nonNegativeNumber,

    battery_action: z.enum([
      "charge",
      "discharge",
      "idle",
    ]),

    battery_kwh: nonNegativeNumber,

    battery_energy_after_kwh: nonNegativeNumber,
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      entry.battery_action === "idle" &&
      entry.battery_kwh !== 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["battery_kwh"],
        message:
          "battery_kwh must be 0 when battery_action is idle",
      });
    }
  });

export const hourlyPlanSchema = z
  .array(hourlyPlanEntrySchema)
  .length(24)
  .superRefine((plan, ctx) => {
    const hourValues = plan.map(
      (entry) => entry.hour
    );

    const expectedHours = Array.from(
      { length: 24 },
      (_, index) => index
    );

    const isCorrectSequence =
      hourValues.length === expectedHours.length &&
      hourValues.every(
        (hour, index) => hour === expectedHours[index]
      );

    if (!isCorrectSequence) {
      ctx.addIssue({
        code: "custom",
        path: ["hourly_plan"],
        message:
          "hourly_plan must contain exactly 24 entries in ascending order from 0 through 23",
      });
    }
  });

export const optimizeEnergyResponseSchema = z
  .object({
    scenario_id: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, {
        message: "scenario_id must not be empty",
      }),

    directive_interpretation:
      directiveInterpretationsSchema,

    hourly_plan: hourlyPlanSchema,

    total_grid_kwh: nonNegativeNumber,

    total_cost_bdt: nonNegativeNumber,

    peak_grid_kwh: nonNegativeNumber,

    plan_summary: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, {
        message: "plan_summary must not be empty",
      }),
  })
  .strict();

export type HourlyPlanEntry = z.infer<
  typeof hourlyPlanEntrySchema
>;

export type HourlyPlan = z.infer<
  typeof hourlyPlanSchema
>;

export type OptimizeEnergyResponse = z.infer<
  typeof optimizeEnergyResponseSchema
>;