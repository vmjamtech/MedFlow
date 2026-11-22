/**
 * Clinical utilities: Blood Pressure, Blood Sugar, and Resting Pulse classifications
 * Based on ACC/AHA and ADA clinical guidelines
 */

export interface VitalStatus {
  label: string;
  badge: string; // Tailwind classes
  interpretation: string;
}

/**
 * Blood Pressure Classification (ACC/AHA 2017 Guidelines)
 * Context-aware for Orthostatic Hypotension risk in elderly
 */
export function classifyBloodPressure(sys: number, dia: number): VitalStatus {
  // Elevated: Systolic 120–129 AND Diastolic <80
  if (sys >= 120 && sys < 130 && dia < 80) {
    return {
      label: 'Elevated',
      badge: 'bg-amber-100 text-amber-700',
      interpretation: 'Monitor closely, lifestyle modifications recommended',
    };
  }

  // Stage 1 Hypertension: Systolic 130–139 OR Diastolic 80–89
  if ((sys >= 130 && sys < 140) || (dia >= 80 && dia < 90)) {
    return {
      label: 'Stage 1 HTN',
      badge: 'bg-orange-100 text-orange-700',
      interpretation: 'Confirm with home BP log, consider antihypertensive therapy',
    };
  }

  // Stage 2 Hypertension: Systolic ≥140 OR Diastolic ≥90
  if (sys >= 140 || dia >= 90) {
    return {
      label: 'Stage 2 HTN',
      badge: 'bg-rose-100 text-rose-700',
      interpretation: 'High cardiovascular risk, urgent antihypertensive management needed',
    };
  }

  // Hypotension: Systolic <90 OR Diastolic <60
  if (sys < 90 || dia < 60) {
    return {
      label: 'Hypotension',
      badge: 'bg-sky-100 text-sky-700',
      interpretation: 'Low BP detected, assess for orthostatic symptoms',
    };
  }

  // Normal: Systolic <120 AND Diastolic <80
  return {
    label: 'Normal',
    badge: 'bg-emerald-100 text-emerald-700',
    interpretation: 'Optimal blood pressure control',
  };
}

/**
 * Blood Glucose Classification (ADA Standards of Care 2024)
 * Context-sensitive: Fasting vs. Post-Meal expectations
 */
export function classifyBloodGlucose(valueMgDl: number, context?: string): VitalStatus {
  const isFasting = !context || context.toLowerCase().includes('fasting') || context.includes('8+');
  const isPostMeal = context && (context.includes('After Meal') || context.includes('2h'));

  // Hypoglycemia: <70 mg/dL (dangerous regardless of context)
  if (valueMgDl < 70) {
    return {
      label: 'Hypoglycemia',
      badge: 'bg-sky-100 text-sky-700',
      interpretation: 'Low blood sugar detected, consume 15g fast-acting carbs immediately',
    };
  }

  if (isFasting) {
    // Fasting Dysglycemia: Normal <100, Impaired 100-125, Diabetic ≥126
    if (valueMgDl >= 126) {
      return {
        label: 'Diabetic Range',
        badge: 'bg-rose-100 text-rose-700',
        interpretation: 'Fasting glucose ≥126 mg/dL meets diabetes diagnosis threshold',
      };
    }
    if (valueMgDl >= 100) {
      return {
        label: 'Impaired Fasting',
        badge: 'bg-amber-100 text-amber-700',
        interpretation: 'Prediabetic range (100-125 mg/dL), lifestyle intervention recommended',
      };
    }
    return {
      label: 'Normal (Fasting)',
      badge: 'bg-emerald-100 text-emerald-700',
      interpretation: 'Fasting glucose within normal range (<100 mg/dL)',
    };
  }

  if (isPostMeal) {
    // Post-Meal (2h After): Normal <140, Prediabetic 140-199, Diabetic ≥200
    if (valueMgDl >= 200) {
      return {
        label: 'Diabetic (2h Post)',
        badge: 'bg-rose-100 text-rose-700',
        interpretation: 'Post-meal glucose ≥200 mg/dL meets diabetes diagnosis threshold',
      };
    }
    if (valueMgDl >= 140) {
      return {
        label: 'Impaired Tolerance',
        badge: 'bg-amber-100 text-amber-700',
        interpretation: 'Prediabetic range 2 hours after meal, assess meal composition',
      };
    }
    return {
      label: 'Normal (Post-Meal)',
      badge: 'bg-emerald-100 text-emerald-700',
      interpretation: '2-hour post-meal glucose within target (<140 mg/dL)',
    };
  }

  // General non-fasting, non-postmeal context
  if (valueMgDl >= 180) {
    return {
      label: 'High',
      badge: 'bg-rose-100 text-rose-700',
      interpretation: 'Glucose >180 mg/dL, consider meal/medication adjustment',
    };
  }

  return {
    label: 'Normal',
    badge: 'bg-emerald-100 text-emerald-700',
    interpretation: 'Blood glucose within normal range',
  };
}

/**
 * Resting Pulse Rate Classification
 * HR <60 = Bradycardia, 60-100 = Normal, >100 = Tachycardia
 * Athlete status and fitness level affect interpretation
 */
