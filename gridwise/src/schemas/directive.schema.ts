import { z } from "zod";

const directiveHourSchema = z
  .number()
  .int()
  .min(0)
  .max(23);

const directiveHoursSchema = z
  .array(directiveHourSchema)
  .min(1)
  .max(24)
  .superRefine((hours, ctx) => {
    const uniqueHours = new Set(hours);

    if (uniqueHours.size !== hours.length) {
      ctx.addIssue({
        code: "custom",
        message: "Directive hours must be unique",
      });
    }

    for (let index = 1; index < hours.length; index += 1) {
      if (hours[index] <= hours[index - 1]) {
        ctx.addIssue({
          code: "custom",
          message:
            "Directive hours must be in ascending order",
        });

        break;
      }
    }
  });

const solarReductionAdjustmentSchema = z
  .object({
    hours: directiveHoursSchema,

    factor: z
      .number()
      .finite()
      .min(0)
      .max(1),
  })
  .strict();

const minimumBatteryReserveAdjustmentSchema = z
  .object({
    hours: directiveHoursSchema,

    minimum_energy_kwh: z
      .number()
      .finite()
      .nonnegative(),
  })
  .strict();

const noChargeWindowAdjustmentSchema = z
  .object({
    hours: directiveHoursSchema,
  })
  .strict();

const noDischargeWindowAdjustmentSchema = z
  .object({
    hours: directiveHoursSchema,
  })
  .strict();

const maxGridWindowAdjustmentSchema = z
  .object({
    hours: directiveHoursSchema,

    max_grid_kwh: z
      .number()
      .finite()
      .nonnegative(),
  })
  .strict();

const explanationSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, {
    message: "explanation must not be empty",
  });

const noteIndexSchema = z
  .number()
  .int()
  .nonnegative();

const noOpInterpretationSchema = z
  .object({
    note_index: noteIndexSchema,

    applies: z.literal(false),

    directive_type: z.literal("no_op"),

    structured_adjustment: z.null(),

    explanation: explanationSchema,
  })
  .strict();

const solarReductionInterpretationSchema = z
  .object({
    note_index: noteIndexSchema,

    applies: z.literal(true),

    directive_type: z.literal(
      "solar_reduction"
    ),

    structured_adjustment:
      solarReductionAdjustmentSchema,

    explanation: explanationSchema,
  })
  .strict();

const minimumBatteryReserveInterpretationSchema =
  z
    .object({
      note_index: noteIndexSchema,

      applies: z.literal(true),

      directive_type: z.literal(
        "minimum_battery_reserve"
      ),

      structured_adjustment:
        minimumBatteryReserveAdjustmentSchema,

      explanation: explanationSchema,
    })
    .strict();

const noChargeWindowInterpretationSchema = z
  .object({
    note_index: noteIndexSchema,

    applies: z.literal(true),

    directive_type: z.literal(
      "no_charge_window"
    ),

    structured_adjustment:
      noChargeWindowAdjustmentSchema,

    explanation: explanationSchema,
  })
  .strict();

const noDischargeWindowInterpretationSchema = z
  .object({
    note_index: noteIndexSchema,

    applies: z.literal(true),

    directive_type: z.literal(
      "no_discharge_window"
    ),

    structured_adjustment:
      noDischargeWindowAdjustmentSchema,

    explanation: explanationSchema,
  })
  .strict();

const maxGridWindowInterpretationSchema = z
  .object({
    note_index: noteIndexSchema,

    applies: z.literal(true),

    directive_type: z.literal(
      "max_grid_window"
    ),

    structured_adjustment:
      maxGridWindowAdjustmentSchema,

    explanation: explanationSchema,
  })
  .strict();

export const directiveInterpretationSchema =
  z.union([
    solarReductionInterpretationSchema,

    minimumBatteryReserveInterpretationSchema,

    noChargeWindowInterpretationSchema,

    noDischargeWindowInterpretationSchema,

    maxGridWindowInterpretationSchema,

    noOpInterpretationSchema,
  ]);

export const directiveInterpretationsSchema = z
  .array(directiveInterpretationSchema)
  .min(1)
  .max(3)
  .superRefine((directives, ctx) => {
    const noteIndexes = directives.map(
      (directive) => directive.note_index
    );

    const uniqueIndexes = new Set(
      noteIndexes
    );

    if (
      uniqueIndexes.size !==
      noteIndexes.length
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "note_index values must be unique",
      });
    }

    for (
      let index = 1;
      index < noteIndexes.length;
      index += 1
    ) {
      if (
        noteIndexes[index] <=
        noteIndexes[index - 1]
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "directive_interpretation entries must be in note_index order",
        });

        break;
      }
    }
  });

export type DirectiveInterpretation =
  z.infer<
    typeof directiveInterpretationSchema
  >;

export type DirectiveInterpretations =
  z.infer<
    typeof directiveInterpretationsSchema
  >;