import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import request from "supertest";

const {
  mockInterpretOperatorNotes,
} = vi.hoisted(() => ({
  mockInterpretOperatorNotes:
    vi.fn(),
}));

vi.mock(
  "../../src/llm/interpreter",
  () => ({
    interpretOperatorNotes:
      mockInterpretOperatorNotes,
  })
);

import app from "../../src/app";

type PublicDirective = {
  note_index: number;
  applies: boolean;
  directive_type: string;

  structured_adjustment:
    | {
        hours: number[];
        factor?: number;
        minimum_energy_kwh?: number;
        max_grid_kwh?: number;
      }
    | null;

  explanation: string;
};

type PublicHourlyPlanEntry = {
  hour: number;
  grid_kwh: number;
  solar_used_kwh: number;

  battery_action:
    | "charge"
    | "discharge"
    | "idle";

  battery_kwh: number;
  battery_energy_after_kwh: number;
};

type PublicSampleCase = {
  id: string;
  label: string;

  input: {
    scenario_id: string;

    operator_notes: string[];

    hours: Array<{
      hour: number;
      demand_kwh: number;
      solar_kwh: number;
      tariff_bdt_per_kwh: number;
    }>;

    battery: {
      capacity_kwh: number;
      initial_energy_kwh: number;
      minimum_energy_kwh: number;
      max_charge_kwh_per_hour: number;
      max_discharge_kwh_per_hour: number;
    };
  };

  expected_output: {
    scenario_id: string;

    directive_interpretation:
      PublicDirective[];

    hourly_plan:
      PublicHourlyPlanEntry[];

    total_grid_kwh: number;
    total_cost_bdt: number;
    peak_grid_kwh: number;

    plan_summary: string;
  };
};

type PublicSamplePack = {
  _meta: {
    case_count: number;
  };

  cases: PublicSampleCase[];
};

const fixturePath =
  path.resolve(
    process.cwd(),
    "tests",
    "fixtures",
    "public-samples.json"
  );

const fixture =
  JSON.parse(
    fs.readFileSync(
      fixturePath,
      "utf-8"
    )
  ) as PublicSamplePack;

const TOLERANCE = 0.01;

function expectClose(
  actual: number,
  expected: number,
  tolerance = TOLERANCE
): void {
  expect(
    Math.abs(actual - expected)
  ).toBeLessThanOrEqual(
    tolerance
  );
}

function normalizeDirective(
  directive: PublicDirective
) {
  return {
    note_index:
      directive.note_index,

    applies:
      directive.applies,

    directive_type:
      directive.directive_type,

    structured_adjustment:
      directive.structured_adjustment,
  };
}

function calculatePlanCost(
  sampleCase: PublicSampleCase,
  plan: PublicHourlyPlanEntry[]
): number {
  return plan.reduce(
    (total, entry) => {
      const inputHour =
        sampleCase.input.hours[
          entry.hour
        ];

      return (
        total +
        entry.grid_kwh *
          inputHour.tariff_bdt_per_kwh
      );
    },
    0
  );
}

function calculateTotalGrid(
  plan: PublicHourlyPlanEntry[]
): number {
  return plan.reduce(
    (total, entry) =>
      total + entry.grid_kwh,
    0
  );
}

function calculatePeakGrid(
  plan: PublicHourlyPlanEntry[]
): number {
  if (plan.length === 0) {
    return 0;
  }

  return Math.max(
    ...plan.map(
      (entry) => entry.grid_kwh
    )
  );
}

