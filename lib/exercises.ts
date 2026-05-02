export interface LibraryExercise {
  id: string
  name: string
  muscle_group: string
  equipment: string
}

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  // Brust
  { id: 'bench-press',     name: 'Bankdrücken',           muscle_group: 'Brust',     equipment: 'Langhantel'    },
  { id: 'incline-press',   name: 'Schrägbankdrücken',     muscle_group: 'Brust',     equipment: 'Langhantel'    },
  { id: 'chest-fly-db',    name: 'Fliegende',             muscle_group: 'Brust',     equipment: 'Kurzhantel'    },
  { id: 'cable-fly',       name: 'Kabelzug Fly',          muscle_group: 'Brust',     equipment: 'Kabelzug'      },
  { id: 'dips-chest',      name: 'Dips (Brust)',          muscle_group: 'Brust',     equipment: 'Körpergewicht' },
  { id: 'push-up',         name: 'Liegestütz',            muscle_group: 'Brust',     equipment: 'Körpergewicht' },
  // Rücken
  { id: 'deadlift',        name: 'Kreuzheben',            muscle_group: 'Rücken',    equipment: 'Langhantel'    },
  { id: 'pullup',          name: 'Klimmzug',              muscle_group: 'Rücken',    equipment: 'Körpergewicht' },
  { id: 'lat-pulldown',    name: 'Latziehen',             muscle_group: 'Rücken',    equipment: 'Kabelzug'      },
  { id: 'row-barbell',     name: 'Rudern vorgebeugt',     muscle_group: 'Rücken',    equipment: 'Langhantel'    },
  { id: 'row-cable',       name: 'Kabelrudern',           muscle_group: 'Rücken',    equipment: 'Kabelzug'      },
  { id: 'row-dumbbell',    name: 'Kurzhantelrudern',      muscle_group: 'Rücken',    equipment: 'Kurzhantel'    },
  // Schultern
  { id: 'ohp',             name: 'Schulterdrücken',       muscle_group: 'Schultern', equipment: 'Langhantel'    },
  { id: 'ohp-db',          name: 'Schulterdrücken',       muscle_group: 'Schultern', equipment: 'Kurzhantel'    },
  { id: 'lateral-raise',   name: 'Seitheben',             muscle_group: 'Schultern', equipment: 'Kurzhantel'    },
  { id: 'face-pull',       name: 'Face Pull',             muscle_group: 'Schultern', equipment: 'Kabelzug'      },
  { id: 'shrug',           name: 'Schulterziehen',        muscle_group: 'Schultern', equipment: 'Langhantel'    },
  // Bizeps
  { id: 'bicep-curl-db',   name: 'Bizeps Curl',           muscle_group: 'Bizeps',    equipment: 'Kurzhantel'    },
  { id: 'hammer-curl',     name: 'Hammer Curl',           muscle_group: 'Bizeps',    equipment: 'Kurzhantel'    },
  { id: 'bicep-curl-bar',  name: 'Stangen Curl',          muscle_group: 'Bizeps',    equipment: 'Kurzstange'    },
  { id: 'cable-curl',      name: 'Kabel Curl',            muscle_group: 'Bizeps',    equipment: 'Kabelzug'      },
  // Trizeps
  { id: 'pushdown',        name: 'Trizeps Pushdown',      muscle_group: 'Trizeps',   equipment: 'Kabelzug'      },
  { id: 'skull-crusher',   name: 'Skull Crusher',         muscle_group: 'Trizeps',   equipment: 'Langhantel'    },
  { id: 'overhead-ext',    name: 'Overhead Extension',    muscle_group: 'Trizeps',   equipment: 'Kurzhantel'    },
  { id: 'dips-tri',        name: 'Dips (Trizeps)',        muscle_group: 'Trizeps',   equipment: 'Körpergewicht' },
  // Beine
  { id: 'squat',           name: 'Kniebeuge',             muscle_group: 'Beine',     equipment: 'Langhantel'    },
  { id: 'leg-press',       name: 'Beinpresse',            muscle_group: 'Beine',     equipment: 'Maschine'      },
  { id: 'leg-extension',   name: 'Beinstrecker',          muscle_group: 'Beine',     equipment: 'Maschine'      },
  { id: 'leg-curl',        name: 'Beinbeuger',            muscle_group: 'Beine',     equipment: 'Maschine'      },
  { id: 'lunges',          name: 'Ausfallschritte',       muscle_group: 'Beine',     equipment: 'Kurzhantel'    },
  { id: 'rdl',             name: 'Rumänisches Kreuzheben',muscle_group: 'Beine',     equipment: 'Langhantel'    },
  { id: 'calf-raise',      name: 'Wadenheben',            muscle_group: 'Beine',     equipment: 'Maschine'      },
  { id: 'goblet-squat',    name: 'Goblet Squat',          muscle_group: 'Beine',     equipment: 'Kurzhantel'    },
  // Core
  { id: 'plank',           name: 'Plank',                 muscle_group: 'Core',      equipment: 'Körpergewicht' },
  { id: 'crunch',          name: 'Crunch',                muscle_group: 'Core',      equipment: 'Körpergewicht' },
  { id: 'leg-raise',       name: 'Beinheben',             muscle_group: 'Core',      equipment: 'Körpergewicht' },
  { id: 'ab-wheel',        name: 'Ab Roller',             muscle_group: 'Core',      equipment: 'Gerät'         },
  { id: 'russian-twist',   name: 'Russian Twist',         muscle_group: 'Core',      equipment: 'Körpergewicht' },
]

export const MUSCLE_GROUPS = [...new Set(EXERCISE_LIBRARY.map(e => e.muscle_group))]
