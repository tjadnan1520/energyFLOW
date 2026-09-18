import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  OptimizeEnergyRequest,
} from "../../src/schemas/request.schema";

import type {
  DirectiveInterpretation,
} from "../../src/schemas/directive.schema";

import {
  validateDirectiveInterpretations,
  DirectiveGuardrailError,
} from "../../src/guardrails/directive.validator";

import {
  directiveInterpretationsSchema,
} from "../../src/schemas/directive.schema";

import {
  compileDirectives,
  type CompiledDirectives,
} from "../../src/directives/directive.compiler";

import {
  optimizeEnergy,
} from "../../src/optimizer/energy.optimizer";

import {
  validateOptimizationResult,
  PlanValidationError,
} from "../../src/validator/plan.validator";

function makeRequest(
  overrides: Partial<OptimizeEnergyRequest> = {}
): OptimizeEnergyRequest {
  const base: OptimizeEnergyRequest = {
    scenario_id: "judge-audit",
    operator_notes: [
      "Solar reduction to half from 13 to 15.",
    ],
    battery: {
      capacity_kwh: 200,
      initial_energy_kwh: 100,
      minimum_energy_kwh: 20,
      max_charge_kwh_per_hour: 50,
      max_discharge_kwh_per_hour: 50,
    },
    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        demand_kwh: 100,
        solar_kwh:
          hour >= 8 && hour <= 15
            ? 80
            : 0,
        tariff_bdt_per_kwh:
          hour >= 18 && hour <= 21
            ? 20
            : 8,
      })
    ),
  };

  return {
    ...base,
    ...overrides,
  };
}

