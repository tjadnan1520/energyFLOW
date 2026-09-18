import type {
  OptimizeEnergyRequest,
} from "../schemas/request.schema";

import type {
  DirectiveInterpretation,
  DirectiveInterpretations,
} from "../schemas/directive.schema";

export class DirectiveGuardrailError extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "DirectiveGuardrailError";
  }
}

export function validateDirectiveInterpretations(
  request: OptimizeEnergyRequest,
  interpretations: DirectiveInterpretations
): void {
  validateInterpretationCount(
    request.operator_notes.length,
    interpretations
  );

  validateNoteIndexes(
    request.operator_notes.length,
    interpretations
  );

  for (
    const interpretation of interpretations
  ) {
    validateInterpretation(
      request,
      interpretation
    );
  }
}

function validateInterpretationCount(
  noteCount: number,
  interpretations: DirectiveInterpretations
): void {
  if (
    interpretations.length !==
    noteCount
  ) {
    throw new DirectiveGuardrailError(
      `Expected exactly ${noteCount} directive interpretations, received ${interpretations.length}`
    );
  }
}

function validateNoteIndexes(
  noteCount: number,
  interpretations: DirectiveInterpretations
): void {
  const expectedIndexes =
    Array.from(
      {
        length: noteCount,
      },
      (_, index) => index
    );

  const actualIndexes =
    interpretations.map(
      (interpretation) =>
        interpretation.note_index
    );

  if (
    actualIndexes.length !==
    expectedIndexes.length
  ) {
    throw new DirectiveGuardrailError(
      "Invalid directive interpretation count"
    );
  }

  for (
    let index = 0;
    index <
    expectedIndexes.length;
    index += 1
  ) {
    if (
      actualIndexes[index] !==
      expectedIndexes[index]
    ) {
      throw new DirectiveGuardrailError(
        `Directive interpretation order is invalid at position ${index}. Expected note_index ${expectedIndexes[index]}, received ${actualIndexes[index]}`
      );
    }
  }
}

function validateInterpretation(
  request: OptimizeEnergyRequest,
  interpretation: DirectiveInterpretation
): void {
  validateExplanation(
    interpretation
  );

  switch (
    interpretation.directive_type
  ) {
    case "solar_reduction":
      validateSolarReduction(
        interpretation
      );
      return;

    case "minimum_battery_reserve":
      validateMinimumBatteryReserve(
        request,
        interpretation
      );
      return;

    case "no_charge_window":
      validateNoChargeWindow(
        interpretation
      );
      return;

    case "no_discharge_window":
      validateNoDischargeWindow(
        interpretation
      );
      return;

    case "max_grid_window":
      validateMaxGridWindow(
        interpretation
      );
      return;

    case "no_op":
      validateNoOp(
        interpretation
      );
      return;
  }
}

function validateExplanation(
  interpretation: DirectiveInterpretation
): void {
  if (
    typeof interpretation.explanation !==
      "string" ||
    interpretation.explanation
      .trim()
      .length === 0
  ) {
    throw new DirectiveGuardrailError(
      `Explanation is missing for note_index ${interpretation.note_index}`
    );
  }
}

function validateSolarReduction(
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "solar_reduction";
    }
  >
): void {
  if (
    interpretation.applies !== true
  ) {
    throw new DirectiveGuardrailError(
      `solar_reduction must have applies=true for note_index ${interpretation.note_index}`
    );
  }

  const adjustment =
    interpretation.structured_adjustment;

  validateDirectiveHours(
    adjustment.hours,
    interpretation.note_index
  );

  if (
    !Number.isFinite(
      adjustment.factor
    )
  ) {
    throw new DirectiveGuardrailError(
      `solar_reduction factor must be finite for note_index ${interpretation.note_index}`
    );
  }

  if (
    adjustment.factor < 0 ||
    adjustment.factor > 1
  ) {
    throw new DirectiveGuardrailError(
      `solar_reduction factor must be between 0 and 1 for note_index ${interpretation.note_index}`
    );
  }
}

