// src/lib/jee-syllabus.ts
//
// Unit order and extra detail for the JEE Main 2026 syllabus pages. Unit numbers follow the order of
// the syllabus NTA published for JEE Main 2026 (Paper 1); the topic text for each unit lives in
// jee-blueprint-data.ts (a paraphrase of that syllabus). Paper 2A / 2B descriptions are paraphrased
// from the same document.
import { getJeeSubject, type JeeChapter } from "@/lib/jee-blueprint";

export const SYLLABUS_BASE = "/jee/syllabus";
export const syllabusPath = (key: string) => `${SYLLABUS_BASE}/${key}`;

const ORDER: Record<string, string[]> = {
  physics: [
    "Physics and Measurement", "Kinematics", "Laws of Motion", "Work, Energy and Power", "Rotational Motion", "Gravitation",
    "Properties of Solids and Liquids", "Thermodynamics", "Kinetic Theory of Gases", "Oscillations and Waves", "Electrostatics",
    "Current Electricity", "Magnetic Effects of Current and Magnetism", "Electromagnetic Induction and Alternating Currents",
    "Electromagnetic Waves", "Optics", "Dual Nature of Matter and Radiation", "Atoms and Nuclei", "Electronic Devices", "Experimental Skills",
  ],
  chemistry: [
    "Some Basic Concepts in Chemistry", "Atomic Structure", "Chemical Bonding and Molecular Structure", "Chemical Thermodynamics", "Solutions",
    "Equilibrium", "Redox Reactions and Electrochemistry", "Chemical Kinetics", "Classification of Elements and Periodicity", "p-Block Elements",
    "d- and f-Block Elements", "Coordination Compounds", "Purification and Characterisation of Organic Compounds",
    "Some Basic Principles of Organic Chemistry", "Hydrocarbons", "Organic Compounds Containing Halogens", "Organic Compounds Containing Oxygen",
    "Organic Compounds Containing Nitrogen", "Biomolecules", "Principles Related to Practical Chemistry",
  ],
  maths: [
    "Sets, Relations and Functions", "Complex Numbers and Quadratic Equations", "Matrices and Determinants", "Permutations and Combinations",
    "Binomial Theorem and Its Simple Applications", "Sequence and Series", "Limit, Continuity and Differentiability", "Integral Calculus",
    "Differential Equations", "Co-ordinate Geometry", "Three Dimensional Geometry", "Vector Algebra", "Statistics and Probability", "Trigonometry",
  ],
};

export type SyllabusUnit = { unit: number; chapter: JeeChapter };

export function syllabusUnits(subjectKey: string): SyllabusUnit[] {
  const s = getJeeSubject(subjectKey);
  if (!s) return [];
  return (ORDER[subjectKey] ?? []).flatMap((name, i) => {
    const chapter = s.chapters.find((c) => c.name === name);
    return chapter ? [{ unit: i + 1, chapter }] : [];
  });
}

export const PHYSICS_EXPERIMENTS: string[] = [
  "Vernier calipers: internal and external diameter and depth of a vessel",
  "Screw gauge: thickness or diameter of a thin sheet or wire",
  "Simple pendulum: dissipation of energy by plotting amplitude squared against time",
  "Metre scale: mass of an object using the principle of moments",
  "Young's modulus of elasticity of a metallic wire",
  "Surface tension of water by capillary rise, and the effect of detergents",
  "Coefficient of viscosity of a liquid from the terminal velocity of a sphere",
  "Speed of sound in air at room temperature using a resonance tube",
  "Specific heat capacity of a solid and a liquid by the method of mixtures",
  "Resistivity of a wire material using a metre bridge",
  "Resistance of a wire using Ohm's law",
  "Resistance and figure of merit of a galvanometer by the half-deflection method",
  "Focal length of a convex mirror, concave mirror and convex lens using the parallax method",
  "Plot of angle of deviation against angle of incidence for a triangular prism",
  "Refractive index of a glass slab using a travelling microscope",
  "Characteristic curves of a p-n junction diode in forward and reverse bias",
  "Characteristic curves of a Zener diode and its reverse breakdown voltage",
  "Identifying a diode, LED, resistor and capacitor from a mixed collection",
];

