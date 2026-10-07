// Default syllabi, split by NCERT Class 11 / Class 12 → chapter → topics.
//   • JEE  (Physics, Chemistry, Mathematics)        — defined below
//   • NEET (Physics, Chemistry, Botany, Zoology)    — lib/neet-syllabus.ts,
//     built from the Edurack NEET PYQ Blueprint PDFs
//
// These files are only the *seed*. The first time the admin opens question
// ingestion, getSyllabus (server-functions/admin.ts) copies the exam's seed
// into the `syllabus` collection once; after that the database copy is what
// every screen reads. Edit the DB copy (or bump the version and re-seed) if the
// chapter list ever needs to change.
import { NEET_SYLLABUS, NEET_SYLLABUS_KEY, NEET_SYLLABUS_VERSION } from "@/lib/neet-syllabus";

export type SyllabusSubject = "Physics" | "Chemistry" | "Mathematics" | "Botany" | "Zoology" | "Biology";
export type ClassLevel = "11" | "12";
export type SyllabusChapter = { chapter: string; topics: string[]; /** Other spellings accepted when matching a chapter tag. */ aliases?: string[] };
// Partial: JEE has no Botany/Zoology, NEET has no Mathematics, and "Biology"
// is never stored (it is Botany + Zoology, see chaptersFor).
export type Syllabus = Partial<Record<SyllabusSubject, Record<ClassLevel, SyllabusChapter[]>>>;

/** Exams that have a built-in syllabus. Others (CUET, IPMAT) fall back to free-text tagging. */
export type SyllabusExam = "jee" | "neet";

export const SYLLABUS_KEY = "jee-default";
export const SYLLABUS_VERSION = 1;

const ch = (chapter: string, ...topics: string[]): SyllabusChapter => ({ chapter, topics });