function interpretation(
  note_index: number,
  directive_type: string,
  adjustment: any
): DirectiveInterpretation {
  return {
    note_index,
    directive_type,
    applies: true,
    structured_adjustment:
      adjustment,
    explanation:
      "judge audit explanation",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function plainRequest(
  overrides: Partial<OptimizeEnergyRequest> = {}
): OptimizeEnergyRequest {
  const req = makeRequest(overrides);
  return JSON.parse(
    JSON.stringify(req)
  ) as OptimizeEnergyRequest;
}

function expectRejection(
  request: OptimizeEnergyRequest,
  interpretations: DirectiveInterpretation[]
): void {
  expect(() => {
    validateDirectiveInterpretations(
      request,
      interpretations
    );
  }).toThrow(
    DirectiveGuardrailError
  );
}

describe("judge: guardrails", () => {
  const validSolar = interpretation(
    0,
    "solar_reduction",
    {
      hours: [13, 14],
      factor: 0.5,
    }
  );

  const validReserve = interpretation(
    0,
    "minimum_battery_reserve",
    {
      hours: [18, 19, 20],
      minimum_energy_kwh: 100,
    }
  );

  const validNoCharge = interpretation(
    0,
    "no_charge_window",
    { hours: [12, 13, 14] }
  );

  const validNoDischarge = interpretation(
    0,
    "no_discharge_window",
    { hours: [17, 18, 19] }
  );

  const validMaxGrid = interpretation(
    0,
    "max_grid_window",
    {
      hours: [18, 19, 20],
      max_grid_kwh: 120,
    }
  );

  const validNoOp = {
    note_index: 0,
    directive_type: "no_op",
    applies: false,
    structured_adjustment: null,
    explanation: "irrelevant note",
  } as DirectiveInterpretation;

  it("accepts valid interpretations for all six directive types", () => {
    const request = plainRequest();

    expect(() =>
      validateDirectiveInterpretations(
        request,
        [validNoOp]
      )
    ).not.toThrow();
    expect(() =>
      validateDirectiveInterpretations(
        request,
        [validSolar]
      )
    ).not.toThrow();
    expect(() =>
      validateDirectiveInterpretations(
        request,
        [validReserve]
      )
    ).not.toThrow();
    expect(() =>
      validateDirectiveInterpretations(
        request,
        [validNoCharge]
      )
    ).not.toThrow();
    expect(() =>
      validateDirectiveInterpretations(
        request,
        [validNoDischarge]
      )
    ).not.toThrow();
    expect(() =>
      validateDirectiveInterpretations(
        request,
        [validMaxGrid]
      )
    ).not.toThrow();
  });

  it("rejects invented directive types through the production schema", () => {
    const result =
      directiveInterpretationsSchema.safeParse([
        {
          ...validSolar,
          directive_type:
            "emergency_mode",
        },
      ]);

    expect(result.success).toBe(false);
  });

  it("guardrail switch has no default and accepts unknown types (latent gap)", () => {
    const invented = {
      note_index: 0,
      directive_type: "emergency_mode",
      applies: true,
      structured_adjustment: {
        hours: [13],
        severity: "high",
      },
      explanation:
        "arbitrary unknown directive",
    } as unknown as DirectiveInterpretation;

    expect(() =>
      validateDirectiveInterpretations(
        plainRequest(),
        [invented]
      )
    ).not.toThrow();
  });

  it("rejects missing, duplicate, and out-of-order note_index", () => {
    const request = plainRequest({
      operator_notes: [
        "a",
        "b",
        "c",
      ],
    });

    const a = {
      note_index: 2,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;
    const b = {
      note_index: 1,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;
    const c = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    expectRejection(
      request,
      [a, b, c]
    );

    expectRejection(
      request,
      [b, a, c]
    );

    expectRejection(
      request,
      [a, a, c]
    );

    expectRejection(
      request,
      [b, c]
    );

    expect(() =>
      validateDirectiveInterpretations(
        request,
        [c, b, a]
      )
    ).not.toThrow();
  });

  it("rejects wrong interpretation count", () => {
    expectRejection(
      plainRequest(),
      [
        validSolar,
        validNoOp,
      ]
    );
  });

  it("rejects empty, duplicate, descending, and out-of-range directive hours", () => {
    const request = plainRequest();

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [], factor: 0.5 }
        ),
      ]
    );

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [13, 13], factor: 0.5 }
        ),
      ]
    );

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [14, 13], factor: 0.5 }
        ),
      ]
    );

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [24], factor: 0.5 }
        ),
      ]
    );

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [-1], factor: 0.5 }
        ),
      ]
    );
  });

  it("rejects out-of-range solar factors", () => {
    const request = plainRequest();

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [13], factor: 1.5 }
        ),
      ]
    );

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [13], factor: -0.2 }
        ),
      ]
    );
  });

  it("rejects reserve above battery capacity", () => {
    expectRejection(
      plainRequest(),
      [
        interpretation(
          0,
          "minimum_battery_reserve",
          {
            hours: [18],
            minimum_energy_kwh: 201,
          }
        ),
      ]
    );
  });

  it("rejects negative or non-finite reserve and max grid", () => {
    const request = plainRequest();

    expectRejection(
      request,
      [
        interpretation(
          0,
          "minimum_battery_reserve",
          {
            hours: [18],
            minimum_energy_kwh: -5,
          }
        ),
      ]
    );

    expectRejection(
      request,
      [
        interpretation(
          0,
          "max_grid_window",
          {
            hours: [18],
            max_grid_kwh: -10,
          }
        ),
      ]
    );

    expectRejection(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [13], factor: Infinity }
        ),
      ]
    );
  });

  it("rejects incorrect no_op semantics", () => {
    expectRejection(
      plainRequest(),
      [
        {
          note_index: 0,
          directive_type: "no_op",
          applies: true,
          structured_adjustment: {
            hours: [13],
            factor: 0.5,
          },
          explanation: "x",
        } as unknown as DirectiveInterpretation,
      ]
    );

    expectRejection(
      plainRequest(),
      [
        {
          note_index: 0,
          directive_type: "no_op",
          applies: false,
          structured_adjustment: {
            hours: [13],
            factor: 0.5,
          },
          explanation: "x",
        } as unknown as DirectiveInterpretation,
      ]
    );
  });

  it("rejects non-applying non-noop directives", () => {
    expectRejection(
      plainRequest(),
      [
        {
          ...validSolar,
          applies: false,
        } as unknown as DirectiveInterpretation,
      ]
    );
  });
});