export const CHEM_PRACTICAL: { title: string; items: string[] }[] = [
  { title: "Detection", items: ["Extra elements (nitrogen, sulphur, halogens) in organic compounds", "Hydroxyl (alcoholic and phenolic), carbonyl (aldehydes and ketones), carboxyl and amino groups"] },
  { title: "Preparations", items: ["Inorganic: Mohr's salt, potash alum", "Organic: acetanilide, p-nitroacetanilide, aniline yellow, iodoform"] },
  { title: "Titrations", items: ["Acids and bases with indicators", "Oxalic acid against KMnO4", "Mohr's salt against KMnO4"] },
  { title: "Qualitative salt analysis", items: ["Cations: Pb2+, Cu2+, Al3+, Fe3+, Zn2+, Ni2+, Ca2+, Ba2+, Mg2+, NH4+", "Anions: CO3 2-, S2-, SO4 2-, NO3-, NO2-, Cl-, Br-, I- (insoluble salts excluded)"] },
  { title: "Other experiments", items: ["Enthalpy of solution of CuSO4", "Enthalpy of neutralisation of a strong acid and strong base", "Preparation of lyophilic and lyophobic sols", "Kinetic study of the reaction of iodide ions with hydrogen peroxide at room temperature"] },
];

export type Paper2Part = { title: string; summary: string; items?: string[] };
export type Paper2 = { key: string; name: string; course: string; parts: Paper2Part[] };

const APTITUDE: Paper2Part = {
  title: "Part II: Aptitude test",
  summary: "Tests visual and analytical ability for architecture and the built environment.",
  items: [
    "Awareness of buildings, materials, objects and textures related to architecture and the built environment",
    "Visualising three-dimensional objects from two-dimensional drawings and seeing different sides of 3D objects",
    "Analytical reasoning and mental ability (visual, numerical and verbal)",
    "Three-dimensional perception: scale and proportion, building forms, colour, texture, harmony and contrast",
    "Design and drawing of geometrical or abstract shapes and patterns in pencil",
    "Transformation of forms in 2D and 3D: union, subtraction, rotation, development of surfaces and volumes",
    "Plans, elevations and 3D views of objects, and 2D and 3D compositions from given shapes",
  ],
};

export const PAPER2: Paper2[] = [
  {
    key: "paper-2a-barch",
    name: "Paper 2A (B.Arch)",
    course: "B.Arch",
    parts: [
      { title: "Part I: Mathematics", summary: "The same 14 mathematics units as Paper 1, from sets and functions to trigonometry." },
      APTITUDE,
      {
        title: "Part III: Drawing test",
        summary: "Sketching of scenes and activities from memory, done on a drawing sheet.",
        items: ["Urbanscape: public spaces, markets, festivals, street scenes, monuments, recreational spaces", "Landscape: riverfronts, jungles, gardens, trees and plants", "Rural life", "Bring pencils, your own geometry box, erasers, colour pencils and crayons"],
      },
    ],
  },
  {
    key: "paper-2b-bplanning",
    name: "Paper 2B (B.Planning)",
    course: "B.Planning",
    parts: [
      { title: "Part I: Mathematics", summary: "The same 14 mathematics units as Paper 1, from sets and functions to trigonometry." },
      APTITUDE,
      {
        title: "Part III: Planning",
        summary: "General awareness, social sciences and thinking skills.",
        items: [
          "General awareness: prominent cities, development issues, government programmes",
          "Social sciences: nationalism in India, the 19th-century global economy, colonial cities, resources and development, agriculture, water and minerals, industries, human settlements, power sharing, federalism, democracy, the Constitution, economic sectors, globalisation, poverty, population, urbanisation, rural development",
          "Thinking skills: comprehension of an unseen passage, map reading (scale, distance, direction, area), critical reasoning, charts, graphs and tables, basic statistics and quantitative reasoning",
        ],
      },
    ],
  },
];

export const getPaper2 = (key: string) => PAPER2.find((p) => p.key === key);
export const syllabusKeys = () => ["physics", "chemistry", "maths", ...PAPER2.map((p) => p.key)];
