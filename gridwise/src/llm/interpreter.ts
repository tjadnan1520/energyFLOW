import {
  directiveInterpretationsSchema,
  type DirectiveInterpretations,
} from "../schemas/directive.schema";

import type {
  OptimizeEnergyRequest,
} from "../schemas/request.schema";

import {
  generateDirectiveInterpretation,
} from "./gemini.client";

import {
  buildInterpreterPrompt,
} from "./prompts";

export async function interpretOperatorNotes(
  request: OptimizeEnergyRequest
): Promise<DirectiveInterpretations> {
  const prompt =
    buildInterpreterPrompt(request);

  const rawOutput =
    await generateDirectiveInterpretation(
      prompt
    );

  let parsedOutput: unknown;

  try {
    parsedOutput = JSON.parse(rawOutput);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON"
    );
  }

  const validationResult =
    directiveInterpretationsSchema.safeParse(
      parsedOutput &&
        typeof parsedOutput === "object" &&
        "directive_interpretation" in parsedOutput
        ? (
            parsedOutput as {
              directive_interpretation: unknown;
            }
          ).directive_interpretation
        : undefined
    );

  if (!validationResult.success) {
    throw new Error(
      `Gemini directive validation failed: ${validationResult.error.message}`
    );
  }

  const interpretations =
    validationResult.data;

  validateInterpretationMapping(
    interpretations,
    request.operator_notes.length
  );

  return interpretations;
}

function validateInterpretationMapping(
  interpretations: DirectiveInterpretations,
  noteCount: number
): void {
  if (interpretations.length !== noteCount) {
    throw new Error(
      `Gemini returned ${interpretations.length} interpretations for ${noteCount} notes`
    );
  }

  for (
    let index = 0;
    index < noteCount;
    index += 1
  ) {
    const interpretation =
      interpretations[index];

    if (
      interpretation.note_index !== index
    ) {
      throw new Error(
        `Invalid note mapping at position ${index}`
      );
    }
  }
}