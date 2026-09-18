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
    scenario_id: "solar-test",

    operator_notes: [
      "Reduce solar output",
    ],

    hours: Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        demand_kwh: 100,
        solar_kwh: 50,
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
  "Directive compiler - solar reduction",
  () => {
    it(
      "applies solar reduction to the specified hours",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "solar_reduction",
              structured_adjustment: {
                hours: [13, 14],
                factor: 0.2,
              },
              explanation:
                "Solar output is reduced to 20% from 1 PM to 3 PM.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[13]
            .solar_factor
        ).toBe(0.2);

        expect(
          result.by_hour[14]
            .solar_factor
        ).toBe(0.2);
      }
    );

    it(
      "does not affect hours outside the reduction window",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "solar_reduction",
              structured_adjustment: {
                hours: [13, 14],
                factor: 0.2,
              },
              explanation:
                "Solar reduction.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[12]
            .solar_factor
        ).toBe(1);

        expect(
          result.by_hour[15]
            .solar_factor
        ).toBe(1);
      }
    );

    it(
      "preserves a factor of 1 correctly",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "solar_reduction",
              structured_adjustment: {
                hours: [10, 11],
                factor: 1,
              },
              explanation:
                "Solar remains fully available.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[10]
            .solar_factor
        ).toBe(1);

        expect(
          result.by_hour[11]
            .solar_factor
        ).toBe(1);
      }
    );

    it(
      "supports complete solar reduction",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "solar_reduction",
              structured_adjustment: {
                hours: [8, 9],
                factor: 0,
              },
              explanation:
                "Solar is unavailable during maintenance.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[8]
            .solar_factor
        ).toBe(0);

        expect(
          result.by_hour[9]
            .solar_factor
        ).toBe(0);

        expect(
          result.by_hour[10]
            .solar_factor
        ).toBe(1);
      }
    );
  }
);