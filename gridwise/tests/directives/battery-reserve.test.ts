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
    scenario_id: "battery-reserve-test",

    operator_notes: [
      "Keep battery reserve",
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
  "Directive compiler - minimum battery reserve",
  () => {
    it(
      "applies the requested reserve to specified hours",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "minimum_battery_reserve",
              structured_adjustment: {
                hours: [18, 19, 20],
                minimum_energy_kwh: 100,
              },
              explanation:
                "Keep at least 100 kWh in the battery.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[18]
            .minimum_battery_energy_kwh
        ).toBe(100);

        expect(
          result.by_hour[19]
            .minimum_battery_energy_kwh
        ).toBe(100);

        expect(
          result.by_hour[20]
            .minimum_battery_energy_kwh
        ).toBe(100);
      }
    );

    it(
      "keeps the base battery minimum outside the reserve window",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "minimum_battery_reserve",
              structured_adjustment: {
                hours: [18, 19, 20],
                minimum_energy_kwh: 100,
              },
              explanation:
                "Battery reserve.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[17]
            .minimum_battery_energy_kwh
        ).toBe(20);

        expect(
          result.by_hour[21]
            .minimum_battery_energy_kwh
        ).toBe(20);
      }
    );

    it(
      "does not lower the configured base minimum",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "minimum_battery_reserve",
              structured_adjustment: {
                hours: [10],
                minimum_energy_kwh: 10,
              },
              explanation:
                "Requested reserve is below the base minimum.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[10]
            .minimum_battery_energy_kwh
        ).toBe(20);
      }
    );

    it(
      "uses the highest reserve when multiple reserve directives overlap",
      () => {
        const request =
          createRequest();

        const interpretations: DirectiveInterpretations =
          [
            {
              note_index: 0,
              applies: true,
              directive_type:
                "minimum_battery_reserve",
              structured_adjustment: {
                hours: [18, 19],
                minimum_energy_kwh: 80,
              },
              explanation:
                "Keep 80 kWh.",
            },
            {
              note_index: 1,
              applies: true,
              directive_type:
                "minimum_battery_reserve",
              structured_adjustment: {
                hours: [19, 20],
                minimum_energy_kwh: 120,
              },
              explanation:
                "Keep 120 kWh.",
            },
          ];

        const result =
          compileDirectives(
            request,
            interpretations
          );

        expect(
          result.by_hour[18]
            .minimum_battery_energy_kwh
        ).toBe(80);

        expect(
          result.by_hour[19]
            .minimum_battery_energy_kwh
        ).toBe(120);

        expect(
          result.by_hour[20]
            .minimum_battery_energy_kwh
        ).toBe(120);
      }
    );
  }
);