describe("judge: directive compiler", () => {
  it("no-op leaves every constraint at default", () => {
    const request = plainRequest();
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const compiled = compileDirectives(
      request,
      [noOp]
    );

    for (const hour of compiled.by_hour) {
      expect(hour.solar_factor).toBe(1);
      expect(
        hour.minimum_battery_energy_kwh
      ).toBe(20);
      expect(hour.charge_allowed).toBe(true);
      expect(hour.discharge_allowed).toBe(true);
      expect(hour.max_grid_kwh).toBe(null);
    }
  });

  it("applies solar reduction factor to correct hours only", () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [13, 14], factor: 0.2 }
        ),
      ]
    );

    expect(
      compiled.by_hour[13].solar_factor
    ).toBe(0.2);
    expect(
      compiled.by_hour[14].solar_factor
    ).toBe(0.2);
    expect(
      compiled.by_hour[12].solar_factor
    ).toBe(1);
    expect(
      compiled.by_hour[15].solar_factor
    ).toBe(1);
  });

  it("combines multiple solar reductions restrictively (min)", () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [13], factor: 0.5 }
        ),
        interpretation(
          1,
          "solar_reduction",
          { hours: [13], factor: 0.2 }
        ),
      ]
    );

    expect(
      compiled.by_hour[13].solar_factor
    ).toBe(0.2);
  });

  it("applies reserve above scenario minimum and maxes across directives", () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "minimum_battery_reserve",
          {
            hours: [18, 19],
            minimum_energy_kwh: 60,
          }
        ),
        interpretation(
          1,
          "minimum_battery_reserve",
          {
            hours: [19, 20],
            minimum_energy_kwh: 120,
          }
        ),
      ]
    );

    expect(
      compiled.by_hour[18]
        .minimum_battery_energy_kwh
    ).toBe(60);
    expect(
      compiled.by_hour[19]
        .minimum_battery_energy_kwh
    ).toBe(120);
    expect(
      compiled.by_hour[20]
        .minimum_battery_energy_kwh
    ).toBe(120);
    expect(
      compiled.by_hour[17]
        .minimum_battery_energy_kwh
    ).toBe(20);
  });

  it("reserve never lowers the scenario base minimum", () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "minimum_battery_reserve",
          {
            hours: [18],
            minimum_energy_kwh: 5,
          }
        ),
      ]
    );

    expect(
      compiled.by_hour[18]
        .minimum_battery_energy_kwh
    ).toBe(20);
  });

  it("applies no-charge and no-discharge windows", () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "no_charge_window",
          { hours: [12, 13] }
        ),
        interpretation(
          1,
          "no_discharge_window",
          { hours: [18, 19] }
        ),
      ]
    );

    expect(
      compiled.by_hour[12].charge_allowed
    ).toBe(false);
    expect(
      compiled.by_hour[13].charge_allowed
    ).toBe(false);
    expect(
      compiled.by_hour[14].charge_allowed
    ).toBe(true);
    expect(
      compiled.by_hour[18].discharge_allowed
    ).toBe(false);
    expect(
      compiled.by_hour[17].discharge_allowed
    ).toBe(true);
  });

  it("applies grid caps and combines restrictively (min)", () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "max_grid_window",
          {
            hours: [18, 19],
            max_grid_kwh: 150,
          }
        ),
        interpretation(
          1,
          "max_grid_window",
          {
            hours: [19, 20],
            max_grid_kwh: 90,
          }
        ),
      ]
    );

    expect(
      compiled.by_hour[18].max_grid_kwh
    ).toBe(150);
    expect(
      compiled.by_hour[19].max_grid_kwh
    ).toBe(90);
    expect(
      compiled.by_hour[20].max_grid_kwh
    ).toBe(90);
    expect(
      compiled.by_hour[17].max_grid_kwh
    ).toBe(null);
  });

  it("combines overlapping directives across types", () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "solar_reduction",
          { hours: [13, 14], factor: 0.2 }
        ),
        interpretation(
          1,
          "minimum_battery_reserve",
          {
            hours: [13, 14],
            minimum_energy_kwh: 150,
          }
        ),
        interpretation(
          2,
          "no_charge_window",
          { hours: [13, 14] }
        ),
        interpretation(
          3,
          "max_grid_window",
          {
            hours: [13, 14],
            max_grid_kwh: 80,
          }
        ),
      ]
    );

    const hour13 =
      compiled.by_hour[13];
    expect(hour13.solar_factor).toBe(0.2);
    expect(
      hour13.minimum_battery_energy_kwh
    ).toBe(150);
    expect(hour13.charge_allowed).toBe(false);
    expect(hour13.max_grid_kwh).toBe(80);
  });
});

