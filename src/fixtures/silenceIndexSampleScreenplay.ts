/**
 * Reproducible two-scene screenplay for cinematic pipeline tests.
 * Inspired by THE SILENCE INDEX tone: recurring cast, location, prop, reveal, reaction.
 */
export const SILENCE_INDEX_SAMPLE_SCRIPT = `THE SILENCE INDEX — SAMPLE

INT. OBSERVATION GALLERY - NIGHT

Rain streaks the glass. MARA VALE (30s) stands at the window, dry inside, watching the city. In her hand: the SILENCE INDEX TOKEN, a black metal disc.

MARA
They said the reading never lies.

She turns as DAMIEN CROWE (40s) enters behind her, coat dripping.

DAMIEN
Then why is the gallery empty?

Mara closes her fist around the token. Damien's eyes catch the gesture.

MARA
Because everyone who heard the last frequency stopped answering.

CLOSE on Mara's knuckles whitening around the disc.

INT. ARCHIVE CORRIDOR - NIGHT

Fluorescent hum. Damien leads Mara down the corridor toward a sealed steel door marked INDEX 09.

DAMIEN
If the token opens it, we don't come back the same.

Mara presses the Silence Index Token to the reader. A green light. The door unseals with a soft vacuum hiss — the REVEAL.

Damien flinches. Mara does not. She looks at him — a reaction that decides the night — then steps through first.
`;

export const SILENCE_INDEX_SAMPLE_REFERENCES = [
  {
    id: 'char-mara',
    type: 'character' as const,
    name: 'Mara Vale',
    description: 'Analyst, 30s, controlled, haunted eyes',
    prompt: 'Mara Vale, 30s woman, dark coat, controlled expression',
    imageUrl: 'https://example.com/mara.png',
    isGenerating: false,
    outfits: [
      {
        id: 'outfit-mara-gallery',
        name: 'Gallery black',
        description: 'Episodes in the gallery',
        prompt: 'black tailored coat, dark turtleneck',
        imageUrl: 'https://example.com/mara-outfit.png',
      },
    ],
  },
  {
    id: 'char-damien',
    type: 'character' as const,
    name: 'Damien Crowe',
    description: 'Handler, 40s, wet coat, wary',
    prompt: 'Damien Crowe, 40s man, rain-soaked coat',
    imageUrl: 'https://example.com/damien.png',
    isGenerating: false,
  },
  {
    id: 'env-gallery',
    type: 'environment' as const,
    name: 'Observation Gallery',
    description: 'Glass wall overlooking the city at night',
    prompt: 'night observation gallery, rain on glass, dry interior',
    imageUrl: 'https://example.com/gallery.png',
    isGenerating: false,
  },
  {
    id: 'env-corridor',
    type: 'environment' as const,
    name: 'Archive Corridor',
    description: 'Fluorescent corridor to Index 09',
    prompt: 'archive corridor, fluorescent lights, sealed steel door',
    imageUrl: 'https://example.com/corridor.png',
    isGenerating: false,
  },
  {
    id: 'prop-token',
    type: 'prop' as const,
    name: 'Silence Index Token',
    description: 'Black metal disc that opens Index doors',
    prompt: 'black metal silence index token disc',
    imageUrl: 'https://example.com/token.png',
    isGenerating: false,
  },
];
