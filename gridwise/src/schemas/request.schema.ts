import { z } from "zod";

const nonNegativeNumber = z
  .number()
  .finite()
  .nonnegative();

const hourSchema = z
  .number()
  .int()
  .min(0)
  .max(23);

export const hourInputSchema = z
  .object({
    hour: hourSchema,
    demand_kwh: nonNegativeNumber,
    solar_kwh: nonNegativeNumber,
    tariff_bdt_per_kwh: nonNegativeNumber,
  })
  .strict();

export const batteryInputSchema = z
  .object({
    capacity_kwh: nonNegativeNumber,
    initial_energy_kwh: nonNegativeNumber,
    minimum_energy_kwh: nonNegativeNumber,
    max_charge_kwh_per_hour: nonNegativeNumber,
    max_discharge_kwh_per_hour: nonNegativeNumber,
  })
  .strict()
  .superRefine((battery, ctx) => {
    if (battery.initial_energy_kwh > battery.capacity_kwh) {
      ctx.addIssue({
        code: "custom",
        path: ["initial_energy_kwh"],
        message: "initial_energy_kwh cannot exceed capacity_kwh",
      });
    }

    if (battery.minimum_energy_kwh > battery.capacity_kwh) {
      ctx.addIssue({
        code: "custom",
        path: ["minimum_energy_kwh"],
        message: "minimum_energy_kwh cannot exceed capacity_kwh",
      });
    }

    if (battery.initial_energy_kwh < battery.minimum_energy_kwh) {
      ctx.addIssue({
        code: "custom",
        path: ["initial_energy_kwh"],
        message: "initial_energy_kwh cannot be below minimum_energy_kwh",
      });
    }
  });

export const optimizeEnergyRequestSchema = z
  .object({
    scenario_id: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, {
        message: "scenario_id must not be empty",
      }),

    operator_notes: z
      .array(
        z
          .string()
          .min(1)
          .refine((value) => value.trim().length > 0, {
            message: "operator note must not be empty",
          })
      )
      .min(1)
      .max(3),

    hours: z
      .array(hourInputSchema)
      .length(24)
      .superRefine((hours, ctx) => {
        const hourValues = hours.map((entry) => entry.hour);

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
            path: ["hours"],
            message:
              "hours must contain exactly 24 entries in ascending order from 0 through 23",
          });
        }
      }),

    battery: batteryInputSchema,
  })
  .strict();

export type OptimizeEnergyRequest = z.infer<
  typeof optimizeEnergyRequestSchema
>;

export type HourInput = z.infer<typeof hourInputSchema>;

export type BatteryInput = z.infer<typeof batteryInputSchema>;