describe("judge: optimizer mathematical properties", () => {
  async function optimizeWithNotes(
    request: OptimizeEnergyRequest,
    interpretations: DirectiveInterpretation[]
  ) {
    const compiled = compileDirectives(
      request,
      interpretations
    );
    const result = await optimizeEnergy(
      request,
      compiled
    );

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        result
      )
    ).not.toThrow();

    return {
      result,
      compiled,
    };
  }

  it("A: uses solar whenever available (no battery otherwise)", async () => {
    const request = plainRequest({
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 100,
        minimum_energy_kwh: 100,
        max_charge_kwh_per_hour: 0,
        max_discharge_kwh_per_hour: 0,
      },
    });
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    const noon = result.hourly[12];
    expect(noon.solar_used_kwh).toBe(80);
    expect(noon.grid_kwh).toBeCloseTo(20, 6);

    const midnight = result.hourly[0];
    expect(midnight.solar_used_kwh).toBe(0);
    expect(midnight.grid_kwh).toBe(100);
  });

  it("B: discharges battery to shave expensive peak tariff", async () => {
    const request = plainRequest();
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    for (const hour of [18, 19, 20, 21]) {
      expect(
        result.hourly[hour].grid_kwh
      ).toBeLessThan(100);
      expect(
        result.hourly[hour].discharge_kwh
      ).toBeGreaterThan(0);
    }
  });

  it("C: restores battery in cheap hours after peak discharge", async () => {
    const request = plainRequest();
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    const totalDischarge = result.hourly.reduce(
      (sum, h) => sum + h.discharge_kwh,
      0
    );
    const totalCharge = result.hourly.reduce(
      (sum, h) => sum + h.charge_kwh,
      0
    );

    expect(totalDischarge).toBeGreaterThan(0);
    expect(totalCharge).toBeCloseTo(
      totalDischarge,
      6
    );
    expect(
      result.hourly[23].battery_energy_after_kwh
    ).toBeCloseTo(100, 6);
  });

  it("E: solar reduction lowers effective solar in window", async () => {
    const request = plainRequest();
    const { result } =
      await optimizeWithNotes(
        request,
        [
          interpretation(
            0,
            "solar_reduction",
            {
              hours: [13, 14],
              factor: 0.2,
            }
          ),
        ]
      );

    expect(
      result.hourly[13].solar_used_kwh
    ).toBeCloseTo(16, 6);
    expect(
      result.hourly[12].solar_used_kwh
    ).toBeCloseTo(80, 6);
  });

  it("F: no charging during no-charge window", async () => {
    const request = plainRequest();
    const { result } =
      await optimizeWithNotes(
        request,
        [
          interpretation(
            0,
            "no_charge_window",
            { hours: [10, 11, 12] }
          ),
        ]
      );

    for (const hour of [10, 11, 12]) {
      expect(
        result.hourly[hour].charge_kwh
      ).toBe(0);
    }
  });

  it("G: no discharging during no-discharge window", async () => {
    const request = plainRequest();
    const { result } =
      await optimizeWithNotes(
        request,
        [
          interpretation(
            0,
            "no_discharge_window",
            { hours: [18, 19, 20] }
          ),
        ]
      );

    for (const hour of [18, 19, 20]) {
      expect(
        result.hourly[hour].discharge_kwh
      ).toBe(0);
    }
  });

  it("H: battery never below requested reserve in window", async () => {
    const request = plainRequest();
    const { result } =
      await optimizeWithNotes(
        request,
        [
          interpretation(
            0,
            "minimum_battery_reserve",
            {
              hours: [18, 19, 20],
              minimum_energy_kwh: 150,
            }
          ),
        ]
      );

    for (const hour of [18, 19, 20]) {
      expect(
        result.hourly[hour]
          .battery_energy_after_kwh
      ).toBeGreaterThanOrEqual(150);
    }
  });

  it("I: grid never exceeds cap in window", async () => {
    const request = plainRequest();
    const { result } =
      await optimizeWithNotes(
        request,
        [
          interpretation(
            0,
            "max_grid_window",
            {
              hours: [18, 19, 20],
              max_grid_kwh: 120,
            }
          ),
        ]
      );

    for (const hour of [18, 19, 20]) {
      expect(
        result.hourly[hour].grid_kwh
      ).toBeLessThanOrEqual(120);
    }
  });

  it("L: handles entire day with no solar", async () => {
    const request = plainRequest({
      hours: Array.from(
        { length: 24 },
        (_, hour) => ({
          hour,
          demand_kwh: 100,
          solar_kwh: 0,
          tariff_bdt_per_kwh: 8,
        })
      ),
    });
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    for (const h of result.hourly) {
      expect(h.solar_used_kwh).toBe(0);
    }
  });

  it("N: zero usable battery capacity yields idle battery", async () => {
    const request = plainRequest({
      battery: {
        capacity_kwh: 0,
        initial_energy_kwh: 0,
        minimum_energy_kwh: 0,
        max_charge_kwh_per_hour: 0,
        max_discharge_kwh_per_hour: 0,
      },
    });
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    for (const h of result.hourly) {
      expect(h.charge_kwh).toBe(0);
      expect(h.discharge_kwh).toBe(0);
      expect(h.battery_energy_after_kwh).toBe(0);
    }
  });

  it("Q: zero charge limit prevents all charging", async () => {
    const request = plainRequest({
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 100,
        minimum_energy_kwh: 20,
        max_charge_kwh_per_hour: 0,
        max_discharge_kwh_per_hour: 50,
      },
    });
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    for (const h of result.hourly) {
      expect(h.charge_kwh).toBe(0);
    }
  });

  it("R: zero discharge limit prevents all discharging", async () => {
    const request = plainRequest({
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 100,
        minimum_energy_kwh: 20,
        max_charge_kwh_per_hour: 50,
        max_discharge_kwh_per_hour: 0,
      },
    });
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    for (const h of result.hourly) {
      expect(h.discharge_kwh).toBe(0);
    }
  });

  it("S: grid cap exactly equal to required grid stays feasible", async () => {
    const noSolar: OptimizeEnergyRequest =
      plainRequest({
        hours: Array.from(
          { length: 24 },
          (_, hour) => ({
            hour,
            demand_kwh: 100,
            solar_kwh: 0,
            tariff_bdt_per_kwh: 8,
          })
        ),
        battery: {
          capacity_kwh: 0,
          initial_energy_kwh: 0,
          minimum_energy_kwh: 0,
          max_charge_kwh_per_hour: 0,
          max_discharge_kwh_per_hour: 0,
        },
      });

    const { result } =
      await optimizeWithNotes(
        noSolar,
        [
          interpretation(
            0,
            "max_grid_window",
            {
              hours: [10, 11, 12],
              max_grid_kwh: 100,
            }
          ),
        ]
      );

    for (const hour of [10, 11, 12]) {
      expect(
        result.hourly[hour].grid_kwh
      ).toBeCloseTo(100, 6);
    }
  });

  it("T: infeasible grid cap fails in a controlled manner", async () => {
    const noDischarge = plainRequest({
      hours: Array.from(
        { length: 24 },
        (_, hour) => ({
          hour,
          demand_kwh: 100,
          solar_kwh: 0,
          tariff_bdt_per_kwh: 8,
        })
      ),
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 100,
        minimum_energy_kwh: 100,
        max_charge_kwh_per_hour: 0,
        max_discharge_kwh_per_hour: 0,
      },
    });

    const compiled = compileDirectives(
      noDischarge,
      [
        interpretation(
          0,
          "max_grid_window",
          {
            hours: [10],
            max_grid_kwh: 10,
          }
        ),
      ]
    );

    await expect(
      optimizeEnergy(
        noDischarge,
        compiled
      )
    ).rejects.toThrow(
      /optimization failed/
    );
  });

  it("never returns simultaneous charge and discharge", async () => {
    const request = plainRequest();
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    for (const h of result.hourly) {
      const both =
        h.charge_kwh > 1e-6 &&
        h.discharge_kwh > 1e-6;
      expect(both).toBe(false);
    }
  });

  it("maintains energy balance and battery continuity everywhere", async () => {
    const request = plainRequest();
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;

    const { result } =
      await optimizeWithNotes(
        request,
        [noOp]
      );

    let previous =
      request.battery.initial_energy_kwh;

    for (let hour = 0; hour < 24; hour++) {
      const h = result.hourly[hour];
      const solar =
        request.hours[hour].solar_kwh;

      expect(
        h.grid_kwh +
          h.discharge_kwh +
          h.solar_used_kwh
      ).toBeCloseTo(
        request.hours[hour].demand_kwh +
          h.charge_kwh,
        6
      );
      expect(h.solar_used_kwh).toBe(solar);
      expect(
        h.battery_energy_after_kwh
      ).toBeCloseTo(
        previous +
          h.charge_kwh -
          h.discharge_kwh,
        6
      );
      expect(
        h.battery_energy_after_kwh
      ).toBeLessThanOrEqual(200);
      expect(
        h.battery_energy_after_kwh
      ).toBeGreaterThanOrEqual(20);

      previous =
        h.battery_energy_after_kwh;
    }

    expect(previous).toBeCloseTo(100, 6);
  });
});

