/**
 * Chybové typy výpočtu cílů. Bezpečnostní limity nejsou volitelné, proto se
 * neplatné vstupy hlásí výjimkou a cíl se v takovém případě nevytvoří.
 */

export class RateOutOfRange extends Error {
  constructor(message = 'Tempo hubnutí je mimo povolený rozsah (0 až 1 kg/týden).') {
    super(message);
    this.name = 'RateOutOfRange';
  }
}

export class HeightOutOfRange extends Error {
  constructor(message = 'Výška je mimo povolený rozsah (100 až 250 cm).') {
    super(message);
    this.name = 'HeightOutOfRange';
  }
}

export class InvalidBirthDate extends Error {
  constructor(message = 'Neplatné datum narození.') {
    super(message);
    this.name = 'InvalidBirthDate';
  }
}

export class TargetWeightUnsafe extends Error {
  /** Nejnižší přijatelná váha (BMI 18,5) pro danou výšku, v kg. */
  readonly lowestAcceptableWeightKg: number;

  constructor(lowestAcceptableWeightKg: number, message?: string) {
    super(
      message ??
        `Cílová váha odpovídá BMI pod 18,5. Nejnižší přijatelná váha je ${lowestAcceptableWeightKg} kg.`,
    );
    this.name = 'TargetWeightUnsafe';
    this.lowestAcceptableWeightKg = lowestAcceptableWeightKg;
  }
}
