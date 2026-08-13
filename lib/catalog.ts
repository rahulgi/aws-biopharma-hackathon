import type { AgentInput, ApprovedSource } from "./agent";

export type DrugPreset = {
  id: string;
  drug: string;
  aliases: string[];
  indication: string;
  question: string;
  approvedSources?: ApprovedSource[];
  featured?: boolean;
};

const EMTRIVA_SOURCES: ApprovedSource[] = [
  {
    url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=d6599395-3944-44f9-97f2-e0424c6b6a1f&version=12",
    category: "DRUG_LABEL",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/what-start-initial-combination-regimens?view=full",
    category: "CLINICAL_GUIDELINE",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/what-start-nucleoside-reverse-transcriptase-inhibitor?view=full",
    category: "CLINICAL_GUIDELINE",
  },
  {
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3419182/",
    category: "PHASE_3_RESULTS",
  },
  {
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3113064/",
    category: "PHASE_3_RESULTS",
  },
  {
    url: "https://jamanetwork.com/journals/jama/fullarticle/199085",
    category: "PHASE_3_RESULTS",
  },
];

export const DRUG_PRESETS: DrugPreset[] = [
  {
    id: "emtriva",
    drug: "Emtriva (emtricitabine)",
    aliases: ["FTC", "emtricitabine"],
    indication: "treatment of HIV-1 infection in adults and adolescents",
    question:
      "What evidence supports the efficacy and safety of emtricitabine-containing antiretroviral regimens for treatment-naive people with HIV-1?",
    approvedSources: EMTRIVA_SOURCES,
    featured: true,
  },
  {
    id: "keytruda",
    drug: "Keytruda (pembrolizumab)",
    aliases: ["pembrolizumab"],
    indication: "non-small cell lung cancer",
    question:
      "What evidence should a healthcare professional consider for pembrolizumab in non-small cell lung cancer?",
  },
  {
    id: "mounjaro",
    drug: "Mounjaro (tirzepatide)",
    aliases: ["tirzepatide"],
    indication: "type 2 diabetes mellitus",
    question:
      "What evidence is available concerning tirzepatide in adults with type 2 diabetes mellitus?",
  },
  {
    id: "eliquis",
    drug: "Eliquis (apixaban)",
    aliases: ["apixaban"],
    indication: "nonvalvular atrial fibrillation",
    question:
      "What evidence is available concerning apixaban in nonvalvular atrial fibrillation?",
  },
  {
    id: "dupixent",
    drug: "Dupixent (dupilumab)",
    aliases: ["dupilumab"],
    indication: "moderate-to-severe atopic dermatitis",
    question:
      "What evidence is available concerning dupilumab in moderate-to-severe atopic dermatitis?",
  },
  {
    id: "skyrizi",
    drug: "Skyrizi (risankizumab-rzaa)",
    aliases: ["risankizumab", "risankizumab-rzaa"],
    indication: "plaque psoriasis",
    question:
      "What evidence is available concerning risankizumab in plaque psoriasis?",
  },
];

export function presetToInput(preset: DrugPreset): AgentInput {
  return {
    drug: preset.drug,
    indication: preset.indication,
    medical_information_question: preset.question,
    ...(preset.approvedSources?.length
      ? { approved_sources: preset.approvedSources }
      : {}),
  };
}

export function filterDrugPresets(query: string): DrugPreset[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return DRUG_PRESETS;
  return DRUG_PRESETS.filter((preset) =>
    [preset.drug, ...preset.aliases].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}