describe("judge: replay validator catches corruption", () => {
  async function validBaseline() {
    const request = plainRequest();
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;
    const compiled = compileDirectives(
      request,
      [noOp]
    );
    const result = await optimizeEnergy(
      request,
      compiled
    );

    return {
      request,
      compiled,
      result,
    };
  }

  it("catches wrong hour count and order", async () => {
    const { request, compiled, result } =
      await validBaseline();

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          hourly: result.hourly.slice(0, 23),
        }
      )
    ).toThrow(PlanValidationError);

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          hourly: result.hourly
            .slice()
            .reverse(),
        }
      )
    ).toThrow(PlanValidationError);
  });

  it("catches negative grid and NaN battery", async () => {
    const { request, compiled, result } =
      await validBaseline();

    const corrupted = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 5
            ? { ...h, grid_kwh: -1 }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        corrupted
      )
    ).toThrow(PlanValidationError);

    const nanPlan = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 5
            ? {
                ...h,
                battery_energy_after_kwh: NaN,
              }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        nanPlan
      )
    ).toThrow(PlanValidationError);
  });

  it("catches broken energy balance and battery transition", async () => {
    const { request, compiled, result } =
      await validBaseline();

    const brokenBalance = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 6
            ? { ...h, grid_kwh: h.grid_kwh + 1 }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        brokenBalance
      )
    ).toThrow(PlanValidationError);

    const brokenTransition = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 10
            ? {
                ...h,
                battery_energy_after_kwh:
                  h.battery_energy_after_kwh +
                  5,
              }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        brokenTransition
      )
    ).toThrow(PlanValidationError);
  });

  it("catches battery capacity and minimum violations", async () => {
    const { request, compiled, result } =
      await validBaseline();

    const overCapacity = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 8
            ? { ...h, battery_energy_after_kwh: 201 }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        overCapacity
      )
    ).toThrow(PlanValidationError);

    const belowMinimum = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 9
            ? { ...h, battery_energy_after_kwh: 5 }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        belowMinimum
      )
    ).toThrow(PlanValidationError);
  });

  it("catches charge/discharge limit violations and simultaneous flows", async () => {
    const { request, compiled, result } =
      await validBaseline();

    const overCharge = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 3
            ? { ...h, charge_kwh: 51 }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        overCharge
      )
    ).toThrow(PlanValidationError);

    const simultaneous = {
      ...result,
      hourly: result.hourly.map(
        (h, index) =>
          index === 4
            ? {
                ...h,
                charge_kwh: 10,
                discharge_kwh: 10,
              }
            : h
      ),
    };
    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        simultaneous
      )
    ).toThrow(PlanValidationError);
  });

  it("catches reserve, no-charge, no-discharge and grid-cap violations", async () => {
    const request = plainRequest();
    const directives = [
      interpretation(
        0,
        "minimum_battery_reserve",
        {
          hours: [18, 19],
          minimum_energy_kwh: 150,
        }
      ),
      interpretation(
        1,
        "no_charge_window",
        { hours: [10, 11] }
      ),
      interpretation(
        2,
        "no_discharge_window",
        { hours: [18, 19] }
      ),
      interpretation(
        3,
        "max_grid_window",
        {
          hours: [18, 19],
          max_grid_kwh: 120,
        }
      ),
    ] as DirectiveInterpretation[];

    const compiled = compileDirectives(
      request,
      directives
    );
    const result = await optimizeEnergy(
      request,
      compiled
    );

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        result
      )
    ).not.toThrow();

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          hourly: result.hourly.map(
            (h, index) =>
              index === 18
                ? { ...h, grid_kwh: 121 }
                : h
          ),
        }
      )
    ).toThrow(PlanValidationError);

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          hourly: result.hourly.map(
            (h, index) =>
              index === 10
                ? { ...h, charge_kwh: 5 }
                : h
          ),
        }
      )
    ).toThrow(PlanValidationError);
  });

  it("catches wrong totals and final-battery mismatch", async () => {
    const { request, compiled, result } =
      await validBaseline();

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          total_grid_kwh:
            result.total_grid_kwh + 1,
        }
      )
    ).toThrow(PlanValidationError);

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          total_cost_bdt:
            result.total_cost_bdt + 1,
        }
      )
    ).toThrow(PlanValidationError);

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          peak_grid_kwh:
            result.peak_grid_kwh + 1,
        }
      )
    ).toThrow(PlanValidationError);

    expect(() =>
      validateOptimizationResult(
        request,
        compiled,
        {
          ...result,
          hourly: result.hourly.map(
            (h, index) =>
              index === 23
                ? { ...h, battery_energy_after_kwh: 99 }
                : h
          ),
        }
      )
    ).toThrow(PlanValidationError);
  });
});