export const JEE_SYLLABUS: Syllabus = {
  Physics: {
    "11": [
      ch("Units and Measurements", "SI units and dimensions", "Significant figures", "Errors in measurement", "Dimensional analysis and its applications"),
      ch("Motion in a Straight Line", "Position, displacement, velocity, acceleration", "Kinematic equations (uniform acceleration)", "Motion graphs (x-t, v-t, a-t)", "Relative velocity", "Motion under gravity"),
      ch("Motion in a Plane", "Scalars and vectors", "Vector addition and resolution", "Projectile motion", "Uniform circular motion", "Relative velocity in two dimensions"),
      ch("Laws of Motion", "Newton's laws of motion", "Momentum and impulse", "Conservation of linear momentum", "Equilibrium of concurrent forces", "Friction", "Dynamics of circular motion", "Pulleys and connected bodies"),
      ch("Work, Energy and Power", "Work-energy theorem", "Kinetic and potential energy", "Conservative forces and conservation of energy", "Power", "Collisions (elastic and inelastic)", "Potential energy of a spring"),
      ch("System of Particles and Rotational Motion", "Centre of mass", "Torque and angular momentum", "Moment of inertia", "Parallel and perpendicular axis theorems", "Rotational kinematics and dynamics", "Rolling motion", "Equilibrium of rigid bodies"),
      ch("Gravitation", "Kepler's laws", "Universal law of gravitation", "Variation of g with height and depth", "Gravitational potential energy", "Escape velocity and orbital velocity", "Satellites"),
      ch("Mechanical Properties of Solids", "Stress and strain", "Hooke's law and elastic moduli", "Stress-strain curve", "Elastic potential energy", "Poisson's ratio"),
      ch("Mechanical Properties of Fluids", "Pressure and Pascal's law", "Streamline flow and equation of continuity", "Bernoulli's principle", "Viscosity, Stokes' law, terminal velocity", "Surface tension and capillarity"),
      ch("Thermal Properties of Matter", "Temperature scales", "Thermal expansion", "Specific heat and calorimetry", "Change of state and latent heat", "Heat transfer (conduction, convection, radiation)", "Newton's law of cooling"),
      ch("Thermodynamics", "Thermal equilibrium and zeroth law", "First law of thermodynamics", "Thermodynamic processes (isothermal, adiabatic, isobaric, isochoric)", "Second law, heat engines and Carnot cycle", "Refrigerators and heat pumps"),
      ch("Kinetic Theory", "Ideal gas equation", "Kinetic theory of gases and pressure", "RMS speed and kinetic interpretation of temperature", "Degrees of freedom and law of equipartition", "Specific heat capacities of gases", "Mean free path"),
      ch("Oscillations", "Periodic motion", "Simple harmonic motion", "Energy in SHM", "Spring-mass system", "Simple pendulum", "Damped and forced oscillations, resonance"),
      ch("Waves", "Transverse and longitudinal waves", "Speed of a wave", "Superposition and reflection of waves", "Standing waves and normal modes (strings, pipes)", "Beats", "Doppler effect"),
    ],
    "12": [
      ch("Electric Charges and Fields", "Electric charge and Coulomb's law", "Electric field and field lines", "Electric dipole", "Electric flux and Gauss's law", "Applications of Gauss's law"),
      ch("Electrostatic Potential and Capacitance", "Electric potential and potential difference", "Potential due to point charge and dipole", "Equipotential surfaces", "Capacitors (series and parallel)", "Dielectrics and polarisation", "Energy stored in a capacitor"),
      ch("Current Electricity", "Ohm's law, resistivity, drift velocity", "Temperature dependence of resistance", "Series and parallel combinations", "Cells, emf and internal resistance", "Kirchhoff's laws", "Wheatstone bridge, meter bridge, potentiometer"),
      ch("Moving Charges and Magnetism", "Lorentz force", "Motion of a charge in magnetic field (cyclotron)", "Biot-Savart law", "Ampere's circuital law (solenoid, toroid)", "Force between parallel currents", "Torque on a current loop, moving coil galvanometer"),
      ch("Magnetism and Matter", "Bar magnet and magnetic dipole", "Earth's magnetism", "Gauss's law for magnetism", "Magnetisation and classification of materials", "Electromagnets and permanent magnets"),
      ch("Electromagnetic Induction", "Faraday's law and Lenz's law", "Motional emf", "Eddy currents", "Self-inductance", "Mutual inductance", "AC generator"),
      ch("Alternating Current", "AC through resistor, inductor, capacitor", "Phasors and series LCR circuit", "Resonance and quality factor", "Power and power factor", "LC oscillations", "Transformers"),
      ch("Electromagnetic Waves", "Displacement current", "Properties of electromagnetic waves", "Electromagnetic spectrum"),
      ch("Ray Optics and Optical Instruments", "Reflection and spherical mirrors", "Refraction and total internal reflection", "Lenses and lens maker's formula", "Prism and dispersion", "Microscopes and telescopes", "Human eye and defects of vision"),
      ch("Wave Optics", "Huygens' principle", "Interference and Young's double slit experiment", "Diffraction (single slit)", "Polarisation and Brewster's law", "Coherent sources"),
      ch("Dual Nature of Radiation and Matter", "Photoelectric effect", "Einstein's photoelectric equation", "Photon nature of light", "de Broglie wavelength", "Davisson-Germer experiment"),
      ch("Atoms", "Rutherford's model", "Bohr's model of hydrogen atom", "Energy levels", "Hydrogen spectral series"),
      ch("Nuclei", "Nuclear size and composition", "Mass defect and binding energy", "Radioactivity and decay law", "Nuclear fission and fusion"),
      ch("Semiconductor Electronics", "Energy bands in solids", "Intrinsic and extrinsic semiconductors", "p-n junction diode", "Rectifiers", "Zener diode, LED, photodiode, solar cell", "Logic gates"),
    ],
  },
  Chemistry: {
    "11": [
      ch("Some Basic Concepts of Chemistry", "Matter and its classification", "Laws of chemical combination", "Atomic and molecular masses, mole concept", "Empirical and molecular formula", "Stoichiometry and limiting reagent", "Concentration terms"),
      ch("Structure of Atom", "Subatomic particles and atomic models", "Bohr's model and hydrogen spectrum", "Dual nature, de Broglie and Heisenberg principle", "Quantum numbers and atomic orbitals", "Electronic configuration (Aufbau, Pauli, Hund)"),
      ch("Classification of Elements and Periodicity in Properties", "Modern periodic law and periodic table", "Atomic and ionic radii", "Ionisation enthalpy and electron gain enthalpy", "Electronegativity", "Periodic trends and valence"),
      ch("Chemical Bonding and Molecular Structure", "Ionic bond and lattice enthalpy", "Covalent bond, Lewis structures, formal charge", "VSEPR theory", "Valence bond theory and hybridisation", "Molecular orbital theory", "Hydrogen bonding and polarity"),
      ch("Thermodynamics", "System, surroundings and state functions", "First law, internal energy, enthalpy", "Heat capacity and calorimetry", "Hess's law and enthalpies of reaction", "Entropy and second law", "Gibbs energy and spontaneity"),
      ch("Equilibrium", "Physical and chemical equilibrium", "Law of mass action, Kc and Kp", "Le Chatelier's principle", "Ionic equilibrium, acids and bases, pH", "Buffers and hydrolysis", "Solubility product"),
      ch("Redox Reactions", "Oxidation number", "Types of redox reactions", "Balancing redox equations", "Redox reactions and electrode processes"),
      ch("Organic Chemistry: Some Basic Principles and Techniques", "Classification and IUPAC nomenclature", "Isomerism", "Electronic effects (inductive, resonance, hyperconjugation)", "Reaction intermediates", "Types of organic reactions", "Purification and analysis of organic compounds"),
      ch("Hydrocarbons", "Alkanes", "Alkenes", "Alkynes", "Aromatic hydrocarbons and benzene", "Conformations", "Electrophilic substitution"),
      ch("States of Matter", "Gas laws and ideal gas equation", "Dalton's law and Graham's law", "Kinetic molecular theory of gases", "Real gases and van der Waals equation", "Liquefaction and critical temperature", "Liquid state: viscosity and surface tension"),
      ch("Hydrogen", "Position and isotopes of hydrogen", "Water and hydrogen peroxide", "Hard water", "Hydrides"),
      ch("The s-Block Elements", "Group 1 (alkali metals) properties", "Group 2 (alkaline earth metals) properties", "Compounds of sodium and calcium", "Anomalous behaviour of Li and Be"),
      ch("The p-Block Elements (Group 13 and 14)", "Boron family: properties and compounds", "Carbon family: properties and allotropes", "Compounds of boron and silicon"),
    ],
    "12": [
      ch("Solutions", "Types of solutions and concentration terms", "Solubility of gases", "Raoult's law and vapour pressure", "Ideal and non-ideal solutions", "Colligative properties", "Abnormal molar mass and van't Hoff factor"),
      ch("Electrochemistry", "Electrochemical cells and electrode potential", "Nernst equation", "Conductance and Kohlrausch's law", "Electrolysis and Faraday's laws", "Batteries and fuel cells", "Corrosion"),
      ch("Chemical Kinetics", "Rate of reaction and rate law", "Order and molecularity", "Integrated rate equations", "Half-life", "Temperature dependence and Arrhenius equation", "Collision theory"),
      ch("The d- and f-Block Elements", "General properties of transition elements", "Oxidation states and magnetic properties", "Compounds of K2Cr2O7 and KMnO4", "Lanthanoids", "Actinoids"),
      ch("Coordination Compounds", "Werner's theory and terminology", "IUPAC nomenclature", "Isomerism in coordination compounds", "Bonding: VBT and CFT", "Stability and applications"),
      ch("Haloalkanes and Haloarenes", "Nomenclature and preparation", "Nucleophilic substitution (SN1, SN2)", "Elimination reactions", "Reactions of haloarenes", "Polyhalogen compounds"),
      ch("Alcohols, Phenols and Ethers", "Nomenclature and preparation", "Physical and chemical properties of alcohols", "Phenols and electrophilic substitution", "Ethers", "Identification of alcohols"),
      ch("Aldehydes, Ketones and Carboxylic Acids", "Nomenclature and preparation", "Nucleophilic addition reactions", "Name reactions (Aldol, Cannizzaro, etc.)", "Carboxylic acids and derivatives", "Acidity of carboxylic acids"),
      ch("Amines", "Nomenclature and classification", "Preparation of amines", "Basicity of amines", "Diazonium salts", "Distinction between amines"),
      ch("Biomolecules", "Carbohydrates", "Proteins and amino acids", "Enzymes", "Vitamins", "Nucleic acids"),
      ch("The p-Block Elements", "Group 15 elements and compounds", "Group 16 elements and compounds", "Group 17 elements and compounds", "Group 18 (noble gases)", "Oxoacids and halogen compounds"),
      ch("Polymers and Chemistry in Everyday Life", "Classification of polymers", "Addition and condensation polymerisation", "Important polymers", "Drugs and their classification", "Soaps and detergents"),
    ],
  },
  Mathematics: {
    "11": [
      ch("Sets", "Types of sets and subsets", "Operations on sets", "Venn diagrams", "Applications of sets"),
      ch("Relations and Functions", "Cartesian product and relations", "Types of functions", "Domain and range", "Algebra of functions"),
      ch("Trigonometric Functions", "Trigonometric ratios and identities", "Graphs of trigonometric functions", "Compound and multiple angle formulae", "Trigonometric equations", "Properties of triangles"),
      ch("Complex Numbers and Quadratic Equations", "Algebra of complex numbers", "Argand plane and polar form", "Modulus and argument", "Quadratic equations in complex numbers", "Roots of unity"),
      ch("Linear Inequalities", "Linear inequalities in one variable", "Graphical solution in two variables", "System of linear inequalities"),
      ch("Permutations and Combinations", "Fundamental principle of counting", "Permutations", "Combinations", "Circular permutations", "Distribution problems"),
      ch("Binomial Theorem", "Binomial expansion", "General and middle terms", "Properties of binomial coefficients", "Applications and approximations"),
      ch("Sequences and Series", "Arithmetic progression", "Geometric progression", "Arithmetic-geometric progression", "Harmonic progression", "Special series (sum of n, n squared, n cubed)"),
      ch("Straight Lines", "Slope and forms of line equations", "Distance and angle between lines", "Distance of a point from a line", "Family of lines", "Transformation of axes"),
      ch("Conic Sections", "Circle", "Parabola", "Ellipse", "Hyperbola", "Tangents and normals"),
      ch("Introduction to Three Dimensional Geometry", "Coordinate axes and planes", "Distance formula in 3D", "Section formula in 3D"),
      ch("Limits and Derivatives", "Limits of functions and standard limits", "Derivative from first principles", "Algebra of derivatives", "Derivatives of standard functions"),
      ch("Statistics", "Measures of dispersion", "Mean deviation", "Variance and standard deviation", "Analysis of frequency distributions"),
      ch("Probability", "Random experiments and events", "Axiomatic probability", "Addition theorem", "Classical probability problems"),
      ch("Mathematical Reasoning", "Statements and logical connectives", "Negation, conjunction, disjunction", "Implication and contrapositive", "Validating statements"),
    ],
    "12": [
      ch("Relations and Functions", "Types of relations", "Types of functions (one-one, onto)", "Composition and invertible functions", "Binary operations"),
      ch("Inverse Trigonometric Functions", "Domain and range of inverse functions", "Principal values", "Properties of inverse trigonometric functions"),
      ch("Matrices", "Types of matrices", "Operations on matrices", "Transpose, symmetric and skew-symmetric", "Elementary operations and inverse"),
      ch("Determinants", "Determinant and its properties", "Minors, cofactors and adjoint", "Inverse of a matrix", "Solving linear equations using matrices", "Area of a triangle"),
      ch("Continuity and Differentiability", "Continuity", "Differentiability", "Chain rule and implicit differentiation", "Logarithmic and parametric differentiation", "Second order derivatives", "Mean value theorems"),
      ch("Application of Derivatives", "Rate of change", "Increasing and decreasing functions", "Tangents and normals", "Maxima and minima", "Approximations"),
      ch("Integrals", "Indefinite integrals and standard forms", "Integration by substitution", "Integration by parts", "Partial fractions", "Definite integrals and properties", "Fundamental theorem of calculus"),
      ch("Application of Integrals", "Area under simple curves", "Area between two curves"),
      ch("Differential Equations", "Order and degree", "Formation of differential equations", "Variable separable", "Homogeneous equations", "Linear differential equations"),
      ch("Vector Algebra", "Types of vectors and operations", "Section formula", "Dot product", "Cross product", "Scalar triple product"),
      ch("Three Dimensional Geometry", "Direction cosines and ratios", "Equation of a line in space", "Equation of a plane", "Angle between lines and planes", "Distance of a point from a plane or line"),
      ch("Linear Programming", "Linear programming problems", "Graphical method of solution", "Feasible region and optimisation"),
      ch("Probability", "Conditional probability", "Multiplication theorem and independent events", "Bayes' theorem", "Random variables and probability distributions", "Binomial distribution"),
    ],
  },
};