export function classifyRestingPulse(bpm: number): VitalStatus {
  // Bradycardia: <60 bpm (can be normal for athletes)
  if (bpm < 60) {
    return {
      label: 'Bradycardia',
      badge: 'bg-sky-100 text-sky-700',
      interpretation: 'Low resting HR (<60 bpm). Normal for athletes; evaluate if symptomatic',
    };
  }

  // Normal: 60-100 bpm
  if (bpm <= 100) {
    return {
      label: 'Normal',
      badge: 'bg-emerald-100 text-emerald-700',
      interpretation: 'Resting heart rate within normal range (60-100 bpm)',
    };
  }

  // Tachycardia: >100 bpm
  return {
    label: 'Tachycardia',
    badge: 'bg-amber-100 text-amber-700',
    interpretation: 'Elevated resting HR (>100 bpm). Check for fever, anxiety, or medication effects',
  };
}

/**
 * Body Temperature Classification (Celsius)
 */
export function classifyTemperature(celsius: number): VitalStatus {
  if (celsius < 36.0) {
    return {
      label: 'Hypothermia',
      badge: 'bg-sky-100 text-sky-700',
      interpretation: 'Body temperature <36°C, assess for cold exposure or metabolic issues',
    };
  }

  if (celsius >= 37.8) {
    return {
      label: 'Fever',
      badge: 'bg-rose-100 text-rose-700',
      interpretation: `Fever ≥${celsius}°C detected, assess for infection or inflammatory condition`,
    };
  }

  if (celsius >= 37.0) {
    return {
      label: 'Elevated',
      badge: 'bg-amber-100 text-amber-700',
      interpretation: 'Slight temperature elevation, monitor for fever development',
    };
  }

  return {
    label: 'Normal',
    badge: 'bg-emerald-100 text-emerald-700',
    interpretation: 'Body temperature within normal range (36.0–37.0°C)',
  };
}

/**
 * Oxygen Saturation (SpO2) Classification
 */
export function classifySpO2(percentage: number): VitalStatus {
  if (percentage < 90) {
    return {
      label: 'Critical',
      badge: 'bg-rose-100 text-rose-700',
      interpretation: 'SpO2 <90% requires urgent medical attention',
    };
  }

  if (percentage < 95) {
    return {
      label: 'Low',
      badge: 'bg-amber-100 text-amber-700',
      interpretation: 'SpO2 90-94%, monitor respiratory status and consider oxygen therapy',
    };
  }

  return {
    label: 'Optimal',
    badge: 'bg-emerald-100 text-emerald-700',
    interpretation: 'SpO2 ≥95%, oxygen saturation normal',
  };
}

/**
 * Unified vital status lookup (used in UI for quick classification)
 */
export function getVitalStatus(
  vitalOrType: any,
  data?: any
): { status: string; label: string } {
  let type: string;
  let statusObj: VitalStatus;

  // Handle both old and new signatures
  if (typeof vitalOrType === 'object' && vitalOrType.type) {
    // New signature: getVitalStatus(vital)
    type = vitalOrType.type;
    const vital = vitalOrType;

    if (type === 'bp' && vital.sys !== undefined && vital.dia !== undefined) {
      statusObj = classifyBloodPressure(vital.sys, vital.dia);
    } else if (type === 'sugar' && vital.valueMgDl !== undefined) {
      statusObj = classifyBloodGlucose(vital.valueMgDl, vital.context);
    } else if (type === 'pulse' && vital.value !== undefined) {
      statusObj = classifyRestingPulse(vital.value);
    } else if (type === 'temp' && vital.value !== undefined) {
      statusObj = classifyTemperature(vital.value);
    } else if (type === 'spo2' && vital.value !== undefined) {
      statusObj = classifySpO2(vital.value);
    } else {
      statusObj = {
        label: 'No Data',
        badge: 'bg-slate-100 text-slate-600',
        interpretation: 'No vital reading recorded yet',
      };
    }
  } else {
    // Old signature: getVitalStatus(type, data)
    type = vitalOrType;
    if (type === 'bp' && data.sys !== undefined && data.dia !== undefined) {
      statusObj = classifyBloodPressure(data.sys, data.dia);
    } else if (type === 'sugar' && data.valueMgDl !== undefined) {
      statusObj = classifyBloodGlucose(data.valueMgDl, data.context);
    } else if (type === 'pulse' && data.value !== undefined) {
      statusObj = classifyRestingPulse(data.value);
    } else if (type === 'temp' && data.value !== undefined) {
      statusObj = classifyTemperature(data.value);
    } else if (type === 'spo2' && data.value !== undefined) {
      statusObj = classifySpO2(data.value);
    } else {
      statusObj = {
        label: 'No Data',
        badge: 'bg-slate-100 text-slate-600',
        interpretation: 'No vital reading recorded yet',
      };
    }
  }

  // Map status label to status name for color mapping
  let status = 'normal';
  if (statusObj.label.includes('Elevated') || statusObj.label.includes('HTN')) {
    status = 'elevated';
  } else if (statusObj.label.includes('Low') || statusObj.label.includes('High') || 
             statusObj.label.includes('Abnormal') || statusObj.label.includes('Impaired') ||
             statusObj.label.includes('Diabetic') || statusObj.label.includes('Critical') ||
             statusObj.label.includes('Hypotension') || statusObj.label.includes('Hypoglycemia')) {
    status = 'abnormal';
  }

  return {
    status,
    label: statusObj.label,
  };
}

/**
 * Glucose unit conversion (internal always mg/dL, display as requested)
 */
export function convertGlucose(mgDl: number, toUnit: 'mg/dL' | 'mmol/L'): number {
  if (toUnit === 'mmol/L') {
    return Number((mgDl / 18.0182).toFixed(1));
  }
  return Math.round(mgDl);
}
