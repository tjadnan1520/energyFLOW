import {
  describe,
  expect,
  it,
} from "vitest";

import {
  compileDirectives,
} from "../../src/directives/directive.compiler";

import type {
  OptimizeEnergyRequest,
} from "../../src/schemas/request.schema";

import type {
  DirectiveInterpretations,
} from "../../src/schemas/directive.schema";

function createRequest(): OptimizeEnergyRequest {
  return {
    scenario_id: "grid-cap-test",

    operator_notes: [
      "Limit grid usage.",
    ],

    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        demand_kwh: 100,
        solar_kwh: 20,
        tariff_bdt_per_kwh: 10,
      })
    ),

    battery: {
      capacity_kwh: 200,
      initial_energy_kwh: 100,
      minimum_energy_kwh: 20,
      max_charge_kwh_per_hour: 30,
      max_discharge_kwh_per_hour: 30,
    },
  };
}

describe(
  "Directive compiler - maximum grid window",
  () => {
    it(
      "applies the grid cap to specified hours",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "max_grid_window",
              structured_adjustment: {
                hours: [18, 19, 20],
                max_grid_kwh: 120,
              },
              explanation:
                "Grid usage cannot exceed 120 kWh.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[18]
            .max_grid_kwh
        ).toBe(120);

        expect(
          result.by_hour[19]
            .max_grid_kwh
        ).toBe(120);

        expect(
          result.by_hour[20]
            .max_grid_kwh
        ).toBe(120);
      }
    );

    it(
      "keeps unlimited grid outside the cap window",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "max_grid_window",
              structured_adjustment: {
                hours: [18, 19, 20],
                max_grid_kwh: 120,
              },
              explanation:
                "Grid cap.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[17]
            .max_grid_kwh
        ).toBe(Infinity);

        expect(
          result.by_hour[21]
            .max_grid_kwh
        ).toBe(Infinity);
      }
    );

    it(
      "uses the stricter cap when multiple grid caps overlap",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "max_grid_window",
              structured_adjustment: {
                hours: [18, 19],
                max_grid_kwh: 150,
              },
              explanation:
                "Grid cap of 150.",
            },
            {
              note_index: 1,
              applies: true,
              directive_type:
                "max_grid_window",
              structured_adjustment: {
                hours: [19, 20],
                max_grid_kwh: 100,
              },
              explanation:
                "Grid cap of 100.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[18]
            .max_grid_kwh
        ).toBe(150);

        expect(
          result.by_hour[19]
            .max_grid_kwh
        ).toBe(100);

        expect(
          result.by_hour[20]
            .max_grid_kwh
        ).toBe(100);
      }
    );
  }
);