describe("judge: objective is cost minimization", () => {
  it("produces expected objective for a hand-computed case", async () => {
    const request = plainRequest({
      hours: Array.from(
        { length: 24 },
        (_, hour) => ({
          hour,
          demand_kwh: 100,
          solar_kwh: 0,
          tariff_bdt_per_kwh: 8,
        })
      ),
      battery: {
        capacity_kwh: 0,
        initial_energy_kwh: 0,
        minimum_energy_kwh: 0,
        max_charge_kwh_per_hour: 0,
        max_discharge_kwh_per_hour: 0,
      },
    });
    const noOp = {
      note_index: 0,
      directive_type: "no_op",
      applies: false,
      structured_adjustment: null,
      explanation: "x",
    } as DirectiveInterpretation;
    const compiled = compileDirectives(
      request,
      [noOp]
    );
    const result = await optimizeEnergy(
      request,
      compiled
    );

    expect(result.total_grid_kwh).toBeCloseTo(
      2400,
      6
    );
    expect(result.total_cost_bdt).toBeCloseTo(
      2400 * 8,
      6
    );
    expect(result.peak_grid_kwh).toBe(100);
  });
});

describe("judge: multi-note ordering through the pipeline", () => {
  it("keeps three directives and preserves note_index order in the result", async () => {
    const request = plainRequest({
      operator_notes: [
        "Reduce solar to 20% from 13 to 15.",
        "Keep 100 kWh reserve from 18 to 21.",
        "Do not discharge from 17 to 20.",
      ],
    });

    const interpretations = [
      interpretation(
        0,
        "solar_reduction",
        {
          hours: [13, 14],
          factor: 0.2,
        }
      ),
      interpretation(
        1,
        "minimum_battery_reserve",
        {
          hours: [18, 19, 20],
          minimum_energy_kwh: 100,
        }
      ),
      interpretation(
        2,
        "no_discharge_window",
        { hours: [17, 18, 19] }
      ),
    ];

    expect(() =>
      validateDirectiveInterpretations(
        request,
        interpretations
      )
    ).not.toThrow();

    const compiled = compileDirectives(
      request,
      interpretations
    );
    const result = await optimizeEnergy(
      request,
      compiled
    );

    expect(
      result.hourly[13].solar_used_kwh
    ).toBeCloseTo(16, 6);
    for (const hour of [18, 19, 20]) {
      expect(
        result.hourly[hour]
          .battery_energy_after_kwh
      ).toBeGreaterThanOrEqual(100);
    }
    for (const hour of [17, 18, 19]) {
      expect(
        result.hourly[hour].discharge_kwh
      ).toBe(0);
    }
  });

  it("handles a mix of one real directive and no_ops", async () => {
    const request = plainRequest({
      operator_notes: [
        "Campus meeting at 7pm.",
        "Solar drops to half from 13 to 15.",
        "Battery room inspection tomorrow.",
      ],
    });

    const interpretations = [
      {
        note_index: 0,
        directive_type: "no_op",
        applies: false,
        structured_adjustment: null,
        explanation: "not energy related",
      },
      interpretation(
        1,
        "solar_reduction",
        {
          hours: [13, 14],
          factor: 0.5,
        }
      ),
      {
        note_index: 2,
        directive_type: "no_op",
        applies: false,
        structured_adjustment: null,
        explanation: "not energy related",
      },
    ] as DirectiveInterpretation[];

    expect(() =>
      validateDirectiveInterpretations(
        request,
        interpretations
      )
    ).not.toThrow();

    const compiled = compileDirectives(
      request,
      interpretations
    );

    expect(
      compiled.by_hour[13].solar_factor
    ).toBe(0.5);
    expect(
      compiled.by_hour[0].solar_factor
    ).toBe(1);
    expect(
      compiled.by_hour[10].charge_allowed
    ).toBe(true);
  });
});