export { NEET_SYLLABUS };

/** Seed + stored-document id + version, per exam. */
export const SYLLABUS_SEEDS: Record<SyllabusExam, { key: string; version: number; syllabus: Syllabus }> = {
  jee: { key: SYLLABUS_KEY, version: SYLLABUS_VERSION, syllabus: JEE_SYLLABUS },
  neet: { key: NEET_SYLLABUS_KEY, version: NEET_SYLLABUS_VERSION, syllabus: NEET_SYLLABUS },
};

/** An exam key (or anything else) → the exam whose syllabus applies, or null (no built-in syllabus). */
export function toSyllabusExam(exam: unknown): SyllabusExam | null {
  const t = String(exam ?? "").toLowerCase();
  if (t.includes("neet")) return "neet";
  if (t.includes("jee")) return "jee";
  return null;
}

/** Maps a test's free-text subject tag ("Physics", "Maths", "Chemistry (JEE)", "Biology") to a syllabus key. */
export function toSyllabusSubject(subject: string): SyllabusSubject | null {
  const s = subject.trim().toLowerCase();
  if (s.startsWith("phys")) return "Physics";
  if (s.startsWith("chem")) return "Chemistry";
  if (s.startsWith("math")) return "Mathematics";
  if (s.startsWith("bot")) return "Botany";
  if (s.startsWith("zoo")) return "Zoology";
  if (s.startsWith("bio")) return "Biology";
  return null;
}