describe(
  "GridWise public sample cases",
  () => {
    it(
      "loads the official public sample pack",
      () => {
        expect(
          fixture.cases
        ).toHaveLength(10);

        expect(
          fixture._meta.case_count
        ).toBe(10);
      }
    );

    for (
      const sampleCase of fixture.cases
    ) {
      describe(
        `${sampleCase.id}: ${sampleCase.label}`,
        () => {
          it(
            "returns HTTP 200",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              expect(
                response.status
              ).toBe(200);
            }
          );

          it(
            "returns the correct scenario_id",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              expect(
                response.body
                  .scenario_id
              ).toBe(
                sampleCase.input
                  .scenario_id
              );
            }
          );

          it(
            "interprets every operator note correctly",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              const actual =
                response.body
                  .directive_interpretation
                  .map(
                    normalizeDirective
                  );

              const expected =
                sampleCase
                  .expected_output
                  .directive_interpretation
                  .map(
                    normalizeDirective
                  );

              expect(
                actual
              ).toEqual(
                expected
              );
            }
          );

          it(
            "calls the operator-note interpreter exactly once",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              await request(app)
                .post(
                  "/optimize-energy"
                )
                .send(
                  sampleCase.input
                );

              expect(
                mockInterpretOperatorNotes
              ).toHaveBeenCalledTimes(
                1
              );
            }
          );

          it(
            "returns exactly 24 hourly plan entries",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              expect(
                response.body
                  .hourly_plan
              ).toHaveLength(24);
            }
          );

          it(
            "returns hourly plan entries from hour 0 through 23",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              const hours =
                response.body
                  .hourly_plan
                  .map(
                    (
                      entry: PublicHourlyPlanEntry
                    ) =>
                      entry.hour
                  );

              expect(
                hours
              ).toEqual(
                Array.from(
                  {
                    length: 24,
                  },
                  (_, index) =>
                    index
                )
              );
            }
          );

          it(
            "returns valid battery actions",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              for (
                const entry of response
                  .body
                  .hourly_plan as PublicHourlyPlanEntry[]
              ) {
                expect([
                  "charge",
                  "discharge",
                  "idle",
                ]).toContain(
                  entry.battery_action
                );

                expect(
                  entry.grid_kwh
                ).toBeGreaterThanOrEqual(
                  0
                );

                expect(
                  entry.solar_used_kwh
                ).toBeGreaterThanOrEqual(
                  0
                );

                expect(
                  entry.battery_kwh
                ).toBeGreaterThanOrEqual(
                  0
                );

                expect(
                  entry.battery_energy_after_kwh
                ).toBeGreaterThanOrEqual(
                  0
                );

                if (
                  entry.battery_action ===
                  "idle"
                ) {
                  expect(
                    entry.battery_kwh
                  ).toBe(0);
                }
              }
            }
          );

          it(
            "returns a cost matching the reference optimum",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              expectClose(
                response.body
                  .total_cost_bdt,
                sampleCase
                  .expected_output
                  .total_cost_bdt
              );
            }
          );

          it(
            "returns totals consistent with the returned hourly plan",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              const plan =
                response.body
                  .hourly_plan as PublicHourlyPlanEntry[];

              const calculatedCost =
                calculatePlanCost(
                  sampleCase,
                  plan
                );

              const calculatedGrid =
                calculateTotalGrid(
                  plan
                );

              const calculatedPeak =
                calculatePeakGrid(
                  plan
                );

              expectClose(
                response.body
                  .total_cost_bdt,
                calculatedCost
              );

              expectClose(
                response.body
                  .total_grid_kwh,
                calculatedGrid
              );

              expectClose(
                response.body
                  .peak_grid_kwh,
                calculatedPeak
              );
            }
          );

          it(
            "returns a non-empty plan summary",
            async () => {
              mockInterpretOperatorNotes.mockReset();

              mockInterpretOperatorNotes.mockResolvedValue(
                sampleCase
                  .expected_output
                  .directive_interpretation
              );

              const response =
                await request(app)
                  .post(
                    "/optimize-energy"
                  )
                  .send(
                    sampleCase.input
                  );

              expect(
                typeof response.body
                  .plan_summary
              ).toBe("string");

              expect(
                response.body
                  .plan_summary
                  .trim()
                  .length
              ).toBeGreaterThan(
                0
              );
            }
          );
        }
      );
    }
  }
);