function validateMinimumBatteryReserve(
  request: OptimizeEnergyRequest,
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "minimum_battery_reserve";
    }
  >
): void {
  if (
    interpretation.applies !== true
  ) {
    throw new DirectiveGuardrailError(
      `minimum_battery_reserve must have applies=true for note_index ${interpretation.note_index}`
    );
  }

  const adjustment =
    interpretation.structured_adjustment;

  validateDirectiveHours(
    adjustment.hours,
    interpretation.note_index
  );

  if (
    !Number.isFinite(
      adjustment.minimum_energy_kwh
    )
  ) {
    throw new DirectiveGuardrailError(
      `minimum_energy_kwh must be finite for note_index ${interpretation.note_index}`
    );
  }

  if (
    adjustment.minimum_energy_kwh < 0
  ) {
    throw new DirectiveGuardrailError(
      `minimum_energy_kwh cannot be negative for note_index ${interpretation.note_index}`
    );
  }

  if (
    adjustment.minimum_energy_kwh >
    request.battery.capacity_kwh
  ) {
    throw new DirectiveGuardrailError(
      `minimum_energy_kwh cannot exceed battery capacity for note_index ${interpretation.note_index}`
    );
  }
}

function validateNoChargeWindow(
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "no_charge_window";
    }
  >
): void {
  if (
    interpretation.applies !== true
  ) {
    throw new DirectiveGuardrailError(
      `no_charge_window must have applies=true for note_index ${interpretation.note_index}`
    );
  }

  validateDirectiveHours(
    interpretation
      .structured_adjustment
      .hours,
    interpretation.note_index
  );
}

function validateNoDischargeWindow(
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "no_discharge_window";
    }
  >
): void {
  if (
    interpretation.applies !== true
  ) {
    throw new DirectiveGuardrailError(
      `no_discharge_window must have applies=true for note_index ${interpretation.note_index}`
    );
  }

  validateDirectiveHours(
    interpretation
      .structured_adjustment
      .hours,
    interpretation.note_index
  );
}

function validateMaxGridWindow(
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type:
        "max_grid_window";
    }
  >
): void {
  if (
    interpretation.applies !== true
  ) {
    throw new DirectiveGuardrailError(
      `max_grid_window must have applies=true for note_index ${interpretation.note_index}`
    );
  }

  const adjustment =
    interpretation.structured_adjustment;

  validateDirectiveHours(
    adjustment.hours,
    interpretation.note_index
  );

  if (
    !Number.isFinite(
      adjustment.max_grid_kwh
    )
  ) {
    throw new DirectiveGuardrailError(
      `max_grid_kwh must be finite for note_index ${interpretation.note_index}`
    );
  }

  if (
    adjustment.max_grid_kwh < 0
  ) {
    throw new DirectiveGuardrailError(
      `max_grid_kwh cannot be negative for note_index ${interpretation.note_index}`
    );
  }
}

function validateNoOp(
  interpretation: Extract<
    DirectiveInterpretation,
    {
      directive_type: "no_op";
    }
  >
): void {
  if (
    interpretation.applies !== false
  ) {
    throw new DirectiveGuardrailError(
      `no_op must have applies=false for note_index ${interpretation.note_index}`
    );
  }

  if (
    interpretation.structured_adjustment !==
    null
  ) {
    throw new DirectiveGuardrailError(
      `no_op must have structured_adjustment=null for note_index ${interpretation.note_index}`
    );
  }
}

function validateDirectiveHours(
  hours: number[],
  noteIndex: number
): void {
  if (hours.length === 0) {
    throw new DirectiveGuardrailError(
      `Directive hours cannot be empty for note_index ${noteIndex}`
    );
  }

  const uniqueHours =
    new Set(hours);

  if (
    uniqueHours.size !==
    hours.length
  ) {
    throw new DirectiveGuardrailError(
      `Directive hours must be unique for note_index ${noteIndex}`
    );
  }

  for (
    let index = 0;
    index < hours.length;
    index += 1
  ) {
    const hour = hours[index];

    if (
      !Number.isInteger(hour) ||
      hour < 0 ||
      hour > 23
    ) {
      throw new DirectiveGuardrailError(
        `Directive hour must be an integer between 0 and 23 for note_index ${noteIndex}`
      );
    }

    if (index > 0) {
      const previousHour =
        hours[index - 1];

      if (
        hour <= previousHour
      ) {
        throw new DirectiveGuardrailError(
          `Directive hours must be in ascending order for note_index ${noteIndex}`
        );
      }
    }
  }
}