/** Chapters of one subject/class. "Biology" = Botany + Zoology. [] when this syllabus doesn't cover the subject. */
export function chaptersFor(syllabus: Syllabus | null | undefined, subject: SyllabusSubject | null, cls: ClassLevel): SyllabusChapter[] {
  if (!syllabus || !subject) return [];
  if (subject === "Biology") return [...(syllabus.Botany?.[cls] ?? []), ...(syllabus.Zoology?.[cls] ?? [])];
  return syllabus[subject]?.[cls] ?? [];
}

/** True when the syllabus has any chapters for this subject (so tags can be judged). */
export function syllabusCovers(syllabus: Syllabus | null | undefined, subject: SyllabusSubject | null): boolean {
  return chaptersFor(syllabus, subject, "11").length + chaptersFor(syllabus, subject, "12").length > 0;
}

// ─── Out of Syllabus ────────────────────────────────────────────────────────
/** Chapter AND topic of any question whose tag isn't in the exam's syllabus. */
export const OUT_OF_SYLLABUS = "Out of Syllabus";

/** Case/punctuation/spacing-insensitive key ("Work, Energy and Power" = "Work Energy & Power"). */
export function syllabusKey(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9φχμπ]/g, "");
}

export type SyllabusTagResult = {
  classLevel?: ClassLevel;
  chapter?: string;
  topic?: string;
  /** True when the chapter or topic was not in the syllabus and was replaced by "Out of Syllabus". */
  outOfSyllabus: boolean;
};