describe("judge: edge cases (section 17)", () => {
  const noOp = {
    note_index: 0,
    directive_type: "no_op",
    applies: false,
    structured_adjustment: null,
    explanation: "x",
  } as DirectiveInterpretation;

  function run(
    request: OptimizeEnergyRequest
  ) {
    return (async () => {
      const compiled = compileDirectives(
        request,
        [noOp]
      );
      const result = await optimizeEnergy(
        request,
        compiled
      );
      expect(() =>
        validateOptimizationResult(
          request,
          compiled,
          result
        )
      ).not.toThrow();
      return result;
    })();
  }

  type HourShape = {
    demand_kwh?: number;
    solar_kwh?: number;
    tariff_bdt_per_kwh?: number;
  };

  function flatHours(
    demand: number,
    solar: number,
    tariff: number,
    edgeHours: Partial<Record<number, HourShape>> = {}
  ): OptimizeEnergyRequest["hours"] {
    return Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        demand_kwh:
          edgeHours[hour]?.demand_kwh ??
          demand,
        solar_kwh:
          edgeHours[hour]?.solar_kwh ??
          solar,
        tariff_bdt_per_kwh:
          edgeHours[hour]?.tariff_bdt_per_kwh ??
          tariff,
      })
    );
  }

  it("all tariffs equal", async () => {
    const request = plainRequest({
      hours: flatHours(100, 80, 8),
    });

    const result = await run(request);
    const totalCost =
      result.total_grid_kwh * 8;
    expect(result.total_cost_bdt).toBeCloseTo(
      totalCost,
      6
    );
  });

  it("all tariffs zero", async () => {
    const request = plainRequest({
      hours: flatHours(100, 80, 0),
    });

    const result = await run(request);
    expect(result.total_cost_bdt).toBe(0);
  });

  it("zero demand", async () => {
    const request = plainRequest({
      hours: flatHours(0, 0, 8),
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 100,
        minimum_energy_kwh: 20,
        max_charge_kwh_per_hour: 50,
        max_discharge_kwh_per_hour: 50,
      },
    });

    const result = await run(request);
    expect(result.total_grid_kwh).toBe(0);
    for (const h of result.hourly) {
      expect(h.grid_kwh).toBe(0);
      expect(h.charge_kwh).toBe(0);
      expect(h.discharge_kwh).toBe(0);
      expect(
        h.battery_energy_after_kwh
      ).toBe(100);
    }
  });

  it("curtails solar surplus beyond battery absorption instead of failing", async () => {
    const request = plainRequest({
      hours: flatHours(10, 100, 8),
    });

    const compiled = compileDirectives(
      request,
      [noOp]
    );

    const result = await optimizeEnergy(
      request,
      compiled
    );

    for (const h of result.hourly) {
      expect(
        h.solar_used_kwh
      ).toBeLessThanOrEqual(100);
      expect(h.grid_kwh).toBeGreaterThanOrEqual(0);
      expect(
        Math.abs(
          h.grid_kwh +
            h.solar_used_kwh +
            h.discharge_kwh -
            (10 + h.charge_kwh)
        )
      ).toBeLessThanOrEqual(0.01);
    }

    expect(
      result.hourly[23].battery_energy_after_kwh
    ).toBe(100);
  });

  it("battery initially full", async () => {
    const request = plainRequest({
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 200,
        minimum_energy_kwh: 20,
        max_charge_kwh_per_hour: 50,
        max_discharge_kwh_per_hour: 50,
      },
    });

    const result = await run(request);
    expect(
      result.hourly[0].battery_energy_after_kwh
    ).toBeLessThanOrEqual(200);
    expect(
      result.hourly[23].battery_energy_after_kwh
    ).toBe(200);
  });

  it("battery initially at minimum", async () => {
    const request = plainRequest({
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 20,
        minimum_energy_kwh: 20,
        max_charge_kwh_per_hour: 50,
        max_discharge_kwh_per_hour: 50,
      },
    });

    const result = await run(request);
    for (const h of result.hourly) {
      expect(
        h.battery_energy_after_kwh
      ).toBeGreaterThanOrEqual(20);
    }
  });

  it("only one expensive hour", async () => {
    const hours = flatHours(100, 0, 8, {
      19: { tariff_bdt_per_kwh: 100 },
    });

    const request = plainRequest({
      hours,
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 100,
        minimum_energy_kwh: 20,
        max_charge_kwh_per_hour: 50,
        max_discharge_kwh_per_hour: 50,
      },
    });

    const result = await run(request);
    expect(
      result.hourly[19].discharge_kwh
    ).toBe(50);
  });

  it("only one solar hour", async () => {
    const hours = flatHours(100, 0, 8, {
      12: { solar_kwh: 80 },
    });

    const request = plainRequest({
      hours,
      battery: {
        capacity_kwh: 200,
        initial_energy_kwh: 100,
        minimum_energy_kwh: 100,
        max_charge_kwh_per_hour: 0,
        max_discharge_kwh_per_hour: 0,
      },
    });

    const result = await run(request);
    expect(
      result.hourly[12].solar_used_kwh
    ).toBe(80);
    expect(result.hourly[12].grid_kwh).toBe(20);
  });

  it("directive covering hour 0", async () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "no_charge_window",
          { hours: [0] }
        ),
      ]
    );
    expect(
      compiled.by_hour[0].charge_allowed
    ).toBe(false);
  });

  it("directive covering hour 23", async () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "max_grid_window",
          {
            hours: [23],
            max_grid_kwh: 50,
          }
        ),
      ]
    );
    expect(
      compiled.by_hour[23].max_grid_kwh
    ).toBe(50);
  });

  it("directive covering all 24 hours", async () => {
    const request = plainRequest();
    const compiled = compileDirectives(
      request,
      [
        interpretation(
          0,
          "max_grid_window",
          {
            hours: Array.from({ length: 24 }, (_, h) => h),
            max_grid_kwh: 60,
          }
        ),
      ]
    );
    for (let h = 0; h < 24; h++) {
      expect(
        compiled.by_hour[h].max_grid_kwh
      ).toBe(60);
    }
  });

  it("very small decimal values remain numerically sound", async () => {
    const request = plainRequest({
      hours: flatHours(0.001, 0.0004, 0.01),
    });

    const result = await run(request);
    expect(
      result.total_grid_kwh
    ).toBeCloseTo(0.0144, 4);
  });

  it("very large values solve without overflow", async () => {
    const request = plainRequest({
      hours: flatHours(1_000_000, 0, 8),
    });

    const result = await run(request);
    expect(result.total_grid_kwh).toBeCloseTo(
      24_000_000,
      2
    );
  });

  it("all 24 hours identical", async () => {
    const request = plainRequest({
      hours: flatHours(100, 50, 8),
    });

    const result = await run(request);
    expect(result.total_grid_kwh).toBeCloseTo(
      1200,
      6
    );
    expect(result.total_cost_bdt).toBeCloseTo(
      9600,
      6
    );
    expect(result.hourly[0].solar_used_kwh).toBe(
      50
    );
    for (const h of result.hourly) {
      expect(h.grid_kwh).toBeGreaterThanOrEqual(
        0
      );
      expect(h.solar_used_kwh).toBe(50);
      expect(
        h.battery_energy_after_kwh
      ).toBeLessThanOrEqual(200);
      expect(
        h.battery_energy_after_kwh
      ).toBeGreaterThanOrEqual(20);
    }
    expect(
      result.hourly[23].battery_energy_after_kwh
    ).toBe(100);
  });

  it("demand greater than solar", async () => {
    const request = plainRequest({
      hours: flatHours(100, 30, 8),
    });

    const result = await run(request);
    for (const h of result.hourly) {
      expect(h.grid_kwh).toBeGreaterThan(0);
      expect(h.solar_used_kwh).toBe(30);
    }
  });
});