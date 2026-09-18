export function isHourInWindow(
  hour: number,
  hours: readonly number[]
): boolean {
  return hours.includes(hour);
}

export function normalizeHours(
  hours: readonly number[]
): number[] {
  return [...new Set(hours)].sort(
    (a, b) => a - b
  );
}

export function isValidHour(
  hour: number
): boolean {
  return (
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23
  );
}

export function areValidHours(
  hours: readonly number[]
): boolean {
  if (hours.length === 0) {
    return false;
  }

  const uniqueHours =
    new Set(hours);

  if (
    uniqueHours.size !==
    hours.length
  ) {
    return false;
  }

  for (
    const hour of hours
  ) {
    if (!isValidHour(hour)) {
      return false;
    }
  }

  for (
    let index = 1;
    index < hours.length;
    index += 1
  ) {
    if (
      hours[index] <=
      hours[index - 1]
    ) {
      return false;
    }
  }

  return true;
}

export function createHourRange(
  startHour: number,
  endHour: number
): number[] {
  if (
    !isValidHour(startHour) ||
    !Number.isInteger(endHour) ||
    endHour < 0 ||
    endHour > 24
  ) {
    throw new Error(
      "Invalid hour range"
    );
  }

  if (endHour <= startHour) {
    throw new Error(
      "End hour must be greater than start hour"
    );
  }

  return Array.from(
    {
      length:
        endHour - startHour,
    },
    (_, index) =>
      startHour + index
  );
}