/**
 * Judges a question's chapter/topic tag against the syllabus (pure — used by
 * the server on every save, and mirrored by the form's dropdowns).
 *   • subject not covered / no chapter given → left untouched (can't judge; blank stays "Not yet tagged")
 *   • chapter in the syllabus               → canonical chapter name + its class; topic canonicalised,
 *                                             or "Out of Syllabus" if that topic isn't listed under it
 *   • anything else                         → chapter and topic both "Out of Syllabus"
 */
export function classifySyllabusTag(
  syllabus: Syllabus | null | undefined,
  subjectText: string,
  tag: { classLevel?: ClassLevel; chapter?: string; topic?: string },
): SyllabusTagResult {
  const subject = toSyllabusSubject(subjectText);
  const chapter = tag.chapter?.trim() || undefined;
  const topic = tag.topic?.trim() || undefined;
  if (!syllabusCovers(syllabus, subject) || !chapter) return { classLevel: tag.classLevel, chapter, topic, outOfSyllabus: false };

  const oos: SyllabusTagResult = { classLevel: undefined, chapter: OUT_OF_SYLLABUS, topic: OUT_OF_SYLLABUS, outOfSyllabus: true };
  const want = syllabusKey(chapter);
  if (want === syllabusKey(OUT_OF_SYLLABUS)) return oos;

  for (const cls of ["11", "12"] as const) {
    const hit = chaptersFor(syllabus, subject, cls).find(
      (c) => syllabusKey(c.chapter) === want || (c.aliases ?? []).some((a) => syllabusKey(a) === want),
    );
    if (!hit) continue;
    if (!topic) return { classLevel: cls, chapter: hit.chapter, topic: undefined, outOfSyllabus: false };
    const t = hit.topics.find((x) => syllabusKey(x) === syllabusKey(topic));
    return t
      ? { classLevel: cls, chapter: hit.chapter, topic: t, outOfSyllabus: false }
      : { classLevel: cls, chapter: hit.chapter, topic: OUT_OF_SYLLABUS, outOfSyllabus: true };
  }
  return oos;
}
