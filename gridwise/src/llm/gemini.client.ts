import { GoogleGenAI } from "@google/genai";

import {
  GRIDWISE_SYSTEM_PROMPT,
} from "./prompts";

const apiKey =
  process.env.GEMINI_API_KEY;

if (
  !apiKey ||
  apiKey.trim().length === 0
) {
  throw new Error(
    "GEMINI_API_KEY environment variable is not configured"
  );
}

const gemini =
  new GoogleGenAI({
    apiKey,
  });

const directiveInterpretationJsonSchema =
  {
    type: "object",

    properties: {
      directive_interpretation: {
        type: "array",

        minItems: 1,
        maxItems: 3,

        items: {
          anyOf: [
            {
              type: "object",

              properties: {
                note_index: {
                  type: "integer",
                  minimum: 0,
                  maximum: 2,
                },

                applies: {
                  type: "boolean",
                  enum: [true],
                },

                directive_type: {
                  type: "string",
                  enum: [
                    "solar_reduction",
                  ],
                },

                structured_adjustment: {
                  type: "object",

                  properties: {
                    hours: {
                      type: "array",
                      minItems: 1,
                      maxItems: 24,
                      items: {
                        type: "integer",
                        minimum: 0,
                        maximum: 23,
                      },
                    },

                    factor: {
                      type: "number",
                      minimum: 0,
                      maximum: 1,
                    },
                  },

                  required: [
                    "hours",
                    "factor",
                  ],

                  additionalProperties: false,
                },

                explanation: {
                  type: "string",
                },
              },

              required: [
                "note_index",
                "applies",
                "directive_type",
                "structured_adjustment",
                "explanation",
              ],

              additionalProperties: false,
            },

            {
              type: "object",

              properties: {
                note_index: {
                  type: "integer",
                  minimum: 0,
                  maximum: 2,
                },

                applies: {
                  type: "boolean",
                  enum: [true],
                },

                directive_type: {
                  type: "string",
                  enum: [
                    "minimum_battery_reserve",
                  ],
                },

                structured_adjustment: {
                  type: "object",

                  properties: {
                    hours: {
                      type: "array",
                      minItems: 1,
                      maxItems: 24,
                      items: {
                        type: "integer",
                        minimum: 0,
                        maximum: 23,
                      },
                    },

                    minimum_energy_kwh: {
                      type: "number",
                      minimum: 0,
                    },
                  },

                  required: [
                    "hours",
                    "minimum_energy_kwh",
                  ],

                  additionalProperties: false,
                },

                explanation: {
                  type: "string",
                },
              },

              required: [
                "note_index",
                "applies",
                "directive_type",
                "structured_adjustment",
                "explanation",
              ],

              additionalProperties: false,
            },

            {
              type: "object",

              properties: {
                note_index: {
                  type: "integer",
                  minimum: 0,
                  maximum: 2,
                },

                applies: {
                  type: "boolean",
                  enum: [true],
                },

                directive_type: {
                  type: "string",
                  enum: [
                    "no_charge_window",
                  ],
                },

                structured_adjustment: {
                  type: "object",

                  properties: {
                    hours: {
                      type: "array",
                      minItems: 1,
                      maxItems: 24,
                      items: {
                        type: "integer",
                        minimum: 0,
                        maximum: 23,
                      },
                    },
                  },

                  required: [
                    "hours",
                  ],

                  additionalProperties: false,
                },

                explanation: {
                  type: "string",
                },
              },

              required: [
                "note_index",
                "applies",
                "directive_type",
                "structured_adjustment",
                "explanation",
              ],

              additionalProperties: false,
            },

            {
              type: "object",

              properties: {
                note_index: {
                  type: "integer",
                  minimum: 0,
                  maximum: 2,
                },

                applies: {
                  type: "boolean",
                  enum: [true],
                },

                directive_type: {
                  type: "string",
                  enum: [
                    "no_discharge_window",
                  ],
                },

                structured_adjustment: {
                  type: "object",

                  properties: {
                    hours: {
                      type: "array",
                      minItems: 1,
                      maxItems: 24,
                      items: {
                        type: "integer",
                        minimum: 0,
                        maximum: 23,
                      },
                    },
                  },

                  required: [
                    "hours",
                  ],

                  additionalProperties: false,
                },

                explanation: {
                  type: "string",
                },
              },

              required: [
                "note_index",
                "applies",
                "directive_type",
                "structured_adjustment",
                "explanation",
              ],

              additionalProperties: false,
            },

            {
              type: "object",

              properties: {
                note_index: {
                  type: "integer",
                  minimum: 0,
                  maximum: 2,
                },

                applies: {
                  type: "boolean",
                  enum: [true],
                },

                directive_type: {
                  type: "string",
                  enum: [
                    "max_grid_window",
                  ],
                },

                structured_adjustment: {
                  type: "object",

                  properties: {
                    hours: {
                      type: "array",
                      minItems: 1,
                      maxItems: 24,
                      items: {
                        type: "integer",
                        minimum: 0,
                        maximum: 23,
                      },
                    },

                    max_grid_kwh: {
                      type: "number",
                      minimum: 0,
                    },
                  },

                  required: [
                    "hours",
                    "max_grid_kwh",
                  ],

                  additionalProperties: false,
                },

                explanation: {
                  type: "string",
                },
              },

              required: [
                "note_index",
                "applies",
                "directive_type",
                "structured_adjustment",
                "explanation",
              ],

              additionalProperties: false,
            },

            {
              type: "object",

              properties: {
                note_index: {
                  type: "integer",
                  minimum: 0,
                  maximum: 2,
                },

                applies: {
                  type: "boolean",
                  enum: [false],
                },

                directive_type: {
                  type: "string",
                  enum: [
                    "no_op",
                  ],
                },

                structured_adjustment: {
                  type: "null",
                },

                explanation: {
                  type: "string",
                },
              },

              required: [
                "note_index",
                "applies",
                "directive_type",
                "structured_adjustment",
                "explanation",
              ],

              additionalProperties: false,
            },
          ],
        },
      },
    },

    required: [
      "directive_interpretation",
    ],

    additionalProperties: false,
  };

export async function generateDirectiveInterpretation(
  prompt: string
): Promise<string> {
  const model =
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-3.6-flash";

  const response =
    await gemini.interactions.create({
      model,

      system_instruction:
        GRIDWISE_SYSTEM_PROMPT,

      input: prompt,

      response_format: {
        type: "text",
        mime_type: "application/json",
        schema:
          directiveInterpretationJsonSchema,
      },

      generation_config: {
        seed: 1,
      },
    });

  const output =
    response.output_text;

  if (
    !output ||
    output.trim().length === 0
  ) {
    throw new Error(
      "Gemini returned an empty structured response"
    );
  }

  return output.trim();
}